import { performance } from "node:perf_hooks";
import { ZONE_TICK_MS } from "../../shared/zoneTimingContract";
import { AurionTickRecorder } from "../causality/tickRecorder";
import { AuthoritativeMovementZone } from "../zoneRuntime";

export type MultirateFrame = Readonly<{
  tick: number;
  authority10Hz: true;
  world5Hz: boolean;
  background1Hz: boolean;
}>;

/**
 * Virtual cadence only: never changes the authoritative production clock.
 * Exactly 2 and 10 100-ms authority ticks per 5 Hz / 1 Hz observation.
 */
export function multirateFrames(seconds: number): MultirateFrame[] {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 60) {
    throw new Error("AURION_TICK_PROFILE_DURATION_INVALID");
  }
  if (ZONE_TICK_MS !== 100) throw new Error("AURION_TICK_PROFILE_BASE_RATE_DRIFT");
  return Array.from({ length: 10 * seconds }, (_, i) => {
    const tick = i + 1;
    return {
      tick,
      authority10Hz: true,
      world5Hz: tick % 2 === 0,
      background1Hz: tick % 10 === 0,
    };
  });
}

export function summarizeMultirateCounts(frames: readonly MultirateFrame[]) {
  return {
    authority10Hz: frames.filter(frame => frame.authority10Hz).length,
    world5Hz: frames.filter(frame => frame.world5Hz).length,
    background1Hz: frames.filter(frame => frame.background1Hz).length,
  };
}

export type ActualZoneProfileMeasurement = Readonly<{
  profileHz: 1 | 5 | 10;
  virtualSeconds: number;
  tickCount: number;
  receiptCount: number;
  finalReceiptHash: string;
  chainValid: boolean;
  cpuMilliseconds: number;
  wallMilliseconds: number;
  heapHighWaterBytes: number;
  projectionOnly: true;
  productionMutation: false;
}>;

/**
 * Execute the actual authoritative zone implementation, but in replay mode:
 * no live sockets, gameplay writes or database persistence. The same zone ID
 * and pinned source revision allow exact receipt-hash comparison across rates.
 * Wall/CPU measurements are local process measurements, not production results.
 */
export function runActualAurionZoneProfile(
  hz: 1 | 5 | 10,
  seconds: number,
): ActualZoneProfileMeasurement {
  if (![1, 5, 10].includes(hz) || !Number.isSafeInteger(seconds) || seconds < 1 || seconds > 60) {
    throw new Error("AURION_TICK_PROFILE_DURATION_INVALID");
  }
  const tickCount = hz * seconds;
  const zoneId = "observatory_threshold:multirate-benchmark";
  const recorder = new AurionTickRecorder(tickCount + 1);
  const zone = new AuthoritativeMovementZone(zoneId as ConstructorParameters<typeof AuthoritativeMovementZone>[0], recorder);
  zone.isReplay = true;
  zone.sourceRevisionOverride = "a".repeat(40);

  let heapHighWaterBytes = process.memoryUsage().heapUsed;
  const startCpu = process.cpuUsage();
  const startWall = performance.now();
  for (let index = 0; index < tickCount; index++) {
    zone.tick();
    const receipt = zone.getLatestReceipt();
    if (!receipt) throw new Error("AURION_PROFILE_RECEIPT_MISSING");
    recorder.record({ receipt });
    heapHighWaterBytes = Math.max(heapHighWaterBytes, process.memoryUsage().heapUsed);
  }
  const wallMilliseconds = performance.now() - startWall;
  const cpu = process.cpuUsage(startCpu);
  const cpuMilliseconds = (cpu.user + cpu.system) / 1000;
  const receipts = recorder.getReceipts(zoneId);
  const chainValid = recorder.verifyReceiptChain(zoneId).valid;
  if (!chainValid || receipts.length !== tickCount || zone.getTickNumber() !== tickCount) {
    throw new Error("AURION_PROFILE_PROVENANCE_INVALID");
  }
  return Object.freeze({
    profileHz: hz,
    virtualSeconds: seconds,
    tickCount,
    receiptCount: receipts.length,
    finalReceiptHash: receipts[receipts.length - 1].receiptHash,
    chainValid,
    cpuMilliseconds,
    wallMilliseconds,
    heapHighWaterBytes,
    projectionOnly: true,
    productionMutation: false,
  });
}
