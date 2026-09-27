import { describe, expect, it } from "vitest";
import { resolveEmergentLifeStep } from "../shared/aurionEmergentLifeCore";
import {
  AURION_TEMPORAL_PROPERTY_PROTOCOL,
  type AurionTemporalProperty,
  type AurionTemporalTrace,
  aurionTemporalTraceHash,
} from "../shared/aurionTemporalInvariantProtocol";
import {
  validateAurionTemporalTrace,
  validateAurionTemporalTraceSet,
} from "./aurionTemporalInvariantValidator";

const SOURCE_REVISION = "cd53ace168a4a602a11d3cf670d68d57f3823ec4"; // merged Emergent Life Core source revision
const RULESET = "aurion-emergent-life-test.v1";

function property(
  propertyId: AurionTemporalProperty["propertyId"],
  overrides: Partial<AurionTemporalProperty> = {},
): AurionTemporalProperty {
  return {
    protocol: AURION_TEMPORAL_PROPERTY_PROTOCOL,
    propertyId,
    scope: "trace",
    startTick: 12,
    endTick: 12,
    sourceRevision: SOURCE_REVISION,
    rulesetVersion: RULESET,
    ...overrides,
  };
}

function liveTrace(): AurionTemporalTrace {
  const resolution = resolveEmergentLifeStep({
    entityId: "npc:aurion-test",
    regionId: "observatory_threshold",
    resolutionIndex: 12,
    currentNeeds: {
      safety: 8_000,
      resources: 6_000,
      belonging: 7_000,
      status: 7_000,
      wealth: 7_000,
      power: 7_000,
    },
    impacts: [{
      sourceReceiptId: "receipt:world:12",
      targetEntityIds: ["npc:aurion-test"],
      domain: "resource",
      magnitudeBps: 900,
      causeTags: ["drought", "scarcity"],
      regionId: "observatory_threshold",
      resolutionIndex: 12,
    }],
    candidates: [{
      id: "candidate:forage",
      kind: "forage",
      sourceReceiptId: "receipt:world:12",
      resolutionIndex: 12,
      priorityBps: 9_000,
      benefitBps: 8_000,
      riskBps: 1_000,
      distanceBps: 100,
    }],
  });

  if (!resolution.effectIntent || !resolution.selectedAction) {
    throw new Error("LIVE_TRACE_FIXTURE_RESOLUTION_REQUIRED");
  }

  return {
    sourceRevision: SOURCE_REVISION,
    rulesetVersion: RULESET,
    startTick: 12,
    endTick: 12,
    events: [
      {
        tick: 12,
        sequence: 0,
        eventId: "action:" + resolution.actionIntentHash,
        kind: "action_intent",
        sourceRevision: SOURCE_REVISION,
        actionGrounded: true,
        hasCausalReceipt: true,
        needSatisfactionBoundTicks: null,
        needResolvedWithinBound: null,
        impactDepth: null,
        postHandover: null,
        usesStaleAuthority: null,
      },
      {
        tick: 12,
        sequence: 1,
        eventId: "effect:" + resolution.effectIntent.effectId,
        kind: "effect_receipt",
        sourceRevision: SOURCE_REVISION,
        actionGrounded: null,
        hasCausalReceipt: true,
        needSatisfactionBoundTicks: null,
        needResolvedWithinBound: null,
        impactDepth: 1,
        postHandover: null,
        usesStaleAuthority: null,
      },
      {
        tick: 12,
        sequence: 2,
        eventId: "impact:" + resolution.nextImpact!.domain,
        kind: "impact",
        sourceRevision: SOURCE_REVISION,
        actionGrounded: null,
        hasCausalReceipt: true,
        needSatisfactionBoundTicks: null,
        needResolvedWithinBound: null,
        impactDepth: 1,
        postHandover: null,
        usesStaleAuthority: null,
      },
      {
        tick: 12,
        sequence: 3,
        eventId: "need:" + resolution.afterNeedsHash,
        kind: "need_resolution",
        sourceRevision: SOURCE_REVISION,
        actionGrounded: null,
        hasCausalReceipt: null,
        needSatisfactionBoundTicks: 4,
        needResolvedWithinBound: true,
        impactDepth: null,
        postHandover: null,
        usesStaleAuthority: null,
      },
    ],
  };
}

