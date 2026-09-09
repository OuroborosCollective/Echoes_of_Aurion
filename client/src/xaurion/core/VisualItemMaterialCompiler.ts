import * as THREE from "three";
import { visualMaterialIds, type VisualItemDescriptor } from "@shared/visualItemProtocol";
import type { GeneratedVisualItemGeometry, VisualItemLod } from "./VisualItemGeometryCompiler";

export type VisualMaterialId = (typeof visualMaterialIds)[number];
export const visualElementFamilies = ["ember", "tide", "gale", "resonance", "restoration", "stone"] as const;
export type VisualElementFamily = (typeof visualElementFamilies)[number];
export type VisualMaterialSource = "confirmed" | "fallback";
export type VisualMaterialTier = "physical" | "standard" | "lambert";

export type VisualItemMaterialProfile = Readonly<{
  materialId: VisualMaterialId;
  materialSource: VisualMaterialSource;
  element: VisualElementFamily | null;
  quality: VisualItemDescriptor["quality"];
  setActive: boolean;
  lod: VisualItemLod;
  materialTier: VisualMaterialTier;
  materialCount: 1 | 2;
  maxDrawPassesPerMesh: 1;
  animatedEffect: boolean;
  visualPhase: number;
}>;

export type VisualItemMaterialBundle = Readonly<{
  profile: VisualItemMaterialProfile;
  primary: THREE.Material;
  accent: THREE.Material;
  clockUniform: THREE.IUniform<number>;
  apply: (asset: GeneratedVisualItemGeometry) => number;
  dispose: () => void;
}>;

type Palette = Readonly<{
  primary: number;
  accent: number;
  roughness: number;
  metalness: number;
  emissive: number;
}>;

const palettes: Readonly<Record<VisualMaterialId, Palette>> = Object.freeze({
  rustic_iron: { primary: 0x475569, accent: 0x78350f, roughness: 0.65, metalness: 0.75, emissive: 0x000000 },
  star_iron: { primary: 0x1e293b, accent: 0x38bdf8, roughness: 0.25, metalness: 0.92, emissive: 0x0f172a },
  verdant_fiber: { primary: 0x166534, accent: 0xca8a04, roughness: 0.7, metalness: 0.15, emissive: 0x000000 },
  echo_clay: { primary: 0x713f12, accent: 0x0d9488, roughness: 0.8, metalness: 0.1, emissive: 0x000000 },
  lumen_resin: { primary: 0xfef08a, accent: 0xf59e0b, roughness: 0.15, metalness: 0.1, emissive: 0x451a03 },
  damascus_steel: { primary: 0x334155, accent: 0x94a3b8, roughness: 0.3, metalness: 0.95, emissive: 0x000000 },
  obsidian: { primary: 0x09090b, accent: 0x9333ea, roughness: 0.1, metalness: 0.9, emissive: 0x1e1b4b },
  celestial_gold: { primary: 0xd97706, accent: 0xfef08a, roughness: 0.2, metalness: 0.98, emissive: 0x78350f },
  bloodstone: { primary: 0x881337, accent: 0xf43f5e, roughness: 0.35, metalness: 0.6, emissive: 0x4c0519 },
  astral_silver: { primary: 0xe2e8f0, accent: 0x38bdf8, roughness: 0.18, metalness: 0.95, emissive: 0x0284c7 },
});

const elementColors: Readonly<Record<VisualElementFamily, number>> = Object.freeze({
  ember: 0xff5a1f,
  tide: 0x58d3ff,
  gale: 0xb8f4ff,
  resonance: 0xa78bfa,
  restoration: 0xffe58a,
  stone: 0xff8a3d,
});

const qualityColors: Readonly<Record<VisualItemDescriptor["quality"], number>> = Object.freeze({
  normal: 0xd4d4d8,
  magic: 0x38bdf8,
  rare: 0xfacc15,
  set: 0x4ade80,
  unique: 0xfb923c,
  mythic: 0xc084fc,
});

const qualityGlow: Readonly<Record<VisualItemDescriptor["quality"], number>> = Object.freeze({
  normal: 0,
  magic: 0.025,
  rare: 0.04,
  set: 0.055,
  unique: 0.07,
  mythic: 0.085,
});

