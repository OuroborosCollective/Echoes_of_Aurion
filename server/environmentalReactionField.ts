import type { WorldReaction, WorldSignal } from "./wasdAurionProtocol";
import { decideNpcGoal, resolveNpcNeeds, type NpcNeedEvent } from "./wasdAurionProtocol";
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
const q16ToBps = (value: number): number => Math.floor((clampQ16(value) * 10_000 + ENVIRONMENTAL_REACTION_Q16_MAX / 2) / ENVIRONMENTAL_REACTION_Q16_MAX);
const roundNeedDeltaFromBps = (valueBps: number): number => q16ToBps(valueBps) / 10_000;
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

  const hazardQ16 = toQ16(Math.max(reaction.threatDelta, weatherRisk(reaction.weatherTone)));
  const opportunityQ16 = toQ16(Math.max(0, reaction.resourceDelta));
  const resourcePressureQ16 = toQ16(Math.max(0, -reaction.resourceDelta));
  const traversalRiskQ16 = clampQ16(
    hazardQ16 * 0.75 +
    toQ16(weatherRisk(reaction.weatherTone)) * 0.15 +
    resourcePressureQ16 * 0.10,
  );

  const identity = [
    reaction.regionId,
    String(reaction.resolutionIndex),
    reaction.id,
    reaction.deterministicHash.slice(0, 24),
  ].join(":");
  const fieldId = `envf:${identity}`;
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
  signals: readonly WorldSignal[];
}): EnvironmentalReactionField {
  const ordered = input.signals.slice().sort(
    (left, right) => left.resolutionIndex - right.resolutionIndex
      || left.regionId.localeCompare(right.regionId)
      || left.kind.localeCompare(right.kind)
      || left.id.localeCompare(right.id),
  );
  if (ordered.some(signal => signal.regionId !== input.reaction.regionId || signal.resolutionIndex > input.reaction.resolutionIndex)) {
    throw new Error("ENVIRONMENTAL_REACTION_SIGNAL_SCOPE_INVALID");
  }
  return compileEnvironmentalReactionField(input.reaction);
}

/**
 * Convert a confirmed field into bounded NPC need evidence. This adapter is
 * intentionally one-way: environmental state can constrain NPC needs, but NPC
 * state cannot rewrite the field.
 */
export function environmentalReactionNeedEvents(field: EnvironmentalReactionField): readonly NpcNeedEvent[] {
  const safetyDelta = roundNeedDelta(-fromQ16(field.hazardQ16) * 0.70);
  const resourceDelta = roundNeedDelta(fromQ16(field.opportunityQ16) * 0.25 - fromQ16(field.resourcePressureQ16) * 0.35);
  const wealthDelta = roundNeedDelta(fromQ16(field.opportunityQ16) * 0.20 - fromQ16(field.resourcePressureQ16) * 0.25);
  const belongingDelta = roundNeedDelta(-fromQ16(field.traversalRiskQ16) * 0.05);

  const events: NpcNeedEvent[] = [];
  const push = (need: NpcNeedEvent["need"], delta: number, suffix: string) => {
    if (delta !== 0) {
      events.push({
        id: `environment:${field.fieldHash.slice(0, 24)}:${suffix}`,
        need,
        delta,
        sourceReceiptId: field.sourceReceiptId,
        resolutionIndex: field.resolutionIndex,
      });
    }
  };
  push("safety", safetyDelta, "safety");
  push("resources", resourceDelta, "resources");
  push("wealth", wealthDelta, "wealth");
  push("belonging", belongingDelta, "belonging");
  return Object.freeze(events.sort((left, right) => left.need.localeCompare(right.need) || left.id.localeCompare(right.id)));
}

/**
 * Observable deterministic decision adapter used by tests/readback surfaces.
 * The actual NPC mutation remains in resolveAndRecordNpc and the existing
 * gateway; this helper only demonstrates the field's influence on the
 * already-existing need/goal resolver.
 */
export function resolveEnvironmentalNpcGoal(input: {
  npcId: string;
  baseNeeds: Parameters<typeof resolveNpcNeeds>[0]["current"];
  observationIds: readonly string[];
  field: EnvironmentalReactionField;
}): Readonly<{ goal: ReturnType<typeof decideNpcGoal>["goal"]; decisionHash: string; needs: ReturnType<typeof resolveNpcNeeds> }> {
  const needs = resolveNpcNeeds({ current: input.baseNeeds, events: environmentalReactionNeedEvents(input.field) });
  const decision = decideNpcGoal({
    npcId: input.npcId,
    needs,
    observationIds: [...input.observationIds, `environment:${input.field.fieldHash}`],
    resolutionIndex: input.field.resolutionIndex,
  });
  return Object.freeze({ goal: decision.goal, decisionHash: decision.decisionHash, needs });
}
