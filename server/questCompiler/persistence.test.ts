import { describe, expect, it } from "vitest";
import { computeCanonicalHash, computeQuestStateHash } from "../../shared/aurionQuestCanonicalHash";
import type { QuestInstance, QuestReceipt } from "../../shared/aurionQuestContract";
import { QuestPersistenceEngine } from "./persistence";

describe("QuestPersistenceEngine continuous runtime commit (AIM-298)", () => {
  const instance: QuestInstance = {
    id: "qi_test_458",
    worldId: "world_test",
    playerUserId: 7,
    giverNpcId: "npc_test",
    templateId: "tpl_test",
    templateVersion: 1,
    seedDigest: "a".repeat(64),
    planHash: "b".repeat(64),
    graphHash: "c".repeat(64),
    currentNodeId: "node_objective",
    completedNodeIds: [],
    boundRoles: [],
    state: "active",
    objectiveProgress: { investigate: 0 },
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
  };

  function transition(sourceInstance: QuestInstance = instance) {
    const previousStateHash = computeQuestStateHash(sourceInstance);
    const updatedInstance: QuestInstance = {
      ...sourceInstance,
      objectiveProgress: { investigate: 1 },
      updatedAt: "2026-09-22T00:00:01.000Z",
    };
    const resultStateHash = computeQuestStateHash(updatedInstance);
    const receipt: QuestReceipt = {
      id: "rcpt_test_458",
      instanceId: sourceInstance.id,
      eventSequence: 1,
      planHash: sourceInstance.planHash,
      graphHash: sourceInstance.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey: `event:test-source-1:instance:${sourceInstance.id}:objective:investigate`,
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", { previousStateHash, resultStateHash }),
      createdAt: "2026-09-22T00:00:01.000Z",
    };
    return { previousStateHash, updatedInstance, receipt };
  }

  it("commits one event exactly once and returns the persisted receipt on retry", async () => {
    const persistence = new QuestPersistenceEngine();
    await persistence.saveInstance(instance);
    const first = transition();

    const committed = await persistence.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: first.receipt.idempotencyKey,
      receipt: first.receipt,
      updatedInstance: first.updatedInstance,
    });
    const replay = await persistence.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: first.receipt.idempotencyKey,
      receipt: first.receipt,
      updatedInstance: first.updatedInstance,
    });

    expect(committed.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(committed.receipt);
    expect(replay.updatedInstance.objectiveProgress.investigate).toBe(1);
    expect((await persistence.getReceiptsForInstance(instance.id))).toHaveLength(1);
  });

  it("rejects a receipt whose result hash does not match the persisted next state", async () => {
    const persistence = new QuestPersistenceEngine();
    await persistence.saveInstance(instance);
    const first = transition();
    const tampered = {
      ...first,
      receipt: {
        ...first.receipt,
        resultStateHash: computeQuestStateHash({
          ...first.updatedInstance,
          objectiveProgress: { investigate: 99 },
        }),
        receiptHash: computeCanonicalHash("aurion.quest.event.v1", {
          previousStateHash: first.previousStateHash,
          resultStateHash: computeQuestStateHash({
            ...first.updatedInstance,
            objectiveProgress: { investigate: 99 },
          }),
        }),
      },
    };

    await expect(persistence.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: first.receipt.idempotencyKey,
      receipt: tampered.receipt,
      updatedInstance: first.updatedInstance,
    })).rejects.toThrow("QUEST_RESULT_STATE_HASH_MISMATCH");
    expect(await persistence.getReceiptsForInstance(instance.id)).toHaveLength(0);
  });

  it("rejects a receipt whose instance or idempotency identity is inconsistent", async () => {
    const persistence = new QuestPersistenceEngine();
    await persistence.saveInstance(instance);
    const first = transition();
    await expect(persistence.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: first.receipt.idempotencyKey,
      receipt: { ...first.receipt, instanceId: "different-instance" },
      updatedInstance: first.updatedInstance,
    })).rejects.toThrow("QUEST_RECEIPT_IDENTITY_MISMATCH");
  });

  it("rejects a stale expected state hash without creating a second receipt", async () => {
    const persistence = new QuestPersistenceEngine();
    const staleInstance = { ...instance, id: "qi_test_458_stale" };
    await persistence.saveInstance(staleInstance);
    const first = transition(staleInstance);
    await persistence.commitObjectiveTransition({
      instanceId: staleInstance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: first.receipt.idempotencyKey,
      receipt: first.receipt,
      updatedInstance: first.updatedInstance,
    });

    const staleReceipt = { ...first.receipt, id: "rcpt_stale_458", eventSequence: 2, idempotencyKey: `event:test-source-2:instance:${staleInstance.id}:objective:investigate` };
    await expect(persistence.commitObjectiveTransition({
      instanceId: staleInstance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: staleReceipt.idempotencyKey,
      receipt: staleReceipt,
      updatedInstance: { ...first.updatedInstance, objectiveProgress: { investigate: 2 } },
    })).rejects.toThrow("QUEST_RUNTIME_STALE_STATE");

    expect((await persistence.getReceiptsForInstance(staleInstance.id))).toHaveLength(1);
  });

  it("replays an identical completion event and rejects a different late event without over-counting", async () => {
    const persistence = new QuestPersistenceEngine();
    const atFive = {
      ...instance,
      id: "qi_test_458_completed_objective",
      objectiveProgress: { investigate: 5 },
    };
    await persistence.saveInstance(atFive);
    const previousStateHash = computeQuestStateHash(atFive);
    const atTarget = {
      ...atFive,
      currentNodeId: "node_end",
      completedNodeIds: ["node_objective"],
      objectiveProgress: { investigate: 6 },
      updatedAt: "2026-09-22T00:00:01.000Z",
    };
    const resultStateHash = computeQuestStateHash(atTarget);
    const receipt: QuestReceipt = {
      id: "rcpt_test_458_target",
      instanceId: atFive.id,
      eventSequence: 1,
      planHash: atFive.planHash,
      graphHash: atFive.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey: "confirmed-objective-event-identical",
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", { previousStateHash, resultStateHash }),
      createdAt: "2026-09-22T00:00:01.000Z",
    };
    const commit = () => persistence.commitObjectiveTransition({
      instanceId: atFive.id,
      expectedStateHash: previousStateHash,
      idempotencyKey: receipt.idempotencyKey,
      receipt,
      updatedInstance: atTarget,
    });

    expect((await commit()).replayed).toBe(false);
    expect((await commit()).replayed).toBe(true);

    const overCounted = { ...atTarget, objectiveProgress: { investigate: 7 } };
    const overCountedHash = computeQuestStateHash(overCounted);
    const lateReceipt: QuestReceipt = {
      ...receipt,
      id: "rcpt_test_458_late",
      eventSequence: 2,
      idempotencyKey: "confirmed-objective-event-different-late",
      resultStateHash: overCountedHash,
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", { previousStateHash, resultStateHash: overCountedHash }),
    };
    await expect(persistence.commitObjectiveTransition({
      instanceId: atFive.id,
      expectedStateHash: previousStateHash,
      idempotencyKey: lateReceipt.idempotencyKey,
      receipt: lateReceipt,
      updatedInstance: overCounted,
    })).rejects.toThrow("QUEST_RUNTIME_STALE_STATE");

    expect((await persistence.getInstance(atFive.id))?.objectiveProgress.investigate).toBe(6);
    expect(await persistence.getNextEventSequence(atFive.id)).toBe(2);
    expect(await persistence.getReceiptsForInstance(atFive.id)).toHaveLength(1);
  });
  it("serializes concurrent identical transitions to one durable receipt", async () => {
    const persistence = new QuestPersistenceEngine();
    const concurrentInstance = { ...instance, id: "qi_test_458_concurrent" };
    await persistence.saveInstance(concurrentInstance);
    const first = transition(concurrentInstance);

    const [a, b] = await Promise.all([
      persistence.commitObjectiveTransition({
        instanceId: concurrentInstance.id,
        expectedStateHash: first.previousStateHash,
        idempotencyKey: first.receipt.idempotencyKey,
        receipt: first.receipt,
        updatedInstance: first.updatedInstance,
      }),
      persistence.commitObjectiveTransition({
        instanceId: concurrentInstance.id,
        expectedStateHash: first.previousStateHash,
        idempotencyKey: first.receipt.idempotencyKey,
        receipt: first.receipt,
        updatedInstance: first.updatedInstance,
      }),
    ]);

    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect((await persistence.getReceiptsForInstance(concurrentInstance.id))).toHaveLength(1);
  });

  it("accepts only one of two different progress commands at the same expected state revision", async () => {
    const persistence = new QuestPersistenceEngine();
    const concurrentInstance = { ...instance, id: "qi_test_458_concurrent_revision" };
    await persistence.saveInstance(concurrentInstance);
    const first = transition(concurrentInstance);
    const alternateInstance = {
      ...first.updatedInstance,
      objectiveProgress: { investigate: 2 },
    };
    const alternateResultHash = computeQuestStateHash(alternateInstance);
    const alternateReceipt: QuestReceipt = {
      ...first.receipt,
      id: "rcpt_test_458_alternate",
      idempotencyKey: `event:test-source-2:instance:${concurrentInstance.id}:objective:investigate`,
      resultStateHash: alternateResultHash,
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", {
        previousStateHash: first.previousStateHash,
        resultStateHash: alternateResultHash,
      }),
    };

    const results = await Promise.allSettled([
      persistence.commitObjectiveTransition({
        instanceId: concurrentInstance.id,
        expectedStateHash: first.previousStateHash,
        idempotencyKey: first.receipt.idempotencyKey,
        receipt: first.receipt,
        updatedInstance: first.updatedInstance,
      }),
      persistence.commitObjectiveTransition({
        instanceId: concurrentInstance.id,
        expectedStateHash: first.previousStateHash,
        idempotencyKey: alternateReceipt.idempotencyKey,
        receipt: alternateReceipt,
        updatedInstance: alternateInstance,
      }),
    ]);

    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason)
      .toMatchObject({ message: "QUEST_RUNTIME_STALE_STATE" });
    expect(await persistence.getNextEventSequence(concurrentInstance.id)).toBe(2);
    expect((await persistence.getReceiptsForInstance(concurrentInstance.id))).toHaveLength(1);
  });

  it("fails closed when an idempotency key is reused with changed receipt payload", async () => {
    const persistence = new QuestPersistenceEngine();
    const conflictInstance = { ...instance, id: "qi_test_458_conflict" };
    await persistence.saveInstance(conflictInstance);
    const first = transition(conflictInstance);
    await persistence.commitObjectiveTransition({
      instanceId: conflictInstance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: first.receipt.idempotencyKey,
      receipt: first.receipt,
      updatedInstance: first.updatedInstance,
    });

    const conflictingResultState = computeQuestStateHash({
      ...first.updatedInstance,
      objectiveProgress: { investigate: 99 },
    });
    const conflictingReceipt = {
      ...first.receipt,
      id: "rcpt_conflicting_payload",
      resultStateHash: conflictingResultState,
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", {
        previousStateHash: first.previousStateHash,
        resultStateHash: conflictingResultState,
      }),
    };

    await expect(persistence.commitObjectiveTransition({
      instanceId: conflictInstance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: first.receipt.idempotencyKey,
      receipt: conflictingReceipt,
      updatedInstance: first.updatedInstance,
    })).rejects.toThrow("QUEST_RECEIPT_IDEMPOTENCY_CONFLICT");

    expect((await persistence.getReceiptsForInstance(conflictInstance.id))).toHaveLength(1);
  });
});
