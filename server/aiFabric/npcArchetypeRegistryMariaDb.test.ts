import { createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../db";
import { commitNpcPolicyMutation } from "../wasdNpcEvolutionPersistence";
import { npcCapsulePin as pin } from "../aurion/npc/authority";
import { merchantGenesisRequest, npcIdentity } from "../aurion/npc/merchantRules";
import { npcHash } from "../wasdNpcCapsule";
import { resolveAndRecordNpc } from "../wasdAurionRuntime";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { behaviorTemplate } from "./behaviorForge";
import { promoteNpcArchetype, readNpcControllerBinding } from "../npcArchetypePersistence";

const suite = process.env.AURION_WORLD_AUTHORING_DB_TEST === "1" && process.env.DATABASE_URL ? describe : describe.skip;
suite("Archetype binding through actual isolated MariaDB and canonical merchant genesis", () => {
  let pool: Pool;
  const merchantIds = [npcIdentity("observatory_threshold"), npcIdentity("windhollow")];
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
    expect(first).toMatchObject({ npcId: merchantIds[0], registryRevision: 1, artifactHash: payload.artifactHash, status: "BOUND_SHADOW" });
    expect(second).toMatchObject({ npcId: merchantIds[1], registryRevision: 1, artifactHash: payload.artifactHash, status: "BOUND_SHADOW" });
    expect(first!.bindingHash).not.toBe(second!.bindingHash);
    const [rows] = await pool.query("SELECT artifactHash FROM aurionNpcControllerArtifacts");
    expect(rows).toHaveLength(1);
    expect((await resolveAndRecordNpc(merchantGenesisRequest("observatory_threshold"))).source).toBe("persisted");
    expect(await readNpcControllerBinding(merchantIds[0])).toEqual(first);
  });
});
