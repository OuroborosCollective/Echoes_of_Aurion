import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID } from "../shared/aurionProductionProbeEvidence";
import { AURION_CAUSAL_TICK_SCHEMA_V1 } from "../shared/aurionCausalTickContract";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";
import { replayZoneTick } from "./causality/replayZoneTick";
import { AurionTickRecorder, type RecordedTickEntry } from "./causality/tickRecorder";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import type { ZoneId } from "./zoneProtocol";

type PresenceView = { userId: number };
type MobRuntimeView = {
  tick(presences: PresenceView[], tickNumber: number): boolean;
};

function createSocket(send: (payload: string) => void = () => {}): WebSocket {
  return {
    readyState: 1,
    OPEN: 1,
    send,
    close: () => {},
  } as unknown as WebSocket;
}

function replayEntry(
  recorder: AurionTickRecorder,
  zoneId: ZoneId,
  tick: number,
  previous?: RecordedTickEntry,
): RecordedTickEntry {
  const entry = recorder.getEntry(zoneId, tick);
  expect(entry).toBeDefined();
  const current = entry!;
  expect(current.preState).toBeDefined();
  expect(current.postState).toBeDefined();
  expect(hashCanonicalZoneState(current.preState!)).toBe(current.receipt.preStateHash);
  expect(hashCanonicalZoneState(current.postState!)).toBe(current.receipt.postStateHash);

  if (previous) {
    expect(current.receipt.previousReceiptHash).toBe(previous.receipt.receiptHash);
    expect(current.receipt.preStateHash).toBe(previous.receipt.postStateHash);
    expect(current.preState).toEqual(previous.postState);
  }

  const verdict = replayZoneTick({
    preState: current.preState!,
    intents: current.intents!,
    expectedReceipt: current.receipt,
  });
  expect(verdict.verdict).toBe("MATCH");
  if (verdict.verdict === "MATCH") {
    expect(verdict.receiptHash).toBe(current.receipt.receiptHash);
  }
  return current;
}

describe("Aurion zone tick scratch-state safety and causal parity (#987)", () => {
  it("refreshes the reused mob-target buffer as actors join and leave", () => {
    const zoneId = "zone_tick_gc_membership" as ZoneId;
    const zone = new AuthoritativeMovementZone(zoneId, new AurionTickRecorder(8));
    const first = zone.join({ userId: 41, socket: createSocket() });
    zone.join({
      userId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID,
      socket: createSocket(),
    });

    const mobRuntime = Reflect.get(zone, "mobRuntime") as MobRuntimeView;
    const originalTick = mobRuntime.tick.bind(mobRuntime);
    const buffers: PresenceView[][] = [];
    const observedIds: number[][] = [];
    vi.spyOn(mobRuntime, "tick").mockImplementation((presences, tickNumber) => {
      buffers.push(presences);
      observedIds.push(presences.map(presence => presence.userId));
      return originalTick(presences, tickNumber);
    });

    zone.tick();
    zone.join({ userId: 42, socket: createSocket() });
    zone.tick();
    zone.leave(first.connectionId);
    zone.tick();

    expect(new Set(buffers).size).toBe(1);
    expect(observedIds).toEqual([[41], [41, 42], [42]]);
  });

  it("preserves action-sequence, snapshot and replay hashes across tick boundaries", () => {
    const zoneId = "zone_tick_gc_replay_parity" as ZoneId;
    const recorder = new AurionTickRecorder(32);
    const zone = new AuthoritativeMovementZone(zoneId, recorder);
    zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V1;
    const combatMessages: Record<string, unknown>[] = [];
    const { connectionId } = zone.join({
      userId: 7,
      socket: createSocket(payload => combatMessages.push(JSON.parse(payload))),
      combatProfile: {
        combatLevel: 7,
        maxHealth: 540,
        weaponBonus: 15,
        weaponTrack: "blade",
      },
    });

    expect(zone.submitMovement(connectionId, {
      type: "move",
      clientSeq: 1,
      input: { x: 0, z: -1 },
    })).toBe("accepted");

    let previous: RecordedTickEntry | undefined;
    for (let tick = 1; tick <= 5; tick += 1) {
      zone.tick();
      previous = replayEntry(recorder, zoneId, tick, previous);
    }

    // The movement stage sees sequence 3 before the action stage sees sequence 2.
    // The captured per-tick watermark must still admit the already accepted skill.
    expect(zone.submitSkill(connectionId, {
      type: "skill",
      clientSeq: 2,
      skillId: "k_strike",
      targetEntityId: "mob_12",
    })).toBe("accepted");
    expect(zone.submitMovement(connectionId, {
      type: "move",
      clientSeq: 3,
      input: { x: 0, z: 0 },
    })).toBe("accepted");
    zone.tick();
    previous = replayEntry(recorder, zoneId, 6, previous);

    expect(combatMessages.some(message =>
      message.type === "combat"
      && message.attackerEntityId === "player:7"
      && message.skillId === "k_strike"
      && message.defenderEntityId === "mob_12",
    )).toBe(true);

    expect(zone.submitMovement(connectionId, {
      type: "move",
      clientSeq: 4,
      input: { x: 1, z: 0 },
    })).toBe("accepted");
    zone.tick();
    replayEntry(recorder, zoneId, 7, previous);
  });
});

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1]!;
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Diagnostic budget and parity measurement of the current implementation.
 * Treat it as optimization evidence only when paired with a matched pre-change
 * run on the same runner, workload, and runtime.
 */
