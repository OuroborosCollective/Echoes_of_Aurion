import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import type { WorldDirectorDecision } from "../shared/worldPressureProtocol";
import {
  deriveSystemicQuestOpportunities,
  opportunityToWorldEvent,
  type ConfirmedSystemicQuestActor,
  type QuestOpportunity,
  type SystemicQuestOpportunitySet,
} from "../shared/systemicQuestOpportunityProtocol";
import type { WorldFactEngine } from "./questCompiler/worldFacts";
import type { QuestRuntimeEngine } from "./questCompiler/runtime";
import type { QuestInstance, QuestPlan } from "../shared/aurionQuestContract";
import type { WorldEvent } from "../shared/aurionQuestContract";

export type SystemicQuestCompilation = Readonly<{
  opportunities: SystemicQuestOpportunitySet;
  events: readonly WorldEvent[];
}>;

/** Pure bridge: confirmed WorldDirector consequences -> typed systemic quest opportunities. */
export function compileSystemicQuestOpportunities(input: Readonly<{
  worldId: string;
  sourceRevision: string;
  decision: WorldDirectorDecision;
  confirmedActors: readonly ConfirmedSystemicQuestActor[];
  maxCandidates?: number;
}>): SystemicQuestCompilation {
  const opportunities = deriveSystemicQuestOpportunities(input);
  const events = Object.freeze(opportunities.opportunities
    .map(opportunityToWorldEvent)
    .map(raw => Object.freeze({
      ...raw,
      payloadHash: canonicalSha256("aurion.world.event.v1", raw.data ?? {}),
    } satisfies WorldEvent))
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id)));
  return Object.freeze({ opportunities, events });
}

/**
 * Existing Quest Runtime integration boundary. No new quest persistence or completion path is
 * introduced: the canonical WorldFactEngine validates the derived source event and the existing
 * QuestRuntimeEngine performs the normal offer/plan flow.
 */
export function compileSystemicQuestIntoExistingRuntime(input: Readonly<{
  opportunity: QuestOpportunity;
  worldFacts: WorldFactEngine;
  questRuntime: QuestRuntimeEngine;
  worldId: string;
  playerUserId: number;
}>): Readonly<{ event: WorldEvent; instance: QuestInstance; plan: QuestPlan }> {
  const event = Object.freeze({
    ...opportunityToWorldEvent(input.opportunity),
    payloadHash: canonicalSha256("aurion.world.event.v1", opportunityToWorldEvent(input.opportunity).data ?? {}),
  } satisfies WorldEvent);
  input.worldFacts.ingestCanonicalEvent(event);
  const { instance, plan } = input.questRuntime.compileAndOfferQuest({
    worldId: input.worldId,
    playerUserId: input.playerUserId,
    triggerEventId: event.id,
    requestedTemplateId: input.opportunity.questTemplateId,
  });
  return Object.freeze({ event, instance, plan });
}
