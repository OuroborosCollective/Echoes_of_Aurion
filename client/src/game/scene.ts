/**
 * Echoes of Aurion — Arena expedition core
 * Design philosophy: The human Explorer and articulate Echo Scout remain equal
 * on a material-rich battlefield; tactical signals produce immediately visible world change.
 */

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { defaultVertexShader } from "@babylonjs/core/Shaders/default.vertex.js";
import { defaultPixelShader } from "@babylonjs/core/Shaders/default.fragment.js";
import { pbrVertexShader } from "@babylonjs/core/Shaders/pbr.vertex.js";
import { pbrPixelShader } from "@babylonjs/core/Shaders/pbr.fragment.js";
import { glowMapGenerationVertexShader } from "@babylonjs/core/Shaders/glowMapGeneration.vertex.js";
import { glowMapGenerationPixelShader } from "@babylonjs/core/Shaders/glowMapGeneration.fragment.js";
import { glowMapMergeVertexShader } from "@babylonjs/core/Shaders/glowMapMerge.vertex.js";
import { glowMapMergePixelShader } from "@babylonjs/core/Shaders/glowMapMerge.fragment.js";
import { glowBlurPostProcessPixelShader } from "@babylonjs/core/Shaders/glowBlurPostProcess.fragment.js";
import { layerVertexShader } from "@babylonjs/core/Shaders/layer.vertex.js";
import { layerPixelShader } from "@babylonjs/core/Shaders/layer.fragment.js";
import { kernelBlurVertexShader } from "@babylonjs/core/Shaders/kernelBlur.vertex.js";
import { kernelBlurPixelShader } from "@babylonjs/core/Shaders/kernelBlur.fragment.js";
import { postprocessVertexShader } from "@babylonjs/core/Shaders/postprocess.vertex.js";
import { passPixelShader } from "@babylonjs/core/Shaders/pass.fragment.js";
import { rgbdDecodePixelShader } from "@babylonjs/core/Shaders/rgbdDecode.fragment.js";
import { colorVertexShader } from "@babylonjs/core/Shaders/color.vertex.js";
import { colorPixelShader } from "@babylonjs/core/Shaders/color.fragment.js";
import { aurionAssets } from "@/lib/aurionAssets";
import { essentialTowerGlbPlan } from "@/game/glbUsagePlan";
import { generateBaseWorldChunk, WORLD_CHUNK_BASE_REVISION, type WorldChunkDeltaOverlay } from "@shared/worldChunkProtocol";
import { WORLD_CHUNK_STREAM_PAGE_LIMIT, orderedWorldChunkWindow, planWorldChunkCache, worldChunkCoordinateKey, worldChunkHorizonProfile, worldChunkStreamingBudget, type WorldChunkStreamingTier } from "@shared/worldChunkStreamingProtocol";
import type { AudioEvent, AudioSurface } from "@shared/audioProtocol";
import { companionCommandRequiresSpawn, companionGameplayActionSource, type CompanionCommandOrigin } from "@shared/companionLearningProtocol";
import "@babylonjs/loaders/glTF";

// Vite must receive the literal GLSL modules, not a `.vertex` / `.fragment` asset URL.
ShaderStore.ShadersStore[defaultVertexShader.name] = defaultVertexShader.shader;
ShaderStore.ShadersStore[defaultPixelShader.name] = defaultPixelShader.shader;
ShaderStore.ShadersStore[pbrVertexShader.name] = pbrVertexShader.shader;
ShaderStore.ShadersStore[pbrPixelShader.name] = pbrPixelShader.shader;
ShaderStore.ShadersStore[glowMapGenerationVertexShader.name] = glowMapGenerationVertexShader.shader;
ShaderStore.ShadersStore[glowMapGenerationPixelShader.name] = glowMapGenerationPixelShader.shader;
ShaderStore.ShadersStore[glowMapMergeVertexShader.name] = glowMapMergeVertexShader.shader;
ShaderStore.ShadersStore[glowMapMergePixelShader.name] = glowMapMergePixelShader.shader;
ShaderStore.ShadersStore[glowBlurPostProcessPixelShader.name] = glowBlurPostProcessPixelShader.shader;
ShaderStore.ShadersStore[layerVertexShader.name] = layerVertexShader.shader;
ShaderStore.ShadersStore[layerPixelShader.name] = layerPixelShader.shader;
ShaderStore.ShadersStore[kernelBlurVertexShader.name] = kernelBlurVertexShader.shader;
ShaderStore.ShadersStore[kernelBlurPixelShader.name] = kernelBlurPixelShader.shader;
ShaderStore.ShadersStore[postprocessVertexShader.name] = postprocessVertexShader.shader;
ShaderStore.ShadersStore[passPixelShader.name] = passPixelShader.shader;
ShaderStore.ShadersStore[rgbdDecodePixelShader.name] = rgbdDecodePixelShader.shader;
ShaderStore.ShadersStore[colorVertexShader.name] = colorVertexShader.shader;
ShaderStore.ShadersStore[colorPixelShader.name] = colorPixelShader.shader;
console.info("[aurion:shader-store]", {
  defaultVertex: ShaderStore.ShadersStore.defaultVertexShader?.slice(0, 32),
  defaultPixel: ShaderStore.ShadersStore.defaultPixelShader?.slice(0, 32),
  pbrVertex: ShaderStore.ShadersStore.pbrVertexShader?.slice(0, 32),
  defaultUbo: Boolean(ShaderStore.IncludesShadersStore.defaultUboDeclaration),
  defaultVertexDeclaration: Boolean(ShaderStore.IncludesShadersStore.defaultVertexDeclaration),
  bonesDeclaration: Boolean(ShaderStore.IncludesShadersStore.bonesDeclaration),
  glowMapGenerationVertex: Boolean(ShaderStore.ShadersStore.glowMapGenerationVertexShader),
});

export type GameHandle = { scene: Scene; setCharacterModel: (sourceUrl?: string) => Promise<void>; setArenaModel: (sourceUrl?: string) => Promise<void>; dispose: () => void };

type CommandCode = "W" | "A" | "S" | "D" | "E" | "F" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Pulse = { mesh: Mesh; age: number };
type ArenaDefinition = { name: string; objective: string; health: number; floor: Color3; glow: Color3; sun: Color3; enemy: Color3; reward: string };
type MissionState = { arena: number; arenaName: string; objective: string; sentinelHp: number; sentinelMaxHp: number; explorerHp: number; echoHp: number; shield: boolean; marked: boolean; phase: "active" | "transition" | "quest_ready" | "dungeon_ready" | "victory" };
type TerrainSurfaceKey = "grass" | "flower_meadow" | "earth" | "farmland" | "garden_parcels" | "starpath" | "starpath_crossing";
type WorldPropKind = "flower_shrub" | "starpath_marker" | "garden_border";
type OpenWorldSceneState = { revision: number; zoneId: "observatory_threshold" | "windhollow" | "emberfall" | "cinder_vault"; zoneTier: number; displayName: string; entryNarrative: string; encounter: { activeCount: number; budget: number; maximumVisible: number }; terrain: { chunkSizeMeters: 32; tileSizeMeters: 4; columns: 8; rows: 8; atlas: { sizePixels: 1024; cellsPerAxis: 4; cellPixels: 256; surfaces: readonly TerrainSurfaceKey[] }; roads: { tileCount: number; fieldTileTarget: number; gardenTileTarget: number }; tiles: readonly { x: number; z: number; surface: TerrainSurfaceKey }[] }; props: readonly { kind: WorldPropKind; tileX: number; tileZ: number; rotationY: number; scale: number }[]; npcs: readonly { id: "lyra" | "orun"; displayName: string }[]; globalWorld: { version: "aurion-global-world.v1"; worldId: "echoes-of-aurion-global"; worldSeed: string; epoch: number; unlockedSectorCount: number; nextExpansionAtPlayerCount: number | null; deterministicHash: string } };
type WorldChunkStreamState = { globalWorld: OpenWorldSceneState["globalWorld"]; tier: WorldChunkStreamingTier; center: { x: number; z: number }; chunk: { generation: { worldId: "echoes-of-aurion-global"; coordinate: { x: number; z: number }; baseRevision: 1; baseHash: string }; deltas: readonly WorldChunkDeltaOverlay[]; nextAfterSequence: number; hasMore: boolean } };
type StreamedChunkRoot = { coordinate: { x: number; z: number }; root: TransformNode; lastAccess: number };
type LiveRig = { root: TransformNode; torso: TransformNode; head: TransformNode; arms: TransformNode[]; legs: TransformNode[]; weapon?: TransformNode; halo?: TransformNode; eye?: StandardMaterial; shell?: StandardMaterial; crown?: StandardMaterial };
type SentinelRig = LiveRig & { eye: StandardMaterial; shell: StandardMaterial; crown: StandardMaterial };

const aurion = Color3.FromHexString("#2DE2CF");
const bronze = Color3.FromHexString("#9A7043");
const sandstone = Color3.FromHexString("#A88254");
const ink = Color3.FromHexString("#071B24");

const arenas: ArenaDefinition[] = [
  { name: "Sternwarte Asterion", objective: "Brich den ersten Resonanzanker des Sentinels.", health: 112, floor: Color3.FromHexString("#183B3D"), glow: aurion, sun: Color3.FromHexString("#FFD890"), enemy: Color3.FromHexString("#9A4B35"), reward: "Asterion-Splitter" },
  { name: "Versunkene Archivhalle", objective: "Entschlüssele den Echo-Schlüssel unter gegnerischem Druck.", health: 154, floor: Color3.FromHexString("#29394B"), glow: Color3.FromHexString("#75A8FF"), sun: Color3.FromHexString("#B4C8FF"), enemy: Color3.FromHexString("#7A4FAA"), reward: "Archiv-Siegel" },
  { name: "Solarium der letzten Flamme", objective: "Beende die Resonanz, bevor das Solarium kollabiert.", health: 198, floor: Color3.FromHexString("#473226"), glow: Color3.FromHexString("#F2C15B"), sun: Color3.FromHexString("#FFB34E"), enemy: Color3.FromHexString("#B5422F"), reward: "Aurion-Kern" },
  { name: "Aschengewölbe", objective: "Besiege den Glutwächter und sichere den ersten Dungeonfund.", health: 258, floor: Color3.FromHexString("#241D2B"), glow: Color3.FromHexString("#D976FF"), sun: Color3.FromHexString("#E8A1FF"), enemy: Color3.FromHexString("#61284B"), reward: "Glutwächter-Relikt" },
];

function material(scene: Scene, name: string, diffuse: Color3, emissive?: Color3): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = diffuse;
  result.specularColor = Color3.FromHexString("#24140A");
  result.emissiveColor = emissive ?? Color3.Black();
  return result;
}

