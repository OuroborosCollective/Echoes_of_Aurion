import { describe, expect, it } from "vitest";
import { AurionTickRecorder, type RecordedTickEntry } from "../causality/tickRecorder";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { hashCanonicalZoneState } from "../causality/zoneCanonicalState";
import { projectCommittedTick } from "./aurionAdapter";
import { isProjectionIdentity, projectionHash } from "./shared/projectionIdentity";
import { AURION_CAUSAL_TICK_SCHEMA_V2 } from "../../shared/aurionCausalTickContract";

// Isolated real Aurion authority, not a running production zone or DB proof.
const revision = "1".repeat(40);
const observation = { sourceRevision: revision, runtimeImageDigest: "UNVERIFIED", streamInstance: "11111111-1111-4111-8111-111111111111" };
function fixture() {
  const recorder = new AurionTickRecorder(200);
  const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
  zone.sourceRevisionOverride = revision;
  return { zone, recorder };
}

describe("Aurion committed Godot projection", () => {
  it("projects only a hash-checked canonical tick and converts fixed X/Z exactly once", () => {
    const { zone, recorder } = fixture();
    zone.tick();
    const entry = recorder.getEntry(zone.zoneId, zone.getTickNumber())!;
    const before = JSON.stringify(entry);
    const projected = projectCommittedTick(entry, observation);
    expect(isProjectionIdentity(projected.identity)).toBe(true);
    expect(projected.identity.receiptHash).toBe(zone.getLatestReceipt()!.receiptHash);
    expect(projected.identity.stateHash).toBe(hashCanonicalZoneState(entry.postState!));
    expect(projected.identity.projectionHash).toBe(projectionHash(projected.identity.tick, projected.entities, projected.regions));
    for (const mob of entry.postState!.mobs) {
      const entity = projected.entities.find(e => e.id === mob.entityId)!;
      expect(entity.pos).toEqual({ x: mob.x / 1000, y: 0, z: mob.z / 1000 });
    }
    expect(JSON.stringify(entry)).toBe(before);
  });

  it("rejects changed state, receipt, revision and missing post-state", () => {
    const { zone, recorder } = fixture();
    zone.tick();
    const entry = recorder.getEntry(zone.zoneId, zone.getTickNumber())!;
    expect(() => projectCommittedTick({ ...entry, postState: undefined }, observation)).toThrow();
    expect(() => projectCommittedTick(entry, { ...observation, sourceRevision: "2".repeat(40) })).toThrow();
    expect(() => projectCommittedTick({ ...entry, receipt: { ...entry.receipt, receiptHash: "sha256:" + "0".repeat(64) } }, observation)).toThrow();
    expect(() => projectCommittedTick({ ...entry, postState: { ...entry.postState!, tick: 999 } }, observation)).toThrow();
  });

  it("keeps receipt chains identical with a detached, even hostile, observer", async () => {
    const baseline = fixture();
    const observed = fixture();
    baseline.zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
    observed.zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
    const captured: RecordedTickEntry[] = [];
    let completed = 0;
    const stop = observed.recorder.observeCommittedTicks(entry => {
      captured.push(structuredClone(entry));
      entry.receipt.receiptHash = "observer-local mutation";
      if ("stages" in entry.receipt && entry.receipt.stages.length) Object.assign(entry.receipt.stages[0], { observerMutation: true });
      if (entry.postState?.mobs[0]) entry.postState.mobs[0].x = 999999;
      completed++;
    });
    for (let tick = 1; tick <= 100; tick++) {
      baseline.zone.tick();
      observed.zone.tick();
      await Promise.resolve();
      expect(observed.zone.getLatestReceipt()).toEqual(baseline.zone.getLatestReceipt());
      expect(observed.zone.getCanonicalZoneState()).toEqual(baseline.zone.getCanonicalZoneState());
    }
    expect(captured).toHaveLength(100);
    expect(completed).toBe(100);
    expect(observed.recorder.verifyReceiptChain().valid).toBe(true);
    stop();
    observed.zone.tick();
    await Promise.resolve();
    expect(captured).toHaveLength(100);
  });
});
