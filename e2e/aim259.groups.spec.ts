import { test, expect, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { groupReadmodelSchema, type GroupReadmodel } from "../shared/groupInstanceProtocol";

test.skip(process.env.AURION_GROUP_E2E !== "1", "Requires the isolated group runtime workflow");

async function rpc(page: Page, procedure: string, input?: unknown) {
  const response = input === undefined
    ? await page.request.get(`/api/trpc/${procedure}`)
    : await page.request.post(`/api/trpc/${procedure}`, { data: { json: input } });
  expect(response.ok(), procedure).toBe(true);
  const payload = await response.json();
  expect(payload.error, procedure).toBeUndefined();
  return payload.result.data.json;
}
async function read(page: Page): Promise<GroupReadmodel> { return groupReadmodelSchema.parse(await rpc(page, "groups.read")); }

for (const viewport of [{ name: "phone", width: 412, height: 915 }, { name: "tablet", width: 800, height: 1280 }, { name: "desktop", width: 1440, height: 1000 }]) {
  test(`five real browser sessions share one revision-bound instance on ${viewport.name}`, async ({ browser, baseURL }, info) => {
    expect(baseURL).toBe("http://127.0.0.1:3000");
    const url = new URL(process.env.DATABASE_URL!);
    expect(url.hostname).toBe("127.0.0.1"); expect(url.pathname).toBe("/aurion_group_test");
    const pool = createPool(process.env.DATABASE_URL!);
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    expect(database[0]!.name).toBe("aurion_group_test");
    const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ baseURL, viewport })));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const errors: string[] = [];
    pages.forEach(page => page.on("pageerror", error => errors.push(error.message)));
    try {
      const health = await (await pages[0]!.request.get("/healthz")).json();
      expect(health).toMatchObject({ service: "echoes-of-aurion", status: "ok", revision: process.env.AURION_RELEASE_SHA });
      for (let i = 0; i < 5; i++) {
        const page = pages[i]!;
        // Disposable test accounts use the real registration and signed-cookie
        // path. No test auth bypass and no mocked API response is installed.
        await rpc(page, "auth.registerLocal", { handle: `aim259_${viewport.name}_${i}`, password: "Aurion-disposable-group-regression-259!" });
        await rpc(page, "player.me");
        await rpc(page, "player.setWeaponLoadout", { weaponTrack: (["blade", "spear", "staff", "focus", "blade"] as const)[i] });
        await page.goto("/groups");
        await expect(page.getByRole("heading", { name: "Gruppenexpedition", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Gruppe suchen", exact: true })).toBeVisible();
      }
      await pages[0]!.getByLabel(/Wächterhaltung/).check();
      await expect(pages[0]!.getByRole("radio", { name: "Tank", exact: true })).toBeEnabled();
      await pages[0]!.getByRole("radio", { name: "Tank", exact: true }).check();
      await pages[1]!.getByLabel(/Heilendes Licht/).check();
      await expect(pages[1]!.getByRole("radio", { name: "Heiler", exact: true })).toBeEnabled();
      await pages[1]!.getByRole("radio", { name: "Heiler", exact: true }).check();
      // A healer with a SPEAR verifies the explicit weapon-independent rule.
      expect((await read(pages[1]!)).qualification.weaponTrack).toBe("spear");
      for (let i = 0; i < 4; i++) await pages[i]!.getByRole("button", { name: "Gruppe suchen", exact: true }).click();
      await expect(pages[0]!.getByRole("status").filter({ hasText: "Warte auf echte Mitspieler" })).toBeVisible();
      expect((await read(pages[0]!)).party).toBeNull();
      await pages[4]!.getByRole("button", { name: "Gruppe suchen", exact: true }).click();
      for (const page of pages) await expect(page.getByRole("button", { name: "Für diese Gruppe bereit", exact: true })).toBeVisible();
      const matched = await Promise.all(pages.map(read));
      expect(new Set(matched.map(s => s.party!.id)).size).toBe(1);
      for (const page of pages) await page.getByRole("button", { name: "Für diese Gruppe bereit", exact: true }).click();
      for (const page of pages) {
        await expect(page.getByRole("button", { name: "Gemeinsame Instanz betreten / fortsetzen", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Gemeinsame Instanz betreten / fortsetzen", exact: true }).click();
        await expect(page.getByRole("region", { name: "Gemeinsame Instanz", exact: true })).toBeVisible();
      }
      const admitted = await Promise.all(pages.map(read));
      const ticket = admitted[0]!.ticket!;
      expect(new Set(admitted.map(s => s.ticket!.hash)).size).toBe(1);
      expect(ticket.sourceRevision).toBe(health.revision);
      for (const state of admitted) expect(state.enteredUserIds).toHaveLength(5);
      await pages[2]!.getByRole("button", { name: "Gemeinsam angreifen", exact: true }).click();
      const tankId = admitted[0]!.player.userId;
      await expect.poll(async () => (await read(pages[1]!)).party!.health.find(h => h.userId === tankId)!.hp).toBeLessThan(ticket.playerMaxHp);
      const damaged = await read(pages[1]!);
      const tankName = ticket.roster.find(m => m.userId === tankId)!.name;
      // Respect the real operational admission interval before another action.
      await expect.poll(async () => Date.now() - (await read(pages[1]!)).party!.lastActionAtMs).toBeGreaterThanOrEqual(1_000);
      await expect(pages[1]!.getByRole("button", { name: `${tankName} heilen`, exact: true })).toBeEnabled();
      await pages[1]!.getByRole("button", { name: `${tankName} heilen`, exact: true }).click();
      await expect.poll(async () => (await read(pages[0]!)).party!.health.find(h => h.userId === tankId)!.hp).toBeGreaterThan(damaged.party!.health.find(h => h.userId === tankId)!.hp);
      await pages[1]!.getByRole("button", { name: "Instanz verlassen, Platz behalten", exact: true }).click();
      await pages[1]!.reload();
      await pages[1]!.getByRole("button", { name: "Gemeinsame Instanz betreten / fortsetzen", exact: true }).click();
      await expect(pages[1]!.getByRole("region", { name: "Gemeinsame Instanz", exact: true })).toHaveAttribute("data-ticket-id", ticket.id);
      await pages[1]!.screenshot({ path: info.outputPath(`group-${viewport.name}.png`), fullPage: true });
      const [storedTickets] = await pool.query<RowDataPacket[]>("SELECT id,partyId,sourceRevision,ticketHash,ticketJson FROM aurionGroupTickets WHERE id=?", [ticket.id]);
      expect(storedTickets).toHaveLength(1);
      expect(storedTickets[0]).toMatchObject({ id: ticket.id, sourceRevision: health.revision, ticketHash: ticket.hash });
      expect(JSON.parse(storedTickets[0]!.ticketJson)).toEqual(ticket);
      const finalReadback = await read(pages[0]!);
      const evidence = { kind: "aurion-group-runtime-evidence.v1", runtime: "isolated-real-http-mariadb", sourceRevision: health.revision, runtimeHealth: health, viewport, sessionUserIds: admitted.map(s => s.player.userId), partyId: ticket.partyId, ticketId: ticket.id, ticketHash: ticket.hash, databaseReadback: true, sourceWorldHash: ticket.worldHash, worldSnapshotSha256: ticket.worldSnapshotSha256, instanceRevision: finalReadback.party!.instanceRevision, sharedHealingConfirmed: true, rejoinConfirmed: true, production: false };
      const evidenceJson = JSON.stringify(evidence, null, 2);
      await writeFile(info.outputPath(`group-evidence-${viewport.name}.json`), evidenceJson);
      await info.attach("revision-bound-group-evidence", { body: evidenceJson, contentType: "application/json" });
      await info.attach("evidence-sha256", { body: createHash("sha256").update(evidenceJson).digest("hex"), contentType: "text/plain" });
      expect(errors).toEqual([]);
      await pages[0]!.getByRole("button", { name: "Gruppe verlassen …", exact: true }).click();
      await pages[0]!.getByRole("button", { name: "Gruppe verlassen und Lauf beenden", exact: true }).click();
      await expect(pages[0]!.getByRole("button", { name: "Gruppe suchen", exact: true })).toBeVisible();
    } finally { await Promise.all(contexts.map(context => context.close())); await pool.end(); }
  });
}
