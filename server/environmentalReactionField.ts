import { decideNpcGoal, resolveNpcNeeds, type NpcNeedEvent, type WorldReaction } from "./wasdAurionProtocol";
import {
  ENVIRONMENTAL_REACTION_FIELD_VERSION,
  ENVIRONMENTAL_REACTION_Q16_MAX,
  environmentalReactionFieldHash,
  type EnvironmentalReactionField,
} from "../shared/environmentalReactionFieldProtocol";

const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));
const clampQ16 = (value: number): number => Math.max(0, Math.min(ENVIRONMENTAL_REACTION_Q16_MAX, Math.round(value)));
const toBps = (value: number): number => Math.max(0, Math.min(10_000, Math.round(clampUnit(value) * 10_000)));
const bpsToQ16 = (bps: number): number => Math.floor((bps * ENVIRONMENTAL_REACTION_Q16_MAX + 5_000) / 10_000);
const q16ToBps = (value: number): number =>
  Math.floor((clampQ16(value) * 10_000 + ENVIRONMENTAL_REACTION_Q16_MAX / 2) / ENVIRONMENTAL_REACTION_Q16_MAX);
const roundNeedDeltaFromBps = (valueBps: number): number => Math.max(-1, Math.min(1, Math.round(valueBps) / 10_000));
const weatherRiskBps = (tone: WorldReaction["weatherTone"]): number =>
  tone === "ashfall" ? 10_000 : tone === "storm" ? 8_000 : tone === "rain" ? 4_500 : 0;
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function assertReaction(reaction: WorldReaction): void {
  if (!reaction.regionId || !reaction.id || !/^[a-f0-9]{64}$/.test(reaction.deterministicHash)) {
    throw new Error("ENVIRONMENTAL_REACTION_SOURCE_INVALID");
  }
  if (!Number.isSafeInteger(reaction.resolutionIndex) || reaction.resolutionIndex < 0) {
    throw new Error("ENVIRONMENTAL_REACTION_RESOLUTION_INVALID");
  }
  if (!Number.isFinite(reaction.threatDelta) || !Number.isFinite(reaction.resourceDelta)) {
    throw new Error("ENVIRONMENTAL_REACTION_SOURCE_NONFINITE");
  }
}

export function compileEnvironmentalReactionField(reaction: WorldReaction): EnvironmentalReactionField {
  assertReaction(reaction);

  const hazardBps = Math.max(toBps(reaction.threatDelta), weatherRiskBps(reaction.weatherTone));
  const opportunityBps = toBps(Math.max(0, reaction.resourceDelta));
  const resourcePressureBps = toBps(Math.max(0, -reaction.resourceDelta));
  const hazardQ16 = bpsToQ16(hazardBps);
  const opportunityQ16 = bpsToQ16(opportunityBps);
  const resourcePressureQ16 = bpsToQ16(resourcePressureBps);
  const weatherQ16 = bpsToQ16(weatherRiskBps(reaction.weatherTone));
  const traversalRiskQ16 = clampQ16(
    Math.floor((hazardQ16 * 75 + weatherQ16 * 15 + resourcePressureQ16 * 10 + 50) / 100),
  );

  const fieldId = `envf:${reaction.regionId}:${reaction.resolutionIndex}:${reaction.id}:${reaction.deterministicHash.slice(0, 24)}`;
  const withoutHash = Object.freeze({
    version: ENVIRONMENTAL_REACTION_FIELD_VERSION,
    fieldId,
    regionId: reaction.regionId,
    resolutionIndex: reaction.resolutionIndex,
    sourceReceiptId: reaction.id,
    sourceStateHash: reaction.deterministicHash,
    hazardQ16,
    opportunityQ16,
    traversalRiskQ16,
    resourcePressureQ16,
    rulesetVersion: reaction.ruleSetVersion,
    contentVersion: reaction.contentVersion,
  });
  return Object.freeze({
    ...withoutHash,
    fieldHash: environmentalReactionFieldHash(withoutHash),
  });
}

