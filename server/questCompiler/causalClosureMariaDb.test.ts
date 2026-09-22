import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  aurionCausalTickReceipts,
  aurionEffectIntents,
  aurionQuestCausalAnchors,
  aurionTemporalEvents,
} from "../../drizzle/aurionCausalitySchema";
import { computeQuestStateHash } from "../../shared/aurionQuestCanonicalHash";
import type { QuestInstance } from "../../shared/aurionQuestContract";
import type { QuestCompleteSource } from "../../shared/aurionQuestDomainCommandContract";
import {
  readQuestCausalAnchorByReceiptId,
  resolveQuestCausalAnchor,
} from "./causalAnchor";
import { buildQuestCausalClosure } from "./causalClosure";
import { QuestPersistenceEngine } from "./persistence";
import { QuestRuntimeEngine } from "./runtime";
import { QuestTemplateRegistry } from "./templateRegistry";
import { WorldFactEngine } from "./worldFacts";
import { materializeQuestDomainCommand } from "./materialization";
import {
  readEncounterCompletionEvidence,
} from "../encounterCompletionEvidence";
import { cleanupQuestRegressionUser } from "../questRegressionFixture";
import { acceptGameplayQuest, applyGameplayAction, getDb, startGameplayEncounter } from "../db";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { globalTickRecorder } from "../causality/tickRecorder";
import { readTemporalEventById } from "../history/aurionTemporalEventPersistence";

const describeReal = process.env.DATABASE_URL && process.env.NODE_ENV === "test" && process.env.AURION_QUEST_CAUSAL_E2E === "1" && process.env.AURION_ENCOUNTER_E2E === "1" ? describe : describe.skip;
const TEST_USER_ID = 2_146_999_991;
const WORLD_ID = "echoes-of-aurion-global";

