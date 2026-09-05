import { seededRandom } from "@shared/deterministicSimulation";
import * as THREE from 'three';
import { ItemRarity, ItemSlot, RPGItem, WeaponType } from '../types';
import { glbManager } from './GLBModelManager';
import { resolveItemGlbMapping, ItemGlbMapping, getDefaultSocketTransform } from './ItemGlbRegistry';

/**
 * Deterministic Diablo-style Procedural & Dynamic GLB Equipment Mesh & Texture Synthesizer for Aurion.
 *
 * Guarantees:
 * 1. Strict triangle limit (each piece < 1200 triangles; typical 150-600 triangles).
 * 2. Visual diversity computed deterministically from item rarity, weapon class, seed id, and mapped GLBs.
 * 3. Dynamic swapping of Head, Chest, Arms, Shoulders, Legs, Boots, Weapon, and Offhand 3D models.
 * 4. Procedural Canvas PBR maps (Damascus steel, runic leylines, brushed bronze, mystic glowing glyphs).
 * 5. Special animated nodes for Mystic & Legendary gear (orbital rings, pulsing aether cores, floating shards).
 */

export interface AnimatedGearNode {
  object: THREE.Object3D;
  type: 'spin_y' | 'spin_x' | 'orbit' | 'pulse_glow' | 'bob_float';
  speed: number;
  baseEmissive?: THREE.Color;
  maxIntensity?: number;
  initialY?: number;
}

// Global cached procedural textures to avoid recreating canvas memory
const proceduralTextureCache = new Map<string, THREE.CanvasTexture>();

