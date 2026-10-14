import { describe, expect, it } from "vitest";
import { ZONE_TICK_MS } from "../../shared/zoneTimingContract";
import {
  multirateFrames,
  runActualAurionZoneProfile,
  summarizeMultirateCounts,
} from "./aurionTickProfileBenchmark";

describe("Aurion 10/5/1 Hz isolated workload experiment", () => {
  it("uses 100 ms authoritative movement/combat frames with exact integer-ratio lower-frequency lanes", () => {
    expect(ZONE_TICK_MS).toBe(100);
    const frames = multirateFrames(60);
    expect(frames).toHaveLength(600);
    expect(summarizeMultirateCounts(frames)).toEqual({
      authority10Hz: 600,
      world5Hz: 300,
      background1Hz: 60,
    });
    expect(frames[0]).toEqual({ tick: 1, authority10Hz: true, world5Hz: false, background1Hz: false });
    expect(frames[1].world5Hz).toBe(true);
    expect(frames[9].background1Hz).toBe(true);
  });

  it("rejects invalid virtual durations and never mutates authoritative tick timing", () => {
    for (const invalid of [0, -1, 1.5, 61, Number.NaN, Infinity]) {
      expect(() => multirateFrames(invalid)).toThrow("AURION_TICK_PROFILE_DURATION_INVALID");
    }
    expect(ZONE_TICK_MS).toBe(100);
  });

  it("runs the REAL zone simulation without DB writes and proves same-tick replay hashes", () => {
    const baseline = runActualAurionZoneProfile(10, 2);
    const half = runActualAurionZoneProfile(5, 4);
    const slow = runActualAurionZoneProfile(1, 20);
    for (const measurement of [baseline, half, slow]) {
      expect(measurement.tickCount).toBe(20);
      expect(measurement.receiptCount).toBe(20);
      expect(measurement.chainValid).toBe(true);
      expect(measurement.cpuMilliseconds).toBeGreaterThanOrEqual(0);
      expect(measurement.wallMilliseconds).toBeGreaterThanOrEqual(0);
      expect(measurement.heapHighWaterBytes).toBeGreaterThan(0);
      expect(measurement.projectionOnly).toBe(true);
      expect(measurement.productionMutation).toBe(false);
    }
    expect(half.finalReceiptHash).toBe(baseline.finalReceiptHash);
    expect(slow.finalReceiptHash).toBe(baseline.finalReceiptHash);
  });

  it("compares same virtual duration without assuming proportional CPU savings", () => {
    const baseline = runActualAurionZoneProfile(10, 3);
    const half = runActualAurionZoneProfile(5, 3);
    const slow = runActualAurionZoneProfile(1, 3);
    expect([baseline.tickCount, half.tickCount, slow.tickCount]).toEqual([30, 15, 3]);
    expect([baseline.receiptCount, half.receiptCount, slow.receiptCount]).toEqual([30, 15, 3]);
    expect(baseline.finalReceiptHash).not.toBe(half.finalReceiptHash);
    expect(half.finalReceiptHash).not.toBe(slow.finalReceiptHash);
  });
});
