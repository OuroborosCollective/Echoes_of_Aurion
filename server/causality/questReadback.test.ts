import { describe, it, expect } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { globalTickRecorder } from "./tickRecorder";
import { globalReadbackService } from "./readbackService";

describe("C-Aurion Quest Determinism & Continuous Readback", () => {
  it("authoritatively tracks quest progress across tick sequences", () => {
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zoneId = "quest_proving_ground";
    const zone = new AuthoritativeMovementZone(zoneId as any);
    const userId = 505;
    
    const { connectionId } = zone.join({
      userId,
      socket: socket as unknown as WebSocket,
      combatProfile: { combatLevel: 10, maxHealth: 1000, weaponBonus: 20, weaponTrack: "blade" }
    });

    // Tick 1: Accept Quest
    zone.enqueueIntent({
      type: "quest_accept",
      connectionId,
      entityId: `player:${userId}`,
      clientSeq: 1,
      arrivalSeq: 1,
      questId: "concord.gate-seal"
    });
    zone.tick();
    
    const s1 = zone.getCanonicalZoneState();
    expect(s1.questSummaries).toHaveLength(1);
    expect(s1.questSummaries[0].questId).toBe("concord.gate-seal");
    expect(s1.questSummaries[0].status).toBe("accepted");

    // Tick 2: Complete Quest
    zone.enqueueIntent({
      type: "quest_hand_in",
      connectionId,
      entityId: `player:${userId}`,
      clientSeq: 2,
      arrivalSeq: 2,
      questId: "concord.gate-seal"
    });
    zone.tick();

    const s2 = zone.getCanonicalZoneState();
    expect(s2.questSummaries).toHaveLength(1);
    expect(s2.questSummaries[0].status).toBe("completed");
    
    // Verify hash integrity in recorder
    const receipts = globalTickRecorder.getReceipts(zoneId);
    expect(receipts).toHaveLength(2); // accept + handin (join doesn't record)
    expect(globalTickRecorder.verifyReceiptChain(zoneId).valid).toBe(true);
  });

  it("continuously verifies tick chains in the background via ReadbackService", async () => {
    // Note: In a test we manually trigger the verification or wait a bit
    globalReadbackService.start();
    
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} };
    const zoneId = "readback_test_zone";
    const zone = new AuthoritativeMovementZone(zoneId as any);
    const userId = 606;
    
    zone.join({
      userId,
      socket: socket as unknown as WebSocket,
      combatProfile: { combatLevel: 5, maxHealth: 500, weaponBonus: 10, weaponTrack: "blade" }
    });

    // Generate 10 ticks of movement
    for (let i = 1; i <= 10; i++) {
      zone.enqueueIntent({
        type: "move",
        connectionId: "c1",
        entityId: `player:${userId}`,
        clientSeq: i,
        arrivalSeq: i,
        input: { x: 1, z: 0 }
      });
      zone.tick();
    }

    // Wait for background verification
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const status = globalReadbackService.getStatus();
    expect(status.divergences).toBe(0);
    // Should have verified at least some of the ticks
    expect(status.verifiedTicks).toBeGreaterThan(0);
    
    globalReadbackService.stop();
  });
});
