import { describe, expect, it } from "vitest";
import { computeCanonicalHash } from "../../shared/aurionQuestCanonicalHash";
import { AURION_QUEST_CAUSAL_ANCHOR_SCHEMA, createQuestCausalAnchor } from "../../shared/aurionQuestCausalAnchorContract";
import { buildQuestCausalClosure } from "./causalClosure";
import type { QuestInstance, QuestPlan, QuestReceipt } from "../../shared/aurionQuestContract";
import type { QuestDomainCommand } from "../../shared/aurionQuestDomainCommandContract";

const hex = (n: string) => n.repeat(64);
const instance = {
  id: "qi_1_concord.gate-seal_seed",
  worldId: "echoes-of-aurion-global",
  playerUserId: 1,
  giverNpcId: "npc_merchant_kaelen",
  templateId: "concord.gate-seal",
  templateVersion: 1,
  seedDigest: hex("1"),
  planHash: hex("2"),
  graphHash: hex("3"),
  currentNodeId: "end",
  completedNodeIds: ["start", "end"],
  boundRoles: [],
  state: "active",
  objectiveProgress: {},
  triggerEventId: "evt_trigger",
  triggerEventDigest: hex("4"),
  compilerVersion: "1.0.0",
  sourceRevision: "0123456789abcdef0123456789abcdef01234567",
  worldStateRevision: 11,
  templateSetHash: hex("5"),
  candidateSetHash: hex("6"),
  roleBindingHash: hex("7"),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as QuestInstance;
const plan = {
  templateId: instance.templateId,
  templateVersion: 1,
  templateSetHash: hex("5"),
  candidateSetHash: hex("6"),
  seedDigest: hex("1"),
  roleBindingHash: hex("7"),
  planHash: hex("2"),
  graphHash: hex("3"),
  boundRoles: [],
  nodes: [],
  edges: [],
  outcomes: [{
    id: "outcome",
    semanticFlag: "completed",
    factEffects: [{
      targetSubject: "player:1",
      predicate: "quest.completed",
      value: true,
      effectType: "assert_fact",
    }],
    rewards: [{ type: "xp", amount: 50 }],
  }],
} as unknown as QuestPlan;

describe("Quest causal closure", () => {
  it("projects one deterministic WorldEvent, temporal event and effect intents from one anchor", () => {
    const commandInput = {
      schemaVersion: "aurion.quest-domain-command.v1" as const,
      instanceId: instance.id,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      expectedStateHash: hex("8"),
      idempotencyKey: "complete:qi_1_concord.gate-seal_seed",
      eventSequence: 4,
      kind: "complete" as const,
      triggerEventId: instance.triggerEventId!,
      triggerEventDigest: instance.triggerEventDigest!,
      sourceEvidenceId: "encounter:42",
      sourceEvidenceDigest: hex("9"),
      sourceLogicalRevision: instance.worldStateRevision!,
      compilerVersion: instance.compilerVersion!,
      sourceRevision: instance.sourceRevision!,
      templateSetHash: instance.templateSetHash!,
      candidateSetHash: instance.candidateSetHash!,
      seedDigest: instance.seedDigest,
      roleBindingHash: instance.roleBindingHash!,
    };
    const command = {
      ...commandInput,
      commandId: computeCanonicalHash("aurion.quest.command.v1", commandInput),
    } as QuestDomainCommand;
    const receipt = {
      id: "rcpt_complete_1",
      instanceId: instance.id,
      eventSequence: 4,
      planHash: instance.planHash,
      graphHash: instance.graphHash,
      previousStateHash: command.expectedStateHash,
      resultStateHash: hex("a"),
      idempotencyKey: command.idempotencyKey,
      receiptHash: computeCanonicalHash("aurion.quest.event.v1", {
        previousStateHash: command.expectedStateHash,
        resultStateHash: hex("a"),
      }),
      createdAt: "2026-01-01T00:00:00.000Z",
    } as QuestReceipt;
    const anchor = createQuestCausalAnchor({
      schema: AURION_QUEST_CAUSAL_ANCHOR_SCHEMA,
      questReceiptId: receipt.id,
      worldId: instance.worldId,
      epoch: 2,
      zoneId: "observatory_threshold",
      tick: 3,
      causalReceiptHash: "sha256:" + hex("b"),
      sourceWorldRoot: "sha256:" + hex("c"),
      sourceRevision: instance.sourceRevision!,
      rulesetVersion: "aurion.zone.rules.v2",
      sourceEvidenceId: command.sourceEvidenceId,
      sourceEvidenceDigest: command.sourceEvidenceDigest,
      sourceLogicalRevision: command.sourceLogicalRevision,
      triggerEventId: command.triggerEventId,
      triggerEventDigest: command.triggerEventDigest,
      compilerVersion: command.compilerVersion,
      templateSetHash: command.templateSetHash,
      candidateSetHash: command.candidateSetHash,
      seedDigest: command.seedDigest,
      roleBindingHash: command.roleBindingHash,
      commandId: command.commandId,
      planHash: command.planHash,
      graphHash: command.graphHash,
      previousStateHash: receipt.previousStateHash,
      resultStateHash: receipt.resultStateHash,
    });

    const closure = buildQuestCausalClosure({ instance, plan, command, receipt, anchor });
    expect(closure.worldEvent.source).toBe("aurion_quest_runtime");
    expect(closure.worldEvent.data?.causalReceiptHash).toBe(anchor.causalReceiptHash);
    expect(closure.temporalEvent.sourceReceiptHash).toBe(anchor.causalReceiptHash);
    expect(closure.effectIntents).toHaveLength(2);
    expect(closure.effectIntents.map(effect => effect.authorityReceiptHash)).toEqual([
      anchor.causalReceiptHash,
      anchor.causalReceiptHash,
    ]);
  });
});
