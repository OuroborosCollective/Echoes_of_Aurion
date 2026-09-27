import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_TEMPORAL_PROPERTY_PROTOCOL = "aurion.temporal-property.v1" as const;
export const AURION_TEMPORAL_PROPERTY_VERSION = "aurion.temporal-property.v1" as const;
export const AURION_TEMPORAL_MAX_EVENTS = 4096 as const;

export const aurionTemporalPropertyIds = [
  "AURION.NPC.NO_UNGROUNDED_ACTION",
  "AURION.EFFECT.HAS_CAUSAL_RECEIPT",
  "AURION.CAUSAL.TICK_ORDER_TOTAL",
  "AURION.REPLAY.STABLE_HASH",
  "AURION.NPC.NEED_SATISFACTION_BOUND",
  "AURION.WORLD.NO_UNBOUNDED_IMPACT_CHAIN",
  "AURION.HANDOVER.NO_STALE_WRITE",
] as const;

export type AurionTemporalPropertyId = (typeof aurionTemporalPropertyIds)[number];

export type AurionTemporalEventKind =
  | "action_intent"
  | "effect_receipt"
  | "need_resolution"
  | "impact"
  | "handover";

export type AurionTemporalTraceEvent = Readonly<{
  tick: number;
  sequence: number;
  eventId: string;
  kind: AurionTemporalEventKind;
  sourceRevision: string;
  actionGrounded: boolean | null;
  hasCausalReceipt: boolean | null;
  needSatisfactionBoundTicks: number | null;
  needResolvedWithinBound: boolean | null;
  impactDepth: number | null;
  postHandover: boolean | null;
  usesStaleAuthority: boolean | null;
}>;

export type AurionTemporalTrace = Readonly<{
  sourceRevision: string;
  rulesetVersion: string;
  startTick: number;
  endTick: number;
  events: readonly AurionTemporalTraceEvent[];
}>;

export type AurionTemporalProperty = Readonly<{
  protocol: typeof AURION_TEMPORAL_PROPERTY_PROTOCOL;
  propertyId: AurionTemporalPropertyId;
  scope: "trace";
  startTick: number;
  endTick: number;
  sourceRevision: string;
  rulesetVersion: string;
  maxImpactDepth?: number;
  satisfactionBoundTicks?: number;
  expectedTraceHash?: string;
}>;

export type AurionTemporalPropertyResult = Readonly<{
  protocol: typeof AURION_TEMPORAL_PROPERTY_PROTOCOL;
  propertyId: AurionTemporalPropertyId;
  status: "PASS" | "FAIL" | "UNPROVABLE";
  firstFailureTick: number | null;
  observedTraceHash: string;
  propertyHash: string;
  sourceRevision: string;
  reasonCode: string;
}>;

export type AurionTemporalValidationReport = Readonly<{
  observedTraceHash: string;
  results: readonly AurionTemporalPropertyResult[];
  reportHash: string;
}>;

const SHA256 = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function assertNonNegativeSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
}

function assertRevision(value: string, code: string): void {
  if (!REVISION.test(value)) throw new Error(code);
}

function assertIdentifier(value: string, code: string): void {
  if (!IDENTIFIER.test(value)) throw new Error(code);
}

function assertHash(value: string, code: string): void {
  if (!SHA256.test(value)) throw new Error(code);
}

function normalizeEvent(event: AurionTemporalTraceEvent): AurionTemporalTraceEvent {
  assertNonNegativeSafeInteger(event.tick, "AURION_TEMPORAL_EVENT_TICK_INVALID");
  assertNonNegativeSafeInteger(event.sequence, "AURION_TEMPORAL_EVENT_SEQUENCE_INVALID");
  assertIdentifier(event.eventId, "AURION_TEMPORAL_EVENT_ID_INVALID");
  assertRevision(event.sourceRevision, "AURION_TEMPORAL_EVENT_REVISION_INVALID");

  if (event.needSatisfactionBoundTicks !== null) {
    assertNonNegativeSafeInteger(event.needSatisfactionBoundTicks, "AURION_TEMPORAL_NEED_BOUND_INVALID");
  }
  if (event.impactDepth !== null) {
    assertNonNegativeSafeInteger(event.impactDepth, "AURION_TEMPORAL_IMPACT_DEPTH_INVALID");
  }

  return Object.freeze({ ...event });
}

