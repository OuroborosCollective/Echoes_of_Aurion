import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { computeCanonicalHash } from "../../shared/aurionQuestCanonicalHash";
import {
  createEffectIntent,
  type AurionEffectIntent,
} from "../../shared/aurionEffectIntentContract";
import {
  createTemporalEvent,
  type AurionTemporalEvent,
} from "../../shared/aurionTemporalEventContract";
import { type QuestInstance, type QuestPlan, type QuestReceipt, type WorldEvent } from "../../shared/aurionQuestContract";
import { type QuestDomainCommand } from "../../shared/aurionQuestDomainCommandContract";
import { type QuestCausalAnchor } from "../../shared/aurionQuestCausalAnchorContract";

export interface QuestCausalClosure {
  anchor: QuestCausalAnchor;
  worldEvent: WorldEvent;
  temporalEvent: AurionTemporalEvent;
  effectIntents: readonly AurionEffectIntent[];
}

export function buildQuestCausalClosure(input: {
  instance: QuestInstance;
  plan: QuestPlan;
  command: QuestDomainCommand;
  receipt: QuestReceipt;
  anchor: QuestCausalAnchor;
}): QuestCausalClosure {
  if (input.command.kind !== "complete") throw new Error("QUEST_CAUSAL_CLOSURE_COMPLETE_COMMAND_REQUIRED");
  if (input.anchor.questReceiptId !== input.receipt.id || input.anchor.commandId !== input.command.commandId) {
    throw new Error("QUEST_CAUSAL_CLOSURE_ANCHOR_MISMATCH");
  }
  if (input.anchor.planHash !== input.plan.planHash || input.anchor.graphHash !== input.plan.graphHash) {
    throw new Error("QUEST_CAUSAL_CLOSURE_PLAN_MISMATCH");
  }
  const outcome = input.plan.outcomes[0];
  if (!outcome) throw new Error("QUEST_CAUSAL_CLOSURE_OUTCOME_REQUIRED");

  const worldEventData = Object.freeze({
    schema: "aurion.quest.world-event.v1",
    instanceId: input.instance.id,
    playerUserId: String(input.instance.playerUserId),
    merchantId: "merchant_kaelen",
    semanticFlag: outcome.semanticFlag || "completed",
    causalReceiptHash: input.anchor.causalReceiptHash,
    anchorHash: input.anchor.anchorHash,
    sourceEvidenceId: input.anchor.sourceEvidenceId,
    sourceEvidenceDigest: input.anchor.sourceEvidenceDigest,
    planHash: input.anchor.planHash,
    graphHash: input.anchor.graphHash,
    resultStateHash: input.anchor.resultStateHash,
  });
  const eventIdentity = canonicalSha256({
    schema: "aurion.quest.world-event.identity.v1",
    worldId: input.instance.worldId,
    instanceId: input.instance.id,
    questReceiptId: input.receipt.id,
    anchorHash: input.anchor.anchorHash,
  }).slice("sha256:".length);

  const worldEvent: WorldEvent = Object.freeze({
    id: `evt_quest_complete_${eventIdentity.slice(0, 56)}`,
    sequence: input.anchor.tick,
    type: "QUEST_COMPLETED_REVENGE",
    payloadHash: computeCanonicalHash("aurion.world.event.v1", worldEventData),
    source: "aurion_quest_runtime",
    data: worldEventData,
    timestamp: input.receipt.createdAt,
  });

  const temporalPayload = Object.freeze({
    schema: "aurion.quest.temporal-event.v1",
    worldEvent,
    questReceiptId: input.receipt.id,
    commandId: input.command.commandId,
    anchorHash: input.anchor.anchorHash,
  });
  const temporalIdentity = canonicalSha256({
    schema: "aurion.quest.temporal-event.identity.v1",
    worldId: input.instance.worldId,
    eventId: worldEvent.id,
    anchorHash: input.anchor.anchorHash,
  }).slice("sha256:".length);

  const temporalEvent = createTemporalEvent({
    eventId: `quest-temporal:${temporalIdentity.slice(0, 72)}`,
    worldId: input.instance.worldId,
    epoch: input.anchor.epoch,
    domain: "quest",
    subjectIds: [
      `player:${input.instance.playerUserId}`,
      `quest:${input.instance.id}`,
    ],
    validFromEpoch: input.anchor.epoch,
    sourceReceiptHash: input.anchor.causalReceiptHash,
    sourceWorldRoot: input.anchor.sourceWorldRoot,
    sourceRevision: input.anchor.sourceRevision,
    rulesetVersion: input.anchor.rulesetVersion,
    predecessorEventIds: [],
    payload: temporalPayload,
  });

  const effects: AurionEffectIntent[] = [];
  let ordinal = 0;
  for (const effect of outcome.factEffects) {
    effects.push(createEffectIntent({
      authorityReceiptHash: input.anchor.causalReceiptHash,
      effectType: `quest.fact.${effect.effectType}`,
      subjectId: effect.targetSubject,
      ordinal: ordinal++,
      payload: Object.freeze({
        schema: "aurion.quest.effect.v1",
        instanceId: input.instance.id,
        questReceiptId: input.receipt.id,
        anchorHash: input.anchor.anchorHash,
        predicate: effect.predicate,
        value: effect.value,
      }),
    }));
  }
  for (const reward of outcome.rewards) {
    effects.push(createEffectIntent({
      authorityReceiptHash: input.anchor.causalReceiptHash,
      effectType: `quest.reward.${reward.type}`,
      subjectId: `player:${input.instance.playerUserId}`,
      ordinal: ordinal++,
      payload: Object.freeze({
        schema: "aurion.quest.reward-effect.v1",
        instanceId: input.instance.id,
        questReceiptId: input.receipt.id,
        anchorHash: input.anchor.anchorHash,
        rewardType: reward.type,
        amount: reward.amount,
        ...(reward.targetId !== undefined ? { targetId: reward.targetId } : {}),
      }),
    }));
  }

  return Object.freeze({
    anchor: input.anchor,
    worldEvent,
    temporalEvent,
    effectIntents: Object.freeze(effects),
  });
}
