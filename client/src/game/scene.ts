/**
 * Echoes of Aurion — Arena expedition core
 * Design philosophy: The human Explorer and articulate Echo Scout remain equal
 * on a material-rich battlefield; tactical signals produce immediately visible world change.
 */

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

export type GameHandle = { scene: Scene; dispose: () => void };

type CommandCode = "W" | "A" | "S" | "D" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type Pulse = { mesh: Mesh; age: number };
type ArenaDefinition = { name: string; objective: string; health: number; floor: Color3; glow: Color3; sun: Color3; enemy: Color3; reward: string };
type MissionState = { arena: number; arenaName: string; objective: string; sentinelHp: number; sentinelMaxHp: number; explorerHp: number; echoHp: number; shield: boolean; marked: boolean; phase: "active" | "transition" | "victory" };

const aurion = Color3.FromHexString("#2DE2CF");
const bronze = Color3.FromHexString("#9A7043");
const sandstone = Color3.FromHexString("#A88254");
const ink = Color3.FromHexString("#071B24");

const arenas: ArenaDefinition[] = [
  { name: "Sternwarte Asterion", objective: "Brich den ersten Resonanzanker des Sentinels.", health: 112, floor: Color3.FromHexString("#183B3D"), glow: aurion, sun: Color3.FromHexString("#FFD890"), enemy: Color3.FromHexString("#9A4B35"), reward: "Asterion-Splitter" },
  { name: "Versunkene Archivhalle", objective: "Entschlüssele den Echo-Schlüssel unter gegnerischem Druck.", health: 154, floor: Color3.FromHexString("#29394B"), glow: Color3.FromHexString("#75A8FF"), sun: Color3.FromHexString("#B4C8FF"), enemy: Color3.FromHexString("#7A4FAA"), reward: "Archiv-Siegel" },
  { name: "Solarium der letzten Flamme", objective: "Beende die Resonanz, bevor das Solarium kollabiert.", health: 198, floor: Color3.FromHexString("#473226"), glow: Color3.FromHexString("#F2C15B"), sun: Color3.FromHexString("#FFB34E"), enemy: Color3.FromHexString("#B5422F"), reward: "Aurion-Kern" },
];

function material(scene: Scene, name: string, diffuse: Color3, emissive?: Color3): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = diffuse;
  result.specularColor = Color3.FromHexString("#24140A");
  result.emissiveColor = emissive ?? Color3.Black();
  return result;
}

function makeExplorer(scene: Scene): TransformNode {
  const root = new TransformNode("explorer-root", scene);
  root.position = new Vector3(-3.2, 0.2, 1.6);
  const armour = material(scene, "explorer-ivory", Color3.FromHexString("#D7D2B5"));
  const trim = material(scene, "explorer-trim", bronze, aurion.scale(0.12));
  const skin = material(scene, "explorer-skin", Color3.FromHexString("#6B4636"));
  const body = MeshBuilder.CreateCapsule("explorer-body", { height: 1.7, radius: 0.3, tessellation: 12 }, scene);
  body.parent = root; body.position.y = 1.1; body.material = armour;
  const head = MeshBuilder.CreateSphere("explorer-head", { diameter: 0.48, segments: 12 }, scene);
  head.parent = root; head.position.y = 2.1; head.material = skin;
  const mantle = MeshBuilder.CreateTorus("explorer-mantle", { diameter: 0.88, thickness: 0.1, tessellation: 16 }, scene);
  mantle.parent = root; mantle.position.y = 1.65; mantle.rotation.x = Math.PI / 2; mantle.material = trim;
  const spear = MeshBuilder.CreateCylinder("explorer-spear", { height: 2.05, diameter: 0.055, tessellation: 8 }, scene);
  spear.parent = root; spear.position = new Vector3(0.52, 1.12, 0.1); spear.rotation.z = -0.34; spear.material = trim;
  const tip = MeshBuilder.CreateCylinder("explorer-spear-tip", { height: 0.32, diameterTop: 0, diameterBottom: 0.18, tessellation: 6 }, scene);
  tip.parent = spear; tip.position.y = 1.12; tip.material = trim;
  return root;
}