export function normalizeAurionTemporalTrace(trace: AurionTemporalTrace): AurionTemporalTrace {
  assertRevision(trace.sourceRevision, "AURION_TEMPORAL_TRACE_REVISION_INVALID");
  if (!trace.rulesetVersion.trim()) throw new Error("AURION_TEMPORAL_TRACE_RULESET_INVALID");
  assertNonNegativeSafeInteger(trace.startTick, "AURION_TEMPORAL_TRACE_START_INVALID");
  assertNonNegativeSafeInteger(trace.endTick, "AURION_TEMPORAL_TRACE_END_INVALID");
  if (trace.endTick < trace.startTick) throw new Error("AURION_TEMPORAL_TRACE_RANGE_INVALID");
  if (trace.events.length === 0) throw new Error("AURION_TEMPORAL_TRACE_EMPTY");
  if (trace.events.length > AURION_TEMPORAL_MAX_EVENTS) throw new Error("AURION_TEMPORAL_TRACE_TOO_LARGE");

  const normalized = trace.events
    .map(normalizeEvent)
    .filter((event) => event.tick >= trace.startTick && event.tick <= trace.endTick)
    .sort((a, b) => a.tick - b.tick || a.sequence - b.sequence || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));

  if (normalized.length === 0) throw new Error("AURION_TEMPORAL_TRACE_SCOPE_EMPTY");

  const eventIds = new Set<string>();
  const positions = new Set<string>();
  for (const event of normalized) {
    if (event.sourceRevision !== trace.sourceRevision) {
      throw new Error("AURION_TEMPORAL_EVENT_REVISION_DRIFT");
    }
    if (eventIds.has(event.eventId)) throw new Error("AURION_TEMPORAL_EVENT_DUPLICATE");
    eventIds.add(event.eventId);

    const position = event.tick + ":" + event.sequence;
    if (positions.has(position)) throw new Error("AURION_TEMPORAL_EVENT_POSITION_DUPLICATE");
    positions.add(position);
  }

  return Object.freeze({
    sourceRevision: trace.sourceRevision,
    rulesetVersion: trace.rulesetVersion,
    startTick: trace.startTick,
    endTick: trace.endTick,
    events: Object.freeze(normalized),
  });
}

export function aurionTemporalTraceHash(trace: AurionTemporalTrace): string {
  const normalized = normalizeAurionTemporalTrace(trace);
  return canonicalSha256({
    domain: "aurion.temporal-trace.v1",
    sourceRevision: normalized.sourceRevision,
    rulesetVersion: normalized.rulesetVersion,
    startTick: normalized.startTick,
    endTick: normalized.endTick,
    events: normalized.events,
  });
}

function propertyHash(property: AurionTemporalProperty): string {
  return canonicalSha256({
    domain: "aurion.temporal-property.v1",
    protocol: property.protocol,
    propertyId: property.propertyId,
    scope: property.scope,
    startTick: property.startTick,
    endTick: property.endTick,
    sourceRevision: property.sourceRevision,
    rulesetVersion: property.rulesetVersion,
    maxImpactDepth: property.maxImpactDepth ?? null,
    satisfactionBoundTicks: property.satisfactionBoundTicks ?? null,
    expectedTraceHash: property.expectedTraceHash ?? null,
  });
}

function unprovable(
  property: AurionTemporalProperty,
  observedTraceHash: string,
  reasonCode: string,
): AurionTemporalPropertyResult {
  return Object.freeze({
    protocol: AURION_TEMPORAL_PROPERTY_PROTOCOL,
    propertyId: property.propertyId,
    status: "UNPROVABLE",
    firstFailureTick: null,
    observedTraceHash,
    propertyHash: propertyHash(property),
    sourceRevision: property.sourceRevision,
    reasonCode,
  });
}

