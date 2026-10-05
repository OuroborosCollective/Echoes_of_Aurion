import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";
import { AX1_PLAYER_BASIC_MELEE_RANGE_FIXED } from "./ax1CombatProjection";

const enabled = process.env.AURION_STARTER_VILLAGE_HTTP_E2E === "1";
const suite = enabled ? describe : describe.skip;
const phase = process.env.AURION_STARTER_VILLAGE_PHASE ?? "journey";
const evidenceDirectory = process.env.AURION_EVIDENCE_DIR ?? ".aurion-evidence/starter-village-pilot";
const privateStateDirectory = process.env.AURION_PRIVATE_STATE_DIR ?? ".aurion-private/starter-village-pilot";
const sessionFile = path.join(privateStateDirectory, "session.json");
const revision = process.env.AURION_TEST_SOURCE_SHA ?? "";
const endpoint = "http://127.0.0.1:3000/api/trpc/";

type RpcEnvelope<T> = { error?: unknown; result?: { data?: { json?: T } } };
type Position = { x: number; z: number };
type ZoneMob = {
  entityId: string;
  archetype: string;
  level: number;
  state: string;
  position: Position;
  isBoss: boolean;
  health: number;
  maxHealth: number;
};
type ZoneCombatEvent = {
  type: "combat";
  tick: number;
  sequence: number;
  attackerEntityId: string;
  defenderEntityId: string;
  killed: boolean;
  defenderHealth: number;
  damage: number;
  gameplaySourceRevision: string;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function rpc<T>(procedure: string, cookie: string, input?: unknown, kind: "query" | "mutation" = input === undefined ? "query" : "mutation"): Promise<{ data: T; cookie: string }> {
  const query = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const response = await fetch(endpoint + procedure + (kind === "query" ? query : ""), {
    method: kind === "query" ? "GET" : "POST",
    headers: { "content-type": "application/json", cookie },
    body: kind === "mutation" && input !== undefined ? JSON.stringify({ json: input }) : undefined,
  });
  const body = await response.json() as RpcEnvelope<T>;
  if (body.error !== undefined) {
    throw new Error(`RPC_${procedure}:${response.status}:${JSON.stringify(body.error)}`);
  }
  expect(response.ok, `RPC_${procedure}_HTTP_STATUS`).toBe(true);
  const setCookie = response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
  return { data: body.result!.data!.json!, cookie: setCookie || cookie };
}

function distance(left: Position, right: Position): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

async function runAuthoritativeZoneJourney(cookie: string, userId: number, onNorthGate?: (position: Position) => Promise<void>) {
  const issued = await rpc<any>("gameplay.issueZoneTicket", cookie, {
    zoneId: "observatory_threshold",
    clientBuild: `starter-pilot-${revision.slice(0, 12)}`,
  });
  const socket = new WebSocket("ws://127.0.0.1:3000/v1/ws", {
    headers: { Origin: "http://127.0.0.1:3000" },
  });

  let clientSeq = 0;
  let selfEntityId = "";
  let selfPosition: Position | null = null;
  let mobs: ZoneMob[] = [];
  const combatEvents: ZoneCombatEvent[] = [];
  const rejects: string[] = [];
  let welcomed = false;

  socket.on("message", raw => {
    const message = JSON.parse(raw.toString("utf8"));
    if (message.type === "welcome") {
      welcomed = true;
      selfEntityId = String(message.selfEntityId ?? "");
    }
    if (message.type === "welcome" || message.type === "snapshot") {
      const self = message.presences?.find((presence: any) => presence.userId === userId);
      if (self) selfPosition = { x: self.position.x, z: self.position.z };
      if (Array.isArray(message.mobs)) mobs = message.mobs;
    } else if (message.type === "combat") {
      combatEvents.push(message as ZoneCombatEvent);
    } else if (message.type === "reject") {
      rejects.push(String(message.code));
    }
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.once("open", () => {
      socket.send(JSON.stringify({
        type: "hello",
        ticket: issued.data.ticket,
        zoneId: "observatory_threshold",
        protocolVersion: ZONE_PROTOCOL_VERSION,
      }));
      resolve();
    });
  });

  const waitUntil = async (predicate: () => boolean, code: string, timeoutMs: number) => {
    const started = Date.now();
    while (!predicate()) {
      if (Date.now() - started > timeoutMs) throw new Error(code);
      await sleep(50);
    }
  };

  const sendMove = (x: -1 | 0 | 1, z: -1 | 0 | 1) => {
    socket.send(JSON.stringify({ type: "move", clientSeq: ++clientSeq, input: { x, z } }));
  };

  try {
    await waitUntil(() => welcomed && selfPosition !== null && mobs.length > 0, "ZONE_WELCOME_NOT_CONFIRMED", 10_000);
    expect(selfEntityId).toBe(`player:${userId}`);

    const guardStarted = Date.now();
    while (!selfPosition || selfPosition.z > -30_000) {
      if (Date.now() - guardStarted > 25_000) throw new Error("NORTH_GATE_GUARD_NOT_REACHED");
      sendMove(0, -1);
      await sleep(100);
    }
    sendMove(0, 0);
    await sleep(250);
    const guardPosition = { ...selfPosition };
    if (onNorthGate) await onNorthGate(guardPosition);

    const alive = mobs.filter(mob => mob.health > 0 && mob.state !== "dead" && !mob.isBoss);
    expect(alive.length).toBeGreaterThan(0);
    const target = [...alive].sort((left, right) =>
      distance(selfPosition!, left.position) - distance(selfPosition!, right.position)
      || left.entityId.localeCompare(right.entityId)
    )[0]!;

    const approachStarted = Date.now();
    while (true) {
      const currentTarget = mobs.find(mob => mob.entityId === target.entityId);
      if (!currentTarget || currentTarget.health <= 0) throw new Error("ZONE_TARGET_DISAPPEARED_BEFORE_COMBAT");
      if (selfPosition && distance(selfPosition, currentTarget.position) <= AX1_PLAYER_BASIC_MELEE_RANGE_FIXED - 500) break;
      if (Date.now() - approachStarted > 20_000) throw new Error("ZONE_COMBAT_TARGET_NOT_REACHED");
      const dx = currentTarget.position.x - selfPosition!.x;
      const dz = currentTarget.position.z - selfPosition!.z;
      sendMove(Math.abs(dx) < 700 ? 0 : dx > 0 ? 1 : -1, Math.abs(dz) < 700 ? 0 : dz > 0 ? 1 : -1);
      await sleep(100);
    }
    sendMove(0, 0);
    await sleep(150);

    const combatStarted = Date.now();
    let killed: ZoneCombatEvent | undefined;
    while (!killed) {
      if (Date.now() - combatStarted > 30_000) throw new Error("ZONE_COMBAT_NOT_COMPLETED");
      socket.send(JSON.stringify({ type: "attack", clientSeq: ++clientSeq, targetEntityId: target.entityId }));
      await sleep(120);
      killed = combatEvents.find(event =>
        event.attackerEntityId === selfEntityId
        && event.defenderEntityId === target.entityId
        && event.killed
        && event.defenderHealth === 0
      );
    }
    expect(killed.gameplaySourceRevision).toMatch(/^[a-f0-9]{40}$/);

    const gateStarted = Date.now();
    while (!selfPosition || selfPosition.z > -72_000) {
      if (Date.now() - gateStarted > 35_000) throw new Error("NORTH_ROUTE_NOT_REACHED");
      sendMove(0, -1);
      await sleep(100);
    }
    sendMove(0, 0);
    const northGate = { ...selfPosition };

    expect(rejects.filter(code => code !== "COMBATANT_DEAD")).toEqual([]);
    return {
      spawn: { x: 0, z: 0 },
      target: {
        entityId: target.entityId,
        archetype: target.archetype,
        initialHealth: target.health,
        initialPosition: target.position,
      },
      combat: {
        killed: true,
        tick: killed.tick,
        sequence: killed.sequence,
        damage: killed.damage,
        gameplaySourceRevision: killed.gameplaySourceRevision,
      },
      northGate,
      lastClientSeq: clientSeq,
    };
  } finally {
    socket.close();
  }
}

suite("starter village pilot over compiled HTTP/tRPC", () => {
  it("runs the current authored-quest, zone-combat and north-gate journey", async () => {
    if (phase !== "journey") return;
    expect(revision).toMatch(/^[a-f0-9]{40}$/);
    const database = new URL(process.env.DATABASE_URL!);
    expect(database.hostname).toBe("127.0.0.1");
    expect(database.pathname).toBe("/aurion_starter_pilot");
    await mkdir(evidenceDirectory, { recursive: true });
    await mkdir(privateStateDirectory, { recursive: true });

    let cookie = "";
    const handle = `starter_${revision.slice(0, 10)}`;
    const registration = await rpc<any>("auth.registerLocal", cookie, {
      handle,
      password: "Aurion-starter-pilot-only!",
    });
    cookie = registration.cookie;

    const initialWorld = (await rpc<any>("gameplay.openWorld", cookie)).data;
    const initialInventory = (await rpc<any>("player.ui", cookie)).data;
    expect(initialWorld.pointsOfInterest.some((poi: any) => poi.kind === "npc" && poi.state === "available")).toBe(true);

    const available = (await rpc<any[]>("aurionQuest.available", cookie)).data;
    expect(available.length).toBeGreaterThan(0);
    const template = available.find(value => value.templateId === "starter-wolves-6");
    expect(template?.templateId).toBe("starter-wolves-6");
    let offered: any;
    let questBefore: any;

    const route = await runAuthoritativeZoneJourney(cookie, registration.data.id, async northGate => {
      expect(northGate.z).toBeGreaterThanOrEqual(-34_000);
      expect(northGate.z).toBeLessThanOrEqual(-30_000);
      const interpreted = (await rpc<any>("gameplay.interpretNpcDialogue", cookie, {
        npcId: "starter_village_north_gate_guard",
        text: "Seid gegrüßt, ich brauche einen Auftrag.",
        idempotencyKey: `starter-pilot-dialogue-offer-${revision.slice(0, 16)}`,
      })).data;
      expect(interpreted.receiptId).toMatch(/^dialogue_/);
      const command = (await rpc<any>("gameplay.requestQuestActionFromDialogue", cookie, {
        dialogueReceiptId: interpreted.receiptId,
        actionKind: "offer_quest",
        questKey: "starter-wolves-6",
        idempotencyKey: `starter-pilot-command-offer-${revision.slice(0, 16)}`,
      })).data;
      expect(command.receipt.actionKind).toBe("offer_quest");

      offered = (await rpc<any>("aurionQuest.offer", cookie, { templateId: template!.templateId })).data;
      expect(offered.instance.state).toBe("offered");
      const accepted = (await rpc<any>("aurionQuest.accept", cookie, { instanceId: offered.instance.id })).data;
      expect(accepted.updatedInstance.state).toBe("active");
      questBefore = (await rpc<any>("aurionQuest.details", cookie, { instanceId: offered.instance.id }, "query")).data;
      expect(questBefore.instance.state).toBe("active");
    });
    const inventory = (await rpc<any>("player.ui", cookie)).data;
    const questInstances = (await rpc<any[]>("aurionQuest.myInstances", cookie)).data;
    expect(questInstances.some(instance => instance.id === offered.instance.id && instance.state === "active")).toBe(true);
    expect(inventory.userId).toBe(registration.data.id);

    const pool = createPool(process.env.DATABASE_URL!);
    const [legacySessions] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM gameplaySessions WHERE userId=?",
      [registration.data.id],
    );
    const [legacyReceipts] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM gameplayActionReceipts WHERE userId=?",
      [registration.data.id],
    );
    await pool.end();
    expect(Number(legacySessions[0]?.count ?? -1)).toBe(0);
    expect(Number(legacyReceipts[0]?.count ?? -1)).toBe(0);

    const questIdentity = {
      id: questBefore.instance.id,
      templateId: questBefore.instance.templateId,
      state: questBefore.instance.state,
      planHash: questBefore.instance.planHash,
      graphHash: questBefore.instance.graphHash,
      currentNodeId: questBefore.instance.currentNodeId,
    };
    const evidence = {
      schema: "aurion.starter-village-pilot.journey.v2",
      sourceRevision: revision,
      userId: registration.data.id,
      serverConfirmedNpc: initialWorld.pointsOfInterest.find((poi: any) => poi.kind === "npc" && poi.state === "available"),
      authoredQuest: questIdentity,
      zoneJourney: route,
      legacyEncounterAuthority: { sessions: 0, actionReceipts: 0, retiredRoutesUsed: false },
      inventoryReadback: inventory,
      initialInventoryIds: initialInventory.items.map((item: any) => item.id).sort(),
      browserEmulationOnly: true,
    };
    await writeFile(
      path.join(evidenceDirectory, `journey-${revision}.json`),
      JSON.stringify(evidence, null, 2) + "\n",
      { flag: "wx" },
    );
    await writeFile(
      sessionFile,
      JSON.stringify({
        cookie,
        userId: registration.data.id,
        questIdentity,
        inventoryIds: inventory.items.map((item: any) => item.id).sort(),
      }) + "\n",
      { flag: "wx" },
    );
  }, 120_000);

  it("reads authored quest and inventory state after application restart", async () => {
    if (phase !== "readback") return;
    expect(revision).toMatch(/^[a-f0-9]{40}$/);
    const session = JSON.parse(await readFile(sessionFile, "utf8"));
    const quest = (await rpc<any>("aurionQuest.details", session.cookie, { instanceId: session.questIdentity.id }, "query")).data;
    const inventory = (await rpc<any>("player.ui", session.cookie)).data;

    expect({
      id: quest.instance.id,
      templateId: quest.instance.templateId,
      state: quest.instance.state,
      planHash: quest.instance.planHash,
      graphHash: quest.instance.graphHash,
      currentNodeId: quest.instance.currentNodeId,
    }).toEqual(session.questIdentity);
    expect(inventory.userId).toBe(session.userId);
    expect(inventory.items.map((item: any) => item.id).sort()).toEqual(session.inventoryIds);

    await writeFile(
      path.join(evidenceDirectory, `restart-readback-${revision}.json`),
      JSON.stringify({
        schema: "aurion.starter-village-pilot.restart-readback.v2",
        sourceRevision: revision,
        authenticatedSessionReusedAfterRestart: true,
        authoredQuestReadback: session.questIdentity,
        inventoryItemIds: session.inventoryIds,
      }, null, 2) + "\n",
      { flag: "wx" },
    );
  }, 30_000);
});
