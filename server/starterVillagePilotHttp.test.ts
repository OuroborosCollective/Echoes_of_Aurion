import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";

const enabled = process.env.AURION_STARTER_VILLAGE_HTTP_E2E === "1";
const suite = enabled ? describe : describe.skip;
const phase = process.env.AURION_STARTER_VILLAGE_PHASE ?? "journey";
const evidenceDirectory = process.env.AURION_EVIDENCE_DIR ?? "test-results/starter-village-pilot";
const sessionFile = path.join(evidenceDirectory, "session.json");
const revision = process.env.AURION_TEST_SOURCE_SHA ?? "";
const endpoint = "http://127.0.0.1:3000/api/trpc/";

type RpcEnvelope<T> = { error?: unknown; result?: { data?: { json?: T } } };

async function rpc<T>(procedure: string, cookie: string, input?: unknown): Promise<{ data: T; cookie: string }> {
  const response = await fetch(endpoint + procedure, {
    method: input === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", cookie },
    body: input === undefined ? undefined : JSON.stringify({ json: input }),
  });
  const body = await response.json() as RpcEnvelope<T>;
  expect(body.error).toBeUndefined();
  expect(response.ok).toBe(true);
  const setCookie = response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
  return { data: body.result!.data!.json!, cookie: setCookie || cookie };
}

async function defeat(cookie: string, encounterKey: string) {
  const started = await rpc<any>("gameplay.startEncounter", cookie, { encounterKey });
  for (let sequence = 1; sequence <= 12; sequence += 1) {
    const action = await rpc<any>("gameplay.act", cookie, { sessionId: started.data.session.id, sequence, command: "9", source: "human" });
    if (action.data.completed) return action.data;
  }
  throw new Error(`COMBAT_NOT_COMPLETED:${encounterKey}`);
}

async function moveFromReturnStoneToNorthGate(cookie: string, userId: number) {
  const issued = await rpc<any>("gameplay.issueZoneTicket", cookie, { zoneId: "observatory_threshold", clientBuild: `starter-pilot-${revision.slice(0, 12)}` });
  const socket = new WebSocket("ws://127.0.0.1:3000/v1/ws", { headers: { Origin: "http://127.0.0.1:3000" } });
  let sequence = 0;
  let lastPosition = { x: Number.NaN, z: Number.NaN };
  const reached = new Promise<{ x: number; z: number }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("NORTH_GATE_NOT_REACHED")), 30_000);
    socket.on("message", raw => {
      const message = JSON.parse(raw.toString("utf8"));
      if (message.type !== "welcome" && message.type !== "snapshot") return;
      const self = message.presences?.find((presence: any) => presence.userId === userId);
      if (!self) return;
      lastPosition = self.position;
      if (self.position.z <= -72_000) {
        clearTimeout(timeout);
        resolve(self.position);
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.once("open", () => {
      socket.send(JSON.stringify({ type: "hello", ticket: issued.data.ticket, zoneId: "observatory_threshold", protocolVersion: ZONE_PROTOCOL_VERSION }));
      resolve();
    });
  });
  const movement = setInterval(() => socket.send(JSON.stringify({ type: "move", clientSeq: ++sequence, input: { x: 0, z: -1 } })), 100);
  try {
    const northGate = await reached;
    expect(lastPosition).toEqual(northGate);
    return { spawn: { x: 0, z: 0 }, northGate, lastAcceptedClientSeq: sequence };
  } finally {
    clearInterval(movement);
    socket.close();
  }
}

