import * as THREE from 'three';
import { seededRandom } from '@shared/deterministicSimulation';

export interface LowPolyMeshConfig {
  seed: string;
  type: 'rock' | 'crystal' | 'pillar' | 'shrub';
  scale?: number;
  color?: number;
}

/**
 * AIM-278: Procedural Low-Poly Presentation Geometry & Governed PostFX Adapter.
 * Provides deterministic low-poly decor geometry and device-governed PostFX parameters.
 * STRICT BOUNDARY: Strictly visual presentation. Zero impact on server-authoritative physics, collision, or combat truth.
 */
export class ProceduralLowPolyWorld {
  /**
   * Generates a deterministic low-poly rock BufferGeometry.
   * Modifies vertex positions using a deterministic pseudo-random seed to introduce organic low-poly facet displacement.
   */
  public static createLowPolyRockGeometry(seedStr: string, detail = 1, baseRadius = 1.0): THREE.BufferGeometry {
    const geometry = new THREE.DodecahedronGeometry(baseRadius, detail);
    const rng = seededRandom(seedStr);

    const posAttr = geometry.getAttribute('position');
    const vec = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      vec.fromBufferAttribute(posAttr, i);

      // Deterministic low-poly vertex displacement
      const displace = 1.0 + (rng() - 0.5) * 0.35;
      vec.multiplyScalar(displace);

      // Squeeze Y slightly to flatten base
      if (vec.y < 0) {
        vec.y *= 0.6;
      }

      posAttr.setXYZ(i, vec.x, vec.y, vec.z);
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Generates a low-poly crystal shard geometry with sharp facets.
   */
  public static createLowPolyCrystalGeometry(seedStr: string, height = 2.0, radius = 0.5): THREE.BufferGeometry {
    const geometry = new THREE.ConeGeometry(radius, height, 5, 1);
    const rng = seededRandom(seedStr);

    const posAttr = geometry.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      if (y > 0) {
        // Offset crystal tip deterministically
        posAttr.setX(i, posAttr.getX(i) + (rng() - 0.5) * 0.15);
        posAttr.setZ(i, posAttr.getZ(i) + (rng() - 0.5) * 0.15);
      }
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Governed PostFX configuration helper based on device quality profile.
   */
  public static getGovernedPostFxConfig(profile: 'phone' | 'tablet' | 'desktop') {
    switch (profile) {
      case 'phone':
        return {
          bloomEnabled: false,
          bloomThreshold: 1.0,
          bloomStrength: 0.0,
          bloomRadius: 0.0,
          ditherEnabled: false,
          maxParticlePoolSize: 600,
        };
      case 'tablet':
        return {
          bloomEnabled: true,
          bloomThreshold: 0.85,
          bloomStrength: 0.35,
          bloomRadius: 0.2,
          ditherEnabled: true,
          maxParticlePoolSize: 1200,
        };
      case 'desktop':
      default:
        return {
          bloomEnabled: true,
          bloomThreshold: 0.75,
          bloomStrength: 0.6,
          bloomRadius: 0.4,
          ditherEnabled: true,
          maxParticlePoolSize: 2400,
        };
    }
  }
}
