import { expect, test, type Locator } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires disposable migration CI database");

type Pose = { clip: string; clipTime: number; boneCount: number; bonePose: string;
  heightMeters: number; renderedHeightMeters: number; feetY: number; id?: string };
const pose = async (node: Locator): Promise<Pose | null> => JSON.parse(await node.getAttribute("data-presentation") ?? "null");

for (const viewport of [
  { name: "phone", width: 412, height: 915 },
  { name: "tablet", width: 800, height: 1280 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`real GLB actors upload, animate, ground and open the smith on ${viewport.name}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    expect(baseURL).toBe("http://127.0.0.1:3000");
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    expect(databaseUrl.hostname).toBe("127.0.0.1");
    expect(databaseUrl.pathname).toBe("/aurion_browser_test");
    const pool = createPool(process.env.DATABASE_URL!);
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    expect(database[0].name).toBe("aurion_browser_test");
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && /shader|WebGLProgram|render.*failed/i.test(message.text())) errors.push(message.text());
    });
    let presence: { userId: number; position: { x: number; z: number } } | undefined;
    page.on("websocket", socket => {
      if (!socket.url().endsWith("/v1/ws")) return;
      socket.on("framereceived", frame => {
        try {
          const message = JSON.parse(String(frame.payload));
          if (["welcome", "snapshot"].includes(message.type) && message.presences?.length === 1) presence = message.presences[0];
        } catch { /* Invalid frames cannot satisfy movement evidence. */ }
      });
    });
    const confirmMovementStep = async (axis: "x" | "z", key: "a" | "d" | "s" | "w") => {
      await expect.poll(() => presence?.position[axis], { timeout: 15_000 }).toBeDefined();
      const current = presence!.position[axis];
      await page.keyboard.down(key);
      try {
        await expect.poll(() => presence!.position[axis], { timeout: 5_000, intervals: [25, 50, 100] }).not.toBe(current);
      } finally {
        await page.keyboard.up(key);
      }
    };
    const steerConfirmedAxis = async (axis: "x" | "z", targetMm: number, positiveKey: "d" | "s", negativeKey: "a" | "w", toleranceMm = 450) => {
      await expect.poll(() => presence?.position[axis], { timeout: 15_000 }).toBeDefined();
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const current = presence!.position[axis];
        if (Math.abs(current - targetMm) <= toleranceMm) return;
        const key = current < targetMm ? positiveKey : negativeKey;
        await confirmMovementStep(axis, key);
      }
      throw new Error(`CONFIRMED_AXIS_TARGET_NOT_REACHED:${axis}:${presence!.position[axis]}:${targetMm}`);
    };
    try {
      await page.setViewportSize(viewport);
      const health = await page.request.get("/healthz");
      expect(await health.json()).toMatchObject({ status: "ok", revision: process.env.AURION_RELEASE_SHA });
      await page.goto("/");
      await page.getByRole("button", { name: "KONTO ANLEGEN / ANMELDEN", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("tab", { name: "Konto anlegen", exact: true }).click();
      const handle = `glb_actors_${viewport.name}`;
      await dialog.getByLabel("Rufname", { exact: true }).fill(handle);
      await dialog.getByLabel("Passwort", { exact: true }).fill("Aurion-disposable-actors-test-only!");
      await dialog.getByRole("button", { name: "Aurion-Konto erstellen", exact: true }).click();
      await expect(page.getByRole("button", { name: "SPIEL BETRETEN", exact: true })).toBeVisible({ timeout: 30_000 });
      await pool.execute("UPDATE users u JOIN localCredentials c ON c.userId=u.id SET u.role='admin' WHERE c.handle=?", [handle]);
      await page.goto("/ops/glb-upload");
      const input = page.locator("#smartGlbFile");
      const upload = async (file: string, filename: string) => {
        await expect(input).toBeEnabled();
        const bytes = await readFile(file);
        const response = page.waitForResponse(r => r.url().endsWith("/api/admin/glb-smart-upload") && r.request().method() === "POST");
        await input.setInputFiles({ name: filename, mimeType: "model/gltf-binary", buffer: bytes });
        const result = await response;
        expect(result.status()).toBe(201);
        const body = await result.json();
        const receipt = body.receipt;
        expect(receipt.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
        const stored = await page.request.get(receipt.storageUrl);
        expect(stored.status()).toBe(200); expect(await stored.body()).toEqual(bytes);
        return { ...receipt, purpose: body.purpose };
      };

      // The real rig is now published through the canonical player-public lane;
      // starter_player assignment coverage remains in the dedicated GLB import test.
      await page.getByLabel("Kategorie / Verwendungszweck").selectOption("player-public");
      await page.getByLabel("Anzeigename (optional bei Einzeldatei)").fill("AIM253 real public avatar");
      const playerReceipt = await upload("assets/characters/aurion-player-standard-animated.glb", "real-public-player.glb");
      expect(playerReceipt).toMatchObject({ purpose: "player-public", targetKey: null, status: "catalog" });

      await page.getByLabel("Kategorie / Verwendungszweck").selectOption("auto");
      await page.getByLabel("Anzeigename (optional bei Einzeldatei)").fill("");
      const smithReceipt = await upload("test/fixtures/aurion-glb/blacksmith-npc.glb", "another-asset.glb");
      expect(smithReceipt).toMatchObject({ status: "assigned", targetKey: "npc_blacksmith" });
      const [assignments] = await pool.query<RowDataPacket[]>("SELECT a.targetKey, a.assetId, g.sha256 FROM glbAssignments a JOIN glbAssets g ON g.id=a.assetId WHERE a.active=1 ORDER BY a.targetKey");
      expect(assignments).toEqual([
        expect.objectContaining({ targetKey: "npc_blacksmith", assetId: smithReceipt.assetId, sha256: smithReceipt.sha256 }),
      ]);

      const loaded = new Set<string>();
      page.on("response", response => {
        if (response.status() === 200 && [playerReceipt.storageUrl, smithReceipt.storageUrl].some(url => response.url().endsWith(url))) loaded.add(new URL(response.url()).pathname);
      });
      await page.goto("/");
      const launch = page.getByRole("button", { name: "SPIEL BETRETEN", exact: true });
      await expect(launch).toBeVisible({ timeout: 30_000 });
      await launch.click();
      await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });
      const runtime = page.getByTestId("xaurion-open-world-runtime");
      const gate = page.getByTestId("player-character-selection-gate");
      await expect(gate).toBeVisible({ timeout: 15_000 });
      await gate.getByRole("radio", { name: /AIM253 real public avatar/ }).click();
      const selectionReply = page.waitForResponse(response => response.url().endsWith("/api/game/public-player-characters/select") && response.request().method() === "POST");
      await gate.getByRole("button", { name: "Dauerhaft wählen", exact: true }).click();
      const selected = await selectionReply;
      expect(selected.status()).toBe(200);
      expect(await selected.json()).toMatchObject({ assetId: playerReceipt.assetId, storageUrl: playerReceipt.storageUrl, visibility: "public", immutable: true });

      await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(page.getByTestId("glb-model-status")).toHaveText("active", { timeout: 45_000 });
      const player = page.getByTestId("glb-presentation"), smith = page.getByTestId("smith-presentation");
      await expect.poll(async () => (await pose(player))?.clip, { timeout: 30_000 }).toBe("Idle");
      await expect.poll(async () => (await pose(smith))?.clip, { timeout: 30_000 }).toBe("Idle");
      const idle = (await pose(player))!;
      expect(idle.boneCount).toBeGreaterThanOrEqual(24);
      expect(idle.renderedHeightMeters).toBeGreaterThan(1.8);
      expect(idle.renderedHeightMeters).toBeLessThan(2.2);
      expect(Math.abs(idle.feetY - Number(await player.getAttribute("data-ground-y")))).toBeLessThan(0.06);
      await expect.poll(async () => (await pose(player))?.bonePose).not.toBe(idle.bonePose);
      const initialSmith = (await pose(smith))!;
      expect(initialSmith.id).toBe("observatory_blacksmith");
      expect(initialSmith.boneCount).toBeGreaterThanOrEqual(18);
      await expect.poll(async () => (await pose(smith))?.bonePose).not.toBe(initialSmith.bonePose);
      expect([...loaded].sort()).toEqual([playerReceipt.storageUrl, smithReceipt.storageUrl].sort());

      const hud = page.getByTestId("authoritative-world-hud");
      const profile = (await hud.locator(".aurion-authority-hud__profile").boundingBox())!;
      expect(profile.height).toBeLessThan(100);
      const actions = (await hud.locator(".aurion-authority-hud__actions").boundingBox())!;
      const movement = (await hud.locator(".aurion-authority-hud__move").boundingBox())!;
      expect(actions.height).toBeLessThan(130);
      expect(movement.x + movement.width).toBeLessThan(actions.x);
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-world-hud.png`) });
      for (const name of ["Inventar", "Charakter", "Aufträge & Kontakte"]) {
        await hud.getByRole("button", { name, exact: true }).click();
        await expect(dialog).toHaveCSS("opacity", "1");
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-${name.split(" ")[0]}.png`), animations: "disabled" });
        await dialog.getByRole("button", { name: name === "Inventar" ? "Inventar schließen" : name === "Charakter" ? "Charakter schließen" : "Quest-Buch schließen", exact: true }).click();
      }

      await hud.getByRole("button", { name: "Aufträge & Kontakte", exact: true }).click();
      await expect(dialog.getByText("Legacy-Aurion-Aufträge sind im Spiel deaktiviert.", { exact: false })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /Bei Lyra (annehmen|abgeben)/ })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Quest-Buch schließen", exact: true }).click();
      await expect(hud.getByRole("button", { name: "Begegnungen", exact: true })).toHaveCount(0);
      await expect.poll(() => presence?.userId).toBeGreaterThan(0);
      const [legacySessions] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplaySessions WHERE userId=?", [presence!.userId]);
      const [legacyActions] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplayActionReceipts WHERE userId=?", [presence!.userId]);
      expect(Number(legacySessions[0].count)).toBe(0);
      expect(Number(legacyActions[0].count)).toBe(0);

      const origin = { ...presence!.position };
      await confirmMovementStep("x", "d");
      expect(presence!.position.x).toBeGreaterThan(origin.x);
      await steerConfirmedAxis("x", 3000, "d", "a");
      await confirmMovementStep("z", "w");
      await expect.poll(async () => (await pose(player))?.clip, { timeout: 3_000 }).toMatch(/^(Walk|Run|Idle)$/);
      await steerConfirmedAxis("z", -13000, "s", "w");
      await expect.poll(() => presence && Math.hypot(presence.position.x - 3000, presence.position.z + 14000), { timeout: 5_000 }).toBeLessThanOrEqual(5000);
      await expect(page.getByRole("button", { name: "Schmied ansprechen", exact: true })).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => (await pose(player))?.clip).toBe("Idle");
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-near-smith.png`) });
      await page.getByRole("button", { name: "Schmied ansprechen", exact: true }).click();
      await expect(page.getByRole("heading", { name: "HANDWERK & BERUFE", exact: true })).toBeVisible();
      await expect.poll(async () => (await pose(smith))?.clip, { intervals: [50, 100, 200] }).toBe("ShopInteract");
      const crafting = page.getByRole("dialog");
      const craftBox = (await crafting.boundingBox())!;
      expect(craftBox.y).toBeGreaterThanOrEqual(0);
      expect(craftBox.y + craftBox.height).toBeLessThanOrEqual(viewport.height + 1);
      await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-smith-crafting.png`) });
      await expect.poll(async () => (await pose(smith))?.clip, { timeout: 15_000 }).toBe("Idle");
      expect(errors).toEqual([]);
      await testInfo.attach("actual-glb-actor-readback", { contentType: "application/json", body: JSON.stringify({
        revision: process.env.AURION_RELEASE_SHA, viewport: viewport.name, assignments,
        playerPublicAsset: { assetId: playerReceipt.assetId, sha256: playerReceipt.sha256, storageUrl: playerReceipt.storageUrl },
        player: await pose(player), smith: await pose(smith), uploadedByteReadback: true, publicSelectionReadback: true,
        idlePoseChanged: true, serverMovementObserved: true, confirmedSmithApproach: presence?.position,
        interactionObserved: "ShopInteract", profile, actions, movement,
        legacyGameplaySessions: 0, legacyGameplayActions: 0, launchRoute: "portal-confirmed-public-character-ax1",
      }) });
    } finally { await page.close(); await pool.end(); }
  });
}
