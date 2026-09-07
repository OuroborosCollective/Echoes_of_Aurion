import * as THREE from "three";
import type { VisualItemDescriptor } from "@shared/visualItemProtocol";

export type VisualItemLod = 0 | 1 | 2;
export const visualWeaponFamilies = ["blade", "axe", "mace", "spear", "dagger", "bow", "staff", "wand", "hammer", "scythe", "shield", "focus"] as const;
export type VisualWeaponFamily = (typeof visualWeaponFamilies)[number];
export const generatedArmorSlots = ["head", "chest", "hands", "legs", "feet"] as const;
export type GeneratedArmorSlot = (typeof generatedArmorSlots)[number];

export type GeneratedVisualItemGeometry = Readonly<{
  kind: "generated";
  root: THREE.Group;
  lod: VisualItemLod;
  geometryKey: string;
  triangleCount: number;
  structuralFingerprint: string;
  dispose: () => void;
}>;
export type UnsupportedVisualItemGeometry = Readonly<{
  kind: "unsupported";
  lod: VisualItemLod;
  reason: "CATEGORY_UNSUPPORTED" | "WEAPON_FAMILY_UNSUPPORTED" | "ARMOR_SLOT_UNSUPPORTED";
}>;
export type VisualItemGeometryCompileResult = GeneratedVisualItemGeometry | UnsupportedVisualItemGeometry;

type Vec3 = readonly [number, number, number];
type PrimitiveKind = "box" | "cylinder" | "cone" | "sphere" | "octahedron" | "torus";
type PartRecipe = Readonly<{
  name: string;
  kind: PrimitiveKind;
  dimensions: readonly number[];
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  maxLod?: VisualItemLod;
}>;

const radialByLod: Readonly<Record<VisualItemLod, number>> = Object.freeze({ 0: 12, 1: 8, 2: 4 });
const tubularByLod: Readonly<Record<VisualItemLod, number>> = Object.freeze({ 0: 20, 1: 12, 2: 6 });
const subdivisionByLod: Readonly<Record<VisualItemLod, number>> = Object.freeze({ 0: 3, 1: 2, 2: 1 });
const weaponFamilySet = new Set<string>(visualWeaponFamilies);
const armorSlotSet = new Set<string>(generatedArmorSlots);
const v = (x = 0, y = 0, z = 0): Vec3 => [x, y, z] as const;