describe("Aurion 10 Hz zone tick benchmark (#987)", () => {
  it("repeats one fixed authoritative workload and reports the 100 ms budget", async () => {
    const actorCount = 8;
    const warmupTicks = 64;
    const measuredTicks = 256;
    const repeats = 3;
    const totalTicks = warmupTicks + measuredTicks;
    const zoneId = "zone_tick_gc_benchmark" as ZoneId;
    const runs: Array<{
      sampleCount: number;
      p50Ms: number;
      p95Ms: number;
      maxMs: number;
      terminalStateHash: string;
    }> = [];

    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const recorder = new AurionTickRecorder(totalTicks + 1);
      const zone = new AuthoritativeMovementZone(zoneId, recorder);
      zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V1;
      const connections = Array.from({ length: actorCount }, (_, index) =>
        zone.join({
          userId: 500 + index,
          socket: createSocket(),
        }).connectionId,
      );
      const latencies: number[] = [];

      for (let tick = 0; tick < totalTicks; tick += 1) {
        for (let actor = 0; actor < actorCount; actor += 1) {
          const direction = (tick + actor) % 2 === 0 ? 1 : -1;
          const input = actor % 2 === 0
            ? { x: direction, z: 0 }
            : { x: 0, z: direction };
          const result = zone.submitMovement(connections[actor]!, {
            type: "move",
            clientSeq: tick + 1,
            input,
          });
          expect(result).toBe("accepted");
        }

        const start = performance.now();
        zone.tick();
        const elapsed = performance.now() - start;
        if (tick >= warmupTicks) latencies.push(elapsed);
      }

      const terminal = recorder.getEntry(zoneId, totalTicks);
      expect(terminal?.postState).toBeDefined();
      const sorted = [...latencies].sort((left, right) => left - right);
      runs.push({
        sampleCount: latencies.length,
        p50Ms: roundMilliseconds(percentile(latencies, 0.5)),
        p95Ms: roundMilliseconds(percentile(latencies, 0.95)),
        maxMs: roundMilliseconds(sorted.at(-1)!),
        terminalStateHash: hashCanonicalZoneState(terminal!.postState!),
      });
    }

    expect(runs).toHaveLength(repeats);
    expect(runs.every(run => run.sampleCount === measuredTicks)).toBe(true);
    expect(new Set(runs.map(run => run.terminalStateHash)).size).toBe(1);

    const report = {
      protocol: "aurion.zone.tick.benchmark.v1",
      sourceHead: process.env.AURION_ZONE_TICK_HEAD ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      workload: {
        actors: actorCount,
        mobRoster: "default AuthoritativeMovementZone",
        warmupTicks,
        measuredTicks,
        repeats,
        targetHz: 10,
        budgetMs: 100,
        movementIntentsPerTick: actorCount,
      },
      runs,
      snapshotParityAcrossRuns: true,
      within10HzBudget: runs.every(run => run.p95Ms <= 100),
      performanceGainClaimed: false,
      note: "Diagnostic same-workload timing; no pre-change comparison or GC-byte reduction is claimed.",
    };

    expect(report.within10HzBudget).toBe(true);
    console.info("AURION_ZONE_TICK_BENCHMARK_REPORT", JSON.stringify(report));

    const outputPath = process.env.AURION_ZONE_TICK_BENCHMARK_OUTPUT;
    if (outputPath) {
      await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    }
  });
});