function fail(
  property: AurionTemporalProperty,
  observedTraceHash: string,
  firstFailureTick: number,
  reasonCode: string,
): AurionTemporalPropertyResult {
  return Object.freeze({
    protocol: AURION_TEMPORAL_PROPERTY_PROTOCOL,
    propertyId: property.propertyId,
    status: "FAIL",
    firstFailureTick,
    observedTraceHash,
    propertyHash: propertyHash(property),
    sourceRevision: property.sourceRevision,
    reasonCode,
  });
}

function pass(
  property: AurionTemporalProperty,
  observedTraceHash: string,
): AurionTemporalPropertyResult {
  return Object.freeze({
    protocol: AURION_TEMPORAL_PROPERTY_PROTOCOL,
    propertyId: property.propertyId,
    status: "PASS",
    firstFailureTick: null,
    observedTraceHash,
    propertyHash: propertyHash(property),
    sourceRevision: property.sourceRevision,
    reasonCode: "PROVEN",
  });
}

function validatePropertyShape(property: AurionTemporalProperty): void {
  if (property.protocol !== AURION_TEMPORAL_PROPERTY_PROTOCOL) {
    throw new Error("AURION_TEMPORAL_PROPERTY_PROTOCOL_INVALID");
  }
  if (!aurionTemporalPropertyIds.includes(property.propertyId)) {
    throw new Error("AURION_TEMPORAL_PROPERTY_ID_INVALID");
  }
  if (property.scope !== "trace") throw new Error("AURION_TEMPORAL_PROPERTY_SCOPE_INVALID");
  assertNonNegativeSafeInteger(property.startTick, "AURION_TEMPORAL_PROPERTY_START_INVALID");
  assertNonNegativeSafeInteger(property.endTick, "AURION_TEMPORAL_PROPERTY_END_INVALID");
  if (property.endTick < property.startTick) throw new Error("AURION_TEMPORAL_PROPERTY_RANGE_INVALID");
  assertRevision(property.sourceRevision, "AURION_TEMPORAL_PROPERTY_REVISION_INVALID");
  if (!property.rulesetVersion.trim()) throw new Error("AURION_TEMPORAL_PROPERTY_RULESET_INVALID");

  if (property.maxImpactDepth !== undefined) {
    assertNonNegativeSafeInteger(property.maxImpactDepth, "AURION_TEMPORAL_MAX_DEPTH_INVALID");
  }
  if (property.satisfactionBoundTicks !== undefined) {
    assertNonNegativeSafeInteger(property.satisfactionBoundTicks, "AURION_TEMPORAL_SATISFACTION_BOUND_INVALID");
  }
  if (property.expectedTraceHash !== undefined) assertHash(property.expectedTraceHash, "AURION_TEMPORAL_EXPECTED_HASH_INVALID");
}

