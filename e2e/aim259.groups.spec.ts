import { test, expect, type Locator, type Page } from "@playwright/test";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { groupReadmodelSchema, type GroupCommand, type GroupReadmodel } from "../shared/groupInstanceProtocol";

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
async function read(page: Page): Promise<GroupReadmodel> {
  return groupReadmodelSchema.parse(await rpc(page, "groups.read"));
}
async function command(page: Page, action: GroupCommand["action"]): Promise<GroupReadmodel> {
  const before = await read(page);
  const receipt = await rpc(page, "groups.command", { expectedRevision: before.player.revision, action });
  return groupReadmodelSchema.parse(receipt.result);
}
async function clickLiveGroupButton(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 15_000 });
  await expect(locator).toBeEnabled();
  await locator.evaluate((element: HTMLButtonElement) => element.click());
}

async function launchAx1AndOpenGroups(page: Page) {
  await page.goto("/");
  const launch = page.getByRole("button", { name: "SPIEL BETRETEN", exact: true });
  await expect(launch).toBeVisible({ timeout: 30_000 });
  const entryResponse = page.waitForResponse(response => response.url().includes("gameplay.enterOpenWorld") && response.status() === 200);
  await launch.click();
  await entryResponse;
  await expect(page).toHaveURL(/\/play$/, { timeout: 30_000 });
  const runtime = page.getByTestId("xaurion-open-world-runtime");
  await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
  const hud = page.getByTestId("authoritative-world-hud");
  await hud.getByRole("button", { name: "Weitere Menüs", exact: true }).click();
  await hud.getByRole("button", { name: "Gruppe", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Gruppenexpedition", exact: true })).toBeVisible({ timeout: 15_000 });
  return { runtime, hud, dialog };
}

test("five authenticated sessions share one revision-bound group while AX1 proves combat, heal and rejoin", async ({ browser, baseURL }, info) => {
  test.setTimeout(300_000);
  expect(baseURL).toBe("http://127.0.0.1:3000");
  const url = new URL(process.env.DATABASE_URL!);
  expect(url.hostname).toBe("127.0.0.1");
  expect(url.pathname).toBe("/aurion_group_test");
  const pool = createPool(process.env.DATABASE_URL!);
  const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
  expect(database[0]!.name).toBe("aurion_group_test");

  // Five independent browser contexts provide five real authenticated cookie
  // sessions. Only the healer mounts WebGL; the four peers use the same public
  // tRPC commands their UI would send. Rendering the same deterministic world
  // five times is not part of the group-state invariant and is covered by the
  // dedicated AX1 phone/tablet/desktop UI and collision specs in this workflow.
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ baseURL, viewport: { width: 412, height: 915 } })));
  const pages = await Promise.all(contexts.map(context => context.newPage()));
  const errors: string[] = [];
  pages[1]!.on("pageerror", error => errors.push(error.message));

  try {
    const health = await (await pages[0]!.request.get("/healthz")).json();
    expect(health).toMatchObject({ service: "echoes-of-aurion", status: "ok", revision: process.env.AURION_RELEASE_SHA });

    const weaponTracks = ["blade", "spear", "staff", "focus", "blade"] as const;
    for (let i = 0; i < pages.length; i++) {
      await rpc(pages[i]!, "auth.registerLocal", { handle: `aim259_real_${i}`, password: "Aurion-disposable-group-regression-259!" });
      await rpc(pages[i]!, "player.me");
      await rpc(pages[i]!, "player.setWeaponLoadout", { weaponTrack: weaponTracks[i] });
    }

    const healerPage = pages[1]!;
    const { runtime, dialog } = await launchAx1AndOpenGroups(healerPage);

    // Role qualifications are real persisted commands. Tank is configured through
    // its authenticated session; healer qualification is additionally exercised
    // through the visible AX1 group UI.
    await command(pages[0]!, { kind: "equip", skills: ["guardian_stance"] });
    await dialog.getByLabel(/Heilendes Licht/).click();
    await expect(dialog.getByLabel(/Heilendes Licht/)).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "Heiler", exact: true })).toBeEnabled();
    await dialog.getByRole("radio", { name: "Heiler", exact: true }).check();
    expect((await read(healerPage)).qualification.weaponTrack).toBe("spear");

    const roles = ["tank", "healer", "dps", "dps", "dps"] as const;
    for (let i = 0; i < pages.length; i++) {
      const state = await read(pages[i]!);
      await command(pages[i]!, {
        kind: "join",
        dungeonId: "dungeon_aschengewoelbe",
        variant: "normal",
        role: roles[i],
        qualificationHash: state.qualification.hash,
      });
    }

    const matched = await Promise.all(pages.map(read));
    expect(new Set(matched.map(state => state.party!.id)).size).toBe(1);
    const partyId = matched[0]!.party!.id;
    const rosterHash = matched[0]!.party!.rosterHash;
    expect(matched[0]!.party!.roster.map(member => member.role).sort()).toEqual(["dps", "dps", "dps", "healer", "tank"]);

    // Four peers ready through their own sessions; the healer uses the visible UI
    // so the presentation-to-command bridge is covered by the same evidence.
    for (const index of [0, 2, 3, 4]) {
      await command(pages[index]!, { kind: "ready", partyId, rosterHash, ready: true });
    }
    await clickLiveGroupButton(dialog.getByRole("button", { name: "Für diese Gruppe bereit", exact: true }));
    await expect.poll(async () => (await read(healerPage)).readyUserIds.length, { timeout: 15_000 }).toBe(5);
    const ticket = (await read(healerPage)).ticket!;
    expect(ticket.sourceRevision).toBe(health.revision);
    expect(ticket.roster).toHaveLength(5);

    // Admit four peers by their real authenticated commands, then admit the healer
    // through the AX1 UI. All five readmodels must converge to the same ticket.
    for (const index of [0, 2, 3, 4]) {
      await command(pages[index]!, { kind: "enter", ticketId: ticket.id, ticketHash: ticket.hash });
    }
    await clickLiveGroupButton(dialog.getByRole("button", { name: "Gemeinsame Instanz betreten / fortsetzen", exact: true }));
    await expect.poll(async () => (await read(healerPage)).player.status, { timeout: 15_000 }).toBe("entered");
    const admitted = await Promise.all(pages.map(read));
    for (const state of admitted) {
      expect(state.ticket!.hash).toBe(ticket.hash);
      expect(state.enteredUserIds).toHaveLength(5);
    }
    await expect(dialog.getByRole("region", { name: "Gemeinsame Instanz", exact: true })).toHaveAttribute("data-ticket-id", ticket.id);

    // A DPS strike mutates the shared persisted instance. The visible healer then
    // heals the tank through AX1; neither operation touches legacy Aurion rewards.
    const dpsBefore = await read(pages[2]!);
    await command(pages[2]!, { kind: "strike", ticketId: ticket.id, expectedInstanceRevision: dpsBefore.party!.instanceRevision });
    const tankId = admitted[0]!.player.userId;
    await expect.poll(async () => (await read(healerPage)).party!.health.find(entry => entry.userId === tankId)!.hp, { timeout: 15_000 }).toBeLessThan(ticket.playerMaxHp);
    const damagedHp = (await read(healerPage)).party!.health.find(entry => entry.userId === tankId)!.hp;
    const tankName = ticket.roster.find(member => member.userId === tankId)!.name;
    await expect.poll(async () => Date.now() - (await read(healerPage)).party!.lastActionAtMs, { timeout: 5_000 }).toBeGreaterThanOrEqual(1_000);
    await clickLiveGroupButton(dialog.getByRole("button", { name: `${tankName} heilen`, exact: true }));
    await expect.poll(async () => (await read(pages[0]!)).party!.health.find(entry => entry.userId === tankId)!.hp, { timeout: 15_000 }).toBeGreaterThan(damagedHp);

    // Exit and portal re-entry must preserve membership and require a fresh AX1
    // launch. The same UI command rejoins the immutable ticket.
    await clickLiveGroupButton(dialog.getByRole("button", { name: "Instanz verlassen, Platz behalten", exact: true }));
    await expect.poll(async () => (await read(healerPage)).player.status).toBe("formed");
    await runtime.getByRole("button", { name: "ZUR STERNWARTE", exact: true }).click();
    await expect(healerPage).toHaveURL(/\/$/, { timeout: 15_000 });
    const relaunched = await launchAx1AndOpenGroups(healerPage);
    await clickLiveGroupButton(relaunched.dialog.getByRole("button", { name: "Gemeinsame Instanz betreten / fortsetzen", exact: true }));
    await expect.poll(async () => (await read(healerPage)).player.status, { timeout: 15_000 }).toBe("entered");
    await expect(relaunched.dialog.getByRole("region", { name: "Gemeinsame Instanz", exact: true })).toHaveAttribute("data-ticket-id", ticket.id);

    const [storedTickets] = await pool.query<RowDataPacket[]>(
      "SELECT id,partyId,sourceRevision,ticketHash,ticketJson FROM aurionGroupTickets WHERE id=?",
      [ticket.id],
    );
    expect(storedTickets).toHaveLength(1);
    expect(storedTickets[0]).toMatchObject({ id: ticket.id, partyId, sourceRevision: health.revision, ticketHash: ticket.hash });
    expect(JSON.parse(storedTickets[0]!.ticketJson)).toEqual(ticket);

    const [legacySessions] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplaySessions WHERE userId IN (?)", [admitted.map(state => state.player.userId)]);
    const [legacyActions] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM gameplayActionReceipts WHERE userId IN (?)", [admitted.map(state => state.player.userId)]);
    expect(Number(legacySessions[0].count)).toBe(0);
    expect(Number(legacyActions[0].count)).toBe(0);
    expect(errors).toEqual([]);

    const finalReadback = await read(healerPage);
    const evidence = {
      kind: "aurion-group-runtime-evidence.v2",
      runtime: "isolated-real-http-mariadb",
      sourceRevision: health.revision,
      sessionUserIds: admitted.map(state => state.player.userId),
      renderedAx1UserId: finalReadback.player.userId,
      partyId,
      ticketId: ticket.id,
      ticketHash: ticket.hash,
      fiveAuthenticatedSessions: true,
      fiveEntered: finalReadback.enteredUserIds.length === 5,
      databaseReadback: true,
      sharedDamageConfirmed: true,
      sharedHealingConfirmed: true,
      rejoinConfirmed: true,
      rejoinRoute: "portal-direct-ax1-launch",
      legacyGameplaySessions: 0,
      legacyGameplayActions: 0,
      production: false,
    };
    const evidenceJson = JSON.stringify(evidence, null, 2);
    await writeFile(info.outputPath("group-evidence.json"), evidenceJson);
    await info.attach("revision-bound-group-evidence", { body: evidenceJson, contentType: "application/json" });
    await info.attach("evidence-sha256", { body: createHash("sha256").update(evidenceJson).digest("hex"), contentType: "text/plain" });

    // Cleanly abort through the leader's real authenticated command and prove all
    // membership readmodels return to idle.
    await command(pages[0]!, { kind: "leave", partyId, rosterHash });
    await expect.poll(async () => (await read(healerPage)).player.status, { timeout: 15_000 }).toBe("idle");
    expect((await read(pages[4]!)).party).toBeNull();
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
    await pool.end();
  }
});