const terrainTextureUrls: Record<TerrainSurfaceKey, string> = {
  grass: aurionAssets.terrain.grass,
  flower_meadow: aurionAssets.terrain.flowerMeadow,
  earth: aurionAssets.terrain.earth,
  farmland: aurionAssets.terrain.farmland,
  garden_parcels: aurionAssets.terrain.gardenParcels,
  starpath: aurionAssets.terrain.starpath,
  starpath_crossing: aurionAssets.terrain.starpathCrossing,
};

function terrainMaterial(scene: Scene, name: string, surface: TerrainSurfaceKey, tint: Color3): StandardMaterial {
  const result = material(scene, name, tint, Color3.Black());
  const texture = new Texture(terrainTextureUrls[surface], scene, true, false);
  texture.uScale = 1;
  texture.vScale = 1;
  result.diffuseTexture = texture;
  result.specularColor = Color3.Black();
  return result;
}

function makeExplorer(scene: Scene): LiveRig {
  const root = new TransformNode("explorer-root", scene);
  root.position = new Vector3(-3.2, 0.2, 1.6);
  const armour = material(scene, "explorer-ivory", Color3.FromHexString("#D7D2B5"));
  const trim = material(scene, "explorer-trim", bronze, aurion.scale(0.12));
  const skin = material(scene, "explorer-skin", Color3.FromHexString("#6B4636"));
  const leather = material(scene, "explorer-leather", Color3.FromHexString("#3C2B22"));
  const torso = new TransformNode("explorer-torso", scene); torso.parent = root; torso.position.y = 1.62;
  const body = MeshBuilder.CreateCapsule("explorer-body", { height: 1.18, radius: 0.34, tessellation: 12 }, scene);
  body.parent = torso; body.material = armour;
  const belt = MeshBuilder.CreateTorus("explorer-belt", { diameter: 0.72, thickness: 0.065, tessellation: 14 }, scene);
  belt.parent = torso; belt.position.y = -0.36; belt.rotation.x = Math.PI / 2; belt.material = trim;
  const head = MeshBuilder.CreateSphere("explorer-head", { diameter: 0.48, segments: 12 }, scene);
  head.parent = torso; head.position.y = 0.75; head.material = skin;
  const hood = MeshBuilder.CreateSphere("explorer-hood", { diameterX: 0.58, diameterY: 0.42, diameterZ: 0.54, segments: 12 }, scene);
  hood.parent = torso; hood.position.y = 0.79; hood.scaling.y = 1.15; hood.material = leather;
  const mantle = MeshBuilder.CreateTorus("explorer-mantle", { diameter: 0.88, thickness: 0.1, tessellation: 16 }, scene);
  mantle.parent = torso; mantle.position.y = 0.18; mantle.rotation.x = Math.PI / 2; mantle.material = trim;
  const arms: TransformNode[] = []; const legs: TransformNode[] = [];
  [-1, 1].forEach((side, index) => {
    const shoulder = new TransformNode(`explorer-shoulder-${index}`, scene); shoulder.parent = torso; shoulder.position = new Vector3(side * 0.43, 0.28, 0); shoulder.rotation.z = side * 0.12;
    const upperArm = MeshBuilder.CreateCapsule(`explorer-upper-arm-${index}`, { height: 0.72, radius: 0.115, tessellation: 8 }, scene); upperArm.parent = shoulder; upperArm.position.y = -0.33; upperArm.material = armour;
    const forearm = MeshBuilder.CreateCapsule(`explorer-forearm-${index}`, { height: 0.52, radius: 0.095, tessellation: 8 }, scene); forearm.parent = shoulder; forearm.position = new Vector3(0, -0.76, 0.02); forearm.material = leather;
    const hand = MeshBuilder.CreateSphere(`explorer-hand-${index}`, { diameter: 0.2, segments: 8 }, scene); hand.parent = shoulder; hand.position.y = -1.05; hand.material = skin; arms.push(shoulder);
    const hip = new TransformNode(`explorer-hip-${index}`, scene); hip.parent = root; hip.position = new Vector3(side * 0.19, 1.05, 0); hip.rotation.z = side * 0.025;
    const thigh = MeshBuilder.CreateCapsule(`explorer-thigh-${index}`, { height: 0.84, radius: 0.15, tessellation: 9 }, scene); thigh.parent = hip; thigh.position.y = -0.39; thigh.material = armour;
    const shin = MeshBuilder.CreateCapsule(`explorer-shin-${index}`, { height: 0.68, radius: 0.12, tessellation: 9 }, scene); shin.parent = hip; shin.position = new Vector3(0, -0.98, 0.02); shin.material = leather;
    const boot = MeshBuilder.CreateSphere(`explorer-boot-${index}`, { diameterX: 0.25, diameterY: 0.18, diameterZ: 0.38, segments: 8 }, scene); boot.parent = hip; boot.position = new Vector3(0, -1.34, 0.09); boot.material = trim; legs.push(hip);
  });
  const spear = MeshBuilder.CreateCylinder("explorer-spear", { height: 2.05, diameter: 0.055, tessellation: 8 }, scene);
  spear.parent = arms[1]; spear.position = new Vector3(0.1, -0.68, 0.12); spear.rotation.z = -0.42; spear.rotation.x = 0.14; spear.material = trim;
  const tip = MeshBuilder.CreateCylinder("explorer-spear-tip", { height: 0.32, diameterTop: 0, diameterBottom: 0.18, tessellation: 6 }, scene);
  tip.parent = spear; tip.position.y = 1.12; tip.material = trim;
  return { root, torso, head: torso, arms, legs, weapon: spear };
}

function makeEchoScout(scene: Scene): LiveRig {
  const root = new TransformNode("echo-scout-root", scene);
  root.position = new Vector3(-0.7, 0.2, 0.4);
  const plates = material(scene, "echo-bronze", Color3.FromHexString("#2E665F"), aurion.scale(0.08));
  const glow = material(scene, "echo-core", Color3.FromHexString("#104A50"), aurion);
  const torso = new TransformNode("echo-torso", scene); torso.parent = root; torso.position.y = 1.48;
  const body = MeshBuilder.CreateCapsule("echo-body", { height: 1.05, radius: 0.29, tessellation: 12 }, scene);
  body.parent = torso; body.material = plates;
  const core = MeshBuilder.CreateSphere("echo-aurion-core", { diameter: 0.32, segments: 12 }, scene);
  core.parent = torso; core.position = new Vector3(0, -0.08, -0.29); core.material = glow;
  const head = MeshBuilder.CreateSphere("echo-head", { diameterX: 0.52, diameterY: 0.38, diameterZ: 0.48, segments: 12 }, scene);
  head.parent = torso; head.position.y = 0.68; head.material = plates;
  const halo = MeshBuilder.CreateTorus("echo-halo", { diameter: 0.82, thickness: 0.06, tessellation: 18 }, scene);
  halo.parent = torso; halo.position.y = 0.82; halo.rotation.x = Math.PI / 2; halo.material = glow;
  const arms: TransformNode[] = []; const legs: TransformNode[] = [];
  [-1, 1].forEach((side, index) => {
    const shoulder = new TransformNode(`echo-shoulder-${index}`, scene); shoulder.parent = torso; shoulder.position = new Vector3(side * 0.43, 0.2, 0); shoulder.rotation.z = side * 0.22;
    const shoulderMesh = MeshBuilder.CreateSphere(`echo-shoulder-mesh-${index}`, { diameter: 0.34, segments: 10 }, scene); shoulderMesh.parent = shoulder; shoulderMesh.material = plates;
    const arm = MeshBuilder.CreateCapsule(`echo-arm-${index}`, { height: 0.82, radius: 0.11, tessellation: 8 }, scene);
    arm.parent = shoulder; arm.position.y = -0.41; arm.material = plates; arms.push(shoulder);
    const hip = new TransformNode(`echo-hip-${index}`, scene); hip.parent = root; hip.position = new Vector3(side * 0.17, 1.05, 0);
    const leg = MeshBuilder.CreateCapsule(`echo-leg-${index}`, { height: 0.95, radius: 0.13, tessellation: 8 }, scene); leg.parent = hip; leg.position.y = -0.43; leg.material = plates;
    const foot = MeshBuilder.CreateSphere(`echo-foot-${index}`, { diameterX: 0.25, diameterY: 0.17, diameterZ: 0.34, segments: 8 }, scene); foot.parent = hip; foot.position = new Vector3(0, -0.93, 0.08); foot.material = glow; legs.push(hip);
  });
  return { root, torso, head: torso, arms, legs, halo };
}

function makeSentinel(scene: Scene): SentinelRig {
  const root = new TransformNode("sentinel-root", scene);
  root.position = new Vector3(3.25, 0.15, -1.8);
  const shell = material(scene, "sentinel-shell", Color3.FromHexString("#59493C"));
  const eye = material(scene, "sentinel-eye", Color3.FromHexString("#7A281B"), Color3.FromHexString("#FF744A"));
  const torso = new TransformNode("sentinel-torso", scene); torso.parent = root; torso.position.y = 1.82;
  const body = MeshBuilder.CreateCylinder("sentinel-body", { height: 1.65, diameterTop: 0.72, diameterBottom: 1.02, tessellation: 8 }, scene);
  body.parent = torso; body.material = shell;
  const lens = MeshBuilder.CreateSphere("sentinel-lens", { diameter: 0.36, segments: 12 }, scene);
  lens.parent = torso; lens.position = new Vector3(0, 0.18, -0.56); lens.material = eye;
  const crownMesh = MeshBuilder.CreateTorus("sentinel-crown", { diameter: 1.32, thickness: 0.09, tessellation: 16 }, scene);
  crownMesh.parent = torso; crownMesh.position.y = 0.92; crownMesh.rotation.x = Math.PI / 2; crownMesh.material = shell;
  const arms: TransformNode[] = []; const legs: TransformNode[] = [];
  [-1, 1].forEach((side, index) => {
    const shoulder = new TransformNode(`sentinel-shoulder-${index}`, scene); shoulder.parent = torso; shoulder.position = new Vector3(side * 0.74, 0.46, 0); shoulder.rotation.z = side * 0.24;
    const arm = MeshBuilder.CreateCapsule(`sentinel-arm-${index}`, { height: 1.35, radius: 0.17, tessellation: 8 }, scene); arm.parent = shoulder; arm.position.y = -0.63; arm.material = shell;
    const claw = MeshBuilder.CreatePolyhedron(`sentinel-claw-${index}`, { type: 1, size: 0.32 }, scene); claw.parent = shoulder; claw.position.y = -1.38; claw.material = eye; arms.push(shoulder);
    const hip = new TransformNode(`sentinel-hip-${index}`, scene); hip.parent = root; hip.position = new Vector3(side * 0.32, 1.05, 0);
    const leg = MeshBuilder.CreateCapsule(`sentinel-leg-${index}`, { height: 1.2, radius: 0.22, tessellation: 8 }, scene); leg.parent = hip; leg.position.y = -0.52; leg.material = shell;
    const foot = MeshBuilder.CreateBox(`sentinel-foot-${index}`, { width: 0.42, height: 0.25, depth: 0.6 }, scene); foot.parent = hip; foot.position = new Vector3(0, -1.16, 0.12); foot.material = shell; legs.push(hip);
  });
  const staff = MeshBuilder.CreateCylinder("sentinel-staff", { height: 2.8, diameter: 0.09, tessellation: 8 }, scene);
  staff.parent = arms[0]; staff.position = new Vector3(0.05, -0.72, 0.1); staff.rotation.z = 0.18; staff.material = shell;
  return { root, torso, head: torso, arms, legs, weapon: staff, eye, shell, crown: shell };
}

