import {
  createWorld,
  addEntity,
  addComponent,
  query,
  IWorld,
} from 'bitecs';

/**
 * AIM-277: bitECS Render-ECS Pilot (Presentation Mirror Only).
 * Strictly handles presentation entity transform and LOD evaluation using high-performance typed arrays.
 * NO gameplay authority, combat, loot, or collision logic allowed.
 */

const MAX_ENTITIES = 20000;

export const Position = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
  z: new Float32Array(MAX_ENTITIES),
};

export const LodTier = {
  tier: new Uint8Array(MAX_ENTITIES), // 0: High, 1: Medium, 2: Low, 3: Culled
  distanceSq: new Float32Array(MAX_ENTITIES),
};

export const InstanceRef = {
  instanceId: new Uint32Array(MAX_ENTITIES),
};

export class RenderEcsPilot {
  public world: IWorld;

  constructor() {
    this.world = createWorld();
  }

  public registerEntity(x: number, y: number, z: number, instanceId: number): number {
    const eid = addEntity(this.world);
    addComponent(this.world, eid, Position);
    addComponent(this.world, eid, LodTier);
    addComponent(this.world, eid, InstanceRef);

    Position.x[eid] = x;
    Position.y[eid] = y;
    Position.z[eid] = z;

    InstanceRef.instanceId[eid] = instanceId;
    LodTier.tier[eid] = 0;
    LodTier.distanceSq[eid] = 0;

    return eid;
  }

  /**
   * High-speed batch LOD computation across presentation entity typed arrays.
   */
  public updateLods(cameraX: number, cameraY: number, cameraZ: number, lowCutoffSq = 2500, cullCutoffSq = 10000): void {
    const entities = query(this.world, [Position, LodTier, InstanceRef]);
    for (let i = 0; i < entities.length; i++) {
      const eid = entities[i];
      const dx = Position.x[eid] - cameraX;
      const dy = Position.y[eid] - cameraY;
      const dz = Position.z[eid] - cameraZ;

      const dSq = dx * dx + dy * dy + dz * dz;
      LodTier.distanceSq[eid] = dSq;

      if (dSq > cullCutoffSq) {
        LodTier.tier[eid] = 3; // Culled
      } else if (dSq > lowCutoffSq) {
        LodTier.tier[eid] = 2; // Low
      } else if (dSq > 400) {
        LodTier.tier[eid] = 1; // Medium
      } else {
        LodTier.tier[eid] = 0; // High
      }
    }
  }

  /**
   * Benchmarking helper comparing bitECS batch update vs JS Object loop for 5000+ crowd presentation entities.
   */
  public benchmark(entityCount = 5000, iterations = 100): { bitEcsMs: number; jsLoopMs: number; speedup: number } {
    const localWorld = createWorld();
    const posComp = { x: new Float32Array(entityCount + 10), z: new Float32Array(entityCount + 10) };
    const lodComp = { distanceSq: new Float32Array(entityCount + 10), tier: new Uint8Array(entityCount + 10) };

    for (let i = 0; i < entityCount; i++) {
      const eid = addEntity(localWorld);
      addComponent(localWorld, eid, posComp);
      addComponent(localWorld, eid, lodComp);

      posComp.x[eid] = (i % 100) * 2;
      posComp.z[eid] = Math.floor(i / 100) * 2;
      lodComp.tier[eid] = 0;
    }

    // bitECS typed array execution
    const t0 = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      const ents = query(localWorld, [posComp, lodComp]);
      const cx = 50, cz = 50;
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        const dx = posComp.x[e] - cx;
        const dz = posComp.z[e] - cz;
        lodComp.distanceSq[e] = dx * dx + dz * dz;
      }
    }
    const bitEcsMs = performance.now() - t0;

    // Equivalent JS object array loop
    const jsArray = Array.from({ length: entityCount }, (_, i) => ({
      x: (i % 100) * 2,
      y: 0,
      z: Math.floor(i / 100) * 2,
      tier: 0,
      distanceSq: 0,
    }));

    const t1 = performance.now();
    for (let iter = 0; iter < iterations; iter++) {
      const cx = 50, cz = 50;
      for (let i = 0; i < jsArray.length; i++) {
        const item = jsArray[i];
        const dx = item.x - cx;
        const dz = item.z - cz;
        item.distanceSq = dx * dx + dz * dz;
      }
    }
    const jsLoopMs = performance.now() - t1;

    return {
      bitEcsMs,
      jsLoopMs,
      speedup: jsLoopMs / Math.max(0.001, bitEcsMs),
    };
  }
}