suite("starter village pilot over compiled HTTP/tRPC", () => {
  it("runs the journey and persists revision-bound receipts", async () => {
    if (phase !== "journey") return;
    expect(revision).toMatch(/^[a-f0-9]{40}$/);
    const database = new URL(process.env.DATABASE_URL!);
    expect(database.hostname).toBe("127.0.0.1");
    expect(database.pathname).toBe("/aurion_starter_pilot");
    await mkdir(evidenceDirectory, { recursive: true });

    let cookie = "";
    const handle = `starter_${revision.slice(0, 10)}`;
    const registration = await rpc<any>("auth.registerLocal", cookie, { handle, password: "Aurion-starter-pilot-only!" });
    cookie = registration.cookie;
    const route = await moveFromReturnStoneToNorthGate(cookie, registration.data.id);
    const initialWorld = (await rpc<any>("gameplay.openWorld", cookie)).data;
    const initialInventory = (await rpc<any>("player.ui", cookie)).data;
    expect(initialWorld.pointsOfInterest.some((poi: any) => poi.kind === "npc" && poi.state === "available")).toBe(true);

    const quests = [
      ["astral_call", "asterion", "lyra"],
      ["archive_of_echoes", "archive", "orun"],
      ["ember_key", "solarium", "lyra"],
      ["starfall_resonance", "starfall_crater", "lyra"],
      ["clockwork_core", "rootgear_foundry", "orun"],
      ["sunwatch_vanguard", "sunwatch_bastion", "orun"],
    ] as const;
    const receipts: unknown[] = [];
    for (const [questKey, encounterKey, npcId] of quests) {
      const dialogue = await rpc<any>("gameplay.interpretNpcDialogue", cookie, {
        npcId, text: "Seid gegrüßt, ich brauche einen Auftrag.", idempotencyKey: `starter-${questKey}-dialogue`,
      });
      const offer = await rpc<any>("gameplay.requestQuestActionFromDialogue", cookie, {
        dialogueReceiptId: dialogue.data.receiptId, actionKind: "offer_quest", questKey, idempotencyKey: `starter-${questKey}-offer-command`,
      });
      await rpc("gameplay.acceptQuest", cookie, { questKey });
      const combat = await defeat(cookie, encounterKey);
      const turnIn = await rpc<any>("gameplay.completeQuest", cookie, { questKey, giver: npcId === "lyra" ? "Lyra" : "Orun" });
      receipts.push({ questKey, dialogueReceiptId: dialogue.data.receiptId, offerReceiptId: offer.data.receipt.id, combatReceipt: combat.receipt, profile: turnIn.data.profile });
    }
    const progress = (await rpc<any>("gameplay.progress", cookie)).data;
    const inventory = (await rpc<any>("player.ui", cookie)).data;
    expect(progress.profile.victories).toBe(6);
    expect(progress.quests.every((quest: any) => quest.state === "completed")).toBe(true);
    expect(inventory.userId).toBe(registration.data.id);

    const pool = createPool(process.env.DATABASE_URL!);
    const [rewardRows] = await pool.query<RowDataPacket[]>("SELECT kind, delta, idempotencyKey FROM progressionLedger WHERE userId=? ORDER BY idempotencyKey", [registration.data.id]);
    await pool.end();
    expect(rewardRows).toHaveLength(18);
    expect(new Set(rewardRows.map(row => row.idempotencyKey)).size).toBe(18);
    const finalBefore = progress.profile;
    const replay = (await rpc<any>("gameplay.completeQuest", cookie, { questKey: "sunwatch_vanguard", giver: "Orun" })).data;
    expect(replay.profile).toEqual(finalBefore);

    const evidence = { schema: "aurion.starter-village-pilot.journey.v1", sourceRevision: revision, userId: registration.data.id, route, serverConfirmedGuard: initialWorld.pointsOfInterest.find((poi: any) => poi.kind === "npc"), combatVictories: 6, questReceipts: receipts, rewardLedger: rewardRows, questReadback: progress, inventoryReadback: inventory, initialInventoryHash: JSON.stringify(initialInventory.items), browserEmulationOnly: true };
    await writeFile(path.join(evidenceDirectory, `journey-${revision}.json`), JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
    await writeFile(sessionFile, JSON.stringify({ cookie, userId: registration.data.id, finalBefore }) + "\n", { flag: "wx" });
  }, 120_000);

  it("reads quest and inventory state after application restart", async () => {
    if (phase !== "readback") return;
    expect(revision).toMatch(/^[a-f0-9]{40}$/);
    const session = JSON.parse(await readFile(sessionFile, "utf8"));
    const progress = (await rpc<any>("gameplay.progress", session.cookie)).data;
    const inventory = (await rpc<any>("player.ui", session.cookie)).data;
    expect(progress.profile).toEqual(session.finalBefore);
    expect(progress.profile.victories).toBe(6);
    expect(progress.quests.every((quest: any) => quest.state === "completed")).toBe(true);
    expect(inventory.userId).toBe(session.userId);
    await writeFile(path.join(evidenceDirectory, `restart-readback-${revision}.json`), JSON.stringify({ schema: "aurion.starter-village-pilot.restart-readback.v1", sourceRevision: revision, authenticatedSessionReusedAfterRestart: true, questReadback: progress, inventoryReadback: inventory }, null, 2) + "\n", { flag: "wx" });
  }, 30_000);
});
