import { describe, expect, it } from "vitest";
import { AuthoritativeMovementZone, ZoneRegistry } from "./zoneRuntime";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { prepareProductionProbeZone } from "./aurionProductionProbeZone";

function fixture() {
  const recorder = new AurionTickRecorder(20);
  const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
  zone.sourceRevisionOverride = "a".repeat(40);
  zone.tick(); zone.tick();
  const first = recorder.getEntry(zone.zoneId, 1)!;
  const checkpoint = { id: "unit-only", worldId: first.receipt.worldId, zoneId: zone.zoneId, tick: 0,
    snapshotHash: first.receipt.preStateHash, state: first.preState!, reconciled: 1 };
  const persistence = {
    getLatestReceipt: async () => zone.getLatestReceipt(),
    getRecordedTick: async (_zone: string, tick: number) => recorder.getEntry(zone.zoneId, tick) ?? null,
    getCheckpointAtOrBefore: async () => checkpoint,
    getTicksInRange: async (_zone: string, from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => recorder.getEntry(zone.zoneId, from + i)!),
  };
  return { zone, recorder, checkpoint, persistence };
}

describe("probe zone preparation contract (unit evidence)", () => {
  it("reconstructs without activating and preserves the persisted tick and receipt anchor", async () => {
    const f = fixture(), registry = new ZoneRegistry();
    const prepared = await prepareProductionProbeZone(registry, f.persistence, new AurionTickRecorder(20));
    expect(prepared.zone.getCanonicalZoneState()).toEqual(f.zone.getCanonicalZoneState());
    expect(prepared.zone.getLatestReceipt()).toEqual(f.zone.getLatestReceipt());
    expect(registry.find(f.zone.zoneId)).toBeUndefined();
  });
  it.each(["checkpoint", "gap", "replay"])("fails closed on %s damage before activation", async damage => {
    const f = fixture(), registry = new ZoneRegistry();
    if (damage === "checkpoint") f.checkpoint.snapshotHash = "invalid";
    if (damage === "gap") f.persistence.getTicksInRange = async () => [];
    if (damage === "replay") f.recorder.getEntry(f.zone.zoneId, 1)!.receipt.transitionHash = "invalid";
    await expect(prepareProductionProbeZone(registry, f.persistence, new AurionTickRecorder(20))).rejects.toThrow();
    expect(registry.find(f.zone.zoneId)).toBeUndefined();
  });
  it("does not overwrite an already active unhydrated zone with a persisted history", async () => {
    const f = fixture(), registry = new ZoneRegistry();
    const active = registry.get("observatory_threshold");
    await expect(prepareProductionProbeZone(registry, f.persistence, new AurionTickRecorder(20))).rejects.toThrow("PROBE_ACTIVE_ZONE_HEAD_UNVERIFIED");
    expect(active.getTickNumber()).toBe(0);
  });
});