describe("AIM-618 temporal invariant validator", () => {
  it("checks a real Aurion-derived emergent-life trace deterministically", () => {
    const trace = liveTrace();
    const traceAgain = liveTrace();
    expect(aurionTemporalTraceHash(trace)).toBe(aurionTemporalTraceHash(traceAgain));

    const report = validateAurionTemporalTraceSet(trace, [
      property("AURION.NPC.NO_UNGROUNDED_ACTION"),
      property("AURION.EFFECT.HAS_CAUSAL_RECEIPT"),
      property("AURION.CAUSAL.TICK_ORDER_TOTAL"),
      property("AURION.REPLAY.STABLE_HASH", { expectedTraceHash: aurionTemporalTraceHash(trace) }),
      property("AURION.NPC.NEED_SATISFACTION_BOUND", { satisfactionBoundTicks: 4 }),
      property("AURION.WORLD.NO_UNBOUNDED_IMPACT_CHAIN", { maxImpactDepth: 2 }),
    ]);

    expect(report.results.every((result) => result.status === "PASS")).toBe(true);
    expect(report.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("is invariant to event input ordering", () => {
    const trace = liveTrace();
    const reversed = { ...trace, events: [...trace.events].reverse() };
    expect(aurionTemporalTraceHash(reversed)).toBe(aurionTemporalTraceHash(trace));

    const expected = aurionTemporalTraceHash(trace);
    const first = validateAurionTemporalTrace(
      reversed,
      property("AURION.REPLAY.STABLE_HASH", { expectedTraceHash: expected }),
    );
    const second = validateAurionTemporalTrace(
      trace,
      property("AURION.REPLAY.STABLE_HASH", { expectedTraceHash: expected }),
    );

    expect(first.status).toBe("PASS");
    expect(second.status).toBe("PASS");
    expect(first.observedTraceHash).toBe(second.observedTraceHash);
  });

  it("produces the same first failing tick and verdict on repeated runs", () => {
    const trace: AurionTemporalTrace = {
      ...liveTrace(),
      startTick: 10,
      endTick: 14,
      events: [
        ...liveTrace().events,
        {
          tick: 10,
          sequence: 0,
          eventId: "bad-action",
          kind: "action_intent",
          sourceRevision: SOURCE_REVISION,
          actionGrounded: false,
          hasCausalReceipt: true,
          needSatisfactionBoundTicks: null,
          needResolvedWithinBound: null,
          impactDepth: null,
          postHandover: null,
          usesStaleAuthority: null,
        },
      ],
    };

    const p = property("AURION.NPC.NO_UNGROUNDED_ACTION", {
      startTick: 10,
      endTick: 14,
    });
    const first = validateAurionTemporalTrace(trace, p);
    const second = validateAurionTemporalTrace(trace, p);

    expect(first.status).toBe("FAIL");
    expect(first.firstFailureTick).toBe(10);
    expect(first.firstFailureTick).toBe(second.firstFailureTick);
    expect(first.observedTraceHash).toBe(second.observedTraceHash);
  });

  it("returns UNPROVABLE rather than PASS for missing evidence", () => {
    const trace: AurionTemporalTrace = {
      sourceRevision: SOURCE_REVISION,
      rulesetVersion: RULESET,
      startTick: 12,
      endTick: 12,
      events: [{
        tick: 12,
        sequence: 0,
        eventId: "noise",
        kind: "impact",
        sourceRevision: SOURCE_REVISION,
        actionGrounded: null,
        hasCausalReceipt: true,
        needSatisfactionBoundTicks: null,
        needResolvedWithinBound: null,
        impactDepth: 99,
        postHandover: null,
        usesStaleAuthority: null,
      }],
    };

    const result = validateAurionTemporalTrace(trace, property("AURION.HANDOVER.NO_STALE_WRITE"));
    expect(result.status).toBe("UNPROVABLE");
    expect(result.reasonCode).toBe("NO_HANDOVER_EVIDENCE");
  });

  it("rejects a trace whose source revision drifts from an event", () => {
    const trace = {
      ...liveTrace(),
      events: liveTrace().events.map((event, index) =>
        index === 0 ? { ...event, sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } : event,
      ),
    };

    expect(() => aurionTemporalTraceHash(trace)).toThrow("AURION_TEMPORAL_EVENT_REVISION_DRIFT");
  });

  it("returns UNPROVABLE when the property is bound to another source revision", () => {
    const result = validateAurionTemporalTrace(
      liveTrace(),
      property("AURION.REPLAY.STABLE_HASH", {
        sourceRevision: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        expectedTraceHash: aurionTemporalTraceHash(liveTrace()),
      }),
    );
    expect(result.status).toBe("UNPROVABLE");
    expect(result.reasonCode).toBe("TRACE_BINDING_MISMATCH");
  });

  it("fails closed on an impact-depth bound violation", () => {
    const trace: AurionTemporalTrace = {
      ...liveTrace(),
      events: liveTrace().events.map((event) =>
        event.kind === "impact" ? { ...event, impactDepth: 3 } : event,
      ),
    };
    const result = validateAurionTemporalTrace(
      trace,
      property("AURION.WORLD.NO_UNBOUNDED_IMPACT_CHAIN", { maxImpactDepth: 2 }),
    );
    expect(result.status).toBe("FAIL");
    expect(result.reasonCode).toBe("IMPACT_DEPTH_BOUND_VIOLATION");
    expect(result.firstFailureTick).toBe(12);
  });

  it("rejects unbounded trace evidence beyond the protocol cap", () => {
    const trace = liveTrace();
    const oversized: AurionTemporalTrace = {
      ...trace,
      events: Array.from({ length: 4097 }, (_, index) => ({
        ...trace.events[index % trace.events.length]!,
        tick: 12 + index,
        sequence: 0,
        eventId: "oversized:" + index,
      })),
      endTick: 4108,
    };
    expect(() => aurionTemporalTraceHash(oversized)).toThrow("AURION_TEMPORAL_TRACE_TOO_LARGE");
  });

  it("rejects duplicate event positions and event identifiers", () => {
    const trace = liveTrace();
    const duplicatePosition: AurionTemporalTrace = {
      ...trace,
      events: [
        ...trace.events,
        { ...trace.events[0]!, eventId: "duplicate-position" },
      ],
    };
    expect(() => aurionTemporalTraceHash(duplicatePosition)).toThrow("AURION_TEMPORAL_EVENT_POSITION_DUPLICATE");

    const duplicateId: AurionTemporalTrace = {
      ...trace,
      events: [
        ...trace.events,
        { ...trace.events[0]!, tick: 13, sequence: 0 },
      ],
    };
    expect(() => aurionTemporalTraceHash(duplicateId)).toThrow("AURION_TEMPORAL_EVENT_DUPLICATE");
  });
});