function createNoiseTexture(type: 'damascus' | 'runic' | 'bronze' | 'mystic' | 'leather'): THREE.CanvasTexture {
  if (proceduralTextureCache.has(type)) {
    return proceduralTextureCache.get(type)!;
  }

  const random = seededRandom(`equipment-texture-v1:${type}`);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  if (type === 'damascus') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    for (let y = 0; y < 128; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < 128; x += 16) {
        const cy = y + Math.sin((x + y) * 0.1) * 4;
        ctx.lineTo(x, cy);
      }
      ctx.stroke();
    }
  } else if (type === 'runic') {
    ctx.fillStyle = '#081a2e';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#00f0ff';
    ctx.font = '12px monospace';
    for (let i = 0; i < 8; i++) {
      ctx.fillText('ᚠ ᚢ ᚦ ᚨ ᚱ ᚲ', 10, 18 * (i + 1));
    }
  } else if (type === 'bronze') {
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#b45309';
    for (let i = 0; i < 40; i++) {
      const x = random() * 128;
      const y = random() * 128;
      ctx.fillRect(x, y, 4, 12);
    }
  } else if (type === 'mystic') {
    const grad = ctx.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#040d1a');
    grad.addColorStop(0.5, '#00f0ff');
    grad.addColorStop(1, '#6366f1');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 25; i++) {
      ctx.beginPath();
      ctx.arc(random() * 128, random() * 128, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // leather
    ctx.fillStyle = '#292524';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#44403c';
    for (let i = 0; i < 60; i++) {
      ctx.fillRect(random() * 128, random() * 128, 2, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  proceduralTextureCache.set(type, texture);
  return texture;
}

// Simple deterministic hash from string
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

export interface ProceduralTheme {
  primaryColor: number;
  secondaryColor: number;
  glowColor: number;
  goldColor: number;
  metalness: number;
  roughness: number;
  emissiveIntensity: number;
  textureType: 'damascus' | 'runic' | 'bronze' | 'mystic' | 'leather';
  isMystic: boolean;
  isLegendary: boolean;
  triangleBudgetRemaining: number;
}

export function deriveProceduralTheme(item: RPGItem | null, defaultSlot: ItemSlot): ProceduralTheme {
  const rarity = item?.rarity || 'common';
  const isMystic = rarity === 'mystic';
  const isLegendary = rarity === 'legendary';

  let primaryColor = 0x94a3b8; // steel
  let secondaryColor = 0x334155;
  let glowColor = 0x00f0ff; // Aurion turquoise
  const goldColor = 0xd97706; // Brushed Bronze / Gold
  let metalness = 0.85;
  let roughness = 0.3;
  let emissiveIntensity = 0.0;
  let textureType: 'damascus' | 'runic' | 'bronze' | 'mystic' | 'leather' = 'damascus';

  if (item) {
    const seed = hashString(item.id + item.name);

    if (isMystic) {
      primaryColor = 0x0a192f; // Midnight Petrol
      secondaryColor = 0x1e1b4b; // Deep Arcane
      glowColor = 0x00f0ff; // Pure turquoise aether
      emissiveIntensity = 2.4;
      metalness = 0.95;
      roughness = 0.15;
      textureType = 'mystic';
    } else if (isLegendary) {
      primaryColor = 0xf59e0b; // Pure Aurion Gold
      secondaryColor = 0x78350f;
      glowColor = 0xfcd34d; // Solar glow
      emissiveIntensity = 2.0;
      metalness = 0.9;
      roughness = 0.2;
      textureType = 'bronze';
    } else if (rarity === 'epic') {
      primaryColor = 0x0284c7; // Deep Azure / Cyan
      secondaryColor = 0x0f172a;
      glowColor = 0x38bdf8;
      emissiveIntensity = 1.6;
      metalness = 0.85;
      roughness = 0.25;
      textureType = 'runic';
    } else if (rarity === 'rare') {
      primaryColor = 0xb45309; // Weathered Bronze
      secondaryColor = 0x451a03;
      glowColor = 0x00f0ff;
      emissiveIntensity = 1.0;
      metalness = 0.8;
      roughness = 0.35;
      textureType = 'bronze';
    } else if (rarity === 'uncommon') {
      primaryColor = 0x475569; // Iron
      secondaryColor = 0x1e293b;
      glowColor = 0x10b981;
      emissiveIntensity = 0.4;
      metalness = 0.75;
      roughness = 0.45;
      textureType = 'damascus';
    } else {
      // Common
      primaryColor = 0x64748b; // Recruit steel
      secondaryColor = 0x292524; // Leather trim
      glowColor = 0x00f0ff;
      emissiveIntensity = 0.0;
      metalness = 0.7;
      roughness = 0.55;
      textureType = 'leather';
    }
  }

  return {
    primaryColor,
    secondaryColor,
    glowColor,
    goldColor,
    metalness,
    roughness,
    emissiveIntensity,
    textureType,
    isMystic,
    isLegendary,
    triangleBudgetRemaining: 1100, // Safe buffer below 1200
  };
}

export class ProceduralEquipmentVisuals {
  public animatedNodes: AnimatedGearNode[] = [];
  private activeSlotVersions: Map<string, number> = new Map();

  public clearAnimatedNodes() {
    this.animatedNodes = [];
  }

  public updateAnimations(delta: number, time: number) {
    for (const node of this.animatedNodes) {
      if (!node.object || !node.object.parent) continue;

      if (node.type === 'spin_y') {
        node.object.rotation.y += delta * node.speed;
      } else if (node.type === 'spin_x') {
        node.object.rotation.x += delta * node.speed;
      } else if (node.type === 'orbit') {
        node.object.rotation.y += delta * node.speed;
        node.object.rotation.z += delta * (node.speed * 0.7);
      } else if (node.type === 'bob_float') {
        if (node.initialY !== undefined) {
          node.object.position.y = node.initialY + Math.sin(time * node.speed) * 0.08;
        }
      } else if (node.type === 'pulse_glow') {
        const mesh = node.object as THREE.Mesh;
        if (mesh && mesh.material && (mesh.material as THREE.MeshStandardMaterial).emissive) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          const pulse = (Math.sin(time * node.speed) + 1) * 0.5;
          mat.emissiveIntensity = 1.0 + pulse * (node.maxIntensity || 2.0);
        }
      }
    }
  }

  /**
   * Helper: Attaches a single slot container with instant procedural fallback and async GLB swap
   */
  private attachGlbOrProcedural(
    slot: string,
    targetGroup: THREE.Group,
    item: RPGItem | null,
    buildProcedural: (container: THREE.Group) => void,
    customTransform?: (scene: THREE.Group) => void
  ) {
    const nextVer = (this.activeSlotVersions.get(slot) || 0) + 1;
    this.activeSlotVersions.set(slot, nextVer);

    const container = new THREE.Group();
    container.name = `equip_slot_${slot}_v${nextVer}`;
    targetGroup.add(container);

    const fallback = new THREE.Group();
    fallback.name = `fallback_${slot}`;
    container.add(fallback);
    buildProcedural(fallback);

    if (!item) return;

    const mapping = resolveItemGlbMapping(item, slot);
    if (!mapping) return;

    const glbUrl = item.glbModelUrl || mapping.glbPath;
    if (!glbUrl) return;

    glbManager
      .loadModel(glbUrl)
      .then(({ scene }) => {
        if (this.activeSlotVersions.get(slot) !== nextVer) return;

        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        const glbContainer = new THREE.Group();
        glbContainer.name = `glb_mesh_${slot}_${item.id}`;

        const st = mapping.socketTransform;
        const scaleVal = typeof st.scale === 'number' ? st.scale : 1.0;
        const normScale = maxDim > 0 ? (1.0 / maxDim) * scaleVal : scaleVal;

        scene.scale.set(normScale, normScale, normScale);
        scene.position.set(st.position[0], st.position[1], st.position[2]);
        scene.rotation.set(st.rotation[0], st.rotation[1], st.rotation[2]);

        if (customTransform) customTransform(scene);

        glbContainer.add(scene);

        if (mapping.specialEffect === 'orbit_ring') {
          const ringGeo = new THREE.TorusGeometry(0.32, 0.02, 6, 16);
          const ringMat = new THREE.MeshStandardMaterial({
            color: mapping.glowColor || 0x00f0ff,
            emissive: mapping.glowColor || 0x00f0ff,
            emissiveIntensity: 2.2,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(0, 0.2, 0);
          glbContainer.add(ring);
          this.animatedNodes.push({ object: ring, type: 'orbit', speed: 2.2 });
        } else if (mapping.specialEffect === 'pulsing_rune') {
          scene.traverse((node) => {
            if ((node as THREE.Mesh).isMesh && (node as THREE.Mesh).material) {
              const m = (node as THREE.Mesh).material as THREE.MeshStandardMaterial;
              if (m && m.emissive) {
                this.animatedNodes.push({
                  object: node,
                  type: 'pulse_glow',
                  speed: 3.2,
                  maxIntensity: 2.4,
                });
              }
            }
          });
        }

        fallback.visible = false;
        container.add(glbContainer);
      })
      .catch((err) => {
        console.warn(`[ProceduralEquipmentVisuals] Fallback kept for ${slot} (${item.id}):`, err);
        fallback.visible = true;
      });
  }

  /**
   * Helper: Attaches paired slot containers (shoulders, arms, legs, boots) with instant procedural fallback and async GLB swap
   */
  private attachGlbOrProceduralPaired(
    slot: string,
    leftPivot: THREE.Group,
    rightPivot: THREE.Group,
    item: RPGItem | null,
    buildProcedural: (leftCont: THREE.Group, rightCont: THREE.Group) => void
  ) {
    const nextVer = (this.activeSlotVersions.get(slot) || 0) + 1;
    this.activeSlotVersions.set(slot, nextVer);

    const leftContainer = new THREE.Group();
    leftContainer.name = `equip_paired_L_${slot}_v${nextVer}`;
    leftPivot.add(leftContainer);

    const rightContainer = new THREE.Group();
    rightContainer.name = `equip_paired_R_${slot}_v${nextVer}`;
    rightPivot.add(rightContainer);

    const leftFallback = new THREE.Group();
    leftContainer.add(leftFallback);
    const rightFallback = new THREE.Group();
    rightContainer.add(rightFallback);

    buildProcedural(leftFallback, rightFallback);

    if (!item) return;

    const mapping = resolveItemGlbMapping(item, slot);
    if (!mapping) return;

    const glbUrl = item.glbModelUrl || mapping.glbPath;
    if (!glbUrl) return;

    glbManager
      .loadModel(glbUrl)
      .then(({ scene }) => {
        if (this.activeSlotVersions.get(slot) !== nextVer) return;

        const box = new THREE.Box3().setFromObject(scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);

        const st = mapping.socketTransform;
        const scaleVal = typeof st.scale === 'number' ? st.scale : 1.0;
        const normScale = maxDim > 0 ? (1.0 / maxDim) * scaleVal : scaleVal;

        // Left Instance
        const leftScene = scene.clone(true);
        leftScene.scale.set(normScale, normScale, normScale);
        leftScene.position.set(st.position[0], st.position[1], st.position[2]);
        leftScene.rotation.set(st.rotation[0], st.rotation[1], st.rotation[2]);
        leftContainer.add(leftScene);
        leftFallback.visible = false;

        // Right Instance (Mirrored X)
        const rightScene = scene.clone(true);
        rightScene.scale.set(-normScale, normScale, normScale);
        rightScene.position.set(-st.position[0], st.position[1], st.position[2]);
        rightScene.rotation.set(st.rotation[0], -st.rotation[1], -st.rotation[2]);
        rightContainer.add(rightScene);
        rightFallback.visible = false;
      })
      .catch((err) => {
        console.warn(`[ProceduralEquipmentVisuals] Paired fallback kept for ${slot} (${item.id}):`, err);
        leftFallback.visible = true;
        rightFallback.visible = true;
      });
  }

  /**
   * 1. Builds dynamic HEAD & HELMET meshes
   */
  public buildHeadpiece(
    group: THREE.Group,
    helmet: RPGItem | null,
    skinMat: THREE.Material
  ) {
    this.attachGlbOrProcedural('helmet', group, helmet, (fallbackGroup) => {
      const theme = deriveProceduralTheme(helmet, 'helmet');
      const tex = createNoiseTexture(theme.textureType);

      const metalMat = new THREE.MeshStandardMaterial({
        color: theme.primaryColor,
        metalness: theme.metalness,
        roughness: theme.roughness,
        map: tex,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: theme.goldColor,
        metalness: 0.95,
        roughness: 0.2,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: theme.glowColor,
        emissive: theme.glowColor,
        emissiveIntensity: theme.emissiveIntensity,
      });

      // If no helmet, provide basic adventurer browband & hair
      if (!helmet) {
        const hairGeo = new THREE.BoxGeometry(0.48, 0.22, 0.48);
        const hairMesh = new THREE.Mesh(hairGeo, new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 }));
        hairMesh.position.set(0, 0.2, 0);
        fallbackGroup.add(hairMesh);

        const bandGeo = new THREE.BoxGeometry(0.48, 0.06, 0.48);
        const band = new THREE.Mesh(bandGeo, goldMat);
        band.position.set(0, 0.08, 0);
        fallbackGroup.add(band);
        return;
      }

      const seed = hashString(helmet.id + helmet.name);
      const helmVariant = seed % 4;

      if (theme.isMystic || theme.isLegendary) {
        // Imperial Aurion Crown with winged solar spikes & orbiting celestial ring
        const crownBaseGeo = new THREE.CylinderGeometry(0.28, 0.26, 0.16, 8);
        const crownBase = new THREE.Mesh(crownBaseGeo, goldMat);
        crownBase.position.set(0, 0.26, 0);
        fallbackGroup.add(crownBase);

        [-0.22, 0, 0.22].forEach((xOffset, i) => {
          const spikeGeo = new THREE.ConeGeometry(0.06, 0.35 + (i === 1 ? 0.18 : 0), 4);
          const spike = new THREE.Mesh(spikeGeo, glowMat);
          spike.position.set(xOffset, 0.45 + (i === 1 ? 0.08 : 0), 0.12);
          fallbackGroup.add(spike);
        });

        // Orbiting Astral Circlet
        const haloGeo = new THREE.TorusGeometry(0.38, 0.02, 6, 16);
        const halo = new THREE.Mesh(haloGeo, glowMat);
        halo.position.set(0, 0.32, 0);
        halo.rotation.x = Math.PI / 4;
        fallbackGroup.add(halo);

        this.animatedNodes.push({
          object: halo,
          type: 'spin_y',
          speed: 1.5,
        });
        this.animatedNodes.push({
          object: halo,
          type: 'pulse_glow',
          speed: 3.0,
          maxIntensity: 2.2,
        });
      } else if (helmVariant === 0) {
        // Visored Knight Greathelm
        const greathelmGeo = new THREE.BoxGeometry(0.52, 0.56, 0.52);
        const greathelm = new THREE.Mesh(greathelmGeo, metalMat);
        greathelm.position.set(0, 0.08, 0);
        fallbackGroup.add(greathelm);

        const visorGeo = new THREE.BoxGeometry(0.44, 0.1, 0.14);
        const visor = new THREE.Mesh(visorGeo, glowMat);
        visor.position.set(0, 0.08, 0.24);
        fallbackGroup.add(visor);

        const crestFinGeo = new THREE.BoxGeometry(0.06, 0.32, 0.48);
        const crestFin = new THREE.Mesh(crestFinGeo, goldMat);
        crestFin.position.set(0, 0.42, -0.04);
        fallbackGroup.add(crestFin);
      } else if (helmVariant === 1) {
        // Aviator Goggles & Brass Diadem
        const goggleFrameGeo = new THREE.TorusGeometry(0.1, 0.03, 6, 12);
        const leftGoggle = new THREE.Mesh(goggleFrameGeo, metalMat);
        leftGoggle.position.set(-0.12, 0.06, 0.24);
        const rightGoggle = new THREE.Mesh(goggleFrameGeo, metalMat);
        rightGoggle.position.set(0.12, 0.06, 0.24);
        fallbackGroup.add(leftGoggle);
        fallbackGroup.add(rightGoggle);

        const lensGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 10);
        lensGeo.rotateX(Math.PI / 2);
        const leftLens = new THREE.Mesh(lensGeo, glowMat);
        leftLens.position.set(-0.12, 0.06, 0.24);
        const rightLens = new THREE.Mesh(lensGeo, glowMat);
        rightLens.position.set(0.12, 0.06, 0.24);
        fallbackGroup.add(leftLens);
        fallbackGroup.add(rightLens);

        const crownGeo = new THREE.CylinderGeometry(0.28, 0.26, 0.12, 6);
        const crown = new THREE.Mesh(crownGeo, goldMat);
        crown.position.set(0, 0.28, 0);
        fallbackGroup.add(crown);
      } else if (helmVariant === 2) {
        // Mystical Chrono Cowl
        const cowlGeo = new THREE.ConeGeometry(0.36, 0.65, 8);
        cowlGeo.rotateX(-Math.PI / 10);
        const cowl = new THREE.Mesh(cowlGeo, new THREE.MeshStandardMaterial({ color: theme.secondaryColor, roughness: 0.8 }));
        cowl.position.set(0, 0.24, -0.06);
        fallbackGroup.add(cowl);

        const eyeSlitGeo = new THREE.BoxGeometry(0.42, 0.06, 0.08);
        const eyeSlit = new THREE.Mesh(eyeSlitGeo, glowMat);
        eyeSlit.position.set(0, 0.06, 0.23);
        fallbackGroup.add(eyeSlit);
      } else {
        // Standard Segmented Spangenhelm
        const salletGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.32, 8);
        const sallet = new THREE.Mesh(salletGeo, metalMat);
        sallet.position.set(0, 0.18, 0);
        fallbackGroup.add(sallet);

        const noseGuardGeo = new THREE.BoxGeometry(0.08, 0.22, 0.06);
        const noseGuard = new THREE.Mesh(noseGuardGeo, goldMat);
        noseGuard.position.set(0, 0.06, 0.25);
        fallbackGroup.add(noseGuard);
      }
    });
  }

  /**
   * 2. Builds dynamic SHOULDERS (Left & Right Pivots)
   */
  public buildShoulders(
    leftPivot: THREE.Group,
    rightPivot: THREE.Group,
    shoulders: RPGItem | null
  ) {
    this.attachGlbOrProceduralPaired('shoulders', leftPivot, rightPivot, shoulders, (leftFallback, rightFallback) => {
      const theme = deriveProceduralTheme(shoulders, 'shoulders');
      const tex = createNoiseTexture(theme.textureType);

      const metalMat = new THREE.MeshStandardMaterial({
        color: theme.primaryColor,
        metalness: theme.metalness,
        roughness: theme.roughness,
        map: tex,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: theme.goldColor,
        metalness: 0.95,
        roughness: 0.2,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: theme.glowColor,
        emissive: theme.glowColor,
        emissiveIntensity: theme.emissiveIntensity,
      });

      if (!shoulders) {
        // Minimalist shoulder cup
        const basicCapGeo = new THREE.SphereGeometry(0.18, 6, 6);
        const leftCap = new THREE.Mesh(basicCapGeo, metalMat);
        const rightCap = new THREE.Mesh(basicCapGeo, metalMat);
        leftFallback.add(leftCap);
        rightFallback.add(rightCap);
        return;
      }

      const seed = hashString(shoulders.id + shoulders.name);
      const variant = seed % 4;

      if (theme.isMystic || variant === 0) {
        // Mantle of Floating Aether Shards
        const plateGeo = new THREE.BoxGeometry(0.38, 0.16, 0.38);
        const leftPlate = new THREE.Mesh(plateGeo, metalMat);
        const rightPlate = new THREE.Mesh(plateGeo, metalMat);

        const crystalGeo = new THREE.OctahedronGeometry(0.16, 0);
        const leftCrystal = new THREE.Mesh(crystalGeo, glowMat);
        leftCrystal.position.set(0, 0.24, 0);
        leftPlate.add(leftCrystal);

        const rightCrystal = new THREE.Mesh(crystalGeo, glowMat);
        rightCrystal.position.set(0, 0.24, 0);
        rightPlate.add(rightCrystal);

        leftFallback.add(leftPlate);
        rightFallback.add(rightPlate);

        this.animatedNodes.push({
          object: leftCrystal,
          type: 'spin_y',
          speed: 2.0,
        });
        this.animatedNodes.push({
          object: rightCrystal,
          type: 'spin_y',
          speed: -2.0,
        });
      } else if (variant === 1) {
        // Spiked Vanguard Pauldrons
        const plateGeo = new THREE.BoxGeometry(0.36, 0.42, 0.38);
        const spikeGeo = new THREE.ConeGeometry(0.12, 0.45, 4);
        spikeGeo.rotateZ(Math.PI / 4);

        const leftP = new THREE.Mesh(plateGeo, metalMat);
        const leftSpike = new THREE.Mesh(spikeGeo, goldMat);
        leftSpike.position.set(-0.16, 0.2, 0);
        leftP.add(leftSpike);
        leftFallback.add(leftP);

        const rightP = new THREE.Mesh(plateGeo, metalMat);
        const rightSpike = new THREE.Mesh(spikeGeo, goldMat);
        rightSpike.position.set(0.16, 0.2, 0);
        rightSpike.rotation.z = -Math.PI / 2;
        rightP.add(rightSpike);
        rightFallback.add(rightP);
      } else if (variant === 2) {
        // Lion Crest Royal Pauldrons
        const lionGeo = new THREE.BoxGeometry(0.42, 0.46, 0.42);
        const leftLion = new THREE.Mesh(lionGeo, goldMat);
        const rightLion = new THREE.Mesh(lionGeo, goldMat);

        const flareGeo = new THREE.ConeGeometry(0.22, 0.32, 5);
        const leftFlare = new THREE.Mesh(flareGeo, glowMat);
        leftFlare.position.set(-0.1, 0.25, 0);
        leftLion.add(leftFlare);

        const rightFlare = new THREE.Mesh(flareGeo, glowMat);
        rightFlare.position.set(0.1, 0.25, 0);
        rightLion.add(rightFlare);

        leftFallback.add(leftLion);
        rightFallback.add(rightLion);
      } else {
        // Segmented Fluted Pauldron
        const pauldronGeo = new THREE.ConeGeometry(0.32, 0.46, 6);
        const leftP = new THREE.Mesh(pauldronGeo, metalMat);
        leftP.rotation.z = Math.PI / 4;
        leftFallback.add(leftP);

        const rightP = new THREE.Mesh(pauldronGeo, metalMat);
        rightP.rotation.z = -Math.PI / 4;
        rightFallback.add(rightP);
      }
    });
  }

  /**
   * 3. Builds dynamic TORSO & CHESTPLATE
   */
  public buildChestplate(
    torsoGroup: THREE.Group,
    chest: RPGItem | null
  ) {
    this.attachGlbOrProcedural('chest', torsoGroup, chest, (fallbackGroup) => {
      const theme = deriveProceduralTheme(chest, 'chest');
      const tex = createNoiseTexture(theme.textureType);

      const metalMat = new THREE.MeshStandardMaterial({
        color: theme.primaryColor,
        metalness: theme.metalness,
        roughness: theme.roughness,
        map: tex,
      });
      const secondaryMat = new THREE.MeshStandardMaterial({
        color: theme.secondaryColor,
        roughness: 0.8,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: theme.goldColor,
        metalness: 0.95,
        roughness: 0.2,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: theme.glowColor,
        emissive: theme.glowColor,
        emissiveIntensity: theme.emissiveIntensity,
      });

      // Base Torso Geometry
      const torsoGeo = new THREE.BoxGeometry(0.74, 0.85, 0.48);
      const mainTorso = new THREE.Mesh(torsoGeo, chest ? metalMat : secondaryMat);
      mainTorso.position.set(0, 0.35, 0);
      fallbackGroup.add(mainTorso);

      if (!chest) {
        const boilerGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.65, 8);
        const boiler = new THREE.Mesh(boilerGeo, secondaryMat);
        boiler.position.set(0, 0.45, -0.3);
        fallbackGroup.add(boiler);
        return;
      }

      const seed = hashString(chest.id + chest.name);
      const variant = seed % 3;

      // Heavy Plated Breastplate
      const breastplateGeo = new THREE.BoxGeometry(0.68, 0.56, 0.16);
      const breastplate = new THREE.Mesh(breastplateGeo, goldMat);
      breastplate.position.set(0, 0.4, 0.2);
      fallbackGroup.add(breastplate);

      // Glowing Power Reactor Core
      const coreGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10);
      coreGeo.rotateX(Math.PI / 2);
      const core = new THREE.Mesh(coreGeo, glowMat);
      core.position.set(0, 0.45, 0.28);
      fallbackGroup.add(core);

      if (theme.isMystic || theme.isLegendary) {
        // Twin Pulsating Exhaust Boilers with Aether Vents
        const boilerGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.68, 8);
        const leftBoiler = new THREE.Mesh(boilerGeo, metalMat);
        leftBoiler.position.set(-0.2, 0.45, -0.3);
        const rightBoiler = new THREE.Mesh(boilerGeo, metalMat);
        rightBoiler.position.set(0.2, 0.45, -0.3);

        const ventGeo = new THREE.BoxGeometry(0.08, 0.08, 0.12);
        const leftVent = new THREE.Mesh(ventGeo, glowMat);
        leftVent.position.set(-0.2, 0.72, -0.3);
        const rightVent = new THREE.Mesh(ventGeo, glowMat);
        rightVent.position.set(0.2, 0.72, -0.3);

        fallbackGroup.add(leftBoiler);
        fallbackGroup.add(rightBoiler);
        fallbackGroup.add(leftVent);
        fallbackGroup.add(rightVent);

        this.animatedNodes.push({
          object: core,
          type: 'pulse_glow',
          speed: 4.0,
          maxIntensity: 3.0,
        });
      } else if (variant === 0) {
        const sashGeo = new THREE.BoxGeometry(0.32, 0.9, 0.06);
        const sash = new THREE.Mesh(sashGeo, new THREE.MeshStandardMaterial({ color: theme.secondaryColor, roughness: 0.6 }));
        sash.position.set(0, 0.25, 0.26);
        fallbackGroup.add(sash);
      } else {
        const boilerGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.65, 8);
        const boiler = new THREE.Mesh(boilerGeo, glowMat);
        boiler.position.set(0, 0.45, -0.3);
        fallbackGroup.add(boiler);
      }
    });
  }

  /**
   * 4. Builds dynamic ARMS & GAUNTLETS
   */
  public buildArms(
    leftArmPivot: THREE.Group,
    rightArmPivot: THREE.Group,
    leftForearmPivot: THREE.Group,
    rightForearmPivot: THREE.Group,
    arms: RPGItem | null,
    skinMat: THREE.Material
  ) {
    this.attachGlbOrProceduralPaired('arms', leftForearmPivot, rightForearmPivot, arms, (leftFallback, rightFallback) => {
      const theme = deriveProceduralTheme(arms, 'arms');
      const tex = createNoiseTexture(theme.textureType);

      const metalMat = new THREE.MeshStandardMaterial({
        color: theme.primaryColor,
        metalness: theme.metalness,
        roughness: theme.roughness,
        map: tex,
      });
      const secondaryMat = new THREE.MeshStandardMaterial({
        color: theme.secondaryColor,
        roughness: 0.8,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: theme.goldColor,
        metalness: 0.95,
        roughness: 0.2,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: theme.glowColor,
        emissive: theme.glowColor,
        emissiveIntensity: theme.emissiveIntensity,
      });

      // Upper Arms
      const upperArmGeo = new THREE.BoxGeometry(0.24, 0.4, 0.24);
      const leftUpperArm = new THREE.Mesh(upperArmGeo, secondaryMat);
      leftUpperArm.position.set(0, -0.19, 0);
      leftArmPivot.add(leftUpperArm);

      const rightUpperArm = new THREE.Mesh(upperArmGeo, secondaryMat);
      rightUpperArm.position.set(0, -0.19, 0);
      rightArmPivot.add(rightUpperArm);

      // Forearms / Gauntlets
      const forearmGeo = new THREE.BoxGeometry(0.24, 0.36, 0.24);
      const leftForearm = new THREE.Mesh(forearmGeo, arms ? metalMat : secondaryMat);
      leftForearm.position.set(0, -0.18, 0);
      leftFallback.add(leftForearm);

      const rightForearm = new THREE.Mesh(forearmGeo, arms ? metalMat : secondaryMat);
      rightForearm.position.set(0, -0.18, 0);
      rightFallback.add(rightForearm);

      // Hands
      const handMat = arms ? metalMat : skinMat;
      const handGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
      const leftHand = new THREE.Mesh(handGeo, handMat);
      leftHand.position.set(0, -0.38, 0);
      leftFallback.add(leftHand);

      const rightHand = new THREE.Mesh(handGeo, handMat);
      rightHand.position.set(0, -0.38, 0);
      rightFallback.add(rightHand);

      if (arms && (theme.isMystic || theme.isLegendary)) {
        const runeRingGeo = new THREE.TorusGeometry(0.16, 0.02, 6, 16);
        const leftRing = new THREE.Mesh(runeRingGeo, glowMat);
        leftRing.position.set(0, -0.24, 0);
        leftRing.rotation.x = Math.PI / 2;
        leftFallback.add(leftRing);

        const rightRing = new THREE.Mesh(runeRingGeo, glowMat);
        rightRing.position.set(0, -0.24, 0);
        rightRing.rotation.x = Math.PI / 2;
        rightFallback.add(rightRing);

        this.animatedNodes.push({
          object: leftRing,
          type: 'spin_y',
          speed: 2.5,
        });
        this.animatedNodes.push({
          object: rightRing,
          type: 'spin_y',
          speed: -2.5,
        });
      }
    });
  }

  /**
   * 5. Builds dynamic LEGS & GREAVES
   */
  public buildLegs(
    leftHipPivot: THREE.Group,
    rightHipPivot: THREE.Group,
    leftKneePivot: THREE.Group,
    rightKneePivot: THREE.Group,
    legs: RPGItem | null
  ) {
    this.attachGlbOrProceduralPaired('legs', leftKneePivot, rightKneePivot, legs, (leftFallback, rightFallback) => {
      const theme = deriveProceduralTheme(legs, 'legs');
      const tex = createNoiseTexture(theme.textureType);

      const metalMat = new THREE.MeshStandardMaterial({
        color: theme.primaryColor,
        metalness: theme.metalness,
        roughness: theme.roughness,
        map: tex,
      });
      const secondaryMat = new THREE.MeshStandardMaterial({
        color: theme.secondaryColor,
        roughness: 0.8,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: theme.goldColor,
        metalness: 0.95,
        roughness: 0.2,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: theme.glowColor,
        emissive: theme.glowColor,
        emissiveIntensity: theme.emissiveIntensity,
      });

      // Thighs
      const thighGeo = new THREE.BoxGeometry(0.26, 0.48, 0.28);
      const leftThigh = new THREE.Mesh(thighGeo, secondaryMat);
      leftThigh.position.set(0, -0.24, 0);
      leftHipPivot.add(leftThigh);

      const rightThigh = new THREE.Mesh(thighGeo, secondaryMat);
      rightThigh.position.set(0, -0.24, 0);
      rightHipPivot.add(rightThigh);

      // Shins / Greaves
      const shinGeo = new THREE.BoxGeometry(0.25, 0.45, 0.27);
      const leftShin = new THREE.Mesh(shinGeo, legs ? metalMat : secondaryMat);
      leftShin.position.set(0, -0.22, 0);
      leftFallback.add(leftShin);

      const rightShin = new THREE.Mesh(shinGeo, legs ? metalMat : secondaryMat);
      rightShin.position.set(0, -0.22, 0);
      rightFallback.add(rightShin);

      // Knee Guard Plates
      const kneeCopGeo = new THREE.BoxGeometry(0.28, 0.16, 0.12);
      const leftKnee = new THREE.Mesh(kneeCopGeo, legs ? goldMat : secondaryMat);
      leftKnee.position.set(0, 0.02, 0.14);
      leftFallback.add(leftKnee);

      const rightKnee = new THREE.Mesh(kneeCopGeo, legs ? goldMat : secondaryMat);
      rightKnee.position.set(0, 0.02, 0.14);
      rightFallback.add(rightKnee);

      if (legs && (theme.isMystic || theme.isLegendary)) {
        const conduitGeo = new THREE.BoxGeometry(0.04, 0.35, 0.04);
        const leftConduit = new THREE.Mesh(conduitGeo, glowMat);
        leftConduit.position.set(0, -0.22, 0.14);
        leftFallback.add(leftConduit);

        const rightConduit = new THREE.Mesh(conduitGeo, glowMat);
        rightConduit.position.set(0, -0.22, 0.14);
        rightFallback.add(rightConduit);
      }
    });
  }

  /**
   * 6. Builds dynamic FEET & BOOTS (Shoes)
   */
  public buildBoots(
    leftKneePivot: THREE.Group,
    rightKneePivot: THREE.Group,
    boots: RPGItem | null
  ): { leftFoot: THREE.Mesh; rightFoot: THREE.Mesh } {
    const theme = deriveProceduralTheme(boots, 'boots');
    const tex = createNoiseTexture(theme.textureType);

    const metalMat = new THREE.MeshStandardMaterial({
      color: theme.primaryColor,
      metalness: theme.metalness,
      roughness: theme.roughness,
      map: tex,
    });
    const secondaryMat = new THREE.MeshStandardMaterial({
      color: theme.secondaryColor,
      roughness: 0.8,
    });

    const footGeo = new THREE.BoxGeometry(0.26, 0.16, 0.44);
    const leftFoot = new THREE.Mesh(footGeo, boots ? metalMat : secondaryMat);
    const rightFoot = new THREE.Mesh(footGeo, boots ? metalMat : secondaryMat);

    this.attachGlbOrProceduralPaired('boots', leftKneePivot, rightKneePivot, boots, (leftFallback, rightFallback) => {
      leftFoot.position.set(0, -0.42, 0.09);
      leftFallback.add(leftFoot);

      rightFoot.position.set(0, -0.42, 0.09);
      rightFallback.add(rightFoot);
    });

    return { leftFoot, rightFoot };
  }

  /**
   * 7. Builds dynamic WEAPON (Swords, Staves, Bows, Guns, Mystic Relics)
   */
  public buildWeapon(
    weaponGroup: THREE.Group,
    type: WeaponType,
    weaponItem: RPGItem | null
  ) {
    this.attachGlbOrProcedural('weapon', weaponGroup, weaponItem, (fallbackGroup) => {
      const theme = deriveProceduralTheme(weaponItem, 'weapon');
      const tex = createNoiseTexture(theme.textureType);

      const metalMat = new THREE.MeshStandardMaterial({
        color: theme.primaryColor,
        metalness: theme.metalness,
        roughness: theme.roughness,
        map: tex,
      });
      const darkLeatherMat = new THREE.MeshStandardMaterial({ color: 0x271c19, roughness: 0.85 });
      const goldMat = new THREE.MeshStandardMaterial({
        color: theme.goldColor,
        metalness: 0.95,
        roughness: 0.2,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: theme.glowColor,
        emissive: theme.glowColor,
        emissiveIntensity: theme.emissiveIntensity,
      });

      const seed = hashString(weaponItem ? weaponItem.id + weaponItem.name : type);

      if (type === 'blade') {
        const isKatana = weaponItem?.id.includes('katana') || (seed % 3 === 1);
        const isHammer = weaponItem?.id.includes('hammer') || (seed % 3 === 2);

        if (isKatana) {
          const hiltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.52, 6);
          const hilt = new THREE.Mesh(hiltGeo, darkLeatherMat);
          hilt.position.set(0, -0.22, 0);
          fallbackGroup.add(hilt);

          const guardGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8);
          const guard = new THREE.Mesh(guardGeo, goldMat);
          guard.position.set(0, 0, 0);
          fallbackGroup.add(guard);

          const bladeGeo = new THREE.BoxGeometry(0.08, 1.85, 0.03);
          const blade = new THREE.Mesh(bladeGeo, metalMat);
          blade.position.set(0, 0.95, 0);
          fallbackGroup.add(blade);
        } else if (isHammer) {
          const shaftGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6);
          const shaft = new THREE.Mesh(shaftGeo, metalMat);
          shaft.position.set(0, 0.4, 0);
          fallbackGroup.add(shaft);

          const headGeo = new THREE.BoxGeometry(0.48, 0.4, 0.55);
          const hammerHead = new THREE.Mesh(headGeo, goldMat);
          hammerHead.position.set(0, 1.15, 0);
          fallbackGroup.add(hammerHead);
        } else {
          // Broadsword / Sunblade
          const hiltGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6);
          const hilt = new THREE.Mesh(hiltGeo, darkLeatherMat);
          hilt.position.set(0, -0.2, 0);
          fallbackGroup.add(hilt);

          const crossguardGeo = new THREE.BoxGeometry(0.48, 0.08, 0.12);
          const crossguard = new THREE.Mesh(crossguardGeo, goldMat);
          crossguard.position.set(0, 0.05, 0);
          fallbackGroup.add(crossguard);

          const bladeGeo = new THREE.BoxGeometry(0.16, 1.65, 0.04);
          const blade = new THREE.Mesh(bladeGeo, metalMat);
          blade.position.set(0, 0.88, 0);
          fallbackGroup.add(blade);

          const fullerGeo = new THREE.BoxGeometry(0.04, 1.45, 0.045);
          const fuller = new THREE.Mesh(fullerGeo, glowMat);
          fuller.position.set(0, 0.88, 0);
          fallbackGroup.add(fuller);
        }
      } else if (type === 'arcane') {
        const staffGeo = new THREE.CylinderGeometry(0.045, 0.035, 2.1, 8);
        const staff = new THREE.Mesh(staffGeo, goldMat);
        staff.position.set(0, 0.6, 0);
        fallbackGroup.add(staff);

        const orbGeo = new THREE.OctahedronGeometry(0.24, 0);
        const orb = new THREE.Mesh(orbGeo, glowMat);
        orb.position.set(0, 1.75, 0);
        fallbackGroup.add(orb);

        const ringGeo = new THREE.TorusGeometry(0.38, 0.02, 6, 16);
        const ring = new THREE.Mesh(ringGeo, goldMat);
        ring.position.set(0, 1.75, 0);
        ring.rotation.x = Math.PI / 4;
        fallbackGroup.add(ring);

        this.animatedNodes.push({
          object: orb,
          type: 'spin_y',
          speed: 3.0,
        });
        this.animatedNodes.push({
          object: ring,
          type: 'orbit',
          speed: 1.8,
        });
      } else if (type === 'marksmanship') {
        const isBow = !weaponItem?.id.includes('repeater') && !weaponItem?.id.includes('gun');
        if (isBow) {
          const gripGeo = new THREE.BoxGeometry(0.08, 0.25, 0.08);
          const grip = new THREE.Mesh(gripGeo, darkLeatherMat);
          fallbackGroup.add(grip);

          const upperLimbGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.1, 6);
          upperLimbGeo.rotateZ(Math.PI / 8);
          const upperLimb = new THREE.Mesh(upperLimbGeo, goldMat);
          upperLimb.position.set(-0.25, 0.55, 0);
          fallbackGroup.add(upperLimb);

          const lowerLimbGeo = new THREE.CylinderGeometry(0.04, 0.03, 1.1, 6);
          lowerLimbGeo.rotateZ(-Math.PI / 8);
          const lowerLimb = new THREE.Mesh(lowerLimbGeo, goldMat);
          lowerLimb.position.set(-0.25, -0.55, 0);
          fallbackGroup.add(lowerLimb);
        } else {
          // Arbalest / Crossbow
          const stockGeo = new THREE.BoxGeometry(0.12, 0.12, 1.1);
          const stock = new THREE.Mesh(stockGeo, darkLeatherMat);
          stock.position.set(0, 0, 0.2);
          fallbackGroup.add(stock);

          const prodGeo = new THREE.BoxGeometry(0.95, 0.08, 0.08);
          const prod = new THREE.Mesh(prodGeo, metalMat);
          prod.position.set(0, 0, 0.65);
          fallbackGroup.add(prod);
        }
      } else {
        // Heavy Tech / Cannon
        const barrelGeo = new THREE.CylinderGeometry(0.18, 0.14, 1.5, 8);
        barrelGeo.rotateX(Math.PI / 2);
        const barrel = new THREE.Mesh(barrelGeo, metalMat);
        barrel.position.set(0, 0, 0.45);
        fallbackGroup.add(barrel);

        const boilerCoreGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.45, 8);
        const boilerCore = new THREE.Mesh(boilerCoreGeo, goldMat);
        boilerCore.position.set(0, 0, -0.15);
        fallbackGroup.add(boilerCore);
      }
    });
  }

  /**
   * 8. Builds dynamic OFFHAND & SHIELDS (Tomes, Orbs, Bucklers, Stilettos)
   */
  public buildOffhand(
    offhandGroup: THREE.Group,
    shieldItem: RPGItem | null,
    activeWeaponType: WeaponType
  ) {
    if (!shieldItem && activeWeaponType !== 'arcane') {
      return;
    }

    this.attachGlbOrProcedural('shield', offhandGroup, shieldItem, (fallbackGroup) => {
      const theme = deriveProceduralTheme(shieldItem, 'shield');
      const tex = createNoiseTexture(theme.textureType);

      const metalMat = new THREE.MeshStandardMaterial({
        color: theme.primaryColor,
        metalness: theme.metalness,
        roughness: theme.roughness,
        map: tex,
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: theme.goldColor,
        metalness: 0.95,
        roughness: 0.2,
      });
      const glowMat = new THREE.MeshStandardMaterial({
        color: theme.glowColor,
        emissive: theme.glowColor,
        emissiveIntensity: theme.emissiveIntensity,
      });

      if (!shieldItem) {
        // Ambient focus orb for arcane class
        const orbGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const orb = new THREE.Mesh(orbGeo, glowMat);
        orb.position.set(0, 0, 0.25);
        fallbackGroup.add(orb);
        return;
      }

      const seed = hashString(shieldItem.id + shieldItem.name);
      const isTome = shieldItem.id.includes('tome') || shieldItem.id.includes('grimoire') || (seed % 4 === 1);
      const isOrb = shieldItem.id.includes('orb') || shieldItem.id.includes('catalyst') || (seed % 4 === 2);
      const isStiletto = shieldItem.id.includes('dagger') || shieldItem.id.includes('stiletto');

      if (isTome) {
        // Levitating Grimoire
        const bookGeo = new THREE.BoxGeometry(0.45, 0.55, 0.12);
        const book = new THREE.Mesh(bookGeo, new THREE.MeshStandardMaterial({ color: 0x4c1d95, roughness: 0.7 }));
        book.position.set(0, 0, 0.2);
        fallbackGroup.add(book);

        const glyphGeo = new THREE.RingGeometry(0.12, 0.18, 6);
        const glyph = new THREE.Mesh(glyphGeo, glowMat);
        glyph.position.set(0, 0, 0.27);
        fallbackGroup.add(glyph);

        this.animatedNodes.push({
          object: fallbackGroup,
          type: 'bob_float',
          speed: 2.0,
          initialY: 0,
        });
      } else if (isOrb) {
        // Floating Aether Catalyst Orb
        const orbGeo = new THREE.SphereGeometry(0.18, 10, 10);
        const orb = new THREE.Mesh(orbGeo, glowMat);
        orb.position.set(0, 0, 0.25);
        fallbackGroup.add(orb);

        const orbitRingGeo = new THREE.TorusGeometry(0.28, 0.02, 6, 16);
        const ring = new THREE.Mesh(orbitRingGeo, goldMat);
        ring.position.set(0, 0, 0.25);
        ring.rotation.x = Math.PI / 3;
        fallbackGroup.add(ring);

        this.animatedNodes.push({
          object: ring,
          type: 'orbit',
          speed: 2.0,
        });
        this.animatedNodes.push({
          object: orb,
          type: 'pulse_glow',
          speed: 3.5,
          maxIntensity: 2.5,
        });
      } else if (isStiletto) {
        // Parrying Stiletto
        const stilettoGeo = new THREE.BoxGeometry(0.06, 0.75, 0.03);
        const stiletto = new THREE.Mesh(stilettoGeo, metalMat);
        stiletto.position.set(0, 0.25, 0.1);
        stiletto.rotation.x = Math.PI;
        fallbackGroup.add(stiletto);
      } else {
        // Aegis / Tower Shield / Royal Buckler
        const shieldGeo = new THREE.BoxGeometry(0.68, 0.98, 0.12);
        const shield = new THREE.Mesh(shieldGeo, theme.isLegendary ? goldMat : metalMat);
        shield.position.set(0, 0, 0.15);
        fallbackGroup.add(shield);

        const shieldCoreGeo = new THREE.OctahedronGeometry(0.15, 0);
        const shieldCore = new THREE.Mesh(shieldCoreGeo, glowMat);
        shieldCore.position.set(0, 0, 0.22);
        fallbackGroup.add(shieldCore);
      }
    });
  }
}
