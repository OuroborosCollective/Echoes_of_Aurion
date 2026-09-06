import { expect, test, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import type { PlayerUiReadback } from "../shared/playerUiProtocol";

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
      await page.getByRole("button", { name: /ALLEIN DIE STERNWARTE BETRETEN/ }).click();
      await page.getByRole("button", { name: "IN DIE OPEN WORLD", exact: true }).click();

      const runtime = page.getByTestId("xaurion-open-world-runtime");
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
      await expect(dialog.getByRole("button", { name: "Hüter", exact: true })).toBeDisabled();
      await dialog.getByRole("button", { name: "Skills & Meisterschaft", exact: true }).click();
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

      // `/play` must not expose or mutate Aurion gameplaySessions quests/arena.
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

      // The nearest AX1 mob acquires the player and WASD must reduce real player HP
      // without any active quest or legacy encounter session.
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
      await expect(auto).toHaveAttribute("aria-pressed", "false");
      const stoppedAt = combatEvents.filter(event => event.attackerEntityId === selfEntityId).length;
      await page.waitForTimeout(1_400);
      expect(combatEvents.filter(event => event.attackerEntityId === selfEntityId).length).toBe(stoppedAt);

      // Starter state is real equipment: it can leave and return to the paperdoll.
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
          starter: persisted.items.find(item => item.id === starter!.id),
          qualification: group.qualification,
          incomingDamage: incoming,
          outgoingDamage: ownDamage,
          combatEventCount: combatEvents.length,
          damagedPlayer,
          animation,
          environment: environmentReadback,
          legacyArena: { sessions: Number(legacySessionsAfter[0].count), actionReceipts: Number(legacyReceiptsAfter[0].count) },
        }),
        contentType: "application/json",
      });
    } finally {
      await page.close();
      await pool.end();
    }
  });
}
