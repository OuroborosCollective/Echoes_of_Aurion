import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import WebSocket from "ws";
import { ZONE_PROTOCOL_VERSION, validConfirmedPresences } from "../shared/zonePresenceContract";
import { verifySnapshot } from "./aurion-production-assurance.mjs";

const origin = "https://arelogic.space";
const zoneId = "observatory_threshold";
export function requireGameplayHealth(health: any, expectedSha: string) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || health?.status !== "ok" || health.service !== "echoes-of-aurion" || health.revision !== expectedSha) throw new Error("GAMEPLAY_REVISION_MISMATCH");
  if (health.npcLife?.status === "degraded" || health.npcLife?.failureCode) throw new Error("NPC_LIFE_DEGRADED");
  if (!health.npcLife?.enabled) throw new Error("NPC_LIFE_DISABLED");
  return health;
}
export function requireZoneWelcome(message: any) {
  if (message?.type !== "welcome" || message.protocolVersion !== ZONE_PROTOCOL_VERSION || message.zoneId !== zoneId
    || !Number.isSafeInteger(message.tick) || !Number.isSafeInteger(message.snapshotSeq)
    || !validConfirmedPresences(message.presences) || !message.presences.some((p: any) => p.entityId === message.selfEntityId)) throw new Error("WORLD_JOIN_NOT_CONFIRMED");
}
export function requireNpcAdvance(before: any, after: any) {
  const a = before.npcLife, b = after.npcLife;
  return b?.status === "confirmed" && Number.isSafeInteger(b.lastGatewayTick)
    && b.lastGatewayTick > (a.lastGatewayTick ?? -1)
    && Number.isSafeInteger(b.lastResolutionIndex) && b.lastResolutionIndex > (a.lastResolutionIndex ?? -1)
    && /^[a-f0-9]{64}$/.test(b.decisionHash ?? "") && b.npcGuilds?.enabled === true;
}
async function run() {
  const sourceRevision = process.env.AURION_EXPECTED_SHA ?? "";
  const session = process.env.AURION_READBACK_SESSION ?? "";
  if (!/^[A-Za-z0-9._~-]{20,8192}$/.test(session)) throw new Error("AUTHENTICATED_PROBE_SESSION_REQUIRED");
  const headers = { accept: "application/json", cookie: `app_session_id=${session}`, origin };
  const request = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, { ...init, headers: { ...headers, ...init.headers }, redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error("GAMEPLAY_HTTP_READBACK_FAILED");
    return response.json();
  };
  const health = async () => requireGameplayHealth(await request(`${origin}/healthz?revision=${sourceRevision}`), sourceRevision);
  const trpc = async (procedure: string, input?: unknown, mutation = false) => {
    const url = new URL(`/api/trpc/${procedure}`, origin);
    if (!mutation && input !== undefined) url.searchParams.set("input", JSON.stringify({ json: input }));
    const body = await request(url.href, mutation ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: input }) } : {});
    if (!body?.result?.data || body.error) throw new Error("GAMEPLAY_PROCEDURE_READBACK_FAILED");
    return body.result.data.json;
  };
  const before = await health();
  // The configured session belongs to an existing authorized probe account.
  // No account, role, bypass token or synthetic gameplay receipt is created.
  const issued = await trpc("gameplay.issueZoneTicket", { zoneId, clientBuild: `schema-proof-${sourceRevision}` }, true);
  if (typeof issued?.ticket !== "string" || !/^aurion_zone_[A-Za-z0-9_-]{40,}$/.test(issued.ticket)) throw new Error("ZONE_TICKET_INVALID");
  let socket: WebSocket | undefined;
  try {
    const join = await new Promise<{ welcomeTick: number; snapshotTick: number }>((resolve, reject) => {
      socket = new WebSocket("wss://arelogic.space/v1/ws", { origin, handshakeTimeout: 10_000, maxPayload: 1_048_576 });
      const timer = setTimeout(() => reject(new Error("WORLD_JOIN_TIMEOUT")), 20_000);
      let welcome: any;
      let settled = false;
      const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error("ZONE_HANDSHAKE_FAILED")); } };
      socket.once("open", () => socket!.send(JSON.stringify({ type: "hello", ticket: issued.ticket, zoneId, protocolVersion: ZONE_PROTOCOL_VERSION })));
      socket.on("error", fail);
      socket.on("close", fail);
      socket.on("message", raw => {
        if (settled) return;
        try {
          const value = JSON.parse(raw.toString());
          if (!welcome) { requireZoneWelcome(value); welcome = value; return; }
          if (value.type !== "snapshot") return;
          if (value.zoneId !== zoneId || value.snapshotSeq <= welcome.snapshotSeq || value.tick <= welcome.tick
            || !validConfirmedPresences(value.presences) || !value.presences.some((p: any) => p.entityId === welcome.selfEntityId)) throw new Error("SNAPSHOT_INVALID");
          settled = true; clearTimeout(timer);
          resolve({ welcomeTick: welcome.tick, snapshotTick: value.tick });
        } catch { fail(); }
      });
    });
    let after = before;
    for (let attempt = 0; attempt < 40; attempt++) {
      after = await health();
      if (requireNpcAdvance(before, after)) break;
      await new Promise(resolve => setTimeout(resolve, 3_000));
    }
    if (!requireNpcAdvance(before, after)) throw new Error("NPC_FIXED_TICK_NOT_CONFIRMED");
    const guilds = await trpc("history.getGuildOverview");
    if (guilds?.available !== true || !Number.isSafeInteger(guilds.npcGuilds?.guildCount) || !Array.isArray(guilds.npcGuilds.guilds)) throw new Error("NPC_GUILD_READBACK_FAILED");
    const assurance = await trpc("gameplay.assuranceStatus", { worldId: "echoes-of-aurion-global" });
    if (assurance?.mutationAuthority !== "none" || !verifySnapshot(assurance.snapshot) || assurance.snapshot.status === "CONTRADICTED") throw new Error("CAUSAL_ASSURANCE_READBACK_INVALID");
    await health(); // The revision must still match after all functional probes.
    return { recordType: "aurion_production_gameplay_readback", schemaVersion: 1, sourceRevision, observedAt: new Date().toISOString(),
      status: "PASS", worldJoin: "CONFIRMED", zoneHandshake: "CONFIRMED", ...join,
      npcStatus: after.npcLife.status, npcGatewayTick: after.npcLife.lastGatewayTick, npcResolutionIndex: after.npcLife.lastResolutionIndex,
      npcGuildCount: guilds.npcGuilds.guildCount, causalAssuranceStatus: assurance.snapshot.status,
      causalAssuranceHash: assurance.snapshot.snapshotHash, visualStatus: "UNVERIFIED", credentialReturned: false };
  } finally { socket?.terminate(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceRevision = process.env.AURION_EXPECTED_SHA ?? "";
  run().then(async receipt => {
    await writeFile("aurion-production-gameplay-readback.json", JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
  }).catch(async error => {
    const code = error instanceof Error && /^[A-Z_]{5,80}$/.test(error.message) ? error.message : "GAMEPLAY_READBACK_FAILED";
    const receipt = { recordType: "aurion_production_gameplay_readback", schemaVersion: 1, sourceRevision, status: "FAIL", errorClass: code, credentialReturned: false };
    await writeFile("aurion-production-gameplay-readback.json", JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt));
    process.exitCode = 2;
  });
}
