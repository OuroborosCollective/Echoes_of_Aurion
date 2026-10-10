import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { executeProductionProbe } from "./aurion-production-probe-client.mjs";
import { ZONE_PROTOCOL_VERSION, validConfirmedPresences } from "../shared/zonePresenceContract";
import { verifySnapshot } from "./aurion-production-assurance.mjs";
import { requireProbePersistenceEvidence } from "../shared/aurionProductionProbeEvidence";

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
export function requireFunctionalProbeReceipt(observed: any, sourceRevision: string) {
  requireGameplayHealth(observed.healthBefore, sourceRevision);
  requireGameplayHealth(observed.health, sourceRevision);
  if (observed.worldJoin !== "CONFIRMED" || observed.zoneHandshake !== "CONFIRMED") throw new Error("READ_ONLY_PROBE_WORLD_JOIN_UNVERIFIED");
  requireZoneWelcome(observed.welcome);
  const snapshot = observed.snapshot;
  if (snapshot?.zoneId !== zoneId || snapshot.snapshotSeq <= observed.welcome.snapshotSeq || snapshot.tick <= observed.welcome.tick
    || !validConfirmedPresences(snapshot.presences) || !snapshot.presences.some((p: any) => p.entityId === observed.welcome.selfEntityId)) throw new Error("SNAPSHOT_INVALID");
  if (!requireNpcAdvance(observed.healthBefore, observed.health)) throw new Error("NPC_FIXED_TICK_NOT_CONFIRMED");
  if (!Number.isSafeInteger(observed.guilds?.guildCount) || !Array.isArray(observed.guilds?.guilds)) throw new Error("NPC_GUILD_READBACK_FAILED");
  if (!verifySnapshot(observed.assurance) || observed.assurance.status === "CONTRADICTED") throw new Error("CAUSAL_ASSURANCE_READBACK_INVALID");
  requireProbePersistenceEvidence(observed.persistence, sourceRevision, zoneId, observed.welcome.tick, snapshot.tick);
  return { recordType: "aurion_production_gameplay_readback", schemaVersion: 1, sourceRevision,
    approvalId: observed.approvalId, runId: observed.runId, runAttempt: observed.runAttempt,
    observedAt: new Date().toISOString(), status: "PASS", worldJoin: "CONFIRMED", zoneHandshake: "CONFIRMED",
    welcomeTick: observed.welcome.tick, snapshotTick: snapshot.tick, npcStatus: observed.health.npcLife.status,
    npcGatewayTick: observed.health.npcLife.lastGatewayTick, npcResolutionIndex: observed.health.npcLife.lastResolutionIndex,
    npcGuildCount: observed.guilds.guildCount, causalAssuranceStatus: observed.assurance.status,
    membershipPersistence: observed.persistence,
    causalAssuranceHash: observed.assurance.snapshotHash, visualStatus: "UNVERIFIED", credentialReturned: false };
}
export async function run() {
  // This is deliberately not the read-only observation scope. A real welcome
  // and subsequent snapshot require the separately owner-approved, short
  // canonical probe session.
  return requireFunctionalProbeReceipt(await executeProductionProbe("aurion.probe.gameplay-session-readback"), process.env.AURION_EXPECTED_SHA ?? "");
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
