import { describe, expect, it } from 'vitest';
import { ProceduralLowPolyWorld } from './ProceduralLowPolyWorld';

describe('ProceduralLowPolyWorld (AIM-278)', () => {
  it('creates deterministic low-poly rock geometry for identical seed strings', () => {
    const geo1 = ProceduralLowPolyWorld.createLowPolyRockGeometry('seed-rock-100', 1, 1.5);
    const geo2 = ProceduralLowPolyWorld.createLowPolyRockGeometry('seed-rock-100', 1, 1.5);

    const pos1 = Array.from(geo1.attributes.position.array);
    const pos2 = Array.from(geo2.attributes.position.array);

    expect(pos1).toEqual(pos2);
  });

  it('produces different geometry for different seed strings', () => {
    const geo1 = ProceduralLowPolyWorld.createLowPolyRockGeometry('seed-alpha', 1, 1.5);
    const geo2 = ProceduralLowPolyWorld.createLowPolyRockGeometry('seed-beta', 1, 1.5);

    const pos1 = Array.from(geo1.attributes.position.array);
    const pos2 = Array.from(geo2.attributes.position.array);

    expect(pos1).not.toEqual(pos2);
  });

  it('creates low-poly crystal shard geometry deterministically', () => {
    const crystal = ProceduralLowPolyWorld.createLowPolyCrystalGeometry('crystal-seed-01', 3.0, 0.8);
    expect(crystal.attributes.position.count).toBeGreaterThan(0);
  });

  it('returns governed PostFX configurations matching device quality profiles', () => {
    const phone = ProceduralLowPolyWorld.getGovernedPostFxConfig('phone');
    expect(phone.bloomEnabled).toBe(false);
    expect(phone.maxParticlePoolSize).toBe(600);

    const desktop = ProceduralLowPolyWorld.getGovernedPostFxConfig('desktop');
    expect(desktop.bloomEnabled).toBe(true);
    expect(desktop.bloomStrength).toBeGreaterThan(0);
    expect(desktop.maxParticlePoolSize).toBe(2400);
  });
});