const weaponRecipes: Readonly<Record<VisualWeaponFamily, readonly PartRecipe[]>> = Object.freeze({
  blade: [
    { name: "grip", kind: "cylinder", dimensions: [0.045, 0.05, 0.42], position: v(0, -0.25) },
    { name: "blade", kind: "box", dimensions: [0.13, 1.12, 0.045], position: v(0, 0.52) },
    { name: "tip", kind: "cone", dimensions: [0.075, 0.2], position: v(0, 1.18) },
    { name: "guard", kind: "box", dimensions: [0.48, 0.055, 0.08], position: v(0, -0.02), maxLod: 1 },
    { name: "pommel", kind: "octahedron", dimensions: [0.09], position: v(0, -0.52), maxLod: 0 },
  ],
  axe: [
    { name: "haft", kind: "cylinder", dimensions: [0.045, 0.055, 1.25], position: v(0, 0.15) },
    { name: "axe-head", kind: "box", dimensions: [0.46, 0.26, 0.11], position: v(0.14, 0.72) },
    { name: "blade-wedge", kind: "cone", dimensions: [0.23, 0.34], position: v(0.38, 0.72), rotation: v(0, 0, -Math.PI / 2), scale: v(1, 0.35, 1) },
    { name: "counter-spike", kind: "cone", dimensions: [0.08, 0.28], position: v(-0.26, 0.72), rotation: v(0, 0, Math.PI / 2), maxLod: 1 },
    { name: "pommel", kind: "torus", dimensions: [0.075, 0.018], position: v(0, -0.52), rotation: v(Math.PI / 2), maxLod: 0 },
  ],
  mace: [
    { name: "haft", kind: "cylinder", dimensions: [0.045, 0.055, 1.08], position: v(0, 0.05) },
    { name: "mace-core", kind: "octahedron", dimensions: [0.22], position: v(0, 0.72) },
    { name: "top-spike", kind: "cone", dimensions: [0.055, 0.28], position: v(0, 1.0), maxLod: 1 },
    { name: "side-spike-left", kind: "cone", dimensions: [0.05, 0.24], position: v(-0.26, 0.72), rotation: v(0, 0, Math.PI / 2), maxLod: 0 },
    { name: "side-spike-right", kind: "cone", dimensions: [0.05, 0.24], position: v(0.26, 0.72), rotation: v(0, 0, -Math.PI / 2), maxLod: 0 },
  ],
  spear: [
    { name: "shaft", kind: "cylinder", dimensions: [0.03, 0.035, 1.8], position: v(0, 0.25) },
    { name: "spear-head", kind: "cone", dimensions: [0.12, 0.42], position: v(0, 1.36) },
    { name: "socket", kind: "cylinder", dimensions: [0.065, 0.05, 0.18], position: v(0, 1.08), maxLod: 1 },
    { name: "wing-left", kind: "cone", dimensions: [0.045, 0.22], position: v(-0.09, 1.1), rotation: v(0, 0, Math.PI / 3), maxLod: 0 },
    { name: "wing-right", kind: "cone", dimensions: [0.045, 0.22], position: v(0.09, 1.1), rotation: v(0, 0, -Math.PI / 3), maxLod: 0 },
  ],
  dagger: [
    { name: "grip", kind: "cylinder", dimensions: [0.04, 0.045, 0.3], position: v(0, -0.2) },
    { name: "dagger-blade", kind: "box", dimensions: [0.11, 0.62, 0.035], position: v(0, 0.25) },
    { name: "tip", kind: "cone", dimensions: [0.065, 0.16], position: v(0, 0.64) },
    { name: "guard", kind: "box", dimensions: [0.3, 0.04, 0.065], position: v(0, -0.02), maxLod: 1 },
    { name: "pommel", kind: "sphere", dimensions: [0.065], position: v(0, -0.4), maxLod: 0 },
  ],
  bow: [
    { name: "bow-limb", kind: "torus", dimensions: [0.58, 0.035, Math.PI * 1.55], position: v(0, 0.25), rotation: v(0, 0, Math.PI * 0.225) },
    { name: "riser", kind: "box", dimensions: [0.07, 0.38, 0.06], position: v(0, 0.25) },
    { name: "string", kind: "box", dimensions: [0.012, 1.12, 0.012], position: v(0.31, 0.25), maxLod: 1 },
    { name: "nock-top", kind: "sphere", dimensions: [0.045], position: v(0.32, 0.82), maxLod: 0 },
    { name: "nock-bottom", kind: "sphere", dimensions: [0.045], position: v(0.32, -0.32), maxLod: 0 },
  ],
  staff: [
    { name: "shaft", kind: "cylinder", dimensions: [0.035, 0.045, 1.65], position: v(0, 0.25) },
    { name: "focus-core", kind: "octahedron", dimensions: [0.17], position: v(0, 1.18) },
    { name: "focus-ring", kind: "torus", dimensions: [0.24, 0.022], position: v(0, 1.18), maxLod: 1 },
    { name: "crown-prong-left", kind: "cone", dimensions: [0.035, 0.3], position: v(-0.16, 1.22), rotation: v(0, 0, Math.PI / 6), maxLod: 0 },
    { name: "crown-prong-right", kind: "cone", dimensions: [0.035, 0.3], position: v(0.16, 1.22), rotation: v(0, 0, -Math.PI / 6), maxLod: 0 },
  ],
  wand: [
    { name: "wand-shaft", kind: "cone", dimensions: [0.035, 0.9], position: v(0, 0.15) },
    { name: "wand-core", kind: "octahedron", dimensions: [0.1], position: v(0, 0.68) },
    { name: "wand-ring", kind: "torus", dimensions: [0.13, 0.016], position: v(0, 0.68), maxLod: 1 },
    { name: "counterweight", kind: "sphere", dimensions: [0.05], position: v(0, -0.35), maxLod: 0 },
  ],
  hammer: [
    { name: "haft", kind: "cylinder", dimensions: [0.045, 0.055, 1.2], position: v(0, 0.05) },
    { name: "hammer-head", kind: "box", dimensions: [0.62, 0.28, 0.25], position: v(0, 0.72) },
    { name: "beak", kind: "cone", dimensions: [0.09, 0.32], position: v(-0.42, 0.72), rotation: v(0, 0, Math.PI / 2), maxLod: 1 },
    { name: "face-top", kind: "box", dimensions: [0.2, 0.06, 0.28], position: v(0.26, 0.9), maxLod: 0 },
    { name: "pommel", kind: "torus", dimensions: [0.07, 0.018], position: v(0, -0.55), rotation: v(Math.PI / 2), maxLod: 0 },
  ],
  scythe: [
    { name: "snath", kind: "cylinder", dimensions: [0.03, 0.04, 1.7], position: v(0, 0.2), rotation: v(0, 0, -0.08) },
    { name: "scythe-blade", kind: "torus", dimensions: [0.48, 0.055, Math.PI * 0.85], position: v(0.34, 1.06), rotation: v(0, 0, 0.2) },
    { name: "ferrule", kind: "cylinder", dimensions: [0.06, 0.045, 0.22], position: v(0.03, 0.95), maxLod: 1 },
    { name: "counterweight", kind: "torus", dimensions: [0.075, 0.02], position: v(-0.05, -0.62), rotation: v(Math.PI / 2), maxLod: 0 },
  ],
  shield: [
    { name: "shield-body", kind: "cylinder", dimensions: [0.55, 0.55, 0.1], position: v(0, 0.35), rotation: v(Math.PI / 2), scale: v(0.9, 1.15, 1) },
    { name: "shield-boss", kind: "cone", dimensions: [0.18, 0.15], position: v(0, 0.35, 0.11), rotation: v(Math.PI / 2) },
    { name: "rim", kind: "torus", dimensions: [0.5, 0.035], position: v(0, 0.35, 0.07), maxLod: 1 },
    { name: "grip", kind: "box", dimensions: [0.08, 0.42, 0.08], position: v(0, 0.35, -0.12), maxLod: 0 },
  ],
  focus: [
    { name: "focus-core", kind: "octahedron", dimensions: [0.2], position: v(0, 0.35) },
    { name: "focus-ring-inner", kind: "torus", dimensions: [0.34, 0.025], position: v(0, 0.35), maxLod: 1 },
    { name: "focus-ring-outer", kind: "torus", dimensions: [0.5, 0.02], position: v(0, 0.35), rotation: v(Math.PI / 2), maxLod: 0 },
    { name: "focus-shard", kind: "octahedron", dimensions: [0.07], position: v(0.46, 0.35), maxLod: 0 },
  ],
});

