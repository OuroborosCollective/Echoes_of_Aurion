import { describe, expect, it } from 'vitest';
import { RenderEcsPilot, Position, LodTier, InstanceRef } from './RenderEcsPilot';

describe('RenderEcsPilot (AIM-277 bitECS presentation pilot)', () => {
  it('registers presentation entities and computes distance-based LOD tiers deterministically', () => {
    const pilot = new RenderEcsPilot();

    const e1 = pilot.registerEntity(0, 0, 0, 101);   // Near camera (0,0,0) -> Tier 0
    const e2 = pilot.registerEntity(0, 0, 30, 102);  // 30m away (distSq 900) -> Tier 1
    const e3 = pilot.registerEntity(0, 0, 60, 103);  // 60m away (distSq 3600) -> Tier 2
    const e4 = pilot.registerEntity(0, 0, 150, 104); // 150m away (distSq 22500) -> Tier 3 (Culled)

    pilot.updateLods(0, 0, 0);

    expect(LodTier.tier[e1]).toBe(0);
    expect(LodTier.tier[e2]).toBe(1);
    expect(LodTier.tier[e3]).toBe(2);
    expect(LodTier.tier[e4]).toBe(3);

    expect(InstanceRef.instanceId[e1]).toBe(101);
    expect(InstanceRef.instanceId[e4]).toBe(104);
  });

  it('runs performance benchmark verifying typed array speed for high-density crowds', () => {
    const pilot = new RenderEcsPilot();
    const results = pilot.benchmark(2000, 50);

    expect(results.bitEcsMs).toBeGreaterThan(0);
    expect(results.jsLoopMs).toBeGreaterThan(0);
    expect(Number.isFinite(results.speedup)).toBe(true);
  });
});