const accentKeywords = ["grip", "guard", "pommel", "haft", "shaft", "riser", "socket", "rim", "cuff", "ankle", "ferrule", "counter", "wing", "beak", "visor", "pauldron", "poleyn"] as const;
const visualMaterialSet = new Set<string>(visualMaterialIds);

export class AurionVisualClock {
  readonly uniform: THREE.IUniform<number> = { value: 0 };
  private readonly pulses = new Map<THREE.MeshStandardMaterial, number>();

  attach(material: THREE.MeshStandardMaterial, phase: number): void {
    this.pulses.set(material, phase);
    const detach = () => { this.pulses.delete(material); material.removeEventListener("dispose", detach); };
    material.addEventListener("dispose", detach);
    this.updatePulses();
  }

  private updatePulses(): void {
    for (const [material, phase] of this.pulses) material.emissiveIntensity = 0.82 + 0.18 * Math.sin(this.uniform.value * 2.4 + phase);
  }

  advance(deltaSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new Error("visual clock delta must be finite and non-negative");
    this.uniform.value += deltaSeconds;
    this.updatePulses();
    return this.uniform.value;
  }

  reset(timeSeconds = 0): void {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) throw new Error("visual clock time must be finite and non-negative");
    this.uniform.value = timeSeconds;
    this.updatePulses();
  }
}

function selectedMaterial(descriptor: VisualItemDescriptor): { id: VisualMaterialId; source: VisualMaterialSource } {
  const candidate = descriptor.visual?.materialId ?? null;
  if (candidate && visualMaterialSet.has(candidate)) return { id: candidate as VisualMaterialId, source: "confirmed" };
  return { id: "rustic_iron", source: "fallback" };
}

function selectedElement(descriptor: VisualItemDescriptor): VisualElementFamily | null {
  for (const element of visualElementFamilies) {
    if (descriptor.affixes.some(affix => affix.groupId.endsWith(`-${element}`) || affix.id.includes(`-${element}-`))) return element;
  }
  return null;
}

function phaseFromSeed(seed: string): number {
  const prefix = seed.slice(0, 8);
  const value = Number.parseInt(prefix, 16);
  if (!Number.isFinite(value)) return 0;
  return value / 0xffffffff * Math.PI * 2;
}

export function visualItemMaterialProfile(descriptor: VisualItemDescriptor, lod: VisualItemLod): VisualItemMaterialProfile {
  const material = selectedMaterial(descriptor);
  const element = selectedElement(descriptor);
  const materialTier: VisualMaterialTier = lod === 0 ? "physical" : lod === 1 ? "standard" : "lambert";
  return Object.freeze({
    materialId: material.id,
    materialSource: material.source,
    element,
    quality: descriptor.quality,
    setActive: descriptor.setId !== null || descriptor.quality === "set",
    lod,
    materialTier,
    materialCount: lod === 2 ? 1 : 2,
    maxDrawPassesPerMesh: 1,
    animatedEffect: lod === 0 && element !== null,
    visualPhase: phaseFromSeed(descriptor.visualSeed),
  });
}

function elementEmissive(element: VisualElementFamily | null, quality: VisualItemDescriptor["quality"], base: number): THREE.Color {
  const color = new THREE.Color(base);
  const glow = qualityGlow[quality];
  if (!element || glow === 0) return color.multiplyScalar(glow);
  return color.lerp(new THREE.Color(elementColors[element]), 0.78).multiplyScalar(Math.max(glow, 0.035));
}

function attachSinglePassPulse(material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial, element: VisualElementFamily, clock: AurionVisualClock, phase: number): void {
  // Standard emissive intensity works on both backends. This external clock is
  // presentation-only; material updates never mutate a WASD descriptor or receipt.
  clock.attach(material, phase);
  material.userData.aurionAnimatedVfx = Object.freeze({ element, clockDriven: true, visualPhase: phase, maxDrawPassesPerMesh: 1 });
  material.needsUpdate = true;
}

