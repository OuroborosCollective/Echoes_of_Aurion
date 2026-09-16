import * as THREE from 'three';
import { WorldChunkData } from '../types';
import { texturesFor } from './WorldSurfaceAtlas';

export interface TerrainSplatDescriptor {
  version: number;
  height: number;
  slope: number;
  isPaved: boolean;
  isSnowy: boolean;
}

const SPLAT_VERSION = 1;

/**
 * Derives the visual splat weights deterministically for a single vertex.
 * Weights are calculated safely to be seam-stable across chunks because
 * it only relies on absolute world coordinates.
 */
export function calculateSplatWeights(
  worldX: number,
  worldZ: number,
  chunk: WorldChunkData
): [number, number, number, number] {
  // Height calculation matches WorldChunkManager exactly to ensure stable height
  const eBase = chunk.elevationBase * 0.5;
  const elev = Math.sin(worldX * 0.08) * Math.cos(worldZ * 0.08) * 1.8 + eBase;

  // Slope via deterministic central difference within the chunk's formula domain
  const d = 0.1;
  const ex = Math.sin((worldX + d) * 0.08) * Math.cos(worldZ * 0.08) * 1.8 + eBase;
  const ez = Math.sin(worldX * 0.08) * Math.cos((worldZ + d) * 0.08) * 1.8 + eBase;
  const slopeX = (ex - elev) / d;
  const slopeZ = (ez - elev) / d;
  const slope = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ);

  // Masks
  let isPaved = false;
  if (chunk.materialTheme === 'starpath' || chunk.materialTheme === 'starpath_crossing') {
    isPaved = true;
  } else if (chunk.landmarkType !== 'forest' && chunk.landmarkType !== 'border') {
    // Plaza masking near landmarks
    const dist = Math.hypot(worldX - chunk.centerX, worldZ - chunk.centerZ);
    if (dist <= 18.0) isPaved = true;
  }

  // hohes Gebiet oder kalte Region
  const isSnowy = chunk.kingdom === 'Grenzmark Frostkrone' || elev > 4.5;

  const desc: TerrainSplatDescriptor = {
    version: SPLAT_VERSION,
    height: elev,
    slope: slope,
    isPaved,
    isSnowy,
  };

  return resolveWeightsFromDescriptor(desc);
}

/**
 * Pure deterministic mapping from descriptor to physical blend weights.
 */
export function resolveWeightsFromDescriptor(desc: TerrainSplatDescriptor): [number, number, number, number] {
  // Priorities: Paving > Snow > Rock > Grass (Base)
  
  // Explicit masking overrides
  let paving = desc.isPaved ? 1.0 : 0.0;
  if (paving >= 1.0) {
    return [0, 1.0, 0, 0];
  }
  
  // Base slope curve mapping
  let rock = Math.min(1.0, Math.max(0.0, (desc.slope - 0.12) * 6.0));
  
  // Height/Cold mapping
  let snow = 0.0;
  if (desc.isSnowy) {
    snow = Math.min(1.0, Math.max(0.0, (desc.height - 3.5) * 0.5));
    if (desc.height <= 3.5) {
      snow = 1.0; // fully snowed in deep Frostkrone
    }
  }

  // Normalize blending
  const totalSplat = rock + paving + snow;
  if (totalSplat > 1.0) {
    rock /= totalSplat;
    paving /= totalSplat;
    snow /= totalSplat;
  }

  // returning: [ R, G, B, A ] where A is reserved
  return [rock, paving, snow, 0];
}

/**
 * Creates a deterministic custom Terrain Splat Material compatible with THREE.MeshStandardMaterial.
 * Connects to AIM-273 Quality Governor to degrade gracefully on mobile.
 */
export function createTerrainSplatMaterial(
  scene: THREE.Scene,
  tier: string
): THREE.Material {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
  });

  const isMobile = tier === 'phone';

  mat.onBeforeCompile = (shader) => {
    const atlasTextures = texturesFor(scene);

    // Bind texture tiles deterministically
    // Base: Grass (1)
    // Rock: Cliff/Slope (3)
    // Paving: Roads (0)
    shader.uniforms.tBase = { value: atlasTextures[1] };
    shader.uniforms.tRock = { value: atlasTextures[3] };
    shader.uniforms.tPaving = { value: atlasTextures[0] };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      attribute vec4 splatWeight;
      varying vec4 vSplat;
      varying vec2 vWorldUv;
      `
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vSplat = splatWeight;
      vWorldUv = uv; // Mapped by mapWorldGround previously
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform sampler2D tBase;
      uniform sampler2D tRock;
      uniform sampler2D tPaving;
      varying vec4 vSplat;
      varying vec2 vWorldUv;
      `
    );

    // Mobile limits to fewer interpolations (base + maximum of 1 dominant layer per fragment).
    // Desktop does full 4-way linear mixing.
    const mixLogic = isMobile ? `
      vec4 baseColor = texture2D(tBase, vWorldUv);
      vec4 diffuseColor = baseColor;
      
      // Select most dominant splat weight to save texture fetches
      if (vSplat.r > 0.1 && vSplat.r >= vSplat.g && vSplat.r >= vSplat.b) {
          vec4 rockColor = texture2D(tRock, vWorldUv);
          diffuseColor = mix(diffuseColor, rockColor, vSplat.r);
      } else if (vSplat.g > 0.1 && vSplat.g >= vSplat.r && vSplat.g >= vSplat.b) {
          vec4 pavingColor = texture2D(tPaving, vWorldUv);
          diffuseColor = mix(diffuseColor, pavingColor, vSplat.g);
      } else if (vSplat.b > 0.1) {
          // Snow is tinted rock on mobile
          vec4 rockColor = texture2D(tRock, vWorldUv);
          vec4 snowColor = vec4(0.9, 0.95, 1.0, 1.0) * rockColor;
          diffuseColor = mix(diffuseColor, snowColor, vSplat.b);
      }
    ` : `
      vec4 baseColor = texture2D(tBase, vWorldUv);
      vec4 rockColor = texture2D(tRock, vWorldUv);
      vec4 pavingColor = texture2D(tPaving, vWorldUv);
      vec4 snowColor = vec4(0.95, 0.98, 1.0, 1.0) * rockColor; // Tinted rock structure for snow
      
      float baseW = max(0.0, 1.0 - (vSplat.r + vSplat.g + vSplat.b));
      vec4 diffuseColor = baseColor * baseW + rockColor * vSplat.r + pavingColor * vSplat.g + snowColor * vSplat.b;
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `
      ${mixLogic}
      diffuseColor.a = opacity;
      `
    );
  };

  // Necessary to prevent Three.js from optimizing away custom attributes
  mat.customProgramCacheKey = () => `TerrainSplat_${tier}`;

  return mat;
}