function makeEchoScout(scene: Scene): TransformNode {
  const root = new TransformNode("echo-scout-root", scene);
  root.position = new Vector3(-0.7, 0.2, 0.4);
  const plates = material(scene, "echo-bronze", Color3.FromHexString("#2E665F"), aurion.scale(0.08));
  const glow = material(scene, "echo-core", Color3.FromHexString("#104A50"), aurion);
  const body = MeshBuilder.CreateCapsule("echo-body", { height: 1.42, radius: 0.28, tessellation: 12 }, scene);
  body.parent = root; body.position.y = 1.06; body.material = plates;
  const core = MeshBuilder.CreateSphere("echo-aurion-core", { diameter: 0.32, segments: 12 }, scene);
  core.parent = root; core.position = new Vector3(0, 1.12, -0.26); core.material = glow;
  const head = MeshBuilder.CreateSphere("echo-head", { diameterX: 0.52, diameterY: 0.38, diameterZ: 0.48, segments: 12 }, scene);
  head.parent = root; head.position.y = 1.92; head.material = plates;
  const halo = MeshBuilder.CreateTorus("echo-halo", { diameter: 0.82, thickness: 0.06, tessellation: 18 }, scene);
  halo.parent = root; halo.position.y = 2.08; halo.rotation.x = Math.PI / 2; halo.material = glow;
  [-1, 1].forEach((side, index) => {
    const shoulder = MeshBuilder.CreateSphere(`echo-shoulder-${index}`, { diameter: 0.34, segments: 10 }, scene);
    shoulder.parent = root; shoulder.position = new Vector3(side * 0.43, 1.46, 0); shoulder.material = plates;
    const arm = MeshBuilder.CreateCapsule(`echo-arm-${index}`, { height: 0.82, radius: 0.11, tessellation: 8 }, scene);
    arm.parent = root; arm.position = new Vector3(side * 0.5, 0.98, 0.02); arm.rotation.z = side * 0.28; arm.material = plates;
  });
  return root;
}

function makeSentinel(scene: Scene): { root: TransformNode; shell: StandardMaterial; eye: StandardMaterial; crown: StandardMaterial } {
  const root = new TransformNode("sentinel-root", scene);
  root.position = new Vector3(3.25, 0.15, -1.8);
  const shell = material(scene, "sentinel-shell", Color3.FromHexString("#59493C"));
  const eye = material(scene, "sentinel-eye", Color3.FromHexString("#7A281B"), Color3.FromHexString("#FF744A"));
  const body = MeshBuilder.CreateCylinder("sentinel-body", { height: 2.05, diameterTop: 0.62, diameterBottom: 0.9, tessellation: 8 }, scene);
  body.parent = root; body.position.y = 1.16; body.material = shell;
  const lens = MeshBuilder.CreateSphere("sentinel-lens", { diameter: 0.36, segments: 12 }, scene);
  lens.parent = root; lens.position = new Vector3(0, 1.48, -0.47); lens.material = eye;
  const crownMesh = MeshBuilder.CreateTorus("sentinel-crown", { diameter: 1.32, thickness: 0.09, tessellation: 16 }, scene);
  crownMesh.parent = root; crownMesh.position.y = 2.12; crownMesh.rotation.x = Math.PI / 2; crownMesh.material = shell;
  const staff = MeshBuilder.CreateCylinder("sentinel-staff", { height: 2.8, diameter: 0.09, tessellation: 8 }, scene);
  staff.parent = root; staff.position = new Vector3(-0.74, 1.28, 0.06); staff.rotation.z = 0.28; staff.material = shell;
  return { root, shell, eye, crown: shell };
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
  archive.setEnabled(false); solarium.setEnabled(false);
  return [astronomic, archive, solarium];
}