function animateExplorer(rig: LiveRig, time: number, moving: number, attacking: boolean, hurt: boolean): void {
  const stride = Math.sin(time * (moving > 0.1 ? 10 : 2.2)) * (moving > 0.1 ? 0.62 : 0.045);
  rig.legs.forEach((leg, index) => { leg.rotation.x = (index === 0 ? stride : -stride); leg.rotation.z = (index === 0 ? -0.025 : 0.025); });
  rig.arms.forEach((arm, index) => { arm.rotation.x = (index === 0 ? -stride * 0.52 : stride * 0.52) + (attacking && index === 1 ? -1.08 : 0); arm.rotation.z = (index === 0 ? -0.12 : 0.12) + (attacking && index === 1 ? 0.18 : 0); });
  rig.torso.rotation.z = Math.sin(time * 2.2) * 0.025 + (hurt ? -0.16 : 0);
  rig.torso.rotation.x = attacking ? -0.18 : 0;
  rig.root.scaling.y = hurt ? 0.92 : 1;
  if (rig.weapon) rig.weapon.rotation.x = attacking ? -0.68 : 0.14;
}

function animateEcho(rig: LiveRig, time: number, moving: boolean, acting: boolean, hurt: boolean): void {
  const float = Math.sin(time * 2.5) * 0.07;
  rig.torso.position.y = 1.48 + float;
  rig.legs.forEach((leg, index) => { leg.rotation.x = moving ? Math.sin(time * 9 + index * Math.PI) * 0.42 : Math.sin(time * 2 + index) * 0.045; });
  rig.arms.forEach((arm, index) => { arm.rotation.z = (index === 0 ? -0.22 : 0.22) + (acting ? (index === 0 ? -0.34 : 0.34) : 0); arm.rotation.x = acting ? -0.48 : Math.sin(time * 2 + index) * 0.12; });
  rig.halo?.rotation.y && (rig.halo.rotation.y = time * 1.8);
  rig.torso.rotation.z = hurt ? 0.13 : Math.sin(time * 1.8) * 0.045;
  rig.root.scaling.setAll(hurt ? 0.9 : 1);
}

function animateSentinel(rig: SentinelRig, time: number, moving: boolean, attacking: boolean, hurt: boolean): void {
  const stride = Math.sin(time * (moving ? 8.4 : 1.25)) * (moving ? 0.42 : 0.11);
  const sway = Math.sin(time * 1.25) * 0.1;
  rig.legs.forEach((leg, index) => { leg.rotation.x = index === 0 ? stride : -stride; });
  rig.arms.forEach((arm, index) => { arm.rotation.z = (index === 0 ? -0.24 : 0.24) + (attacking ? (index === 0 ? -0.42 : 0.42) : 0); arm.rotation.x = attacking ? -0.62 : sway; });
  rig.torso.rotation.z = hurt ? Math.sin(time * 28) * 0.13 : 0;
  rig.torso.rotation.x = attacking ? 0.18 : 0;
  rig.torso.position.y = 1.82 + (moving ? Math.abs(stride) * 0.12 : 0);
  rig.root.scaling.setAll(hurt ? 0.94 : 1);
  rig.eye.emissiveColor = hurt ? Color3.FromHexString("#FFF1AA") : rig.eye.diffuseColor;
}

function makeRuin(scene: Scene, group: TransformNode, position: Vector3, scale: number, rotation = 0, tone = sandstone): void {
  const stone = material(scene, `ruin-${group.name}-${position.x}`, tone);
  const cap = material(scene, `ruin-cap-${group.name}-${position.x}`, bronze, aurion.scale(0.04));
  const base = MeshBuilder.CreateCylinder(`ruin-base-${group.name}-${position.x}`, { height: 0.42 * scale, diameter: 1.7 * scale, tessellation: 10 }, scene);
  base.parent = group; base.position = position.add(new Vector3(0, 0.21 * scale, 0)); base.material = stone;
  const column = MeshBuilder.CreateCylinder(`ruin-column-${group.name}-${position.x}`, { height: 2.4 * scale, diameterTop: 0.38 * scale, diameterBottom: 0.55 * scale, tessellation: 10 }, scene);
  column.parent = group; column.position = position.add(new Vector3(0, 1.38 * scale, 0)); column.material = stone;
  const ring = MeshBuilder.CreateTorus(`ruin-ring-${group.name}-${position.x}`, { diameter: 1.55 * scale, thickness: 0.12 * scale, tessellation: 18 }, scene);
  ring.parent = group; ring.position = position.add(new Vector3(0, 2.58 * scale, 0)); ring.rotation = new Vector3(Math.PI / 2.3, rotation, 0); ring.material = cap;
}

function makeArenaSet(scene: Scene): TransformNode[] {
  const astronomic = new TransformNode("arena-asterion", scene);
  makeRuin(scene, astronomic, new Vector3(-5.2, 0, -3.2), 1.05, 0.2);
  makeRuin(scene, astronomic, new Vector3(5.1, 0, 2.9), 0.86, -0.45);
  const archive = new TransformNode("arena-archive", scene);
  makeRuin(scene, archive, new Vector3(-4.9, 0, 4.3), 0.9, -0.8, Color3.FromHexString("#60739C"));
  makeRuin(scene, archive, new Vector3(4.75, 0, -4.15), 0.8, 1.1, Color3.FromHexString("#536E8B"));
  for (let index = 0; index < 5; index += 1) {
    const tablet = MeshBuilder.CreateBox(`archive-tablet-${index}`, { width: 0.22, height: 1.5 + index * 0.12, depth: 0.92 }, scene);
    tablet.parent = archive; tablet.position = new Vector3(-4.7 + index * 2.2, 0.78, -4.5 + (index % 2) * 8.8); tablet.rotation.y = index * 0.34;
    tablet.material = material(scene, `archive-tablet-mat-${index}`, Color3.FromHexString("#3E5671"), Color3.FromHexString("#274D90"));
  }
  const solarium = new TransformNode("arena-solarium", scene);
  makeRuin(scene, solarium, new Vector3(-5.0, 0, -4.2), 0.92, 0.5, Color3.FromHexString("#B35E32"));
  makeRuin(scene, solarium, new Vector3(5.0, 0, 3.9), 0.97, -0.8, Color3.FromHexString("#9E4D2C"));
  for (let index = 0; index < 6; index += 1) {
    const flame = MeshBuilder.CreatePolyhedron(`solar-shard-${index}`, { type: 1, size: 0.45 + (index % 2) * 0.18 }, scene);
    flame.parent = solarium; flame.position = new Vector3(Math.cos(index) * 5.6, 1.45 + (index % 3) * 0.45, Math.sin(index) * 5.6);
    flame.material = material(scene, `solar-shard-mat-${index}`, Color3.FromHexString("#5B2B22"), Color3.FromHexString("#F4A13D"));
  }
  const dungeon = new TransformNode("arena-cinder-vault", scene);
  makeRuin(scene, dungeon, new Vector3(-4.8, 0, -3.6), 1.04, 0.35, Color3.FromHexString("#5D3F70"));
  makeRuin(scene, dungeon, new Vector3(4.7, 0, 3.5), 0.94, -0.6, Color3.FromHexString("#4C315E"));
  for (let index = 0; index < 8; index += 1) {
    const ember = MeshBuilder.CreateSphere(`dungeon-ember-${index}`, { diameter: 0.23 + (index % 3) * 0.08, segments: 8 }, scene);
    ember.parent = dungeon; ember.position = new Vector3(Math.cos(index * 0.78) * 5.7, 0.72 + (index % 4) * 0.38, Math.sin(index * 0.78) * 4.8);
    ember.material = material(scene, `dungeon-ember-mat-${index}`, Color3.FromHexString("#402046"), Color3.FromHexString("#D976FF"));
  }
  archive.setEnabled(false); solarium.setEnabled(false); dungeon.setEnabled(false);
  return [astronomic, archive, solarium, dungeon];
}

