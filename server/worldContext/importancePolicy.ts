import type {
  CanonicalContextSource,
  ContextImportanceScore,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";

export const IMPORTANCE_POLICY_VERSION = "aurion.context-importance.v1" as const;

/**
 * Deterministic integer scoring for context importance.
 * Follows AIM-299 specification:
 * total = causal*5 + actorRelevance*4 + questRelevance*4 + relationship*3 + salience*3 + uniqueness*2 + recencyBucket + evidence*5
 */
export function scoreContextSource(
  source: CanonicalContextSource,
  query: WorldContextQuery
): ContextImportanceScore {
  // 1. Causal score (0..1000)
  let causal = 200;
  if (source.kind === "world_event" || source.kind === "quest_event") {
    causal = 700;
  }
  if (source.metadata?.causalTrigger || source.canonicalText.toLowerCase().includes("betray") || source.canonicalText.toLowerCase().includes("rescue")) {
    causal = 950;
  }

  // 2. Actor relevance (0..1000)
  let actorRelevance = 100;
  if (source.actorIds.includes(query.actorId)) {
    actorRelevance += 500;
  }
  const matchingSubjects = source.actorIds.filter(id => query.subjectIds.includes(id));
  if (matchingSubjects.length > 0) {
    actorRelevance += Math.min(400, matchingSubjects.length * 200);
  }
  actorRelevance = Math.min(1000, actorRelevance);

  // 3. Quest relevance (0..1000)
  let questRelevance = 50;
  if (source.kind === "quest_event" || source.kind === "quest_fact") {
    questRelevance = 600;
    if (query.purpose === "quest_compilation" || query.purpose === "quest_explanation") {
      questRelevance = 900;
    }
  } else if (source.metadata?.questId || source.canonicalText.toLowerCase().includes("quest")) {
    questRelevance = 500;
  }

  // 4. Relationship score (0..1000)
  let relationship = 50;
  if (source.kind === "relationship" || source.kind === "semantic_relation") {
    relationship = 700;
  }
  if (source.canonicalText.toLowerCase().includes("trust") || source.canonicalText.toLowerCase().includes("distrust") || source.canonicalText.toLowerCase().includes("loyalty")) {
    relationship = Math.max(relationship, 850);
  }

  // 5. Salience (0..1000)
  let salience = 300;
  if (source.kind === "episode") {
    salience = 800;
  } else if (source.kind === "world_fact") {
    salience = 650;
  }
  if (source.metadata?.highSalience || source.canonicalText.toLowerCase().includes("betrayal") || source.canonicalText.toLowerCase().includes("saved")) {
    salience = 950;
  }

  // 6. Uniqueness (0..1000)
  let uniqueness = 500;
  if (source.kind === "location_fact") {
    uniqueness = 400;
  } else if (source.kind === "episode") {
    uniqueness = 900;
  }

  // 7. Recency bucket (0..1000 based strictly on logicalSequence vs logicalTick)
  let recencyBucket = 0;
  if (query.logicalTick >= source.logicalSequence) {
    const distance = query.logicalTick - source.logicalSequence;
    if (distance <= 10) recencyBucket = 1000;
    else if (distance <= 50) recencyBucket = 800;
    else if (distance <= 200) recencyBucket = 600;
    else if (distance <= 1000) recencyBucket = 400;
    else if (distance <= 5000) recencyBucket = 200;
    else recencyBucket = 50;
  } else {
    recencyBucket = 500;
  }

  // 8. Evidence class score (0..1000)
  let evidence = 400;
  switch (source.evidenceClass) {
    case "verified":
      evidence = 1000;
      break;
    case "observed":
      evidence = 800;
      break;
    case "reported":
      evidence = 500;
      break;
    case "contradicted":
      evidence = 900; // Contradictions are highly critical for explaining discrepancies
      break;
    case "invalidated":
      evidence = 200;
      break;
  }

  // Calculate weighted total
  const total =
    causal * 5 +
    actorRelevance * 4 +
    questRelevance * 4 +
    relationship * 3 +
    salience * 3 +
    uniqueness * 2 +
    recencyBucket +
    evidence * 5;

  return Object.freeze({
    causal,
    actorRelevance,
    questRelevance,
    relationship,
    salience,
    uniqueness,
    recencyBucket,
    evidence,
    total,
    policyVersion: IMPORTANCE_POLICY_VERSION,
  });
}

/**
 * Determines whether a source is non-droppable for a specific query context.
 */
export function isSourceNonDroppable(
  source: CanonicalContextSource,
  query: WorldContextQuery
): boolean {
  if (source.nonDroppable) return true;

  // 1. Direct query subject match on verified critical facts
  if (query.subjectIds.length > 0 && query.subjectIds.includes(source.sourceId)) {
    return true;
  }

  // 2. Explanations asking about causal events (e.g. betrayal, rescue, direct quest outcome)
  if (
    query.purpose === "npc_dialogue" ||
    query.purpose === "quest_explanation" ||
    query.purpose === "admin_explanation"
  ) {
    const text = source.canonicalText.toLowerCase();
    if (text.includes("betray") || text.includes("rescue") || text.includes("critical_prerequisite")) {
      return true;
    }
  }

  // 3. Contradicted evidence when explaining conflict
  if (source.evidenceClass === "contradicted") {
    if (query.subjectIds.some(id => source.actorIds.includes(id) || source.sourceId.includes(id))) {
      return true;
    }
  }

  // 4. Current active quest prerequisite
  if (
    query.purpose === "quest_compilation" &&
    (source.kind === "quest_fact" || source.kind === "quest_event")
  ) {
    if (source.metadata?.activePrerequisite === true) {
      return true;
    }
  }

  return false;
}

/**
 * Stable deterministic sort comparator for context sources and entries.
 * 1. nonDroppable DESC
 * 2. importance.total DESC
 * 3. logicalSequence DESC
 * 4. kind ASC
 * 5. sourceId ASC
 * 6. sourceHash ASC
 */
export function compareContextSources(
  a: { source: CanonicalContextSource; importance: ContextImportanceScore; nonDroppable: boolean },
  b: { source: CanonicalContextSource; importance: ContextImportanceScore; nonDroppable: boolean }
): number {
  if (a.nonDroppable !== b.nonDroppable) {
    return a.nonDroppable ? -1 : 1;
  }
  if (a.importance.total !== b.importance.total) {
    return b.importance.total - a.importance.total;
  }
  if (a.source.logicalSequence !== b.source.logicalSequence) {
    return b.source.logicalSequence - a.source.logicalSequence;
  }
  if (a.source.kind !== b.source.kind) {
    return a.source.kind.localeCompare(b.source.kind);
  }
  if (a.source.sourceId !== b.source.sourceId) {
    return a.source.sourceId.localeCompare(b.source.sourceId);
  }
  return a.source.sourceHash.localeCompare(b.source.sourceHash);
}
