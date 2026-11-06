import { execFileSync } from "node:child_process";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aurionNpcStates } from "../../drizzle/schema";
import { getDb } from "../db";
import { commitNpcPolicyMutation } from "../wasdNpcEvolutionPersistence";
import { npcCapsulePin as pin } from "../aurion/npc/authority";
import { merchantGenesisRequest, npcIdentity } from "../aurion/npc/merchantRules";
import { npcHash, merchantBootstrapMarkets, merchantMarketStateHash, merchantInventoryStateHash, merchantPolityStateHash } from "../wasdNpcCapsule";
import { executeConfirmedMerchantAction, readConfirmedMerchantActionSource } from "../npcActionGatewayPersistence";
import { readNpcControllerShadowReceipt } from "../npcControllerShadowPersistence";
import { resolveAndRecordNpc } from "../wasdAurionRuntime";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { behaviorTemplate } from "./behaviorForge";
import { promoteNpcArchetype, readNpcControllerBinding, bindNpcControllerAtGenesis, readBoundController } from "../npcArchetypePersistence";
import { useNpcSharedTableLock } from "../testSupport/npcSharedTableLock";

// Shares the append-only NPC memory/semantic-graph tables with other DB test files.
useNpcSharedTableLock();

const suite = process.env.AURION_WORLD_AUTHORING_DB_TEST === "1" && process.env.DATABASE_URL ? describe : describe.skip;
suite("Archetype binding through actual isolated MariaDB and canonical merchant genesis", () => {
  let pool: Pool;
  const merchantIds = [npcIdentity("observatory_threshold"), npcIdentity("windhollow")];
  let firstBinding: Awaited<ReturnType<typeof readNpcControllerBinding>>;
  let originalPayload: any;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
  });
  afterAll(async () => { await pool?.end(); });

  it("can create distinct canonical NPCs concurrently before any registry approval exists", async () => {
    await Promise.all((["observatory_threshold", "windhollow"] as const).map(hub => resolveAndRecordNpc(merchantGenesisRequest(hub), undefined, { bindControllerAtGenesis: true })));
    for (const npcId of merchantIds) expect(await readNpcControllerBinding(npcId)).toMatchObject({ status: "CANONICAL_FALLBACK", artifactHash: null });
    // End the entire isolated fixture lifetime, including immutable memory.
    // Keeping its memory while deleting state correctly fails STATE_GAP.
    for (const table of ["aurionNpcControllerBindings", "aurionSemanticGraphIndexV2",
      "aurionSemanticGraphProvenanceV2", "aurionSemanticGraphEdgesV2", "aurionSemanticGraphNodesV2",
      "aurionSemanticGraphReceiptsV2", "aurionNpcMemoryReceiptsV4"]) await pool.query(`TRUNCATE TABLE ${table}`);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId IN (?,?)", merchantIds);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId IN (?,?)", merchantIds);
  });

  it("binds two canonical NPC identities to one shared approved artifact, then reads the binding independently", async () => {
    const db = (await getDb())!;
    const artifact = behaviorTemplate("blacksmith", "utility");
    const payload = {
      schemaVersion: "NpcArchetypeControllerRegistry.v1", archetypeId: "aurion.merchant.economy.v1",
      observationSchema: "aurion-npc-utility-planner.v1", actionSchema: "wasd-npc-action-gateway.v1", execution: "shadow",
      artifact, artifactHash: canonicalSha256(artifact),
      regression: { sourceRevision: "e97a0027d69c6a3a3bf32c3590fdcac38b2d114b", suite: "npc-archetype-regression.v1", resultDigest: canonicalSha256("isolated-test-evidence"), verdict: "passed" },
    };
    originalPayload = payload;
    // Test data enters the existing canonical policy custody API. It is not a release approval.
    await db.transaction(tx => commitNpcPolicyMutation(tx, {
      mutationReceiptId: "registry-test-approval-1", npcId: "registry-test-authoring", previousVersion: null, previousPolicyHash: null,
      nextVersion: 1, nextPolicyHash: npcHash(payload), rejectedCandidateHash: null, verdict: "accepted", reason: "Isolated registry regression",
      provenanceDigest: canonicalSha256(payload), evidenceWindow: { startIndex: 0, endIndex: 0 },
      fitnessContract: { version: payload.regression.suite, resultDigest: payload.regression.resultDigest.slice(7) },
      mutationRule: { version: "npc-archetype-registry.v1" }, envelopeHash: npcHash(payload), rollbackTargetVersion: null,
      sourceRevision: pin.sourceRevision, sourceSha256: pin.sourceSha256, payload,
    }));
    await db.transaction(tx => commitNpcPolicyMutation(tx, {
      mutationReceiptId: "registry-test-individual", npcId: merchantIds[1], previousVersion: null, previousPolicyHash: null,
      nextVersion: 7, nextPolicyHash: npcHash(payload), rejectedCandidateHash: null, verdict: "accepted", reason: "Approved isolated individual policy",
      provenanceDigest: canonicalSha256(payload), evidenceWindow: { startIndex: 0, endIndex: 0 },
      fitnessContract: { version: payload.regression.suite, resultDigest: payload.regression.resultDigest.slice(7) },
      mutationRule: { version: "npc-archetype-registry.v1" }, envelopeHash: npcHash(payload), rollbackTargetVersion: null,
      sourceRevision: pin.sourceRevision, sourceSha256: pin.sourceSha256, payload,
    }));
    await db.transaction(tx => promoteNpcArchetype(tx, { archetypeId: payload.archetypeId, expectedRevision: 0, mutationReceiptId: "registry-test-approval-1", sourceRevision: payload.regression.sourceRevision }));
    await Promise.all((["observatory_threshold", "windhollow"] as const).map(hub => resolveAndRecordNpc(merchantGenesisRequest(hub), undefined, { bindControllerAtGenesis: true })));
    const first = await readNpcControllerBinding(merchantIds[0]);
    const second = await readNpcControllerBinding(merchantIds[1]);
    firstBinding = first;
    expect(first).toMatchObject({ npcId: merchantIds[0], registryRevision: 1, artifactHash: payload.artifactHash, status: "BOUND_SHADOW" });
    expect(second).toMatchObject({ npcId: merchantIds[1], registryRevision: 1, artifactHash: payload.artifactHash, status: "BOUND_SHADOW" });
    expect(first!.bindingHash).not.toBe(second!.bindingHash);
    expect(second!.individualMutationReceiptId).toBe("registry-test-individual");
    const [rows] = await pool.query("SELECT artifactHash FROM aurionNpcControllerArtifacts");
    expect(rows).toHaveLength(1);
    expect((await resolveAndRecordNpc(merchantGenesisRequest("observatory_threshold"))).source).toBe("persisted");
    expect(await readNpcControllerBinding(merchantIds[0])).toEqual(first);
  });
  it("serializes competing releases; new genesis advances while existing NPCs and replays stay pinned; rollback creates a new revision", async () => {
    const db = (await getDb())!;
    const artifact = { ...originalPayload.artifact, version: 2, bias: 10 };
    const payload = { ...originalPayload, artifact, artifactHash: canonicalSha256(artifact) };
    await db.transaction(tx => commitNpcPolicyMutation(tx, {
      mutationReceiptId: "registry-test-approval-2", npcId: "registry-test-authoring", previousVersion: 1, previousPolicyHash: npcHash(originalPayload),
      nextVersion: 2, nextPolicyHash: npcHash(payload), rejectedCandidateHash: null, verdict: "accepted", reason: "Isolated second version",
      provenanceDigest: canonicalSha256(payload), evidenceWindow: { startIndex: 1, endIndex: 1 },
      fitnessContract: { version: payload.regression.suite, resultDigest: payload.regression.resultDigest.slice(7) },
      mutationRule: { version: "npc-archetype-registry.v1" }, envelopeHash: npcHash(payload), rollbackTargetVersion: null,
      sourceRevision: pin.sourceRevision, sourceSha256: pin.sourceSha256, payload,
    }));
    await resolveAndRecordNpc(merchantGenesisRequest("emberfall"));
    const source = (await readConfirmedMerchantActionSource(npcIdentity("emberfall")))!;
    const requests = await db.transaction(async tx => {
      // Hold an older read view while another connection commits the next release.
      await tx.select().from(aurionNpcStates).limit(1);
      const results = await Promise.allSettled([0,1].map(() => db.transaction(other => promoteNpcArchetype(other, {
        archetypeId: payload.archetypeId, expectedRevision: 1, mutationReceiptId: "registry-test-approval-2", sourceRevision: payload.regression.sourceRevision,
      }))));
      await bindNpcControllerAtGenesis(tx, npcIdentity("emberfall"), source.receiptId);
      return results;
    }, { isolationLevel: "repeatable read" });
    expect(requests.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(requests.filter(r => r.status === "rejected")).toHaveLength(1);
    await resolveAndRecordNpc(merchantGenesisRequest("emberfall"), undefined, { bindControllerAtGenesis: true });
    expect(await readNpcControllerBinding(npcIdentity("emberfall"))).toMatchObject({ registryRevision: 2, artifactHash: payload.artifactHash });
    expect(await readNpcControllerBinding(merchantIds[0])).toEqual(firstBinding);
    await db.transaction(tx => promoteNpcArchetype(tx, { archetypeId: payload.archetypeId, expectedRevision: 2, mutationReceiptId: "registry-test-approval-1", sourceRevision: payload.regression.sourceRevision }));
    await resolveAndRecordNpc(merchantGenesisRequest("cinder_vault"), undefined, { bindControllerAtGenesis: true });
    expect(await readNpcControllerBinding(npcIdentity("cinder_vault"))).toMatchObject({ registryRevision: 3, artifactHash: originalPayload.artifactHash });
    expect(await readNpcControllerBinding(npcIdentity("emberfall"))).toMatchObject({ registryRevision: 2, artifactHash: payload.artifactHash });
    await expect(db.transaction(tx => bindNpcControllerAtGenesis(tx, merchantIds[0], firstBinding!.genesisReceiptId))).rejects.toThrow("EXPLICIT_MIGRATION_REQUIRED");
    for (let run = 0; run < 2; run++) {
      const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
        'import {readNpcControllerBinding} from "./server/npcArchetypePersistence.ts";import {resolveAndRecordNpc} from "./server/wasdAurionRuntime.ts";import {merchantGenesisRequest} from "./server/aurion/npc/merchantRules.ts";const snapshot=await resolveAndRecordNpc(merchantGenesisRequest("observatory_threshold"));const binding=await readNpcControllerBinding("ax1_merchant_observatory_threshold");console.log(JSON.stringify({hash:snapshot.decision.decisionHash,binding}));process.exit(0);'],
        { cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 30000 });
      const restarted = JSON.parse(output.trim().split("\n").at(-1)!);
      expect(restarted.binding).toEqual(firstBinding);
      expect(restarted.hash).toBe((await resolveAndRecordNpc(merchantGenesisRequest("observatory_threshold"))).decision.decisionHash);
    }
  // Two independent server processes each have a 30s startup/readback bound.
  // Keep an explicit total budget instead of Vitest's unrelated 5s default.
  }, 75_000);

  it("unknown identities gain no merchant rights even when their profession claims merchant", async () => {
    await resolveAndRecordNpc({ npcId: "registry-test-unknown", regionId: "observatory_threshold", roleId: "merchant", resolutionIndex: 0, needEvents: [], observationIds: [], memory: [] }, undefined, { bindControllerAtGenesis: true });
    expect(await readNpcControllerBinding("registry-test-unknown")).toMatchObject({ archetypeId: null, artifactHash: null, status: "CANONICAL_FALLBACK" });
    const db = (await getDb())!;
    expect((await db.transaction(tx => readBoundController(tx, "registry-test-unknown"))).candidate).toBeNull();
  });

  it("compares a shadow proposal with separately validated canonical effects and persisted receipt readback", async () => {
    // Disposable isolated inventory epochs; no production data or mocks.
    await pool.query("TRUNCATE TABLE aurionNpcActionEpochStates");
    for (const market of Object.values(merchantBootstrapMarkets)) {
      const hubId = market.hubId, ownerId = `market:${hubId}`;
      const entries = Object.entries(market.stock).map(([itemId, quantity]) => ({ itemId, quantity, capacity: 1_000_000 }));
      const inventory = { ownerId, entries, stateHash: merchantInventoryStateHash({ ownerId, market, entries }) };
      const polityId = `polity:${hubId}`;
      await pool.query("INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId, true, 0, JSON.stringify(market), merchantMarketStateHash(market), JSON.stringify(inventory), inventory.stateHash, 0, polityId, 72, merchantPolityStateHash({ polityId, version: 0, stability: 72 }), pin.sourceRevision, pin.sourceSha256]);
    }
    const source = (await readConfirmedMerchantActionSource(merchantIds[0]))!;
    const input = { worldSeed: "registry-isolated-world", homeHubId: "observatory_threshold" as const, sourceDecisionReceiptId: source.receiptId };
    const result = await executeConfirmedMerchantAction(input);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") throw Error("CANONICAL_ACTION_DID_NOT_COMMIT");
    const shadow = await readNpcControllerShadowReceipt(result.actionReceiptId);
    expect(shadow).toMatchObject({ execution: "shadow", mutationAuthority: "none", npcId: merchantIds[0], bindingHash: firstBinding!.bindingHash,
      canonicalActionReceiptId: result.actionReceiptId, canonicalAction: result.resolution.action, sourceDecisionReceiptId: source.receiptId });
    expect(shadow!.proposal).not.toBeNull();
    expect(["MATCHES_CANONICAL_ACTION", "DIFFERS_FROM_CANONICAL_ACTION"]).toContain(shadow!.proposalDisposition);
    expect((await executeConfirmedMerchantAction(input)).status).toBe("persisted");
    expect(await readNpcControllerShadowReceipt(result.actionReceiptId)).toEqual(shadow);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionNpcControllerShadowReceipts WHERE actionReceiptId=?", [result.actionReceiptId]);
    expect(Number(rows[0].n)).toBe(1);
  });

  it("rejects unapproved releases and corrupt artifacts, continuing only through the canonical fallback", async () => {
    const db = (await getDb())!;
    await expect(db.transaction(tx => promoteNpcArchetype(tx, { archetypeId: "aurion.merchant.economy.v1", expectedRevision: 3, mutationReceiptId: "not-approved", sourceRevision: originalPayload.regression.sourceRevision }))).rejects.toThrow("APPROVAL_REQUIRED");
    await expect(pool.query("UPDATE aurionNpcControllerArtifacts SET artifactJson='{}' WHERE artifactHash=?", [originalPayload.artifactHash])).rejects.toThrow("APPEND_ONLY");
    // Corruption fault injection in the explicitly isolated database. Restore the
    // original guard and exact bytes even when an assertion fails.
    const [[trigger]] = await pool.query<RowDataPacket[]>("SHOW CREATE TRIGGER aurionNpcControllerArtifacts_no_update") as unknown as [RowDataPacket[]];
    const ddl = String(trigger["SQL Original Statement"]);
    await pool.query("DROP TRIGGER aurionNpcControllerArtifacts_no_update");
    try {
      await pool.query("UPDATE aurionNpcControllerArtifacts SET artifactJson='{}' WHERE artifactHash=?", [originalPayload.artifactHash]);
      await expect(db.transaction(tx => readBoundController(tx, merchantIds[0]))).rejects.toThrow("ARTIFACT_HASH_MISMATCH");
      const source = (await readConfirmedMerchantActionSource(merchantIds[0]))!;
      const result = await executeConfirmedMerchantAction({ worldSeed: "registry-isolated-world", homeHubId: "observatory_threshold", sourceDecisionReceiptId: source.receiptId });
      expect(result.status).toBe("committed");
      if (result.status !== "committed") throw Error("FALLBACK_DID_NOT_CONTINUE");
      expect(await readNpcControllerShadowReceipt(result.actionReceiptId)).toMatchObject({ proposal: null, proposalDisposition: "CANONICAL_FALLBACK", reason: "CONTROLLER_VERIFICATION_FAILED" });
    } finally {
      await pool.query("UPDATE aurionNpcControllerArtifacts SET artifactJson=? WHERE artifactHash=?", [JSON.stringify(originalPayload.artifact), originalPayload.artifactHash]);
      await pool.query(ddl);
    }
  });

  it("releases different archetypes concurrently without granting resident commerce rights", async () => {
    const db = (await getDb())!;
    const candidates = [
      { archetypeId: "aurion.merchant.economy.v1", expectedRevision: 3, artifact: { ...behaviorTemplate("blacksmith", "utility"), version: 3 } },
      { archetypeId: "aurion.resident.social.v1", expectedRevision: 0, artifact: behaviorTemplate("questgiver", "utility") },
    ];
    for (const [index, candidate] of candidates.entries()) {
      const payload = { ...originalPayload, archetypeId: candidate.archetypeId, artifact: candidate.artifact, artifactHash: canonicalSha256(candidate.artifact) };
      await db.transaction(tx => commitNpcPolicyMutation(tx, {
        mutationReceiptId: `registry-cross-archetype-${index}`, npcId: `registry-test-authoring-${index}`, previousVersion: null, previousPolicyHash: null,
        nextVersion: 1, nextPolicyHash: npcHash(payload), rejectedCandidateHash: null, verdict: "accepted", reason: "Isolated cross-archetype concurrency",
        provenanceDigest: canonicalSha256(payload), evidenceWindow: { startIndex: 0, endIndex: 0 },
        fitnessContract: { version: payload.regression.suite, resultDigest: payload.regression.resultDigest.slice(7) },
        mutationRule: { version: "npc-archetype-registry.v1" }, envelopeHash: npcHash(payload), rollbackTargetVersion: null,
        sourceRevision: pin.sourceRevision, sourceSha256: pin.sourceSha256, payload,
      }));
    }
    const released = await Promise.all(candidates.map((candidate, index) => db.transaction(tx => promoteNpcArchetype(tx, {
      archetypeId: candidate.archetypeId, expectedRevision: candidate.expectedRevision,
      mutationReceiptId: `registry-cross-archetype-${index}`, sourceRevision: originalPayload.regression.sourceRevision,
    }))));
    expect(released.map(r => r.revision)).toEqual([4, 1]);
    expect(new Set(released.map(r => r.artifactHash)).size).toBe(2);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT artifactJson FROM aurionNpcControllerArtifacts WHERE artifactHash=?", [released[1].artifactHash]);
    expect(JSON.parse(rows[0].artifactJson).allowedActions).toEqual(["socialize", "rest", "consume"]);
    expect(await readNpcControllerBinding(merchantIds[0])).toEqual(firstBinding);
  });

});
