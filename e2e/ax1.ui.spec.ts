import { expect, test, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import type { PlayerUiReadback } from "../shared/playerUiProtocol";
import { testAnimatedPlayerGlb } from "../server/glbImportFixtures";

test.skip(process.env.AURION_UI_E2E !== "1", "Isolated AX1 runtime required");

async function rpc<T>(page: Page, procedure: string): Promise<T> {
  const response = await page.request.get(`/api/trpc/${procedure}`);
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  return body.result.data.json;
}

type ZoneCombatEvent = {
  type: "combat";
  tick: number;
  sequence: number;
  attackerEntityId: string;
  defenderEntityId: string;
  hit: boolean;
  damage: number;
  killed: boolean;
  defenderHealth: number;
  gameplaySourceRevision: string;
};
type Combatant = { entityId: string; health: number; maxHealth: number; stamina: number; alive: boolean };
type Presence = { entityId: string; userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number };

for (const viewport of [{ name: "phone", width: 412, height: 915 }, { name: "tablet", width: 800, height: 1280 }, { name: "desktop", width: 1440, height: 1000 }]) {
  test(`AX1 starter equipment, healer rules and quest-independent WASD combat on ${viewport.name}`, async ({ page, baseURL }, info) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(15_000);
    expect(baseURL).toBe("http://127.0.0.1:3000");
    const url = new URL(process.env.DATABASE_URL!);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toBe("/aurion_group_test");
    const pool = createPool(process.env.DATABASE_URL!);
    const errors: string[] = [];
    const combatEvents: ZoneCombatEvent[] = [];
    let selfEntityId = "";
    let latestPresences: Presence[] = [];
    let latestCombatants: Combatant[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("websocket", socket => {
      if (!socket.url().endsWith("/v1/ws")) return;
      socket.on("framereceived", frame => {
        try {
          const value = JSON.parse(String(frame.payload));
          if (value.type === "welcome") selfEntityId = String(value.selfEntityId ?? "");
          if (value.type === "welcome" || value.type === "snapshot") {
            latestPresences = Array.isArray(value.presences) ? value.presences : latestPresences;
            latestCombatants = Array.isArray(value.combatants) ? value.combatants : latestCombatants;
          } else if (value.type === "combat") {
            combatEvents.push(value as ZoneCombatEvent);
          }
        } catch {}
      });
    });

    try {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
      const handle = `ax1_ui_${viewport.name}`;
      await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
      await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-isolated-ui-regression!");
      await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
      const launch = page.getByRole("button", { name: "SPIEL BETRETEN", exact: true });
      await expect(launch).toBeVisible({ timeout: 30_000 });

      // Publish a real catalog-only player through the authenticated intake route.
      // The disposable account is admin only for this upload and is restored to
      // a normal player before gameplay begins.
      const publicDisplayName = `AX1 UI public avatar ${viewport.name}`;
      await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='admin' WHERE c.handle=?", [handle]);
      const publicBytes = testAnimatedPlayerGlb(`AX1_UI_Public_Player_${viewport.name}`);
      const publicUpload = await page.request.post("/api/admin/glb-smart-upload", { data: {
        displayName: publicDisplayName,
        fileName: `ax1-ui-public-player-${viewport.name}.glb`,
        purpose: "player-public",
        contentBase64: publicBytes.toString("base64"),
      } });
      expect(publicUpload.status()).toBe(201);
      const publicBody = await publicUpload.json();
      expect(publicBody).toMatchObject({ accepted: true, purpose: "player-public", classification: { assetType: "character" }, receipt: { targetKey: null, status: "catalog" } });
      await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='user' WHERE c.handle=?", [handle]);

      await launch.click();
      await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });

      const runtime = page.getByTestId("xaurion-open-world-runtime");
      await expect(runtime).toBeVisible();
      const gate = page.getByTestId("player-character-selection-gate");
      const publicAvatar = gate.getByRole("radio", { name: new RegExp(publicDisplayName) });
      await expect(publicAvatar).toBeVisible({ timeout: 45_000 });
      await publicAvatar.click();
      const selectionReply = page.waitForResponse(response => response.url().endsWith("/api/game/public-player-characters/select") && response.request().method() === "POST");
      await gate.getByRole("button", { name: "Dauerhaft wählen", exact: true }).click();
      const selected = await selectionReply;
      expect(selected.status()).toBe(200);
      expect(await selected.json()).toMatchObject({ visibility: "public", immutable: true });

      const hud = page.getByTestId("authoritative-world-hud");
      await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect.poll(() => selfEntityId, { timeout: 20_000 }).toMatch(/^player:[1-9][0-9]*$/);
      await expect.poll(() => latestPresences.some(p => p.entityId === selfEntityId), { timeout: 20_000 }).toBe(true);

      const environment = page.getByTestId("world-assets-evidence");
      const assetEvidence = async () => JSON.parse(await environment.getAttribute("data-presentation") || "{}");
      await expect.poll(async () => (await assetEvidence()).rendered, { timeout: 60_000 }).toBeGreaterThan(0);
      await expect.poll(async () => (await assetEvidence()).loading, { timeout: 60_000 }).toBe(0);
      expect((await assetEvidence()).failed).toBe(0);
      expect((await assetEvidence()).planned).toBe(108);
      await page.screenshot({ path: info.outputPath(`${viewport.name}-world-assets.png`) });

      const initial = await rpc<PlayerUiReadback>(page, "player.ui");
      const userId = initial.userId;
      const starter = initial.items.find(item => item.version === "ax1_starter");
      expect(starter).toMatchObject({
        definition: "item_sword_starter",
        name: "Apprentice Steel Blade",
        slot: "main_hand",
        quality: "normal",
        status: "equipped",
        stats: { attack: 15, maxHealth: 20 },
      });
      expect(initial.equipment).toContainEqual({ id: starter!.id, version: "ax1_starter", slot: "main_hand" });
      const [starterRows] = await pool.query<RowDataPacket[]>(
        "SELECT s.status,r.definitionId,r.sourceRevision,r.sourceBlobSha,r.contentSha256 FROM aurionAx1StarterEquipmentStates s JOIN aurionAx1StarterEquipmentReceipts r ON r.id=s.receiptId WHERE s.userId=?",
        [userId],
      );
      expect(starterRows).toEqual([expect.objectContaining({ status: "equipped", definitionId: "item_sword_starter" })]);
      expect(starterRows[0].sourceRevision).toMatch(/^[a-f0-9]{40}$/);
      expect(starterRows[0].sourceBlobSha).toMatch(/^[a-f0-9]{40}$/);
      expect(starterRows[0].contentSha256).toMatch(/^[a-f0-9]{64}$/);

      const confirmed = () => expect(dialog.getByText("Änderung vom Server bestätigt.", { exact: true })).toBeVisible();
      await hud.getByRole("button", { name: "Inventar", exact: true }).click();
      await expect(dialog.getByRole("button", { name: "Haupthand-Waffe: Apprentice Steel Blade", exact: true })).toBeVisible();
      await expect(dialog.getByText("Keine Gegenstände in dieser Ansicht.", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Auto-Loot AN", exact: true }).click();
      await confirmed();
      await page.screenshot({ path: info.outputPath(`${viewport.name}-starter-paperdoll.png`) });
      await dialog.getByRole("button", { name: "Inventar schließen", exact: true }).click();

      await hud.getByRole("button", { name: "Charakter", exact: true }).click();
      await expect(dialog.getByText("Dein klassenloser Weg durch Aurion", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /Vorhut|Seher|Hüter/ })).toHaveCount(0);
      await expect(dialog.getByText("Bestätigte Waffenpfade", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Bestätigte Skills", { exact: true })).toBeVisible();
      await dialog.getByLabel("Heilendes Licht", { exact: true }).click();
      await confirmed();
      await expect(dialog.getByLabel("Heilendes Licht", { exact: true })).toBeChecked();
      const group = await rpc<any>(page, "groups.read");
      expect(group.player.skills).toContain("mending_light");
      expect(group.qualification.roles).toContain("healer");
      const [profile] = await pool.query<RowDataPacket[]>("SELECT selectedClass FROM playerProfiles WHERE userId=?", [userId]);
      const [legacyEquipment] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionEquipmentSlots WHERE userId=?", [userId]);
      const [starterState] = await pool.query<RowDataPacket[]>("SELECT status FROM aurionAx1StarterEquipmentStates WHERE userId=?", [userId]);
      expect(profile[0].selectedClass).toBe("unbound");
      expect(legacyEquipment).toHaveLength(0);
      expect(starterState[0].status).toBe("equipped");
      await dialog.getByLabel("Skillplatz 1", { exact: true }).selectOption("9");
      await confirmed();
      await expect(dialog.getByLabel("Skillplatz 1", { exact: true })).toHaveValue("9");
      await page.screenshot({ path: info.outputPath(`${viewport.name}-skills.png`) });
      await dialog.getByRole("button", { name: "Charakter schließen", exact: true }).click();

      await hud.getByRole("button", { name: "Aufträge & Kontakte", exact: true }).click();
      await expect(dialog.getByText("Legacy-Aurion-Aufträge sind im Spiel deaktiviert.", { exact: false })).toBeVisible();
      await expect(dialog.getByText("Keine WASD-bestätigten Aufträge in dieser Ansicht.", { exact: true })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /Bei Lyra (annehmen|abgeben)/ })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`${viewport.name}-wasd-quest-gate.png`) });
      await dialog.getByRole("button", { name: "Quest-Buch schließen", exact: true }).click();
      await expect(hud.getByRole("button", { name: "Begegnungen", exact: true })).toHaveCount(0);
      const [legacySessionsBefore] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplaySessions WHERE userId=?", [userId]);
      const [legacyReceiptsBefore] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplayActionReceipts WHERE userId=?", [userId]);
      expect(Number(legacySessionsBefore[0].count)).toBe(0);
      expect(Number(legacyReceiptsBefore[0].count)).toBe(0);

      await expect.poll(
        () => combatEvents.some(event => event.defenderEntityId === selfEntityId && event.damage > 0),
        { timeout: 30_000 },
      ).toBe(true);
      const incoming = combatEvents.findLast(event => event.defenderEntityId === selfEntityId && event.damage > 0)!;
      expect(incoming.gameplaySourceRevision).toMatch(/^[a-f0-9]{40}$/);
      await expect.poll(() => {
        const self = latestCombatants.find(entry => entry.entityId === selfEntityId);
        return self ? self.health < self.maxHealth : false;
      }, { timeout: 10_000 }).toBe(true);
      const damagedPlayer = latestCombatants.find(entry => entry.entityId === selfEntityId)!;
      expect(damagedPlayer.alive).toBe(true);

      const attack = hud.getByRole("button", { name: "Angriff", exact: true });
      const auto = hud.getByRole("button", { name: "Auto-Angriff", exact: true });
      await page.getByTestId("glb-presentation").evaluate(element => {
        const samples: unknown[] = []; (window as any).__ax1AttackSamples = samples;
        const record = () => {
          const procedural = JSON.parse(element.getAttribute("data-attack") || "{}");
          const glb = JSON.parse(element.getAttribute("data-presentation") || "null");
          if (glb && /attack|fight/i.test(String(glb.clip)) && samples.length < 30) samples.push({ kind: "glb", clip: glb.clip, clipTime: glb.clipTime, bonePose: glb.bonePose });
          else if (procedural.attacking && procedural.visible && samples.length < 30) samples.push({ kind: "procedural", remaining: procedural.remaining, arm: procedural.arm, weapon: procedural.weapon });
        };
        new MutationObserver(record).observe(element, { attributes: true, attributeFilter: ["data-attack", "data-presentation"] });
        record();
      });

      let ownDamage: ZoneCombatEvent | undefined;
      for (let attempt = 0; attempt < 8 && !ownDamage; attempt += 1) {
        const before = combatEvents.filter(event => event.attackerEntityId === selfEntityId).length;
        await attack.click();
        await expect.poll(
          () => combatEvents.filter(event => event.attackerEntityId === selfEntityId).length,
          { timeout: 5_000 },
        ).toBeGreaterThan(before);
        ownDamage = combatEvents.findLast(event => event.attackerEntityId === selfEntityId && event.damage > 0);
      }
      expect(ownDamage).toBeDefined();
      expect(ownDamage!.gameplaySourceRevision).toMatch(/^[a-f0-9]{40}$/);
      expect(ownDamage!.defenderEntityId).toMatch(/^mob_[1-9][0-9]{0,2}$/);
      expect(ownDamage!.defenderHealth).toBeGreaterThanOrEqual(0);
      await expect(page.locator("#three-viewport")).toHaveAttribute("data-confirmed-attack-receipt", /.+/);
      await expect.poll(() => page.evaluate(() => (window as any).__ax1AttackSamples.length), { timeout: 10_000 }).toBeGreaterThan(1);
      const animation = await page.evaluate(() => (window as any).__ax1AttackSamples);
      expect(new Set(animation.map((sample: any) => sample.kind === "glb" ? `glb:${sample.bonePose}:${Math.round(sample.clipTime * 1000)}` : `procedural:${JSON.stringify(sample.arm)}`)).size).toBeGreaterThan(1);

      const ownCount = combatEvents.filter(event => event.attackerEntityId === selfEntityId).length;
      await auto.click();
      await expect.poll(() => combatEvents.filter(event => event.attackerEntityId === selfEntityId).length, { timeout: 8_000 }).toBeGreaterThan(ownCount);
      await hud.getByRole("button", { name: "Inventar", exact: true }).click();
      await expect(hud.locator('button[aria-label="Auto-Angriff"]')).toHaveAttribute("aria-pressed", "false");
      const stoppedAt = combatEvents.filter(event => event.attackerEntityId === selfEntityId).length;
      await page.waitForTimeout(1_400);
      expect(combatEvents.filter(event => event.attackerEntityId === selfEntityId).length).toBe(stoppedAt);

      await dialog.getByRole("button", { name: "Haupthand-Waffe: Apprentice Steel Blade", exact: true }).click();
      await dialog.getByRole("button", { name: "Ablegen", exact: true }).click();
      await confirmed();
      const unequipped = await rpc<PlayerUiReadback>(page, "player.ui");
      expect(unequipped.items.find(item => item.id === starter!.id)?.status).toBe("owned");
      expect(unequipped.equipment).not.toContainEqual(expect.objectContaining({ id: starter!.id }));
      await dialog.getByTestId(`bag-${starter!.id}`).click();
      await dialog.getByRole("button", { name: "Ausrüsten", exact: true }).click();
      await confirmed();
      const reequipped = await rpc<PlayerUiReadback>(page, "player.ui");
      expect(reequipped.items.find(item => item.id === starter!.id)?.status).toBe("equipped");
      expect(reequipped.equipment).toContainEqual({ id: starter!.id, version: "ax1_starter", slot: "main_hand" });
      await page.screenshot({ path: info.outputPath(`${viewport.name}-starter-reequipped.png`) });
      await dialog.getByRole("button", { name: "Inventar schließen", exact: true }).click();

      const [legacySessionsAfter] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplaySessions WHERE userId=?", [userId]);
      const [legacyReceiptsAfter] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplayActionReceipts WHERE userId=?", [userId]);
      expect(Number(legacySessionsAfter[0].count)).toBe(0);
      expect(Number(legacyReceiptsAfter[0].count)).toBe(0);

      const environmentReadback = await assetEvidence();
      await page.reload();
      const persisted = await rpc<PlayerUiReadback>(page, "player.ui");
      expect(persisted.settings.hotbar[0]).toBe("9");
      expect(persisted.settings.autoLoot).toBe(false);
      expect(persisted.items.find(item => item.id === starter!.id)?.status).toBe("equipped");
      expect(persisted.equipment).toContainEqual({ id: starter!.id, version: "ax1_starter", slot: "main_hand" });
      expect(errors).toEqual([]);

      await info.attach("ax1-wasd-live-readback", {
        body: JSON.stringify({
          revision: process.env.AURION_RELEASE_SHA,
          userId,
          viewport,
          publicPlayerAssetSha256: publicBody.receipt.sha256,
          publicPlayerSelectedThroughAx1: true,
          starter: persisted.items.find(item => item.id === starter!.id),
          qualification: group.qualification,
          incomingDamage: incoming,
          outgoingDamage: ownDamage,
          combatEventCount: combatEvents.length,
          damagedPlayer,
          animation,
          environment: environmentReadback,
          legacyArena: { sessions: Number(legacySessionsAfter[0].count), actionReceipts: Number(legacyReceiptsAfter[0].count) },
          launchRoute: "portal-confirmed-public-character-ax1-launch",
        }),
        contentType: "application/json",
      });
    } finally {
      await page.close();
      await pool.end();
    }
  });
}
