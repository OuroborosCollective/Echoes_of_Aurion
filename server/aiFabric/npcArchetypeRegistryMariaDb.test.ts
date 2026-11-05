import { execFileSync } from "node:child_process";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    await db.transaction(tx => promoteNpcArchetype(tx, { archetypeId: payload.archetypeId, expectedRevision: 0, mutationReceiptId: "registry-test-approval-1", sourceRevision: payload.regression.sourceRevision }));
    for (const hub of ["observatory_threshold", "windhollow"] as const) await resolveAndRecordNpc(merchantGenesisRequest(hub), undefined, { bindControllerAtGenesis: true });
    const first = await readNpcControllerBinding(merchantIds[0]);
    const second = await readNpcControllerBinding(merchantIds[1]);
    firstBinding = first;
    expect(first).toMatchObject({ npcId: merchantIds[0], registryRevision: 1, artifactHash: payload.artifactHash, status: "BOUND_SHADOW" });
    expect(second).toMatchObject({ npcId: merchantIds[1], registryRevision: 1, artifactHash: payload.artifactHash, status: "BOUND_SHADOW" });
    expect(first!.bindingHash).not.toBe(second!.bindingHash);
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
    const requests = await Promise.allSettled([0,1].map(() => db.transaction(tx => promoteNpcArchetype(tx, {
      archetypeId: payload.archetypeId, expectedRevision: 1, mutationReceiptId: "registry-test-approval-2", sourceRevision: payload.regression.sourceRevision,
    }))));
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
  });

  it("unknown identities gain no merchant rights even when their profession claims merchant", async () => {
    await resolveAndRecordNpc({ npcId: "registry-test-unknown", regionId: "observatory_threshold", roleId: "merchant", resolutionIndex: 0, needEvents: [], observationIds: [], memory: [] }, undefined, { bindControllerAtGenesis: true });
    expect(await readNpcControllerBinding("registry-test-unknown")).toMatchObject({ archetypeId: null, artifactHash: null, status: "CANONICAL_FALLBACK" });
    const db = (await getDb())!;
    expect((await db.transaction(tx => readBoundController(tx, "registry-test-unknown"))).candidate).toBeNull();
  });

  it("links a bounded proposal to real canonical validation, committed effects and independent receipt readback", async () => {
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
    expect(["MATCHES_CANONICAL_ACTION", "REJECTED_CANONICAL_ACTION_MISMATCH"]).toContain(shadow!.proposalDisposition);
    expect((await executeConfirmedMerchantAction(input)).status).toBe("persisted");
    expect(await readNpcControllerShadowReceipt(result.actionReceiptId)).toEqual(shadow);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionNpcControllerShadowReceipts WHERE actionReceiptId=?", [result.actionReceiptId]);
    expect(Number(rows[0].n)).toBe(1);
  });

});
