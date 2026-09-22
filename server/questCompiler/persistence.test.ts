import { describe, expect, it } from "vitest";
import { computeCanonicalHash } from "../../shared/aurionQuestCanonicalHash";
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

  function transition() {
    const previousStateHash = computeCanonicalHash("aurion.quest.instance.v1", instance);
    const updatedInstance: QuestInstance = {
      ...instance,
      objectiveProgress: { investigate: 1 },
      updatedAt: "2026-09-22T00:00:01.000Z",
    };
    const resultStateHash = computeCanonicalHash("aurion.quest.instance.v1", updatedInstance);
    const receipt: QuestReceipt = {
      id: "rcpt_test_458",
      instanceId: instance.id,
      eventSequence: 1,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      previousStateHash,
      resultStateHash,
      idempotencyKey: "event:test-source-1:instance:qi_test_458:objective:investigate",
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", { previousStateHash, resultStateHash }),
      createdAt: "2026-09-22T00:00:01.000Z",
    };
    return { previousStateHash, updatedInstance, receipt };
  }

  it("commits one event exactly once and returns the persisted receipt on retry", async () => {
    const persistence = new QuestPersistenceEngine();
    persistence.seedEphemeral({} as never, instance);
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

  it("rejects a stale expected state hash without creating a second receipt", async () => {
    const persistence = new QuestPersistenceEngine();
    persistence.seedEphemeral({} as never, instance);
    const first = transition();
    await persistence.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: first.receipt.idempotencyKey,
      receipt: first.receipt,
      updatedInstance: first.updatedInstance,
    });

    const staleReceipt = { ...first.receipt, id: "rcpt_stale_458", eventSequence: 2, idempotencyKey: "event:test-source-2:instance:qi_test_458:objective:investigate" };
    await expect(persistence.commitObjectiveTransition({
      instanceId: instance.id,
      expectedStateHash: first.previousStateHash,
      idempotencyKey: staleReceipt.idempotencyKey,
      receipt: staleReceipt,
      updatedInstance: { ...first.updatedInstance, objectiveProgress: { investigate: 2 } },
    })).rejects.toThrow("QUEST_RUNTIME_STALE_STATE");

    expect((await persistence.getReceiptsForInstance(instance.id))).toHaveLength(1);
  });
});
