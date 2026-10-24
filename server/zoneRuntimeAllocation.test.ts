import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID } from "../shared/aurionProductionProbeEvidence";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import type { ZoneId } from "./zoneProtocol";

type PresenceView = { userId: number };
type MobRuntimeView = {
  tick(presences: PresenceView[], tickNumber: number): boolean;
};

describe("zone tick mob-target presence allocation", () => {
  it("reuses one filtered view while preserving the production-probe exclusion", () => {
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("allocation_evidence_zone" as ZoneId);
    zone.join({ userId: 41, socket: socket as unknown as WebSocket });
    const welcome = zone.join({
      userId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID,
      socket: socket as unknown as WebSocket,
    });

    const sampleTicks = 256;
    const expectedIds = welcome.presences
      .filter(presence => presence.userId !== AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID)
      .map(presence => presence.userId);
    const baselineReferences = new Set<PresenceView[]>();
    for (let tick = 0; tick < sampleTicks; tick += 1) {
      baselineReferences.add(welcome.presences.filter(
        presence => presence.userId !== AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID,
      ));
    }

    const runtime = Reflect.get(zone, "mobRuntime") as MobRuntimeView;
    const originalTick = runtime.tick.bind(runtime);
    const runtimeReferences = new Set<PresenceView[]>();
    const observedIds: number[][] = [];
    vi.spyOn(runtime, "tick").mockImplementation((presences, tickNumber) => {
      runtimeReferences.add(presences);
      observedIds.push(presences.map(presence => presence.userId));
      return originalTick(presences, tickNumber);
    });

    for (let tick = 0; tick < sampleTicks; tick += 1) zone.tick();

    expect(baselineReferences.size).toBe(sampleTicks);
    expect(runtimeReferences.size).toBe(1);
    expect(observedIds).toHaveLength(sampleTicks);
    expect(observedIds.every(ids => JSON.stringify(ids) === JSON.stringify(expectedIds))).toBe(true);
    expect(expectedIds).toEqual([41]);
  });
});