export function evaluateAurionTemporalProperty(
  trace: AurionTemporalTrace,
  property: AurionTemporalProperty,
): AurionTemporalPropertyResult {
  validatePropertyShape(property);
  const normalized = normalizeAurionTemporalTrace(trace);
  const observedTraceHash = aurionTemporalTraceHash(normalized);

  if (
    property.sourceRevision !== normalized.sourceRevision ||
    property.rulesetVersion !== normalized.rulesetVersion ||
    property.startTick !== normalized.startTick ||
    property.endTick !== normalized.endTick
  ) {
    return unprovable(property, observedTraceHash, "TRACE_BINDING_MISMATCH");
  }

  switch (property.propertyId) {
    case "AURION.NPC.NO_UNGROUNDED_ACTION": {
      const events = normalized.events.filter((event) => event.kind === "action_intent");
      if (!events.length) return unprovable(property, observedTraceHash, "NO_ACTION_EVIDENCE");
      const first = events.find(
        (event) => event.actionGrounded !== true || event.hasCausalReceipt !== true,
      );
      return first
        ? fail(property, observedTraceHash, first.tick, "UNGROUNDED_ACTION")
        : pass(property, observedTraceHash);
    }

    case "AURION.EFFECT.HAS_CAUSAL_RECEIPT": {
      const events = normalized.events.filter((event) => event.kind === "effect_receipt");
      if (!events.length) return unprovable(property, observedTraceHash, "NO_EFFECT_EVIDENCE");
      const first = events.find((event) => event.hasCausalReceipt !== true);
      return first
        ? fail(property, observedTraceHash, first.tick, "MISSING_CAUSAL_RECEIPT")
        : pass(property, observedTraceHash);
    }

    case "AURION.CAUSAL.TICK_ORDER_TOTAL": {
      const events = normalized.events;
      for (let index = 1; index < events.length; index += 1) {
        const previous = events[index - 1]!;
        const current = events[index]!;
        const ordered = current.tick > previous.tick || (
          current.tick === previous.tick && current.sequence > previous.sequence
        );
        if (!ordered) return fail(property, observedTraceHash, current.tick, "NON_TOTAL_TICK_ORDER");
      }
      return pass(property, observedTraceHash);
    }

    case "AURION.REPLAY.STABLE_HASH": {
      if (!property.expectedTraceHash) return unprovable(property, observedTraceHash, "EXPECTED_TRACE_HASH_REQUIRED");
      return property.expectedTraceHash === observedTraceHash
        ? pass(property, observedTraceHash)
        : fail(property, observedTraceHash, normalized.startTick, "TRACE_HASH_MISMATCH");
    }

    case "AURION.NPC.NEED_SATISFACTION_BOUND": {
      const events = normalized.events.filter((event) => event.kind === "need_resolution");
      if (!events.length) return unprovable(property, observedTraceHash, "NO_NEED_EVIDENCE");
      const bound = property.satisfactionBoundTicks;
      if (bound === undefined) return unprovable(property, observedTraceHash, "SATISFACTION_BOUND_REQUIRED");
      const first = events.find((event) =>
        event.needSatisfactionBoundTicks === null ||
        event.needSatisfactionBoundTicks > bound ||
        event.needResolvedWithinBound !== true
      );
      return first
        ? fail(property, observedTraceHash, first.tick, "NEED_BOUND_VIOLATION")
        : pass(property, observedTraceHash);
    }

    case "AURION.WORLD.NO_UNBOUNDED_IMPACT_CHAIN": {
      const events = normalized.events.filter((event) => event.kind === "impact");
      if (!events.length) return unprovable(property, observedTraceHash, "NO_IMPACT_EVIDENCE");
      const bound = property.maxImpactDepth;
      if (bound === undefined) return unprovable(property, observedTraceHash, "IMPACT_DEPTH_BOUND_REQUIRED");
      const first = events.find((event) => event.impactDepth === null || event.impactDepth > bound);
      return first
        ? fail(property, observedTraceHash, first.tick, "IMPACT_DEPTH_BOUND_VIOLATION")
        : pass(property, observedTraceHash);
    }

    case "AURION.HANDOVER.NO_STALE_WRITE": {
      const events = normalized.events.filter((event) => event.kind === "handover");
      if (!events.length) return unprovable(property, observedTraceHash, "NO_HANDOVER_EVIDENCE");
      const first = events.find(
        (event) => event.postHandover !== true || event.usesStaleAuthority === true,
      );
      return first
        ? fail(property, observedTraceHash, first.tick, "STALE_HANDOVER_WRITE")
        : pass(property, observedTraceHash);
    }
  }
}

export function evaluateAurionTemporalPropertySet(
  trace: AurionTemporalTrace,
  properties: readonly AurionTemporalProperty[],
): AurionTemporalValidationReport {
  if (properties.length === 0) throw new Error("AURION_TEMPORAL_PROPERTY_SET_EMPTY");
  if (properties.length > 64) throw new Error("AURION_TEMPORAL_PROPERTY_SET_TOO_LARGE");

  const normalized = normalizeAurionTemporalTrace(trace);
  const observedTraceHash = aurionTemporalTraceHash(normalized);
  const results = properties.map((property) => evaluateAurionTemporalProperty(normalized, property));

  const reportHash = canonicalSha256({
    domain: "aurion.temporal-validation-report.v1",
    observedTraceHash,
    results,
  });

  return Object.freeze({
    observedTraceHash,
    results: Object.freeze(results),
    reportHash,
  });
}