export function compileEnvironmentalReactionFieldFromSignals(input: {
  reaction: WorldReaction;
  signals: readonly { id: string; kind: string; regionId: string; resolutionIndex: number }[];
}): EnvironmentalReactionField {
  const ordered = input.signals.slice().sort(
    (left, right) => left.resolutionIndex - right.resolutionIndex
      || compareText(left.regionId, right.regionId)
      || compareText(left.kind, right.kind)
      || compareText(left.id, right.id),
  );
  if (ordered.some(signal => signal.regionId !== input.reaction.regionId || signal.resolutionIndex > input.reaction.resolutionIndex)) {
    throw new Error("ENVIRONMENTAL_REACTION_SIGNAL_SCOPE_INVALID");
  }
  return compileEnvironmentalReactionField(input.reaction);
}

/**
 * Convert a confirmed field into bounded NPC need evidence. This is one-way:
 * environmental state can influence NPC needs, while NPC state cannot rewrite it.
 */
export function environmentalReactionNeedEvents(field: EnvironmentalReactionField): readonly NpcNeedEvent[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(field.fieldHash) || !/^[a-f0-9]{64}$/.test(field.sourceStateHash)) {
    throw new Error("ENVIRONMENTAL_REACTION_FIELD_IDENTITY_INVALID");
  }
  const safetyDeltaBps = -Math.floor(q16ToBps(field.hazardQ16) * 70 / 100);
  const resourceDeltaBps = Math.floor(q16ToBps(field.opportunityQ16) * 25 / 100) - Math.floor(q16ToBps(field.resourcePressureQ16) * 35 / 100);
  const wealthDeltaBps = Math.floor(q16ToBps(field.opportunityQ16) * 20 / 100) - Math.floor(q16ToBps(field.resourcePressureQ16) * 25 / 100);
  const belongingDeltaBps = -Math.floor(q16ToBps(field.traversalRiskQ16) * 5 / 100);

  const events: NpcNeedEvent[] = [];
  const push = (need: NpcNeedEvent["need"], deltaBps: number, suffix: string) => {
    if (deltaBps !== 0) {
      events.push({
        id: `environment:${field.fieldHash.slice(0, 24)}:${suffix}`,
        need,
        delta: roundNeedDeltaFromBps(deltaBps),
        sourceReceiptId: field.sourceReceiptId,
        resolutionIndex: field.resolutionIndex,
      });
    }
  };
  push("safety", safetyDeltaBps, "safety");
  push("resources", resourceDeltaBps, "resources");
  push("wealth", wealthDeltaBps, "wealth");
  push("belonging", belongingDeltaBps, "belonging");
  return Object.freeze(events.sort(
    (left, right) => compareText(left.need, right.need) || compareText(left.id, right.id),
  ));
}

/**
 * Deterministic decision adapter for contract/runtime evidence. Mutation stays
 * in resolveAndRecordNpc and the existing action gateway.
 */
export function resolveEnvironmentalNpcGoal(input: {
  npcId: string;
  baseNeeds: Parameters<typeof resolveNpcNeeds>[0]["current"];
  observationIds: readonly string[];
  field: EnvironmentalReactionField;
}): Readonly<{
  goal: ReturnType<typeof decideNpcGoal>["goal"];
  decisionHash: string;
  needs: ReturnType<typeof resolveNpcNeeds>;
}> {
  const needs = resolveNpcNeeds({
    current: input.baseNeeds,
    events: environmentalReactionNeedEvents(input.field),
  });
  const decision = decideNpcGoal({
    npcId: input.npcId,
    needs,
    observationIds: [...input.observationIds, `environment:${input.field.fieldHash}`],
    resolutionIndex: input.field.resolutionIndex,
  });
  return Object.freeze({ goal: decision.goal, decisionHash: decision.decisionHash, needs });
}