function primitiveGeometry(recipe: PartRecipe, lod: VisualItemLod): THREE.BufferGeometry {
  const radial = radialByLod[lod];
  const subdivisions = subdivisionByLod[lod];
  const [a = 0, b = 0, c = 0] = recipe.dimensions;
  switch (recipe.kind) {
    case "box": return new THREE.BoxGeometry(a, b, c, subdivisions, subdivisions, subdivisions);
    case "cylinder": return new THREE.CylinderGeometry(a, b, c, radial, subdivisions);
    case "cone": return new THREE.ConeGeometry(a, b, radial, subdivisions);
    case "sphere": return new THREE.SphereGeometry(a, radial * 2, Math.max(4, radial));
    case "octahedron": return new THREE.OctahedronGeometry(a, lod === 0 ? 1 : 0);
    case "torus": return new THREE.TorusGeometry(a, b, Math.max(4, radial), tubularByLod[lod], c || Math.PI * 2);
  }
}

function buildRecipe(parts: readonly PartRecipe[], lod: VisualItemLod, material: THREE.Material): THREE.Group {
  const root = new THREE.Group();
  for (const part of parts) {
    if ((part.maxLod ?? 2) < lod) continue;
    const mesh = new THREE.Mesh(primitiveGeometry(part, lod), material);
    mesh.name = part.name;
    if (part.position) mesh.position.set(...part.position);
    if (part.rotation) mesh.rotation.set(...part.rotation);
    if (part.scale) mesh.scale.set(...part.scale);
    root.add(mesh);
  }
  return root;
}

function armorWeight(familyId: string): number {
  if (familyId === "light") return 0.9;
  if (familyId === "heavy") return 1.12;
  return 1;
}