function emitGameEvent(kind: string, detail: string, audio?: AudioEvent): void {
  window.dispatchEvent(new CustomEvent("aurion:game-event", { detail: { kind, detail, ...(audio ? { audio } : {}) } }));
}
function emitAudioCue(audio: AudioEvent): void {
  window.dispatchEvent(new CustomEvent("aurion:audio-cue", { detail: audio }));
}
export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.012, 0.06, 0.082, 1);
  const camera = new ArcRotateCamera("expedition-camera", -2.27, 1.05, 20.5, new Vector3(0, 0.9, 0), scene);
  camera.lowerRadiusLimit = 14; camera.upperRadiusLimit = 23; camera.lowerBetaLimit = 0.73; camera.upperBetaLimit = 1.24; camera.wheelDeltaPercentage = 0.012; camera.attachControl(canvas, true);
  const sky = new HemisphericLight("sky-light", new Vector3(0.2, 1, 0.4), scene);
  sky.intensity = 1.1; sky.diffuse = Color3.FromHexString("#70D4C6"); sky.groundColor = ink;
  const sun = new DirectionalLight("sun-light", new Vector3(-0.5, -1, 0.35), scene);
  sun.position = new Vector3(4, 12, -4); sun.intensity = 2.2; sun.diffuse = arenas[0].sun;
  const beaconLight = new PointLight("beacon-light", new Vector3(0, 3.2, 0), scene);
  beaconLight.diffuse = arenas[0].glow; beaconLight.intensity = 9; beaconLight.range = 13;
  const groundMat = material(scene, "observatory-floor", arenas[0].floor);
  const ground = MeshBuilder.CreateCylinder("star-observatory", { height: 0.36, diameter: 14.6, tessellation: 48 }, scene);
  ground.material = groundMat; ground.position.y = -0.18;
  const innerRing = MeshBuilder.CreateTorus("observatory-ring", { diameter: 10.9, thickness: 0.11, tessellation: 48 }, scene);
  innerRing.position.y = 0.04; innerRing.rotation.x = Math.PI / 2;
  const ringMat = material(scene, "observatory-ring-mat", bronze, arenas[0].glow.scale(0.18)); innerRing.material = ringMat;
  const beacon = MeshBuilder.CreatePolyhedron("aurion-beacon", { type: 1, size: 0.62 }, scene);
  beacon.position = new Vector3(0, 2.18, 0); beacon.rotation = new Vector3(0.4, 0.3, 0);
  const beaconMat = material(scene, "beacon-mat", Color3.FromHexString("#0D5659"), arenas[0].glow); beacon.material = beaconMat;
  const beaconStem = MeshBuilder.CreateCylinder("beacon-stem", { height: 3.5, diameterTop: 0.15, diameterBottom: 0.7, tessellation: 8 }, scene);
  beaconStem.position.y = 1.6; beaconStem.material = material(scene, "beacon-stem-mat", bronze);
  const arenaSets = makeArenaSet(scene);
  for (let index = 0; index < 10; index += 1) {
    const angle = index * 0.63; const radius = 7.8 + (index % 2) * 1.4;
    const shard = MeshBuilder.CreatePolyhedron(`floating-shard-${index}`, { type: 2, size: 0.65 + (index % 3) * 0.18 }, scene);
    shard.position = new Vector3(Math.cos(angle) * radius, 2.1 + (index % 4) * 0.5, Math.sin(angle) * radius);
    shard.rotation = new Vector3(index * 0.21, index * 0.44, index * 0.17);
    shard.material = material(scene, `shard-mat-${index}`, index % 2 ? sandstone : bronze, index % 3 === 0 ? aurion.scale(0.18) : undefined);
  }

  const explorerRig = makeExplorer(scene); const echoRig = makeEchoScout(scene); const sentinel = makeSentinel(scene);
  const explorer = explorerRig.root; const echo = echoRig.root;
  const baseExplorerNodes = [explorerRig.torso, ...explorerRig.arms, ...explorerRig.legs, explorerRig.weapon].filter((node): node is TransformNode => Boolean(node));
  let customCharacterRoot: TransformNode | null = null;
  let customCharacterAnimations: AnimationGroup[] = [];
  let customArenaRoot: TransformNode | null = null;
  const setArenaModel = async (sourceUrl?: string): Promise<void> => {
    customArenaRoot?.dispose(false, true);
    customArenaRoot = null;
    if (!sourceUrl) return;
    const result = await SceneLoader.ImportMeshAsync("", "", sourceUrl, scene);
    const topLevelMeshes = result.meshes.filter(mesh => mesh.getTotalVertices() > 0 && !mesh.parent);
    if (!topLevelMeshes.length) throw new Error("Das freigegebene Arenaasset enthält keine sichtbare Topologie.");
    const root = new TransformNode("community-approved-arena-asset", scene);
    root.parent = arenaSets[0];
    topLevelMeshes.forEach(mesh => { mesh.parent = root; });
    const bounds = topLevelMeshes.map(mesh => mesh.getBoundingInfo().boundingBox);
    let minimum = bounds[0]!.minimumWorld.clone(); let maximum = bounds[0]!.maximumWorld.clone();
    bounds.slice(1).forEach(bound => { minimum = Vector3.Minimize(minimum, bound.minimumWorld); maximum = Vector3.Maximize(maximum, bound.maximumWorld); });
    const span = maximum.subtract(minimum);
    const scale = 2.8 / Math.max(0.1, span.x, span.z);
    root.scaling.setAll(scale); root.position = new Vector3(0, -minimum.y * scale + 0.012, -4.9); root.rotation.y = Math.PI;
    customArenaRoot = root;
  };
  const setCharacterModel = async (sourceUrl?: string): Promise<void> => {
    customCharacterAnimations.forEach(group => { group.stop(); group.dispose(); });
    customCharacterAnimations = [];
    customCharacterRoot?.dispose(false, true);
    customCharacterRoot = null;
    baseExplorerNodes.forEach(node => node.setEnabled(true));
    if (!sourceUrl) return;
    try {
      const result = await SceneLoader.ImportMeshAsync("", "", sourceUrl, scene);
      const root = new TransformNode("player-approved-character", scene);
      root.parent = explorer;
      root.position = new Vector3(0, 0, 0);
      const topLevelMeshes = result.meshes.filter(mesh => !mesh.parent);
      topLevelMeshes.forEach(mesh => { mesh.parent = root; });
      if (!topLevelMeshes.length) throw new Error("Das Charaktermodell enthält keine sichtbare Topologie.");
      const bounds = topLevelMeshes.map(mesh => mesh.getBoundingInfo().boundingBox);
      let minimum = bounds[0]!.minimumWorld.clone(); let maximum = bounds[0]!.maximumWorld.clone();
      bounds.slice(1).forEach(bound => { minimum = Vector3.Minimize(minimum, bound.minimumWorld); maximum = Vector3.Maximize(maximum, bound.maximumWorld); });
      const height = Math.max(0.1, maximum.y - minimum.y);
      root.scaling.setAll(1.95 / height);
      root.position.y = -minimum.y * root.scaling.y;
      customCharacterRoot = root;
      customCharacterAnimations = result.animationGroups;
      const idle = customCharacterAnimations.find(group => /idle/i.test(group.name)) ?? customCharacterAnimations[0];
      idle?.start(true, 1);
      baseExplorerNodes.forEach(node => node.setEnabled(false));
    } catch (error) {
      customCharacterRoot?.dispose(false, true);
      customCharacterRoot = null;
      customCharacterAnimations = [];
      baseExplorerNodes.forEach(node => node.setEnabled(true));
      throw error;
    }
  };
  const tether = MeshBuilder.CreateLines("team-tether", { points: [explorer.position.add(new Vector3(0, 1.1, 0)), echo.position.add(new Vector3(0, 1.2, 0))], updatable: true }, scene);
  tether.color = aurion;
  const keys = new Set<string>(); const pulses: Pulse[] = [];
  let companionSpawned = false;
  let started = false; let elapsed = 0; let arenaIndex = 0; let sentinelHp = arenas[0].health; let explorerHp = 100; let echoHp = 100;
  let echoTarget = echo.position.clone(); let shieldTime = 0; let markTime = 0; let actionHeat = 0; let nextEnemyStrike = 4.2; let transitioning = false; let victory = false; let awaitingQuest = false; let dungeonUnlocked = false; let dungeonActive = false; let lastStateEmit = -1;
  let explorerAttackUntil = 0; let explorerHurtUntil = 0; let explorerMotionUntil = 0; let echoActionUntil = 0; let echoHurtUntil = 0; let sentinelAttackUntil = 0; let sentinelHurtUntil = 0; let sentinelMoving = false;
  let authoritativeZoneUserId: number | null = null;
  let authoritativeExplorerTarget: Vector3 | null = null;
  let openWorldActive = false; let openWorldRoot: TransformNode | null = null; let activeGlobalWorldHash: string | null = null; let activeStreamingTier: WorldChunkStreamingTier = "phone"; let activeStreamingCenter = { x: 0, z: 0 }; let streamedChunkAccess = 0; const streamedChunkRoots = new Map<string, StreamedChunkRoot>(); const streamedChunkDeltaCache = new Map<string, Map<string, WorldChunkDeltaOverlay>>(); let worldNpcTargets: { id: "lyra" | "orun"; displayName: string; position: Vector3; root: TransformNode }[] = [];
  // Confirmed world props use deterministic procedural geometry; broken GLB candidates are not requested.

  const createPulse = (at: Vector3, color: Color3, size = 0.54): void => {
    const ring = MeshBuilder.CreateTorus(`command-pulse-${Date.now()}-${pulses.length}`, { diameter: size, thickness: 0.055, tessellation: 24 }, scene);
    ring.position = at.clone(); ring.rotation.x = Math.PI / 2; ring.material = material(scene, `command-pulse-mat-${Date.now()}-${pulses.length}`, color.scale(0.2), color); pulses.push({ mesh: ring, age: 0 });
  };
  const emitState = (force = false): void => {
    if (!force && elapsed - lastStateEmit < 0.16) return;
    lastStateEmit = elapsed;
    const arena = arenas[arenaIndex];
    const state: MissionState = { arena: arenaIndex, arenaName: arena.name, objective: victory ? "Aurion ist stabilisiert. Der Weg zum Himmelsarchiv ist offen." : dungeonUnlocked && !dungeonActive ? "Lyra hat den Glutschlüssel geborgen. Öffne das Aschengewölbe." : awaitingQuest ? "Der Sieg ist bestätigt. Kehre zum Questgeber zurück, um die nächste Resonanz freizugeben." : arena.objective, sentinelHp: Math.max(0, sentinelHp), sentinelMaxHp: arena.health, explorerHp: Math.max(0, explorerHp), echoHp: Math.max(0, echoHp), shield: shieldTime > 0, marked: markTime > 0, phase: victory ? "victory" : dungeonUnlocked && !dungeonActive ? "dungeon_ready" : awaitingQuest ? "quest_ready" : transitioning ? "transition" : "active" };
    window.dispatchEvent(new CustomEvent("aurion:mission-state", { detail: state }));
  };
  const applyArena = (index: number): void => {
    arenaIndex = index; const arena = arenas[index]; sentinelHp = arena.health; shieldTime = 0; markTime = 0; nextEnemyStrike = elapsed + 4.6;
    arenaSets.forEach((set, setIndex) => set.setEnabled(setIndex === index));
    groundMat.diffuseColor = arena.floor; ringMat.emissiveColor = arena.glow.scale(0.23); beaconMat.emissiveColor = arena.glow; beaconLight.diffuse = arena.glow; sun.diffuse = arena.sun;
    sentinel.shell.diffuseColor = arena.enemy.scale(0.58); sentinel.eye.diffuseColor = arena.enemy; sentinel.eye.emissiveColor = arena.glow; sentinel.crown.emissiveColor = arena.glow.scale(0.08);
    sentinel.root.position = new Vector3(3.25, 0.15, -1.8); echoTarget = echo.position.clone(); createPulse(new Vector3(0, 0.15, 0), arena.glow, 1.15);
    emitGameEvent("system", `${arena.name} entfaltet sich. Ziel: ${arena.objective}`); emitState(true);
  };
  const clearOpenWorld = (): void => {
    streamedChunkRoots.forEach(entry => entry.root.dispose(false, true));
    streamedChunkRoots.clear();
    streamedChunkDeltaCache.clear();
    streamedChunkAccess = 0;
    activeGlobalWorldHash = null;
    openWorldRoot?.dispose(false, true);
    openWorldRoot = null;
    worldNpcTargets = [];
    openWorldActive = false;
    scene.fogMode = Scene.FOGMODE_NONE;
    camera.lowerRadiusLimit = 14; camera.upperRadiusLimit = 23; camera.radius = 20.5;
    emitWorldChunkMetrics("cleared");
  };
  const showTowerHome = (): void => {
    clearOpenWorld();
    started = false; transitioning = false; victory = false; awaitingQuest = false; dungeonUnlocked = false; dungeonActive = false;
    arenaIndex = 0; sentinelHp = arenas[0].health; explorerHp = 100; echoHp = 100;
    arenaSets.forEach(set => set.setEnabled(false));
    sentinel.root.setEnabled(false);
    groundMat.diffuseColor = Color3.FromHexString("#17363B"); ringMat.emissiveColor = aurion.scale(0.18); beaconMat.emissiveColor = aurion; beaconLight.diffuse = aurion; sun.diffuse = Color3.FromHexString("#FFD890");
    explorer.position = new Vector3(-3.2, 0.2, 1.6); echo.position = new Vector3(-0.7, 0.2, 0.4); echoTarget = echo.position.clone();
    window.dispatchEvent(new CustomEvent("aurion:boss-encounter", { detail: { active: false } }));
  };
  const trimStreamedChunkCache = (): void => {
    const plan = planWorldChunkCache({ center: activeStreamingCenter, tier: activeStreamingTier, cached: Array.from(streamedChunkRoots.values()).map(entry => ({ coordinate: entry.coordinate, lastAccess: entry.lastAccess })) });
    plan.evict.forEach(coordinate => {
      const key = worldChunkCoordinateKey(coordinate);
      const entry = streamedChunkRoots.get(key);
      if (entry) { entry.root.dispose(false, true); streamedChunkRoots.delete(key); streamedChunkDeltaCache.delete(key); }
    });
  };
  const emitWorldChunkMetrics = (phase: "streamed" | "cleared"): void => {
    const visibleKeys = new Set(orderedWorldChunkWindow(activeStreamingCenter, worldChunkStreamingBudget(activeStreamingTier).visibleRadius).map(worldChunkCoordinateKey));
    const entries = Array.from(streamedChunkRoots.entries());
    const visibleChunkRootCount = entries.filter(([key]) => visibleKeys.has(key)).length;
    const visibleDeltaOverlayCount = Array.from(streamedChunkDeltaCache.entries()).filter(([key]) => visibleKeys.has(key)).reduce((total, [, receipts]) => total + receipts.size, 0);
    const totalDeltaOverlayCount = Array.from(streamedChunkDeltaCache.values()).reduce((total, receipts) => total + receipts.size, 0);
    window.dispatchEvent(new CustomEvent("aurion:world-chunk-metrics", { detail: {
      phase,
      tier: activeStreamingTier,
      center: { ...activeStreamingCenter },
      visibleChunkRootCount,
      cachedChunkRootCount: streamedChunkRoots.size,
      visibleDeltaOverlayCount,
      cachedDeltaOverlayCount: totalDeltaOverlayCount,
      sceneMeshCount: scene.meshes.length,
      sceneVertexCount: scene.meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0),
    } }));
  };
  const renderConfirmedWorldChunk = (state: WorldChunkStreamState): void => {
    if (!openWorldRoot || !Number.isSafeInteger(state.chunk.generation.coordinate.x) || !Number.isSafeInteger(state.chunk.generation.coordinate.z) || state.chunk.generation.baseRevision !== WORLD_CHUNK_BASE_REVISION) return;
    const expectedWindow = orderedWorldChunkWindow(state.center, worldChunkStreamingBudget(state.tier).visibleRadius);
    if (!expectedWindow.some(coordinate => coordinate.x === state.chunk.generation.coordinate.x && coordinate.z === state.chunk.generation.coordinate.z)) return;
    const base = generateBaseWorldChunk({ worldId: state.globalWorld.worldId, worldSeed: state.globalWorld.worldSeed, coordinate: state.chunk.generation.coordinate });
    if (base.deterministicHash !== state.chunk.generation.baseHash) { emitGameEvent("warning", "Der bestätigte Chunksnapshot passt nicht zur lokalen Seedbasis und wurde nicht gerendert."); return; }
    const centerChanged = state.center.x !== activeStreamingCenter.x || state.center.z !== activeStreamingCenter.z;
    activeStreamingTier = state.tier;
    activeStreamingCenter = { ...state.center };
    if (centerChanged) streamedChunkRoots.forEach(entry => { entry.root.position.x = (entry.coordinate.x - state.center.x) * 64; entry.root.position.z = (entry.coordinate.z - state.center.z) * 64; });
    const horizon = worldChunkHorizonProfile(state.tier);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = Color3.FromHexString("#061820");
    scene.fogStart = horizon.fogStartMeters;
    scene.fogEnd = horizon.fogEndMeters;
    camera.lowerRadiusLimit = horizon.cameraRadiusMeters * 0.72; camera.upperRadiusLimit = horizon.cameraRadiusMeters * 1.12; camera.radius = horizon.cameraRadiusMeters; camera.setTarget(Vector3.Zero());
    const key = worldChunkCoordinateKey(base.coordinate);
    const previous = streamedChunkRoots.get(key);
    previous?.root.dispose(false, true);
    const root = new TransformNode(`confirmed-chunk-${base.coordinate.x}-${base.coordinate.z}`, scene);
    root.parent = openWorldRoot;
    root.position = new Vector3((base.coordinate.x - state.center.x) * 64, 0, (base.coordinate.z - state.center.z) * 64);
    streamedChunkRoots.set(key, { coordinate: { ...base.coordinate }, root, lastAccess: ++streamedChunkAccess });
    const surfaceColors: Record<typeof base.tiles[number]["surface"], Color3> = {
      grass: Color3.FromHexString("#2E6D51"), forest_floor: Color3.FromHexString("#1D4938"), riverbank: Color3.FromHexString("#407579"), stone: Color3.FromHexString("#67717A"), ash: Color3.FromHexString("#614C50"), ruin_path: Color3.FromHexString("#806B52"),
    };
    const tilesBySurface = base.tiles.reduce<Record<typeof base.tiles[number]["surface"], Array<(typeof base.tiles)[number]>>>((groups, tile) => { groups[tile.surface].push(tile); return groups; }, { grass: [], forest_floor: [], riverbank: [], stone: [], ash: [], ruin_path: [] });
    (Object.keys(tilesBySurface) as Array<typeof base.tiles[number]["surface"]>).forEach(surface => {
      const tiles = tilesBySurface[surface];
      if (!tiles.length) return;
      const first = tiles[0]!;
      const source = MeshBuilder.CreateGround(`confirmed-chunk-ground-${base.coordinate.x}-${base.coordinate.z}-${surface}`, { width: 4, height: 4, subdivisions: 1 }, scene);
      source.parent = root;
      source.position = new Vector3((first.x - 7.5) * 4, first.heightMm / 1_000, (first.z - 7.5) * 4);
      source.material = material(scene, `confirmed-chunk-ground-mat-${base.coordinate.x}-${base.coordinate.z}-${surface}`, surfaceColors[surface], surface === "ruin_path" ? bronze.scale(0.08) : undefined);
      tiles.slice(1).forEach(tile => source.thinInstanceAdd(Matrix.Translation((tile.x - first.x) * 4, (tile.heightMm - first.heightMm) / 1_000, (tile.z - first.z) * 4)));
    });
    const depleted = new Set(state.chunk.deltas.filter(delta => delta.kind === "resource_depleted").map(delta => delta.targetId));
    base.resources.filter(resource => !depleted.has(resource.id)).forEach((resource, index) => {
      const x = resource.positionMm.x / 1_000 - 32; const z = resource.positionMm.z / 1_000 - 32;
      const resourceColor = resource.kind === "tree" ? Color3.FromHexString("#2D7A55") : resource.kind === "ore" ? Color3.FromHexString("#7D91B0") : resource.kind === "water" ? Color3.FromHexString("#57C8D5") : Color3.FromHexString("#A8C86A");
      const marker = resource.kind === "tree" ? MeshBuilder.CreateCylinder(`confirmed-resource-${base.coordinate.x}-${base.coordinate.z}-${resource.id}`, { height: 2.6, diameterTop: 0.15, diameterBottom: 1.2, tessellation: 6 }, scene) : MeshBuilder.CreatePolyhedron(`confirmed-resource-${base.coordinate.x}-${base.coordinate.z}-${resource.id}`, { type: index % 3, size: 0.52 }, scene);
      marker.parent = root; marker.position = new Vector3(x, resource.kind === "tree" ? 1.32 : 0.48, z); marker.material = material(scene, `confirmed-resource-mat-${base.coordinate.x}-${base.coordinate.z}-${resource.id}`, resourceColor, resource.kind === "water" ? resourceColor.scale(0.45) : undefined);
    });
    const orderedOverlays = state.chunk.deltas.slice().sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
    const removedStructures = new Set(orderedOverlays.filter(delta => delta.kind === "structure_removed").map(delta => delta.targetId));
    const visibleStructures = orderedOverlays.filter(delta => delta.kind === "structure_placed" && !removedStructures.has(delta.targetId)).slice(0, 24);
    visibleStructures.forEach(delta => {
      const x = delta.payload.xMm; const z = delta.payload.zMm;
      if (typeof x !== "number" || typeof z !== "number" || !Number.isSafeInteger(x) || !Number.isSafeInteger(z) || x < 0 || z < 0 || x >= 64_000 || z >= 64_000) return;
      const structure = MeshBuilder.CreateBox(`confirmed-structure-${delta.id}`, { width: 2.5, height: 2.8, depth: 2.5 }, scene);
      structure.parent = root; structure.position = new Vector3(x / 1_000 - 32, 1.4, z / 1_000 - 32); structure.material = material(scene, `confirmed-structure-mat-${delta.id}`, sandstone, aurion.scale(0.15));
    });
    const roadLines = orderedOverlays.filter(delta => delta.kind === "road_built").flatMap(delta => {
      const fromX = delta.payload.fromXmm; const fromZ = delta.payload.fromZmm; const toX = delta.payload.toXmm; const toZ = delta.payload.toZmm;
      if (typeof fromX !== "number" || typeof fromZ !== "number" || typeof toX !== "number" || typeof toZ !== "number" || !Number.isSafeInteger(fromX) || !Number.isSafeInteger(fromZ) || !Number.isSafeInteger(toX) || !Number.isSafeInteger(toZ) || fromX < 0 || fromZ < 0 || toX < 0 || toZ < 0 || fromX >= 64_000 || fromZ >= 64_000 || toX >= 64_000 || toZ >= 64_000) return [];
      return [[new Vector3(fromX / 1_000 - 32, 0.12, fromZ / 1_000 - 32), new Vector3(toX / 1_000 - 32, 0.12, toZ / 1_000 - 32)]];
    });
    if (roadLines.length) {
      const road = MeshBuilder.CreateLineSystem(`confirmed-roads-${base.coordinate.x}-${base.coordinate.z}`, { lines: roadLines }, scene);
      road.parent = root; road.color = Color3.FromHexString("#D6B374");
    }
    const boundary = MeshBuilder.CreateTorus(`confirmed-chunk-boundary-${base.coordinate.x}-${base.coordinate.z}`, { diameter: 90, thickness: 0.08, tessellation: 64 }, scene);
    boundary.parent = root; boundary.position.y = 0.22; boundary.rotation.x = Math.PI / 2; boundary.material = material(scene, `confirmed-chunk-boundary-mat-${base.coordinate.x}-${base.coordinate.z}`, bronze, aurion.scale(0.32));
    trimStreamedChunkCache();
    emitWorldChunkMetrics("streamed");
    emitGameEvent("system", `Seed-Chunk ${base.coordinate.x}:${base.coordinate.z} ist bestätigt; ${state.chunk.deltas.length} aktuelle Delta-Overlays liegen vor, ${streamedChunkRoots.size} Chunks sind im LRU-Cache.`);
  };
  const createOpenWorldVisuals = (detail: OpenWorldSceneState): void => {
    clearOpenWorld();
    openWorldActive = true;
    const root = new TransformNode(`expanse-${detail.zoneId}`, scene);
    openWorldRoot = root;
    activeGlobalWorldHash = detail.globalWorld.deterministicHash;
    const zoneColors = {
      observatory_threshold: { floor: Color3.FromHexString("#17363B"), accent: aurion, stone: Color3.FromHexString("#8C6A45") },
      windhollow: { floor: Color3.FromHexString("#173A35"), accent: Color3.FromHexString("#4EEEDB"), stone: Color3.FromHexString("#5B766A") },
      emberfall: { floor: Color3.FromHexString("#3D2D25"), accent: Color3.FromHexString("#F2B85B"), stone: Color3.FromHexString("#8A5942") },
      cinder_vault: { floor: Color3.FromHexString("#292031"), accent: Color3.FromHexString("#D976FF"), stone: Color3.FromHexString("#57435E") },
    }[detail.zoneId];
    const groupedTiles = detail.terrain.tiles.reduce<Record<TerrainSurfaceKey, { x: number; z: number }[]>>((groups, tile) => {
      groups[tile.surface].push(tile);
      return groups;
    }, { grass: [], flower_meadow: [], earth: [], farmland: [], garden_parcels: [], starpath: [], starpath_crossing: [] });
    const terrainTint: Record<TerrainSurfaceKey, Color3> = {
      grass: zoneColors.floor.scale(1.35), flower_meadow: zoneColors.floor.scale(1.48), earth: zoneColors.stone.scale(0.86), farmland: Color3.FromHexString("#8C6540"), garden_parcels: Color3.FromHexString("#6D5A36"), starpath: zoneColors.stone.scale(0.92), starpath_crossing: zoneColors.accent.scale(0.62),
    };
    (Object.keys(groupedTiles) as TerrainSurfaceKey[]).forEach(surface => {
      const tiles = groupedTiles[surface];
      if (!tiles.length) return;
      const first = tiles[0];
      const source = MeshBuilder.CreateGround(`expanse-terrain-${detail.zoneId}-${surface}`, { width: detail.terrain.tileSizeMeters, height: detail.terrain.tileSizeMeters, subdivisions: 1 }, scene);
      source.parent = root;
      source.position = new Vector3((first.x - 3.5) * detail.terrain.tileSizeMeters, 0, (first.z - 3.5) * detail.terrain.tileSizeMeters);
      source.material = terrainMaterial(scene, `expanse-terrain-mat-${detail.zoneId}-${surface}`, surface, terrainTint[surface]);
      tiles.slice(1).forEach(tile => source.thinInstanceAdd(Matrix.Translation((tile.x - first.x) * detail.terrain.tileSizeMeters, 0, (tile.z - first.z) * detail.terrain.tileSizeMeters)));
    });
    detail.props.forEach((prop, index) => {
      const position = new Vector3((prop.tileX - 3.5) * detail.terrain.tileSizeMeters, 0.25, (prop.tileZ - 3.5) * detail.terrain.tileSizeMeters);
      const height = prop.kind === "starpath_marker" ? 2.35 : prop.kind === "garden_border" ? 0.9 : 1.5;
      const propMesh = prop.kind === "flower_shrub"
        ? MeshBuilder.CreateSphere(`expanse-prop-${detail.zoneId}-${index}`, { diameter: height, segments: 8 }, scene)
        : MeshBuilder.CreateCylinder(`expanse-prop-${detail.zoneId}-${index}`, { height, diameterTop: 0.28, diameterBottom: 0.62, tessellation: 6 }, scene);
      propMesh.parent = root;
      propMesh.position = position.add(new Vector3(0, height / 2, 0));
      propMesh.rotation.y = prop.rotationY;
      propMesh.scaling.setAll(prop.scale);
      propMesh.material = material(scene, `expanse-prop-mat-${detail.zoneId}-${index}`, prop.kind === "flower_shrub" ? zoneColors.accent.scale(0.55) : zoneColors.stone, zoneColors.accent.scale(0.1));
    });
    const portal = MeshBuilder.CreateTorus(`expanse-return-${detail.zoneId}`, { diameter: 2.65, thickness: 0.11, tessellation: 36 }, scene);
    portal.parent = root; portal.position = new Vector3(-5.25, 1.5, 3.5); portal.rotation.x = Math.PI / 2; portal.material = material(scene, `expanse-return-mat-${detail.zoneId}`, zoneColors.accent.scale(0.25), zoneColors.accent);
    const portalLight = new PointLight(`expanse-return-light-${detail.zoneId}`, new Vector3(-5.25, 1.35, 3.5), scene); portalLight.parent = root; portalLight.diffuse = zoneColors.accent; portalLight.intensity = 2.2; portalLight.range = 8;
    const landmarkPositions = [new Vector3(4.6, 0.2, 1.1), new Vector3(2.2, 0.2, -4.6), new Vector3(-2.7, 0.2, -4.0), new Vector3(5.1, 0.2, -4.2)];
    landmarkPositions.slice(0, Math.min(4, detail.encounter.activeCount + 1)).forEach((position, index) => {
      const pillar = MeshBuilder.CreateCylinder(`expanse-landmark-${detail.zoneId}-${index}`, { height: 2.2 + (index % 2) * 0.8, diameterTop: 0.46, diameterBottom: 0.74, tessellation: 6 }, scene);
      pillar.parent = root; pillar.position = position.add(new Vector3(0, 1.05, 0)); pillar.rotation.y = index * 0.73; pillar.material = material(scene, `expanse-landmark-mat-${detail.zoneId}-${index}`, zoneColors.stone, zoneColors.accent.scale(index % 2 ? 0.16 : 0.06));
      const crystal = MeshBuilder.CreatePolyhedron(`expanse-crystal-${detail.zoneId}-${index}`, { type: 1, size: 0.35 + index * 0.05 }, scene);
      crystal.parent = root; crystal.position = position.add(new Vector3(0, 2.45 + (index % 2) * 0.8, 0)); crystal.material = material(scene, `expanse-crystal-mat-${detail.zoneId}-${index}`, zoneColors.accent.scale(0.35), zoneColors.accent.scale(0.62));
    });
    detail.npcs.forEach((npc, index) => {
      const position = index === 0 ? new Vector3(-3.45, 0.2, 0.75) : new Vector3(3.25, 0.2, -0.35);
      const npcRoot = new TransformNode(`expanse-npc-${npc.id}`, scene); npcRoot.parent = root; npcRoot.position = position;
      const robe = material(scene, `expanse-npc-robe-${npc.id}`, npc.id === "lyra" ? Color3.FromHexString("#245B58") : Color3.FromHexString("#5D4C73"), zoneColors.accent.scale(0.14));
      const trim = material(scene, `expanse-npc-trim-${npc.id}`, bronze, zoneColors.accent.scale(0.3));
      const headMat = material(scene, `expanse-npc-head-${npc.id}`, Color3.FromHexString(npc.id === "lyra" ? "#8B604A" : "#6E4A3F"));
      const body = MeshBuilder.CreateCylinder(`expanse-npc-body-${npc.id}`, { height: 1.55, diameterTop: 0.62, diameterBottom: 0.94, tessellation: 8 }, scene); body.parent = npcRoot; body.position.y = 0.88; body.material = robe;
      const head = MeshBuilder.CreateSphere(`expanse-npc-head-${npc.id}`, { diameter: 0.52, segments: 12 }, scene); head.parent = npcRoot; head.position.y = 1.86; head.material = headMat;
      const halo = MeshBuilder.CreateTorus(`expanse-npc-halo-${npc.id}`, { diameter: 1.28, thickness: 0.045, tessellation: 24 }, scene); halo.parent = npcRoot; halo.position.y = 0.16; halo.rotation.x = Math.PI / 2; halo.material = trim;
      const sigil = MeshBuilder.CreatePolyhedron(`expanse-npc-sigil-${npc.id}`, { type: 1, size: 0.17 }, scene); sigil.parent = npcRoot; sigil.position = new Vector3(0, 2.37, 0); sigil.material = material(scene, `expanse-npc-sigil-mat-${npc.id}`, zoneColors.accent.scale(0.3), zoneColors.accent);
      worldNpcTargets.push({ id: npc.id, displayName: npc.displayName, position, root: npcRoot });
    });
    const gate = MeshBuilder.CreateTorus(`expanse-gate-${detail.zoneId}`, { diameter: 3.8, thickness: 0.22, tessellation: 8 }, scene);
    gate.parent = root; gate.position = new Vector3(0, 2.05, -6.15); gate.rotation.x = Math.PI / 2; gate.material = material(scene, `expanse-gate-mat-${detail.zoneId}`, zoneColors.stone, zoneColors.accent.scale(0.14));
    sentinel.root.setEnabled(false); arenaSets.forEach(set => set.setEnabled(false)); groundMat.diffuseColor = zoneColors.floor; ringMat.emissiveColor = zoneColors.accent.scale(0.18); beaconMat.emissiveColor = zoneColors.accent; beaconLight.diffuse = zoneColors.accent;
    explorer.position = new Vector3(-1.35, 0.2, 11.1); echo.position = new Vector3(0.25, 0.2, 11.5); echoTarget = echo.position.clone();
    createPulse(portal.position, zoneColors.accent, 1.25);
    emitGameEvent("system", `${detail.displayName} entfaltet sich als bestätigte Expanse-Ansicht. Rückkehrstein und ${detail.encounter.activeCount} sichtbare Begegnungssignale sind kartiert.`);
  };
  const completeArena = (): void => {
    if (transitioning || victory) return;
    transitioning = true; createPulse(sentinel.root.position.add(new Vector3(0, 0.2, 0)), arenas[arenaIndex].glow, 1.35);
    emitGameEvent("combat", `${arenas[arenaIndex].name} gesichert: ${arenas[arenaIndex].reward} geborgen.`); emitState(true);
    window.setTimeout(() => {
      if (arenaIndex === 2 && !dungeonActive) { dungeonUnlocked = true; transitioning = false; sentinel.root.setEnabled(false); emitGameEvent("system", "Der bestätigte Abschluss hat den Glutschlüssel freigegeben. Das Aschengewölbe kann jetzt betreten werden."); emitState(true); return; }
      if (arenaIndex === arenas.length - 1) { victory = true; transitioning = false; sentinel.root.setEnabled(false); emitGameEvent("system", "Der Glutwächter ist gefallen. Aurion stabilisiert sich um das geborgene Relikt."); emitState(true); return; }
      transitioning = false; awaitingQuest = true; sentinel.root.setEnabled(false); emitGameEvent("system", "Der Bossabschluss ist serverseitig bestätigt. Sprich mit dem Questgeber, bevor die nächste Resonanz beginnt."); emitState(true);
    }, 1100);
  };
  const requestAction = (command: CommandCode, source: "human" | "gateway", origin?: CompanionCommandOrigin): void => {
    if (!started || transitioning || victory || awaitingQuest || sentinelHp <= 0) return;
    window.dispatchEvent(new CustomEvent("aurion:request-action", { detail: { command, source, origin } }));
  };
  const applyAuthoritativeDamage = (damage: number, bossHp: number, label: string, tone: Color3): void => {
    if (!started || transitioning || victory) return;
    sentinelHp = Math.max(0, bossHp); actionHeat = Math.max(actionHeat, 0.65); createPulse(sentinel.root.position.add(new Vector3(0, 0.18, 0)), tone, 0.8);
    sentinelHurtUntil = elapsed + 0.26;
    emitGameEvent("combat", `${label} trifft den Sentinel für ${damage} bestätigten Resonanzschaden.`); emitState(true); if (sentinelHp === 0) completeArena();
  };
  const presentAuthoritativeEchoAbility = (code: CommandCode): void => {
    const arena = arenas[arenaIndex];
    echoActionUntil = elapsed + 0.44;
    if (code === "1") echoTarget = sentinel.root.position.add(new Vector3(-1.1, 0, 1.1));
    createPulse(echo.position.add(new Vector3(0, 0.35, 0)), arena.glow, code === "9" ? 1.15 : 0.72);
    emitGameEvent("combat", `Echo-Impuls ${code} wurde durch das serverseitige Aktionsreceipt bestätigt.`);
  };
  const presentAuthoritativeEchoMovement = (code: CommandCode): void => {
    const movement = 1.2;
    if (code === "W") echoTarget.z -= movement;
    if (code === "S") echoTarget.z += movement;
    if (code === "A") echoTarget.x -= movement;
    if (code === "D") echoTarget.x += movement;
    echoTarget.x = Math.max(-5.7, Math.min(5.7, echoTarget.x));
    echoTarget.z = Math.max(-5.2, Math.min(5.2, echoTarget.z));
    echoActionUntil = elapsed + 0.18;
    const surface: AudioSurface = openWorldActive ? "grass" : dungeonActive ? "stone" : "wood";
    emitGameEvent("command", `Echo Scout bestätigt den serverautorisierten Kurs ${code}.`, { cue: `movement.footstep.${surface}`, category: "movement", surface });
  };
  const emitZoneMovementState = (): void => {
    if (authoritativeZoneUserId === null) return;
    const x = ((keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0)) as -1 | 0 | 1;
    const z = ((keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0)) as -1 | 0 | 1;
    window.dispatchEvent(new CustomEvent("aurion:zone-movement-state", { detail: { x, z } }));
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const code = event.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(code)) { keys.add(code); emitZoneMovementState(); event.preventDefault(); }
    if ((code === "f" || code === "e") && started) { if (code === "e" && requestNpcInteraction()) { event.preventDefault(); return; } requestAction(code.toUpperCase() as CommandCode, "human"); event.preventDefault(); }
  };
  const onKeyUp = (event: KeyboardEvent): void => { keys.delete(event.key.toLowerCase()); emitZoneMovementState(); };
  const onHumanCommand = (event: Event): void => {
    const code = (event as CustomEvent<{ code: string }>).detail.code.toUpperCase(); const distance = 0.95;
    if (authoritativeZoneUserId !== null) {
      const x = (code === "D" ? 1 : code === "A" ? -1 : 0) as -1 | 0 | 1;
      const z = (code === "S" ? 1 : code === "W" ? -1 : 0) as -1 | 0 | 1;
      if (x !== 0 || z !== 0) {
        window.dispatchEvent(new CustomEvent("aurion:zone-movement-tap", { detail: { x, z } }));
        explorerMotionUntil = elapsed + 0.18;
      }
      return;
    }
    if (code === "W") explorer.position.z -= distance; if (code === "S") explorer.position.z += distance; if (code === "A") explorer.position.x -= distance; if (code === "D") explorer.position.x += distance;
    const worldLimit = openWorldActive ? 14.5 : 5.6;
    explorer.position.x = Math.max(-worldLimit, Math.min(worldLimit, explorer.position.x)); explorer.position.z = Math.max(-worldLimit, Math.min(worldLimit, explorer.position.z));
    explorerMotionUntil = elapsed + 0.22;
  };
  const requestNpcInteraction = (): boolean => {
    if (!openWorldActive) return false;
    const candidate = worldNpcTargets.map(target => ({ target, distance: Vector3.Distance(explorer.position, target.position) })).sort((a, b) => a.distance - b.distance)[0];
    if (!candidate || candidate.distance > 3.35) { emitGameEvent("command", "Kein Questgeber in Interaktionsreichweite. Folge den goldenen Wegmarken der Expanse."); return true; }
    candidate.target.root.scaling.setAll(1.07); window.setTimeout(() => candidate.target.root.scaling.setAll(1), 150);
    window.dispatchEvent(new CustomEvent("aurion:world-npc-interaction", { detail: { npcId: candidate.target.id } }));
    emitGameEvent("command", `${candidate.target.displayName} reagiert auf die bestätigte Interaktion.`);
    return true;
  };
  const onHumanAction = (event: Event): void => { const code = ((event as CustomEvent<{ code?: "F" | "E" }>).detail.code ?? "F"); if (code === "E" && requestNpcInteraction()) return; if (code === "F") explorerAttackUntil = elapsed + 0.34; if (code === "E") emitGameEvent("command", "Explorer bestätigt die Interaktion in der aktuellen Resonanzzone."); requestAction(code, "human"); };
  const onCommand = (event: Event): void => {
    const detail = (event as CustomEvent<{ code?: CommandCode; origin?: CompanionCommandOrigin }>).detail;
    const code = detail?.code;
    const origin = detail?.origin ?? "gateway";
    if (!code || !/^[WASDEF1-9]$/.test(code) || !["gateway", "human_team", "local_console"].includes(origin)) return;
    if (!started || victory || (companionCommandRequiresSpawn(origin) && !companionSpawned)) return;
    requestAction(code, companionGameplayActionSource(origin), origin);
  };
  const onStart = (): void => { clearOpenWorld(); started = true; dungeonUnlocked = false; dungeonActive = false; victory = false; awaitingQuest = false; sentinel.root.setEnabled(true); emitGameEvent("system", "Sternwarten-Instanz geöffnet. Die erste Sentinel-Phase reagiert auf das Team-Siegel."); applyArena(0); };
  const onEnterDungeon = (): void => {
    if (!started || !dungeonUnlocked || dungeonActive || victory) return;
    dungeonActive = true; sentinel.root.setEnabled(true); if (arenaIndex === 3) window.dispatchEvent(new CustomEvent("aurion:boss-encounter", { detail: { active: true, scope: "dungeon" } })); emitGameEvent("system", "Das Aschengewölbe öffnet sich. Der Glutwächter reagiert auf den geborgenen Schlüssel."); applyArena(3);
  };
  const onAuthoritativeAction = (event: Event): void => {
    const detail = (event as CustomEvent<{ damage: number; bossHp: number; command: CommandCode; source?: "human" | "gateway"; origin?: CompanionCommandOrigin; completed: boolean }>).detail;
    if (!detail) return;
    const source = detail.source ?? "gateway";
    const companionOrigin = detail.origin === "gateway" || detail.origin === "human_team" || detail.origin === "local_console";
    if (companionOrigin && detail.origin !== "gateway") echo.setEnabled(true);
    if (companionOrigin && /^[WASD]$/.test(detail.command)) presentAuthoritativeEchoMovement(detail.command);
    if (companionOrigin && /^[1-9]$/.test(detail.command)) presentAuthoritativeEchoAbility(detail.command);
    if (companionOrigin && detail.command === "E") requestNpcInteraction();
    if (detail.command === "F") {
      if (source === "human" && !companionOrigin) explorerAttackUntil = elapsed + 0.34;
      else echoActionUntil = elapsed + 0.34;
    }
    if (detail.command === "E") emitGameEvent("command", "Die Interaktion wurde durch den serverseitigen Aktionspfad bestätigt.");
    if (detail.damage > 0) {
      const explorerStrike = detail.command === "F" && source === "human" && !companionOrigin;
      applyAuthoritativeDamage(detail.damage, detail.bossHp, explorerStrike ? "Speersignal des Explorers" : `Echo-Impuls ${detail.command}`, arenas[arenaIndex].glow);
      emitAudioCue({ cue: explorerStrike ? "combat.attack.pointed" : "combat.magic", category: "combat", ...(explorerStrike ? { weapon: "pointed" } : { element: "resonance" }) } as AudioEvent);
      if (detail.completed) emitAudioCue({ cue: "combat.creature.monster.death", category: "combat", creature: "monster", action: "death" });
    } else emitState(true);
  };
  const onLoadEncounter = (event: Event): void => {
    const detail = (event as CustomEvent<{ arenaIndex: number; dungeon?: boolean }>).detail;
    if (!detail || !Number.isInteger(detail.arenaIndex) || detail.arenaIndex < 0 || detail.arenaIndex >= arenas.length) return;
    clearOpenWorld(); started = true; awaitingQuest = false; victory = false; dungeonActive = Boolean(detail.dungeon); dungeonUnlocked = Boolean(detail.dungeon); sentinel.root.setEnabled(true); applyArena(detail.arenaIndex);
  };
  const onLoadOpenWorld = (event: Event): void => {
    const detail = (event as CustomEvent<OpenWorldSceneState>).detail;
    if (!detail || detail.revision !== 1 || !["observatory_threshold", "windhollow", "emberfall", "cinder_vault"].includes(detail.zoneId) || !Number.isInteger(detail.zoneTier) || detail.zoneTier < 0 || detail.zoneTier > 3 || detail.terrain?.chunkSizeMeters !== 32 || detail.terrain.tileSizeMeters !== 4 || detail.terrain.columns !== 8 || detail.terrain.rows !== 8 || detail.terrain.tiles.length !== 64 || detail.globalWorld?.version !== "aurion-global-world.v1" || detail.globalWorld.worldId !== "echoes-of-aurion-global" || !detail.globalWorld.worldSeed.trim() || !Number.isSafeInteger(detail.globalWorld.epoch) || !Number.isSafeInteger(detail.globalWorld.unlockedSectorCount) || typeof detail.globalWorld.deterministicHash !== "string") return;
    started = true; awaitingQuest = false; victory = false; dungeonActive = false; dungeonUnlocked = false; createOpenWorldVisuals(detail); emitState(true);
  };
  const onReturnToTower = (): void => {
    if (!openWorldActive) return;
    showTowerHome();
    emitGameEvent("system", "Du kehrst sicher in deine private Sternwarte zurück. Die Expanse bleibt als serverbestätigter Außenraum erreichbar.");
  };
  const onWorldChunkStream = (event: Event): void => {
    const detail = (event as CustomEvent<WorldChunkStreamState>).detail;
    if (!openWorldActive || !detail || !["phone", "tablet", "desktop"].includes(detail.tier) || !Number.isSafeInteger(detail.center?.x) || !Number.isSafeInteger(detail.center?.z) || detail.globalWorld?.version !== "aurion-global-world.v1" || detail.globalWorld.worldId !== "echoes-of-aurion-global" || !detail.globalWorld.worldSeed.trim() || detail.globalWorld.deterministicHash !== activeGlobalWorldHash || !detail.chunk || detail.chunk.generation?.worldId !== detail.globalWorld.worldId || !Array.isArray(detail.chunk.deltas) || detail.chunk.deltas.length > WORLD_CHUNK_STREAM_PAGE_LIMIT || !Number.isSafeInteger(detail.chunk.nextAfterSequence)) return;
    if (!detail.chunk.deltas.every(delta => Number.isSafeInteger(delta.sequence) && delta.sequence > 0 && delta.worldId === detail.globalWorld.worldId && delta.coordinate.x === detail.chunk.generation.coordinate.x && delta.coordinate.z === detail.chunk.generation.coordinate.z && delta.baseRevision === detail.chunk.generation.baseRevision && typeof delta.deterministicHash === "string" && delta.deterministicHash.startsWith("fnv1a-"))) return;
    const key = worldChunkCoordinateKey(detail.chunk.generation.coordinate);
    const cachedDeltas = streamedChunkDeltaCache.get(key) ?? new Map<string, WorldChunkDeltaOverlay>();
    detail.chunk.deltas.forEach(delta => cachedDeltas.set(delta.id, delta));
    streamedChunkDeltaCache.set(key, cachedDeltas);
    renderConfirmedWorldChunk({ ...detail, chunk: { ...detail.chunk, deltas: Array.from(cachedDeltas.values()).sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id)) } });
  };
  const onZoneConnected = (event: Event): void => {
    const userId = (event as CustomEvent<{ userId?: number }>).detail.userId;
    if (typeof userId !== "number" || !Number.isInteger(userId)) return;
    authoritativeZoneUserId = userId;
    authoritativeExplorerTarget = explorer.position.clone();
  };
  const onZoneDisconnected = (): void => { authoritativeZoneUserId = null; authoritativeExplorerTarget = null; };
  const onZoneSnapshot = (event: Event): void => {
    const detail = (event as CustomEvent<{ userId: number; position: { x: number; z: number } }>).detail;
    if (detail?.userId !== authoritativeZoneUserId || !Number.isInteger(detail.position?.x) || !Number.isInteger(detail.position?.z)) return;
    authoritativeExplorerTarget = new Vector3(detail.position.x / 1_000, explorer.position.y, detail.position.z / 1_000);
  };
  const onCompanionState = (event: Event): void => {
    const detail = (event as CustomEvent<{ protocol?: string; companionSpawned?: boolean }>).detail;
    if (detail?.protocol !== "aurion-companion-learning.v1") return;
    companionSpawned = detail.companionSpawned === true;
    echo.setEnabled(companionSpawned);
    if (!companionSpawned) echoTarget = explorer.position.clone();
  };
  showTowerHome();
  window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("aurion:human-command", onHumanCommand); window.addEventListener("aurion:human-action", onHumanAction); window.addEventListener("aurion:command", onCommand); window.addEventListener("aurion:begin-expedition", onStart); window.addEventListener("aurion:enter-dungeon", onEnterDungeon); window.addEventListener("aurion:authoritative-action", onAuthoritativeAction); window.addEventListener("aurion:load-encounter", onLoadEncounter); window.addEventListener("aurion:load-open-world", onLoadOpenWorld); window.addEventListener("aurion:return-to-tower", onReturnToTower); window.addEventListener("aurion:stream-world-chunk", onWorldChunkStream); window.addEventListener("aurion:zone-connected", onZoneConnected); window.addEventListener("aurion:zone-disconnected", onZoneDisconnected); window.addEventListener("aurion:zone-snapshot", onZoneSnapshot); window.addEventListener("aurion:companion-state", onCompanionState);
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05); elapsed += dt; const arena = arenas[arenaIndex];
    beacon.rotation.y += dt * 0.55; beacon.position.y = 2.18 + Math.sin(elapsed * 1.4) * 0.16;     sentinel.root.position.y = 0.15 + Math.sin(elapsed * 1.4) * 0.08; sentinelMoving = false;
    if (started && !victory) {
      const direction = new Vector3((keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0), 0, (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0));
      if (authoritativeExplorerTarget) {
        const towardAuthoritative = authoritativeExplorerTarget.subtract(explorer.position);
        towardAuthoritative.y = 0;
        if (towardAuthoritative.lengthSquared() > 0.0001) {
          explorer.position.addInPlace(towardAuthoritative.scale(Math.min(1, dt * 12)));
          explorer.rotation.y = Math.atan2(towardAuthoritative.x, towardAuthoritative.z);
        }
      } else if (direction.lengthSquared() > 0) { direction.normalize().scaleInPlace(dt * 3.45); explorer.position.addInPlace(direction); const worldLimit = openWorldActive ? 14.5 : 5.6; explorer.position.x = Math.max(-worldLimit, Math.min(worldLimit, explorer.position.x)); explorer.position.z = Math.max(-worldLimit, Math.min(worldLimit, explorer.position.z)); explorer.rotation.y = Math.atan2(direction.x, direction.z); }
      const pursuit = explorer.position.subtract(sentinel.root.position); pursuit.y = 0;
      const desiredDistance = 3.5;
      if (!openWorldActive && !transitioning && sentinelHp > 0 && pursuit.lengthSquared() > desiredDistance * desiredDistance) {
        const step = pursuit.normalize().scaleInPlace(Math.min(dt * 1.2, Math.max(0, pursuit.length() - desiredDistance)));
        sentinel.root.position.addInPlace(step); sentinel.root.rotation.y = Math.atan2(step.x, step.z); sentinelMoving = step.lengthSquared() > 0.0001;
      } else {
        sentinel.root.rotation.y = Math.sin(elapsed * 0.46) * 0.3 - 0.2;
      }
      shieldTime = Math.max(0, shieldTime - dt); markTime = Math.max(0, markTime - dt);
      if (!openWorldActive && !transitioning && elapsed >= nextEnemyStrike && sentinelHp > 0) {
        const rawDamage = 9 + arenaIndex * 3; const damage = shieldTime > 0 ? Math.ceil(rawDamage * 0.22) : rawDamage; explorerHp = Math.max(0, explorerHp - damage); echoHp = Math.max(0, echoHp - Math.ceil(damage * 0.38)); nextEnemyStrike = elapsed + 3.85 - Math.min(markTime, 1.2); createPulse(explorer.position, Color3.FromHexString("#FF7045"), 0.9); emitGameEvent("combat", `Der Sentinel entfesselt einen Spaltimpuls: Team verliert ${damage} Integrität.`, { cue: "combat.creature.monster.attack", category: "combat", creature: "monster", action: "attack" }); emitState(true);
        sentinelAttackUntil = elapsed + 0.46; explorerHurtUntil = elapsed + 0.3; echoHurtUntil = elapsed + 0.28;
      }
    }
    const follow = companionSpawned ? echoTarget.subtract(echo.position) : Vector3.Zero();
    if (follow.lengthSquared() > 0.02) { follow.normalize().scaleInPlace(dt * 2.9); echo.position.addInPlace(follow); echo.rotation.y = Math.atan2(follow.x, follow.z); }
    const explorerMoving = keys.size > 0 || elapsed < explorerMotionUntil ? 1 : 0;
    animateExplorer(explorerRig, elapsed, explorerMoving, elapsed < explorerAttackUntil, elapsed < explorerHurtUntil);
    animateEcho(echoRig, elapsed, follow.lengthSquared() > 0.03, elapsed < echoActionUntil, elapsed < echoHurtUntil);
    animateSentinel(sentinel, elapsed, sentinelMoving, elapsed < sentinelAttackUntil, elapsed < sentinelHurtUntil);
    echo.position.y = 0.2 + Math.sin(elapsed * 2.4) * 0.07; MeshBuilder.CreateLines("team-tether", { points: [explorer.position.add(new Vector3(0, 1.14, 0)), echo.position.add(new Vector3(0, 1.2, 0))], instance: tether });
    actionHeat = Math.max(0, actionHeat - dt * 1.9); beaconLight.intensity = 8 + Math.sin(elapsed * 2.3) * 1.7 + actionHeat * 6;
    for (let index = pulses.length - 1; index >= 0; index -= 1) { const pulse = pulses[index]; pulse.age += dt; pulse.mesh.scaling.setAll(1 + pulse.age * 4.3); const pulseMaterial = pulse.mesh.material as StandardMaterial; pulseMaterial.alpha = Math.max(0, 1 - pulse.age * 1.8); if (pulse.age > 0.58) { pulse.mesh.dispose(); pulses.splice(index, 1); } }
    emitState();
  });
  return { scene, setCharacterModel, setArenaModel, dispose: () => { clearOpenWorld(); customArenaRoot?.dispose(false, true); scene.onBeforeRenderObservable.remove(observer); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("aurion:human-command", onHumanCommand); window.removeEventListener("aurion:human-action", onHumanAction); window.removeEventListener("aurion:command", onCommand); window.removeEventListener("aurion:begin-expedition", onStart); window.removeEventListener("aurion:enter-dungeon", onEnterDungeon); window.removeEventListener("aurion:authoritative-action", onAuthoritativeAction); window.removeEventListener("aurion:load-encounter", onLoadEncounter); window.removeEventListener("aurion:load-open-world", onLoadOpenWorld); window.removeEventListener("aurion:return-to-tower", onReturnToTower); window.removeEventListener("aurion:stream-world-chunk", onWorldChunkStream); window.removeEventListener("aurion:zone-connected", onZoneConnected); window.removeEventListener("aurion:zone-disconnected", onZoneDisconnected); window.removeEventListener("aurion:zone-snapshot", onZoneSnapshot); window.removeEventListener("aurion:companion-state", onCompanionState); scene.dispose(); } };
}