function testSocket() {
  return { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as any;
}

describeReal("AIM-298 Quest causal closure — real MariaDB", () => {
  beforeEach(() => cleanupQuestRegressionUser(TEST_USER_ID));
  afterEach(() => cleanupQuestRegressionUser(TEST_USER_ID));

  it("persists one real causal anchor/temporal/effect closure, retries idempotently, and rolls back a poisoned effect", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    // 1. Activate the existing legacy quest authority, then produce real durable encounter evidence.
    await acceptGameplayQuest({ userId: TEST_USER_ID, questKey: "astral_call" });
    const encounter = await startGameplayEncounter({ userId: TEST_USER_ID, encounterKey: "asterion" });
    for (const sequence of [1, 2, 3]) {
      const applied = await applyGameplayAction({
        userId: TEST_USER_ID,
        sessionId: encounter.session.id,
        sequence,
        command: "9",
        source: "human",
      });
      expect(applied.completed).toBe(sequence === 3);
    }
    const evidence = await readEncounterCompletionEvidence(TEST_USER_ID, encounter.session.id);
    expect(evidence.eventId).toBe(`evt_encounter_complete_${encounter.session.id}`);
    expect(evidence.evidenceHash).toMatch(/^[a-f0-9]{64}$/);

    // 2. Canonical quest compiler state; persistence stays the existing authority.
    const facts = new WorldFactEngine();
    facts.recordEvent({
      id: `evt_caravan_fixture_${TEST_USER_ID}`,
      type: "CARAVAN_ATTACKED",
      source: "quest.e2e",
      data: {
        caravanId: `caravan_${TEST_USER_ID}`,
        merchantId: "npc_merchant_kaelen",
        playerUserId: String(TEST_USER_ID),
      },
    });
    const trigger = facts.recordEvent({
      id: evidence.eventId,
      type: "ENCOUNTER_COMPLETED",
      source: "gameplay.encounter",
      data: {
        encounterKey: "asterion",
        playerUserId: TEST_USER_ID,
        evidenceHash: evidence.evidenceHash,
      },
    }).event;
    const registry = new QuestTemplateRegistry();
    const runtime = new QuestRuntimeEngine(facts, registry);
    const persistence = new QuestPersistenceEngine();

    const offered = runtime.compileAndOfferQuest({
      worldId: WORLD_ID,
      playerUserId: TEST_USER_ID,
      triggerEventId: trigger.id,
      requestedTemplateId: "tpl_caravan_investigation",
    });
    await persistence.savePlan(offered.plan);
    await persistence.saveInstance(offered.instance);

    const acceptedCommand = materializeQuestDomainCommand(offered.instance, offered.plan, {
      kind: "accept",
      instanceId: offered.instance.id,
      planHash: offered.instance.planHash,
      graphHash: offered.instance.graphHash,
      expectedStateHash: computeQuestStateHash(offered.instance),
      idempotencyKey: `accept:${offered.instance.id}`,
      eventSequence: 1,
    });
    const accepted = runtime.executeDomainCommand(acceptedCommand, offered.instance, offered.plan);
    const acceptedCommitted = await persistence.commitObjectiveTransition({
      instanceId: offered.instance.id,
      expectedStateHash: computeQuestStateHash(offered.instance),
      idempotencyKey: acceptedCommand.idempotencyKey,
      receipt: accepted.receipt,
      updatedInstance: accepted.updatedInstance,
    });

    const progressCommand = materializeQuestDomainCommand(acceptedCommitted.updatedInstance, offered.plan, {
      kind: "progress",
      instanceId: offered.instance.id,
      planHash: offered.plan.planHash,
      graphHash: offered.plan.graphHash,
      expectedStateHash: computeQuestStateHash(acceptedCommitted.updatedInstance),
      idempotencyKey: `progress:${offered.instance.id}:cargo_inspected:3`,
      eventSequence: 2,
      objectiveKey: "cargo_inspected",
      amount: 3,
    });
    const progressed = runtime.executeDomainCommand(progressCommand, acceptedCommitted.updatedInstance, offered.plan);
    expect(progressed.updatedInstance.currentNodeId).toBe("node_end");
    const progressedCommitted = await persistence.commitObjectiveTransition({
      instanceId: offered.instance.id,
      expectedStateHash: computeQuestStateHash(acceptedCommitted.updatedInstance),
      idempotencyKey: progressCommand.idempotencyKey,
      receipt: progressed.receipt,
      updatedInstance: progressed.updatedInstance,
    });

    // 3. Build the exact completion command from the authoritative quest state.
    const source: QuestCompleteSource = {
      triggerEventId: trigger.id,
      triggerEventDigest: trigger.payloadHash,
      sourceEvidenceId: evidence.eventId,
      sourceEvidenceDigest: evidence.evidenceHash,
      sourceLogicalRevision: progressedCommitted.updatedInstance.worldStateRevision!,
      compilerVersion: progressedCommitted.updatedInstance.compilerVersion!,
      sourceRevision: progressedCommitted.updatedInstance.sourceRevision!,
      templateSetHash: progressedCommitted.updatedInstance.templateSetHash!,
      candidateSetHash: progressedCommitted.updatedInstance.candidateSetHash!,
      seedDigest: progressedCommitted.updatedInstance.seedDigest!,
      roleBindingHash: progressedCommitted.updatedInstance.roleBindingHash!,
    };
    const completionCommand = materializeQuestDomainCommand(progressedCommitted.updatedInstance, offered.plan, {
      kind: "complete",
      instanceId: progressedCommitted.updatedInstance.id,
      planHash: offered.plan.planHash,
      graphHash: offered.plan.graphHash,
      expectedStateHash: computeQuestStateHash(progressedCommitted.updatedInstance),
      idempotencyKey: `complete:${offered.instance.id}`,
      eventSequence: 3,
      ...source,
    });
    const completion = runtime.executeDomainCommand(completionCommand, progressedCommitted.updatedInstance, offered.plan);

    // 4. Real 10 Hz zone receipts: accepted -> completed hand-in.
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    zone.sourceRevisionOverride = progressedCommitted.updatedInstance.sourceRevision!;
    zone.join({ userId: TEST_USER_ID, socket: testSocket() });
    zone.enqueueIntent({
      type: "quest_accept",
      connectionId: "e2e",
      entityId: `player:${TEST_USER_ID}`,
      clientSeq: 1,
      arrivalSeq: 1,
      questId: progressedCommitted.updatedInstance.templateId,
    });
    zone.tick();
    await globalTickRecorder.flushPersistence();

    zone.enqueueIntent({
      type: "quest_hand_in",
      connectionId: "e2e",
      entityId: `player:${TEST_USER_ID}`,
      clientSeq: 2,
      arrivalSeq: 2,
      questId: progressedCommitted.updatedInstance.templateId,
      instanceId: completionCommand.instanceId,
      commandId: completionCommand.commandId,
      planHash: completionCommand.planHash,
      graphHash: completionCommand.graphHash,
      expectedStateHash: completionCommand.expectedStateHash,
      triggerEventId: completionCommand.triggerEventId,
      triggerEventDigest: completionCommand.triggerEventDigest,
      sourceEvidenceId: completionCommand.sourceEvidenceId,
      sourceEvidenceDigest: completionCommand.sourceEvidenceDigest,
      sourceLogicalRevision: completionCommand.sourceLogicalRevision,
      compilerVersion: completionCommand.compilerVersion,
      sourceRevision: completionCommand.sourceRevision,
      templateSetHash: completionCommand.templateSetHash,
      candidateSetHash: completionCommand.candidateSetHash,
      seedDigest: completionCommand.seedDigest,
      roleBindingHash: completionCommand.roleBindingHash,
    });
    zone.tick();
    await globalTickRecorder.flushPersistence();
    const epoch = await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: TEST_USER_ID,
      idempotencyKey: `aim298:quest:epoch:${offered.instance.id}`,
      now: new Date("2026-01-01T00:00:02.000Z"),
    });
    expect(epoch.plan.epoch).toBeGreaterThan(0);

    const realReceipts = await db.select().from(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.worldId, WORLD_ID));
    expect(realReceipts.some(row => row.inputJson?.includes(completionCommand.commandId))).toBe(true);

    // 5. Resolve the exact real causal tick and build the closure.
    const anchor = await resolveQuestCausalAnchor({
      instance: progressedCommitted.updatedInstance,
      plan: offered.plan,
      command: completionCommand,
      receipt: completion.receipt,
    });
    const closure = buildQuestCausalClosure({
      instance: progressedCommitted.updatedInstance,
      plan: offered.plan,
      command: completionCommand,
      receipt: completion.receipt,
      anchor: anchor.anchor,
    });

    // 6. Atomic rollback: receipt + anchor + temporal + earlier effect must all disappear.
    const poisonedClosure = {
      ...closure,
      effectIntents: Object.freeze([
        ...closure.effectIntents.slice(0, -1),
        { ...closure.effectIntents.at(-1)!, authorityReceiptHash: "sha256:" + "0".repeat(64) },
      ]),
    };
    const rollbackReceipt = {
      ...completion.receipt,
      id: `rcpt_${completion.receipt.id}_rollback`,
      eventSequence: 3,
      idempotencyKey: `complete:${offered.instance.id}:rollback`,
    };
    await expect(persistence.commitObjectiveTransition({
      instanceId: progressedCommitted.updatedInstance.id,
      expectedStateHash: computeQuestStateHash(progressedCommitted.updatedInstance),
      idempotencyKey: rollbackReceipt.idempotencyKey,
      receipt: rollbackReceipt,
      updatedInstance: completion.updatedInstance,
      causalClosure: poisonedClosure,
    })).rejects.toThrow("EFFECT_AUTHORITY_RECEIPT_UNPROVABLE");

    expect(await db.select().from(aurionQuestReceipts).where(eq(aurionQuestReceipts.id, rollbackReceipt.id))).toHaveLength(0);
    expect(await db.select().from(aurionQuestCausalAnchors).where(eq(aurionQuestCausalAnchors.questReceiptId, rollbackReceipt.id))).toHaveLength(0);
    expect(await db.select().from(aurionTemporalEvents).where(eq(aurionTemporalEvents.eventId, poisonedClosure.temporalEvent.eventId))).toHaveLength(0);
    expect(await db.select().from(aurionEffectIntents).where(eq(aurionEffectIntents.effectId, poisonedClosure.effectIntents.at(-1)!.effectId))).toHaveLength(0);

    // 7. Successful atomic commit after the rollback proof.
    const committed = await persistence.commitObjectiveTransition({
      instanceId: progressedCommitted.updatedInstance.id,
      expectedStateHash: computeQuestStateHash(progressedCommitted.updatedInstance),
      idempotencyKey: completionCommand.idempotencyKey,
      receipt: completion.receipt,
      updatedInstance: completion.updatedInstance,
      causalClosure: closure,
    });
    expect(committed.replayed).toBe(false);

    // 8. Physical readback of every authority and replay verification.
    const storedAnchor = await readQuestCausalAnchorByReceiptId(completion.receipt.id);
    expect(storedAnchor.anchorHash).toBe(closure.anchor.anchorHash);
    expect(storedAnchor.causalReceiptHash).toBe(closure.anchor.causalReceiptHash);
    await expect(readQuestCausalAnchorByReceiptId(`missing:${completion.receipt.id}`)).rejects.toThrow("QUEST_CAUSAL_ANCHOR_UNPROVABLE");

    const temporal = await readTemporalEventById(closure.temporalEvent.eventId);
    expect(temporal.eventHash).toBe(closure.temporalEvent.eventHash);
    expect(temporal.sourceReceiptHash).toBe(closure.anchor.causalReceiptHash);

    const effectRows = await db.select().from(aurionEffectIntents).where(eq(aurionEffectIntents.authorityReceiptHash, closure.anchor.causalReceiptHash));
    expect(effectRows.filter(row => row.effectId === closure.effectIntents[0]?.effectId)).toHaveLength(1);
    expect(effectRows.filter(row => row.effectId === closure.effectIntents[1]?.effectId)).toHaveLength(1);

    const temporalRows = await db.select().from(aurionTemporalEvents).where(eq(aurionTemporalEvents.eventId, closure.temporalEvent.eventId));
    expect(temporalRows).toHaveLength(1);

    // 9. Exact duplicate retry = one durable closure.
    const replayed = await persistence.commitObjectiveTransition({
      instanceId: progressedCommitted.updatedInstance.id,
      expectedStateHash: computeQuestStateHash(progressedCommitted.updatedInstance),
      idempotencyKey: completionCommand.idempotencyKey,
      receipt: completion.receipt,
      updatedInstance: completion.updatedInstance,
      causalClosure: closure,
    });
    expect(replayed.replayed).toBe(true);
    expect(await db.select().from(aurionQuestCausalAnchors).where(eq(aurionQuestCausalAnchors.questReceiptId, completion.receipt.id))).toHaveLength(1);
    expect(await db.select().from(aurionTemporalEvents).where(eq(aurionTemporalEvents.eventId, closure.temporalEvent.eventId))).toHaveLength(1);
  });
});