function armorRecipe(slot: GeneratedArmorSlot, familyId: string): readonly PartRecipe[] {
  const weight = armorWeight(familyId);
  if (slot === "head") return [
    { name: "helmet-shell", kind: "sphere", dimensions: [0.29 * weight], position: v(0, 0.25), scale: v(1, 1.05, 0.92) },
    { name: "helmet-visor", kind: "box", dimensions: [0.46 * weight, 0.11, 0.08], position: v(0, 0.23, 0.24), maxLod: 1 },
    { name: "helmet-crest", kind: "cone", dimensions: [0.065, 0.32], position: v(0, 0.63), maxLod: 0 },
  ];
  if (slot === "chest") return [
    { name: "cuirass", kind: "box", dimensions: [0.58 * weight, 0.76, 0.28 * weight], position: v(0, 0.42) },
    { name: "pauldron-left", kind: "sphere", dimensions: [0.16 * weight], position: v(-0.36 * weight, 0.72), scale: v(1.2, 0.7, 1), maxLod: 1 },
    { name: "pauldron-right", kind: "sphere", dimensions: [0.16 * weight], position: v(0.36 * weight, 0.72), scale: v(1.2, 0.7, 1), maxLod: 1 },
    { name: "plackart", kind: "box", dimensions: [0.45 * weight, 0.2, 0.06], position: v(0, 0.14, 0.16), maxLod: 0 },
  ];
  if (slot === "hands") return [
    { name: "gauntlet-left", kind: "box", dimensions: [0.16 * weight, 0.28, 0.12 * weight], position: v(-0.19, 0.2) },
    { name: "gauntlet-right", kind: "box", dimensions: [0.16 * weight, 0.28, 0.12 * weight], position: v(0.19, 0.2) },
    { name: "cuff-left", kind: "cylinder", dimensions: [0.1 * weight, 0.12 * weight, 0.13], position: v(-0.19, 0.37), maxLod: 1 },
    { name: "cuff-right", kind: "cylinder", dimensions: [0.1 * weight, 0.12 * weight, 0.13], position: v(0.19, 0.37), maxLod: 1 },
  ];
  if (slot === "legs") return [
    { name: "greave-left", kind: "cylinder", dimensions: [0.105 * weight, 0.085 * weight, 0.62], position: v(-0.15, 0.32) },
    { name: "greave-right", kind: "cylinder", dimensions: [0.105 * weight, 0.085 * weight, 0.62], position: v(0.15, 0.32) },
    { name: "poleyn-left", kind: "sphere", dimensions: [0.11 * weight], position: v(-0.15, 0.67, 0.04), scale: v(1, 0.65, 0.8), maxLod: 1 },
    { name: "poleyn-right", kind: "sphere", dimensions: [0.11 * weight], position: v(0.15, 0.67, 0.04), scale: v(1, 0.65, 0.8), maxLod: 1 },
  ];
  return [
    { name: "sabaton-left", kind: "box", dimensions: [0.16 * weight, 0.16, 0.34], position: v(-0.13, 0.11, 0.08) },
    { name: "sabaton-right", kind: "box", dimensions: [0.16 * weight, 0.16, 0.34], position: v(0.13, 0.11, 0.08) },
    { name: "ankle-left", kind: "cylinder", dimensions: [0.095 * weight, 0.11 * weight, 0.24], position: v(-0.13, 0.28), maxLod: 1 },
    { name: "ankle-right", kind: "cylinder", dimensions: [0.095 * weight, 0.11 * weight, 0.24], position: v(0.13, 0.28), maxLod: 1 },
  ];
}

export function countObjectTriangles(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return;
    const geometry = (node as THREE.Mesh).geometry;
    if (geometry.index) triangles += geometry.index.count / 3;
    else if (geometry.attributes.position) triangles += geometry.attributes.position.count / 3;
  });
  return Math.round(triangles);
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function visualGeometryFingerprint(root: THREE.Object3D, geometryKey: string, lod: VisualItemLod): string {
  const parts = [`v1:${geometryKey}:${lod}`];
  root.updateMatrixWorld(true);
  root.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    parts.push(mesh.name, geometry.type, String(geometry.index?.count ?? 0), String(position?.count ?? 0));
    if (position) for (let index = 0; index < position.count; index += 1) {
      parts.push(position.getX(index).toFixed(5), position.getY(index).toFixed(5), position.getZ(index).toFixed(5));
    }
    for (const value of mesh.matrixWorld.elements) parts.push(Number(value).toFixed(5));
  });
  return `fnv1a32:${fnv1a32(parts.join("|"))}`;
}

function disposeGenerated(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    geometries.add(mesh.geometry);
    const values = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    values.forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  root.clear();
}

export function compileVisualItemGeometry(descriptor: VisualItemDescriptor, lod: VisualItemLod): VisualItemGeometryCompileResult {
  if (descriptor.category !== "weapon" && descriptor.category !== "armor") {
    return Object.freeze({ kind: "unsupported", lod, reason: "CATEGORY_UNSUPPORTED" });
  }
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  let root: THREE.Group;
  let geometryKey: string;
  if (descriptor.category === "weapon") {
    if (!weaponFamilySet.has(descriptor.familyId)) {
      material.dispose();
      return Object.freeze({ kind: "unsupported", lod, reason: "WEAPON_FAMILY_UNSUPPORTED" });
    }
    const family = descriptor.familyId as VisualWeaponFamily;
    root = buildRecipe(weaponRecipes[family], lod, material);
    geometryKey = `weapon:${family}`;
  } else {
    const slot = descriptor.equipmentSlot;
    if (!slot || !armorSlotSet.has(slot)) {
      material.dispose();
      return Object.freeze({ kind: "unsupported", lod, reason: "ARMOR_SLOT_UNSUPPORTED" });
    }
    root = buildRecipe(armorRecipe(slot as GeneratedArmorSlot, descriptor.familyId), lod, material);
    geometryKey = `armor:${descriptor.familyId}:${slot}`;
  }
  root.name = `aurion-generated-item:${geometryKey}:lod${lod}`;
  const triangleCount = countObjectTriangles(root);
  const structuralFingerprint = visualGeometryFingerprint(root, geometryKey, lod);
  root.userData.visualItem = Object.freeze({ version: descriptor.version, itemDefinitionId: descriptor.itemDefinitionId, geometryKey, lod, structuralFingerprint });
  return Object.freeze({ kind: "generated", root, lod, geometryKey, triangleCount, structuralFingerprint, dispose: () => disposeGenerated(root) });
}