function createMaterialPair(descriptor: VisualItemDescriptor, profile: VisualItemMaterialProfile, clock: AurionVisualClock): { primary: THREE.Material; accent: THREE.Material } {
  const palette = palettes[profile.materialId];
  const qualityColor = qualityColors[descriptor.quality];
  const primaryColor = new THREE.Color(palette.primary).lerp(new THREE.Color(qualityColor), descriptor.quality === "normal" ? 0 : 0.05).getHex();
  const accentColor = new THREE.Color(palette.accent).lerp(new THREE.Color(qualityColor), profile.setActive ? 0.16 : 0.06).getHex();
  const emissive = elementEmissive(profile.element, descriptor.quality, palette.emissive);

  if (profile.lod === 2) {
    const primary = new THREE.MeshLambertMaterial({ color: primaryColor, emissive });
    primary.name = `aurion-item-${profile.materialId}-lod2`;
    return { primary, accent: primary };
  }

  if (profile.lod === 1) {
    const primary = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: palette.roughness, metalness: palette.metalness, emissive });
    const accent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: Math.max(0.08, palette.roughness - 0.08), metalness: Math.min(1, palette.metalness + 0.08), emissive });
    primary.name = `aurion-item-${profile.materialId}-primary-lod1`;
    accent.name = `aurion-item-${profile.materialId}-accent-lod1`;
    return { primary, accent };
  }

  const primary = new THREE.MeshPhysicalMaterial({
    color: primaryColor,
    roughness: Math.max(0.05, palette.roughness - (descriptor.quality === "mythic" ? 0.12 : descriptor.quality === "unique" ? 0.08 : 0)),
    metalness: palette.metalness,
    emissive,
    clearcoat: descriptor.quality === "mythic" ? 0.9 : descriptor.quality === "unique" || descriptor.quality === "set" ? 0.72 : palette.metalness > 0.5 ? 0.45 : 0.18,
    clearcoatRoughness: 0.1,
    iridescence: descriptor.quality === "mythic" || profile.materialId === "star_iron" || profile.materialId === "obsidian" ? 0.32 : 0,
  });
  const accent = new THREE.MeshPhysicalMaterial({
    color: accentColor,
    roughness: Math.max(0.05, palette.roughness - 0.1),
    metalness: Math.min(1, palette.metalness + 0.1),
    emissive,
    clearcoat: 0.55,
    clearcoatRoughness: 0.08,
    iridescence: descriptor.quality === "mythic" ? 0.28 : 0,
  });
  primary.name = `aurion-item-${profile.materialId}-primary-lod0`;
  accent.name = `aurion-item-${profile.materialId}-accent-lod0`;
  if (profile.element) {
    attachSinglePassPulse(primary, profile.element, clock, profile.visualPhase);
    attachSinglePassPulse(accent, profile.element, clock, profile.visualPhase);
  }
  return { primary, accent };
}

function usesAccent(name: string): boolean {
  const normalized = name.toLowerCase();
  return accentKeywords.some(keyword => normalized.includes(keyword));
}

export function createVisualItemMaterialBundle(descriptor: VisualItemDescriptor, lod: VisualItemLod, clock: AurionVisualClock): VisualItemMaterialBundle {
  const profile = visualItemMaterialProfile(descriptor, lod);
  const { primary, accent } = createMaterialPair(descriptor, profile, clock);
  const ownedMaterials = new Set<THREE.Material>([primary, accent]);
  const previousMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  return Object.freeze({
    profile,
    primary,
    accent,
    clockUniform: clock.uniform,
    apply: (asset: GeneratedVisualItemGeometry): number => {
      if (asset.lod !== lod) throw new Error("visual material LOD does not match generated geometry LOD");
      let applied = 0;
      asset.root.traverse(node => {
        if (!(node as THREE.Mesh).isMesh) return;
        const mesh = node as THREE.Mesh;
        if (!previousMaterials.has(mesh)) previousMaterials.set(mesh, mesh.material);
        mesh.material = profile.materialCount === 1 ? primary : usesAccent(mesh.name) ? accent : primary;
        applied += 1;
      });
      asset.root.userData.visualMaterial = profile;
      return applied;
    },
    dispose: () => {
      previousMaterials.forEach((previous, mesh) => {
        if (mesh.material === primary || mesh.material === accent) mesh.material = previous;
      });
      previousMaterials.clear();
      ownedMaterials.forEach(material => material.dispose());
    },
  });
}