function emitGameEvent(kind: string, detail: string): void {
  window.dispatchEvent(new CustomEvent("aurion:game-event", { detail: { kind, detail } }));
}

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.012, 0.06, 0.082, 1);
  scene.fogMode = Scene.FOGMODE_EXP2; scene.fogColor = new Color3(0.025, 0.11, 0.14); scene.fogDensity = 0.018;
  const camera = new ArcRotateCamera("expedition-camera", -2.27, 1.05, 20.5, new Vector3(0, 0.9, 0), scene);
  camera.lowerRadiusLimit = 14; camera.upperRadiusLimit = 23; camera.lowerBetaLimit = 0.73; camera.upperBetaLimit = 1.24; camera.wheelDeltaPercentage = 0.012; camera.attachControl(canvas, true);
  const sky = new HemisphericLight("sky-light", new Vector3(0.2, 1, 0.4), scene);
  sky.intensity = 1.1; sky.diffuse = Color3.FromHexString("#70D4C6"); sky.groundColor = ink;
  const sun = new DirectionalLight("sun-light", new Vector3(-0.5, -1, 0.35), scene);
  sun.position = new Vector3(4, 12, -4); sun.intensity = 2.2; sun.diffuse = arenas[0].sun;
  const beaconLight = new PointLight("beacon-light", new Vector3(0, 3.2, 0), scene);
  beaconLight.diffuse = arenas[0].glow; beaconLight.intensity = 9; beaconLight.range = 13;
  const glowLayer = new GlowLayer("aurion-glow", scene, { blurKernelSize: 48 }); glowLayer.intensity = 0.64;
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

  const explorer = makeExplorer(scene); const echo = makeEchoScout(scene); const sentinel = makeSentinel(scene);
  const tether = MeshBuilder.CreateLines("team-tether", { points: [explorer.position.add(new Vector3(0, 1.1, 0)), echo.position.add(new Vector3(0, 1.2, 0))], updatable: true }, scene);
  tether.color = aurion;
  const keys = new Set<string>(); const pulses: Pulse[] = [];
  let started = false; let elapsed = 0; let arenaIndex = 0; let sentinelHp = arenas[0].health; let explorerHp = 100; let echoHp = 100;
  let echoTarget = echo.position.clone(); let shieldTime = 0; let markTime = 0; let actionHeat = 0; let nextEnemyStrike = 4.2; let transitioning = false; let victory = false; let lastStateEmit = -1;

  const createPulse = (at: Vector3, color: Color3, size = 0.54): void => {
    const ring = MeshBuilder.CreateTorus(`command-pulse-${Date.now()}-${pulses.length}`, { diameter: size, thickness: 0.055, tessellation: 24 }, scene);
    ring.position = at.clone(); ring.rotation.x = Math.PI / 2; ring.material = material(scene, `command-pulse-mat-${Date.now()}-${pulses.length}`, color.scale(0.2), color); pulses.push({ mesh: ring, age: 0 });
  };
  const emitState = (force = false): void => {
    if (!force && elapsed - lastStateEmit < 0.16) return;
    lastStateEmit = elapsed;
    const arena = arenas[arenaIndex];
    const state: MissionState = { arena: arenaIndex, arenaName: arena.name, objective: victory ? "Aurion ist stabilisiert. Der Weg zum Himmelsarchiv ist offen." : arena.objective, sentinelHp: Math.max(0, sentinelHp), sentinelMaxHp: arena.health, explorerHp: Math.max(0, explorerHp), echoHp: Math.max(0, echoHp), shield: shieldTime > 0, marked: markTime > 0, phase: victory ? "victory" : transitioning ? "transition" : "active" };
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
  const completeArena = (): void => {
    if (transitioning || victory) return;
    transitioning = true; createPulse(sentinel.root.position.add(new Vector3(0, 0.2, 0)), arenas[arenaIndex].glow, 1.35);
    emitGameEvent("combat", `${arenas[arenaIndex].name} gesichert: ${arenas[arenaIndex].reward} geborgen.`); emitState(true);
    window.setTimeout(() => {
      if (arenaIndex === arenas.length - 1) { victory = true; transitioning = false; sentinel.root.setEnabled(false); emitGameEvent("system", "Aurion stabilisiert. Das Team hat die letzte Resonanz bestanden."); emitState(true); return; }
      transitioning = false; applyArena(arenaIndex + 1);
    }, 1100);
  };
  const dealSentinel = (damage: number, label: string, tone: Color3): void => {
    if (!started || transitioning || victory || sentinelHp <= 0) return;
    const applied = Math.round(damage * (markTime > 0 ? 1.35 : 1)); sentinelHp = Math.max(0, sentinelHp - applied); actionHeat = Math.max(actionHeat, 0.65); createPulse(sentinel.root.position.add(new Vector3(0, 0.18, 0)), tone, 0.8);
    emitGameEvent("combat", `${label} trifft den Sentinel für ${applied} Resonanzschaden.`); emitState(true); if (sentinelHp === 0) completeArena();
  };
  const runEchoAbility = (code: CommandCode): void => {
    const arena = arenas[arenaIndex];
    if (code === "1") { echoTarget = sentinel.root.position.add(new Vector3(-1.1, 0, 1.1)); dealSentinel(15, "Prisma-Schritt", arena.glow); return; }
    if (code === "2" || code === "6") { shieldTime = Math.max(shieldTime, code === "6" ? 5.2 : 3.7); createPulse(explorer.position, arena.glow, 0.9); emitGameEvent("combat", code === "6" ? "Aegis-Knoten schützt das gesamte Team." : "Echoschild fängt den nächsten Impuls ab."); emitState(true); return; }
    if (code === "3") { echoHp = Math.min(100, echoHp + 8); explorerHp = Math.min(100, explorerHp + 6); markTime = Math.max(markTime, 3.4); createPulse(echo.position, arena.glow, 0.82); emitGameEvent("combat", "Sternenfaden stabilisiert das Team und markiert den Sentinel."); emitState(true); return; }
    if (code === "4") { markTime = Math.max(markTime, 5.1); createPulse(sentinel.root.position, Color3.FromHexString("#75A8FF"), 1); emitGameEvent("combat", "Kartenblick legt eine verwundbare Resonanzlinie offen."); emitState(true); return; }
    if (code === "5") { dealSentinel(22, "Ruinenschnitt", Color3.FromHexString("#F6D083")); return; }
    if (code === "7") { markTime = Math.max(markTime, 6.2); nextEnemyStrike += 2.4; dealSentinel(10, "Ankerwurf", arena.glow); return; }
    if (code === "8") { dealSentinel(29, "Sonnenbruch", Color3.FromHexString("#F4A13D")); return; }
    if (code === "9") { dealSentinel(43, "Aurion-Resonanz", Color3.FromHexString("#FFB34E")); return; }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const code = event.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(code)) { keys.add(code); event.preventDefault(); }
    if (code === "f" && started) { dealSentinel(17, "Speersignal des Explorers", Color3.FromHexString("#F5D995")); event.preventDefault(); }
  };
  const onKeyUp = (event: KeyboardEvent): void => { keys.delete(event.key.toLowerCase()); };
  const onHumanCommand = (event: Event): void => {
    const code = (event as CustomEvent<{ code: string }>).detail.code.toUpperCase(); const distance = 0.95;
    if (code === "W") explorer.position.z -= distance; if (code === "S") explorer.position.z += distance; if (code === "A") explorer.position.x -= distance; if (code === "D") explorer.position.x += distance;
    explorer.position.x = Math.max(-5.6, Math.min(5.6, explorer.position.x)); explorer.position.z = Math.max(-5.1, Math.min(5.1, explorer.position.z));
  };
  const onHumanAction = (): void => dealSentinel(17, "Speersignal des Explorers", Color3.FromHexString("#F5D995"));
  const onCommand = (event: Event): void => {
    const code = (event as CustomEvent<{ code: CommandCode }>).detail.code; if (!started || victory) return;
    const movement = 1.2;
    if (code === "W") echoTarget.z -= movement; if (code === "S") echoTarget.z += movement; if (code === "A") echoTarget.x -= movement; if (code === "D") echoTarget.x += movement;
    echoTarget.x = Math.max(-5.7, Math.min(5.7, echoTarget.x)); echoTarget.z = Math.max(-5.2, Math.min(5.2, echoTarget.z));
    if (/^[1-9]$/.test(code)) runEchoAbility(code); else emitGameEvent("command", `Echo Scout bestätigt Kurs ${code}.`);
  };
  const onStart = (): void => { started = true; emitGameEvent("system", "Sternwarten-Instanz geöffnet. Die erste Sentinel-Phase reagiert auf das Team-Siegel."); applyArena(0); };
  window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("aurion:human-command", onHumanCommand); window.addEventListener("aurion:human-action", onHumanAction); window.addEventListener("aurion:command", onCommand); window.addEventListener("aurion:begin-expedition", onStart);
  const observer = scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05); elapsed += dt; const arena = arenas[arenaIndex];
    beacon.rotation.y += dt * 0.55; beacon.position.y = 2.18 + Math.sin(elapsed * 1.4) * 0.16; sentinel.root.rotation.y = Math.sin(elapsed * 0.46) * 0.3 - 0.2; sentinel.root.position.y = 0.15 + Math.sin(elapsed * 1.4) * 0.08;
    if (started && !victory) {
      const direction = new Vector3((keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0), 0, (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0));
      if (direction.lengthSquared() > 0) { direction.normalize().scaleInPlace(dt * 3.45); explorer.position.addInPlace(direction); explorer.position.x = Math.max(-5.6, Math.min(5.6, explorer.position.x)); explorer.position.z = Math.max(-5.1, Math.min(5.1, explorer.position.z)); explorer.rotation.y = Math.atan2(direction.x, direction.z); }
      shieldTime = Math.max(0, shieldTime - dt); markTime = Math.max(0, markTime - dt);
      if (!transitioning && elapsed >= nextEnemyStrike && sentinelHp > 0) {
        const rawDamage = 9 + arenaIndex * 3; const damage = shieldTime > 0 ? Math.ceil(rawDamage * 0.22) : rawDamage; explorerHp = Math.max(0, explorerHp - damage); echoHp = Math.max(0, echoHp - Math.ceil(damage * 0.38)); nextEnemyStrike = elapsed + 3.85 - Math.min(markTime, 1.2); createPulse(explorer.position, Color3.FromHexString("#FF7045"), 0.9); emitGameEvent("combat", `Der Sentinel entfesselt einen Spaltimpuls: Team verliert ${damage} Integrität.`); emitState(true);
      }
    }
    const follow = echoTarget.subtract(echo.position);
    if (follow.lengthSquared() > 0.02) { follow.normalize().scaleInPlace(dt * 2.9); echo.position.addInPlace(follow); echo.rotation.y = Math.atan2(follow.x, follow.z); }
    echo.position.y = 0.2 + Math.sin(elapsed * 2.4) * 0.07; MeshBuilder.CreateLines("team-tether", { points: [explorer.position.add(new Vector3(0, 1.14, 0)), echo.position.add(new Vector3(0, 1.2, 0))], instance: tether });
    actionHeat = Math.max(0, actionHeat - dt * 1.9); beaconLight.intensity = 8 + Math.sin(elapsed * 2.3) * 1.7 + actionHeat * 6;
    for (let index = pulses.length - 1; index >= 0; index -= 1) { const pulse = pulses[index]; pulse.age += dt; pulse.mesh.scaling.setAll(1 + pulse.age * 4.3); const pulseMaterial = pulse.mesh.material as StandardMaterial; pulseMaterial.alpha = Math.max(0, 1 - pulse.age * 1.8); if (pulse.age > 0.58) { pulse.mesh.dispose(); pulses.splice(index, 1); } }
    emitState();
  });
  return { scene, dispose: () => { scene.onBeforeRenderObservable.remove(observer); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("aurion:human-command", onHumanCommand); window.removeEventListener("aurion:human-action", onHumanAction); window.removeEventListener("aurion:command", onCommand); window.removeEventListener("aurion:begin-expedition", onStart); scene.dispose(); } };
}
