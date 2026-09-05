import * as THREE from 'three';
import confetti from 'canvas-confetti';
import {
  CharacterAppearance,
  CharacterClassId,
  ChatMessage,
  ClassSkill,
  CompanionPet,
  DayNightInfo,
  EquipmentState,
  FloatingCombatText,
  GMWorldConfig,
  HomesteadBlueprint,
  LootDropEntity,
  NPCCharacter,
  PartyMember,
  PlayerStats,
  Quest,
  RPGItem,
  SimulatedPlayer,
  WorldMobEntity,
} from '../types';
import { INITIAL_NPCS, MMORPG_CLASSES, COMPANION_PETS_DATABASE, HOMESTEAD_BLUEPRINTS } from '../data/mmorpgData';
import { OpenWorldLandscape } from '../world/OpenWorldLandscape';
import { OpenWorldPlayer } from '../entities/OpenWorldPlayer';
import { collisionSystem } from '../world/WorldCollisionSystem';
import { MobManager } from '../entities/MobManager';
import { LootDropManager } from '../entities/LootDropManager';
import { SimulatedRealmPlayers } from '../entities/SimulatedRealmPlayers';
import { soundSynth } from '../audio/SoundSynthesizer';
import { GenkitAdapter } from '../adapters/GenkitAdapter';
import { ParticleSystem } from './ParticleSystem';
import { RuntimeFrameLoop } from './RuntimeFrameLoop';
import { DeterministicSimulation } from '@shared/deterministicSimulation';
import { syncManager } from './SyncManager';
import { PartyManager } from './PartyManager';


interface ActiveProjectile {
  mesh: THREE.Mesh;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  progress: number;
  speed: number;
  damage: number;
  isCrit: boolean;
  targetMobId: string;
  color: string;
}

interface ActiveAoEEffect {
  mesh: THREE.Mesh;
  timer: number;
  maxTimer: number;
}

export class MMOEngine {
  public container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  // Game Subsystems
  public landscape: OpenWorldLandscape;
  public player: OpenWorldPlayer;
  public mobManager: MobManager;
  public lootManager: LootDropManager;
  public simPlayers: SimulatedRealmPlayers;
  public genkitAdapter: GenkitAdapter;
  public particleSystem: ParticleSystem;

  // Companion Pet & Homestead Subsystems
  public activePet: CompanionPet | null = null;
  private petMeshGroup: THREE.Group | null = null;
  private petPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public unlockedHouses: HomesteadBlueprint[] = [];
  private houseMeshes: THREE.Group[] = [];

  // Party Subsystem
  public partyManager: PartyManager;

  // Day-Night Cycle Subsystem & Atmospheric Lighting
  public timeOfDay: number = 14.0; // 0.0 to 24.0
  public dayNightSpeed: number = 0.045; // ~8-9 minutes per full 24hr cycle
  public isDayNightActive: boolean = true;
  private currentSkyColor: THREE.Color = new THREE.Color(0x1e293b);

  // Lighting & GM Controls
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  public gmConfig: GMWorldConfig = {
    godMode: false,
    infiniteResources: false,
    spawnMobType: 'clockwork_stalker',
    weatherState: 'clear_sun',
    timeOfDay: 14,
    mobSpawnMultiplier: 1.0,
    ambientParticles: true,
  };

  // Active Projectiles & AoE VFX
  private projectiles: ActiveProjectile[] = [];
  private aoeEffects: ActiveAoEEffect[] = [];

  // 3rd-Person Orbit & Follow Camera
  public cameraDistance: number = 10.5;
  public cameraHeight: number = 4.2;
  public cameraYaw: number = 0;
  public cameraPitch: number = 0.28;
  private isOrbitingCamera: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // Controls Input State
  private keysPressed: Record<string, boolean> = {};
  public targetMob: WorldMobEntity | null = null;
  public nearbyNPC: NPCCharacter | null = null;
  public nearbyLoot: LootDropEntity | null = null;

  // Quests & Chat State
  public quests: Quest[] = [];
  public npcs: NPCCharacter[] = INITIAL_NPCS;
  public chatMessages: ChatMessage[] = [];

  // Floating Combat Texts
  public floatingTexts: FloatingCombatText[] = [];
  private textIdCounter: number = 0;
  private resizeObserver?: ResizeObserver;

  // Virtual on-screen movement input
  public virtualForward: number = 0;
  public virtualRight: number = 0;

  // Touch gesture states
  private lastPinchDistance: number = 0;

  // Callback to React
  public onStateUpdate?: (data: {
    stats: PlayerStats;
    equipment: EquipmentState;
    inventory: RPGItem[];
    targetMob: WorldMobEntity | null;
    nearbyNPC: NPCCharacter | null;
    nearbyLoot: LootDropEntity | null;
    quests: Quest[];
    chatMessages: ChatMessage[];
    floatingTexts: FloatingCombatText[];
    simPlayers: SimulatedPlayer[];
    partyMembers: PartyMember[];
    dayNightInfo: DayNightInfo;
  }) => void;

  public onRuntimeError?: (error: unknown) => void;
  private disposed = false;
  private readonly frameLoop = new RuntimeFrameLoop(delta => {
    this.simulation.advanceProjection(delta, step => this.update(step));
    this.renderer.render(this.scene, this.camera);
  }, error => this.failRuntime(error));
  private stateUpdateTimer: number = 0;

  public collisionDebugGroup: THREE.Group | null = null;
  private _enableCollisionVisualizer: boolean = false;

  public get enableCollisionVisualizer(): boolean { return this._enableCollisionVisualizer; }
  public set enableCollisionVisualizer(val: boolean) {
    this._enableCollisionVisualizer = val;
    this.updateCollisionVisualizer();
  }

  public updateCollisionVisualizer(): void {
    if (!this.collisionDebugGroup) {
      this.collisionDebugGroup = new THREE.Group();
      this.scene.add(this.collisionDebugGroup);
    }
    
    // Clear existing
    while (this.collisionDebugGroup.children.length > 0) {
      this.collisionDebugGroup.remove(this.collisionDebugGroup.children[0]);
    }

    this.collisionDebugGroup.visible = this._enableCollisionVisualizer;

    if (this._enableCollisionVisualizer) {
       // Render all static obstacles
       const obs = collisionSystem.getAllObstacles();
       const geo = new THREE.CylinderGeometry(1, 1, 10, 16);
       const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.8 });
       
       obs.forEach(o => {
         const mesh = new THREE.Mesh(geo, mat);
         mesh.scale.set(o.radius, 1, o.radius);
         const y = this.landscape.chunkManager.getElevationAt(o.x, o.z);
         mesh.position.set(o.x, y + 5, o.z);
         this.collisionDebugGroup!.add(mesh);
       });
       
       // Render player hitbox
       const playerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.8 });
       const pMesh = new THREE.Mesh(geo, playerMat);
       pMesh.scale.set(0.65, 0.4, 0.65); // 0.65 player collision radius
       pMesh.name = 'playerHitbox';
       
       // Add dynamic player hitbox
       this.collisionDebugGroup.add(pMesh);
    }
  }

  public static checkWebGLSupport(): { supported: boolean; version?: string; error?: string } {
    try {
      if (typeof window === 'undefined') {
        return { supported: false, error: 'Window environment not available.' };
      }
      const canvas = document.createElement('canvas');
      const gl2 = canvas.getContext('webgl2');
      if (gl2) {
        return { supported: true, version: 'WebGL 2.0' };
      }
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        return { supported: true, version: 'WebGL 1.0' };
      }
      return {
        supported: false,
        error: 'WebGL context initialization failed. Please ensure WebGL and Hardware Acceleration are enabled in your browser.',
      };
    } catch (e: any) {
      return {
        supported: false,
        error: e?.message || 'WebGL check threw an unexpected exception.',
      };
    }
  }

  public static isWebGLAvailable(): boolean {
    return MMOEngine.checkWebGLSupport().supported;
  }

  constructor(container: HTMLElement, startingClass: CharacterClassId, public readonly simulation: DeterministicSimulation) {
    this.container = container;

    // Clear any previous stale canvas or child elements from container
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    // 1. Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1e293b);

    const width = container.clientWidth > 0 ? container.clientWidth : (window.innerWidth || 1280);
    const height = container.clientHeight > 0 ? container.clientHeight : (window.innerHeight || 720);
    const aspect = height > 0 ? width / height : 16 / 9;

    this.camera = new THREE.PerspectiveCamera(55, isFinite(aspect) && aspect > 0 ? aspect : 16 / 9, 0.1, 800);

    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err: any) {
      console.error('MMOEngine: Failed to create WebGLRenderer', err);
      throw new Error(`WebGLRenderer initialization failed: ${err?.message || 'WebGL not supported'}`);
    }

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x1e293b, 1.0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = false;

    // Explicit CSS to eliminate layout glitches, margins, or scrollbars
    const canvas = this.renderer.domElement;
    canvas.id = 'threejs-canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.outline = 'none';
    canvas.style.touchAction = 'none';

    container.appendChild(canvas);

    console.info(
      `[MMOEngine] Initialization: Container=${width}x${height}, RendererAttached=${container.contains(
        canvas
      )}, PixelRatio=${window.devicePixelRatio}`
    );

    // 2. Sophisticated Atmospheric Lighting & Fog
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x475569, 1.6);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 2.5); // Warm Sun
    this.sunLight.position.set(60, 95, 60);
    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight(0x38bdf8, 1.0); // Luminous Aether Fill
    this.fillLight.position.set(-60, 40, -40);
    this.scene.add(this.fillLight);

    this.scene.fog = new THREE.FogExp2(0x1e293b, 0.005);

    // 3. Initialize Subsystems
    this.landscape = new OpenWorldLandscape(this.scene, simulation);
    this.lootManager = new LootDropManager(this.scene, simulation);
    this.player = new OpenWorldPlayer(this.scene, startingClass, simulation);
    this.mobManager = new MobManager(this.scene, this.lootManager, simulation);
    this.simPlayers = new SimulatedRealmPlayers(this.scene, simulation);
    this.partyManager = new PartyManager('Hero', startingClass, 1);
    this.partyManager.onPartyMessage = (sender, text) => {
      this.addChatMessage('party', sender, text);
    };
    this.genkitAdapter = new GenkitAdapter(simulation);
    const particleTier = this.container.clientWidth < 768 ? 'phone' : this.container.clientWidth < 1200 ? 'tablet' : 'desktop';
    this.particleSystem = new ParticleSystem(this.scene, simulation, particleTier);


    // Register landscape steam vents and beacon points into ParticleSystem
    this.landscape.steamVents.forEach((v) => {
      this.particleSystem.registerSteamVent(v.x, v.y, v.z);
    });
    this.particleSystem.registerBeacon(0, 4.2, 0, '#00f2ff'); // Central Aetherium Fountain
    this.particleSystem.registerBeacon(0, 8.0, 65, '#a855f7'); // Void Spire Apex
    this.particleSystem.registerBeacon(55, 3.5, -35, '#10b981'); // Whispering Woods Runestone

    // Dynamic Persistent World Events (Self-expanding world chunks & kingdom borders)
    this.landscape.chunkManager.onChunkLoaded = (chunk) => {
      // Spawn Politics Envoy for ALL chunks (loaded or newly generated)
      this.spawnPoliticsEnvoyForChunk(chunk);
    };

    this.landscape.chunkManager.onNewChunkCreated = (chunk) => {
      this.addFloatingText(
        `🗺️ Territorium erbaut: ${chunk.landmarkName}`,
        this.player.position.x,
        this.player.position.y + 2.4,
        '#00f0ff',
        'xl'
      );
      this.addChatMessage(
        'system',
        'Weltchronik',
        `🗺️ Neues dauerhaftes Territorium [${chunk.kingdom} • ${chunk.landmarkName}] generiert und in der persistenten Weltlogik gespeichert!`
      );
      if (this._enableCollisionVisualizer) {
        this.updateCollisionVisualizer();
      }

      // Spawn Politics Envoy
      this.spawnPoliticsEnvoyForChunk(chunk);
    };

    this.landscape.chunkManager.onKingdomBorderCrossed = (fromK, toK) => {
      this.addFloatingText(
        `⚔️ Grenze: ${toK}`,
        this.player.position.x,
        this.player.position.y + 2.8,
        '#eab308',
        'xl'
      );
      this.addChatMessage(
        'system',
        'Landesgrenze',
        `Du überschreitest die Grenze von [${fromK}] und betrittst nun [${toK}].`
      );
    };

    // Position camera immediately
    const horizDist = this.cameraDistance * Math.cos(this.cameraPitch);
    const vertDist = this.cameraHeight + this.cameraDistance * Math.sin(this.cameraPitch);
    const targetCamX = this.player.position.x + Math.sin(this.cameraYaw) * horizDist;
    const targetCamY = this.player.position.y + vertDist;
    const targetCamZ = this.player.position.z + Math.cos(this.cameraYaw) * horizDist;
    this.camera.position.set(targetCamX, targetCamY, targetCamZ);
    this.camera.lookAt(this.player.position.x, this.player.position.y + 1.6, this.player.position.z);

    // Spawn 3D NPC visuals
    this.spawnNPCVisuals();

    // 4. Initial Quests from NPCs
    this.quests = INITIAL_NPCS.flatMap((n) => n.quests);

    // 5. Initial Chat Announcements
    this.addChatMessage('system', 'System', 'Welcome to the Realm of Aethelgard! Use [W,A,S,D] to move, [1-5] for skills, [Z] for Mount.');
    this.addChatMessage('guild', 'Sir_Galahad_99', 'Heading to the Scorched Quarry to hunt Golems if anyone wants to group up!');
    this.addChatMessage('all', 'ArcaneLilly', 'Has anyone spotted the World Boss Titan Ignis in the South Arena today?');

    // 6. Bind User Controls & Resize Observer
    this.bindEvents();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.disposed) return;
        try {
          this.handleResize();
        } catch (error) {
          this.failRuntime(error);
        }
      });
      this.resizeObserver.observe(this.container);
    }
  }

  private spawnNPCVisuals() {
    this.npcs.forEach((npc) => {
      this.addNPCMesh(npc);
    });
  }

  private addNPCMesh(npc: NPCCharacter) {
    const group = new THREE.Group();
    // Use elevation for spawn
    const elev = this.landscape.chunkManager.getElevationAt(npc.x, npc.z);
    group.position.set(npc.x, elev, npc.z);

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(npc.color),
      metalness: 0.8,
      roughness: 0.2,
    });

    // Body & Robe
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.7, 1.8, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.9;
    group.add(body);

    // Head with glowing crest
    const headGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 2.0;
    group.add(head);

    // Quest Exclamation Icon (Floating Golden Marker)
    const markGeo = new THREE.OctahedronGeometry(0.35, 0);
    const markMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.8,
    });
    const marker = new THREE.Mesh(markGeo, markMat);
    marker.position.y = 3.2;
    // Animate marker in update loop? It currently doesn't animate, let's keep it static for now
    group.add(marker);

    this.scene.add(group);
  }

  public spawnPoliticsEnvoyForChunk(chunk: any) {
    // Only one per chunk
    const npcId = `politics_envoy_${chunk.chunkKey}`;
    if (this.npcs.find(n => n.id === npcId)) return;

    const envoyNPC: NPCCharacter = {
      id: npcId,
      name: `Verwaltungssitz: ${chunk.landmarkName}`,
      title: 'Gebietsvorsitzender & Politik',
      role: 'Territory Envoy',
      zone: chunk.landmarkName,
      x: chunk.centerX,
      y: this.landscape.chunkManager.getElevationAt(chunk.centerX, chunk.centerZ),
      z: chunk.centerZ,
      color: '#00f0ff', // Aurion-Türkis
      dialogue: ['Willkommen, Reisender. Die politische Stabilität dieser Region hängt von tapferen Helden ab.'],
      quests: [
        {
          id: `politics_stabilize_${chunk.chunkKey}`,
          title: 'Politik: Gebiet Stabilisieren',
          description: `Erledige Verwaltungsaufgaben in ${chunk.landmarkName}, um Einfluss zu gewinnen. (+15 XP, +5 Gebietsverwaltungspunkte)`,
          completed: false,
          type: 'explore_zone', // Using an existing type for compatibility
          giverName: 'Territory Envoy',
          giverZone: chunk.landmarkName,
          lore: 'Stabilität sichert das Überleben der Zivilisation.',
          objective: 'Führe Verwaltungsaufgaben aus.',
          targetCount: 1,
          currentCount: 0,
          rewardGold: 0,
          rewardXp: 15
        },
        {
          id: `politics_destabilize_${chunk.chunkKey}`,
          title: 'Politik: Chaos stiften (Destabilisierung)',
          description: `Säe Chaos in ${chunk.landmarkName}, um die Kontrolle des aktuellen Verwalters zu schwächen. (+20 XP, senkt Stabilität)`,
          completed: false,
          type: 'explore_zone',
          giverName: 'Territory Envoy',
          giverZone: chunk.landmarkName,
          lore: 'Chaos ist eine Leiter.',
          objective: 'Störe den Frieden.',
          targetCount: 1,
          currentCount: 0,
          rewardGold: 0,
          rewardXp: 20
        }
      ]
    };
    
    this.npcs.push(envoyNPC);
    this.quests.push(...envoyNPC.quests);
    this.addNPCMesh(envoyNPC);

    // Aurion owns persistent territory state; request a projection without writing from the renderer.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aurion:xaurion-politics-read-request', { detail: { chunkKey: chunk.chunkKey } }));
    }
  }

  public spawnTerritoryGuards(chunkKey: string, count: number, ownerName: string) {
    const chunk = Array.from(this.landscape.chunkManager.chunks.values()).find(c => c.chunkKey === chunkKey);
    if (!chunk) return;

    for (let i = 0; i < count; i++) {
      const guardId = `guard_${chunkKey}_${i}`;
      if (this.npcs.find(n => n.id === guardId)) continue;
      
      const angle = (Math.PI * 2 / count) * i;
      const r = 10; // 10m radius around envoy
      const gx = chunk.centerX + Math.cos(angle) * r;
      const gz = chunk.centerZ + Math.sin(angle) * r;

      const guardNPC: NPCCharacter = {
        id: guardId,
        name: `Territoriumswache`,
        title: `Wache von ${ownerName}`,
        zone: chunk.landmarkName,
        role: 'Guard',
        x: gx,
        y: this.landscape.chunkManager.getElevationAt(gx, gz),
        z: gz,
        color: '#fbbf24', // Gold armor
        dialogue: ['Für den Gebietsvorsitzenden!'],
        quests: []
      };
      
      this.npcs.push(guardNPC);
      this.addNPCMesh(guardNPC);
    }
  }

  private bindEvents() {
    const el = this.renderer.domElement;

    // Keyboard controls
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Mouse camera rotation
    el.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    el.addEventListener('wheel', this.handleWheel, { passive: false });

    // Touch controls for mobile
    el.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    el.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    el.addEventListener('touchend', this.handleTouchEnd);

    // WebGL Context Loss / Restore
    el.addEventListener('webglcontextlost', this.handleContextLost as EventListener, false);
    el.addEventListener('webglcontextrestored', this.handleContextRestored as EventListener, false);

    // Resize
    window.addEventListener('resize', this.handleResize);
  }

  private unbindEvents() {
    const el = this.renderer?.domElement;

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    if (el) {
      el.removeEventListener('mousedown', this.handleMouseDown);
      el.removeEventListener('wheel', this.handleWheel);
      el.removeEventListener('touchstart', this.handleTouchStart);
      el.removeEventListener('touchmove', this.handleTouchMove);
      el.removeEventListener('touchend', this.handleTouchEnd);
      el.removeEventListener('webglcontextlost', this.handleContextLost as EventListener);
      el.removeEventListener('webglcontextrestored', this.handleContextRestored as EventListener);
    }

    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('resize', this.handleResize);
  }

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    this.failRuntime(new Error('WEBGL_CONTEXT_LOST'));
  };

  private handleContextRestored = () => {
    // Context loss disposes this engine; recovery must create a fresh instance.
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    // If typing in chat input, ignore game keybinds
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
      return;
    }

    const key = e.key.toLowerCase();
    this.keysPressed[key] = true;

    // Skill keys 1-5
    if (['1', '2', '3', '4', '5'].includes(key)) {
      e.preventDefault();
      const skillIndex = parseInt(key) - 1;
      this.castClassSkill(skillIndex);
    }

    // Space: Shield / Dodge
    if (e.code === 'Space') {
      e.preventDefault();
      this.castClassSkill(2); // trigger class shield/aoe
    }

    // Z: Mount Toggle
    if (key === 'z') {
      e.preventDefault();
      this.toggleMount();
    }

    // F: Interact (Loot or NPC Talk)
    if (key === 'f') {
      e.preventDefault();
      this.interactNearby();
    }

    // Tab: Cycle Target Mob
    if (key === 'tab') {
      e.preventDefault();
      this.cycleTarget();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    this.keysPressed[key] = false;
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (e.button === 0 || e.button === 2) {
      this.isOrbitingCamera = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isOrbitingCamera) return;

    const deltaX = e.clientX - this.lastMouseX;
    const deltaY = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    this.cameraYaw -= deltaX * 0.006;
    this.cameraPitch = Math.max(0.1, Math.min(1.2, this.cameraPitch + deltaY * 0.004));
  };

  private handleMouseUp = () => {
    this.isOrbitingCamera = false;
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.cameraDistance = Math.max(7.0, Math.min(28.0, this.cameraDistance + e.deltaY * 0.015));
    this.cameraHeight = this.cameraDistance * 0.55;
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      this.isOrbitingCamera = true;
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;
      this.lastPinchDistance = 0;
    } else if (e.touches.length === 2) {
      this.isOrbitingCamera = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.lastPinchDistance = Math.hypot(dx, dy);
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && this.isOrbitingCamera) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - this.lastMouseX;
      const deltaY = touch.clientY - this.lastMouseY;
      this.lastMouseX = touch.clientX;
      this.lastMouseY = touch.clientY;

      this.cameraYaw -= deltaX * 0.008;
      this.cameraPitch = Math.max(0.08, Math.min(1.25, this.cameraPitch + deltaY * 0.005));
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.hypot(dx, dy);

      if (this.lastPinchDistance > 0) {
        const diff = this.lastPinchDistance - distance;
        this.cameraDistance = Math.max(6.0, Math.min(32.0, this.cameraDistance + diff * 0.04));
        this.cameraHeight = this.cameraDistance * 0.55;
      }
      this.lastPinchDistance = distance;
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 0) {
      this.isOrbitingCamera = false;
      this.lastPinchDistance = 0;
    } else if (e.touches.length === 1) {
      this.lastPinchDistance = 0;
      this.isOrbitingCamera = true;
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;
    }
  };

  public toggleMount() {
    const isMounted = this.player.toggleMount();
    soundSynth.playMountSound();
    this.addFloatingText(
      isMounted ? 'Mounted (+100% Speed)' : 'Dismounted',
      this.player.position.x,
      this.player.position.y + 2.5,
      isMounted ? '#38bdf8' : '#94a3b8',
      'md'
    );
  }

  public interactNearby(): { npcOpened?: NPCCharacter; lootCollected?: RPGItem } {
    // 1. Check Loot
    if (this.nearbyLoot) {
      const loot = this.nearbyLoot;
      this.lootManager.removeLoot(loot.id);
      this.player.inventory.push(loot.item);
      if (loot.goldAmount > 0) {
        this.player.stats.gold += loot.goldAmount;
      }
      soundSynth.playLootPickup();
      this.addFloatingText(
        `+ Loot: ${loot.item.name} (${loot.rarity.toUpperCase()})`,
        this.player.position.x,
        this.player.position.y + 2.2,
        loot.beamColor,
        'lg'
      );
      this.addChatMessage(
        'system',
        'Loot',
        `Acquired [${loot.item.name}] (${loot.rarity.toUpperCase()}) and ${loot.goldAmount} Gold!`
      );
      // Progress Quests
      this.progressQuests('collect_loot');
      const item = loot.item;
      this.nearbyLoot = null;
      return { lootCollected: item };
    }

    // 2. Check NPC
    if (this.nearbyNPC) {
      soundSynth.playNpcInteract();
      return { npcOpened: this.nearbyNPC };
    }

    return {};
  }

  public cycleTarget() {
    const nearby = this.mobManager.getNearbyMobs(this.player.position.x, this.player.position.z, 28);
    if (nearby.length === 0) {
      this.targetMob = null;
      return;
    }

    if (!this.targetMob) {
      this.targetMob = nearby[0];
    } else {
      const currentIndex = nearby.findIndex((m) => m.id === this.targetMob?.id);
      this.targetMob = nearby[(currentIndex + 1) % nearby.length];
    }
  }

  public castClassSkill(skillIndex: number) {
    const classDef = MMORPG_CLASSES[this.player.currentClassId];
    if (skillIndex < 0 || skillIndex >= classDef.skills.length) return;

    const skill = classDef.skills[skillIndex];
    if (skill.currentCooldown > 0) {
      this.addFloatingText('Skill on Cooldown!', this.player.position.x, this.player.position.y + 2, '#ef4444', 'sm');
      return;
    }

    if (!this.player.consumeResource(skill.resourceCost)) {
      this.addFloatingText(`Not enough ${this.player.stats.resourceName}!`, this.player.position.x, this.player.position.y + 2, '#f97316', 'sm');
      return;
    }

    skill.currentCooldown = skill.cooldown;

    // Auto-acquire target if none selected
    if (!this.targetMob || Math.hypot(this.targetMob.x - this.player.position.x, this.targetMob.z - this.player.position.z) > 30) {
      const nearby = this.mobManager.getNearbyMobs(this.player.position.x, this.player.position.z, 24);
      if (nearby.length > 0) {
        this.targetMob = nearby[0];
      }
    }

    // Execute Skill Mechanics & Visual Weapon Animation
    soundSynth.playSkillCast(skill.type);
    this.player.triggerAttackAnimation(skill.type, skill.type === 'melee' ? 0.55 : 0.45);

    if (skill.type === 'melee') {
      this.executeMeleeSkill(skill);
    } else if (skill.type === 'projectile') {
      this.executeProjectileSkill(skill);
    } else if (skill.type === 'aoe') {
      this.executeAoESkill(skill);
    } else if (skill.type === 'buff') {
      this.executeBuffSkill(skill);
    } else if (skill.type === 'utility') {
      this.executeUtilitySkill(skill);
    } else if (skill.type === 'turret') {
      this.executeTurretSkill(skill);
    }
  }

  private executeMeleeSkill(skill: ClassSkill) {
    const hitAngle = this.player.facingAngle;
    const hitDistance = skill.range || 4.5;
    const hitCenter = new THREE.Vector3(
      this.player.position.x + Math.sin(hitAngle) * 2.5,
      0.5,
      this.player.position.z + Math.cos(hitAngle) * 2.5
    );

    // Spawn 3D Cleave Arc VFX
    const arcGeo = new THREE.RingGeometry(2.0, 3.8, 16, 1, 0, Math.PI * 0.8);
    arcGeo.rotateX(-Math.PI / 2);
    const arcMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(skill.color),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const arc = new THREE.Mesh(arcGeo, arcMat);
    arc.position.copy(hitCenter);
    arc.rotation.y = hitAngle - Math.PI / 2;
    this.scene.add(arc);
    this.aoeEffects.push({ mesh: arc, timer: 0.25, maxTimer: 0.25 });

    // Particle cleave arc
    this.particleSystem.emit('slash_cleave', hitCenter, skill.color, 1.2);

    // Damage all mobs in cleave radius
    const nearby = this.mobManager.getNearbyMobs(hitCenter.x, hitCenter.z, skill.aoeRadius || 4.0);
    nearby.forEach((mob) => {
      const isCrit = this.simulation.random("combat:critical") * 100 < this.player.stats.critChance;
      const baseDmg = (skill.damage + this.player.stats.attackPower * 0.8);
      const totalDmg = Math.round(isCrit ? baseDmg * 1.85 : baseDmg);

      this.applyDamageToMob(mob.id, totalDmg, isCrit);
    });
  }

  private executeProjectileSkill(skill: ClassSkill) {
    if (!this.targetMob) {
      this.addFloatingText('No Target in Range!', this.player.position.x, this.player.position.y + 2, '#ef4444', 'sm');
      return;
    }

    const startPos = new THREE.Vector3(
      this.player.position.x,
      1.5,
      this.player.position.z
    );
    const targetPos = new THREE.Vector3(this.targetMob.x, 1.2, this.targetMob.z);

    const projGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const projMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(skill.color) });
    const projMesh = new THREE.Mesh(projGeo, projMat);
    projMesh.position.copy(startPos);
    this.scene.add(projMesh);

    const isCrit = this.simulation.random("combat:critical") * 100 < this.player.stats.critChance;
    const baseDmg = skill.damage + (this.player.stats.spellPower || this.player.stats.attackPower) * 0.9;
    const totalDmg = Math.round(isCrit ? baseDmg * 1.9 : baseDmg);

    this.projectiles.push({
      mesh: projMesh,
      startPos,
      targetPos,
      progress: 0,
      speed: 35.0,
      damage: totalDmg,
      isCrit,
      targetMobId: this.targetMob.id,
      color: skill.color,
    });
  }

  private executeAoESkill(skill: ClassSkill) {
    const targetX = this.targetMob ? this.targetMob.x : this.player.position.x + Math.sin(this.player.facingAngle) * 6;
    const targetZ = this.targetMob ? this.targetMob.z : this.player.position.z + Math.cos(this.player.facingAngle) * 6;

    const aoeRadius = skill.aoeRadius || 6.0;

    // 3D AoE Ring Ground Impact
    const ringGeo = new THREE.RingGeometry(0.2, aoeRadius, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(skill.color),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(targetX, 0.08, targetZ);
    this.scene.add(ring);
    this.aoeEffects.push({ mesh: ring, timer: 0.6, maxTimer: 0.6 });

    // Emit AoE Magic impact particles
    this.particleSystem.emit('magic_impact', { x: targetX, y: 0.5, z: targetZ }, skill.color, 1.5);

    // Damage all mobs in area
    const nearby = this.mobManager.getNearbyMobs(targetX, targetZ, aoeRadius);
    nearby.forEach((mob) => {
      const isCrit = this.simulation.random("combat:critical") * 100 < this.player.stats.critChance;
      const baseDmg = skill.damage + (this.player.stats.spellPower + this.player.stats.attackPower) * 0.7;
      const totalDmg = Math.round(isCrit ? baseDmg * 1.8 : baseDmg);

      this.applyDamageToMob(mob.id, totalDmg, isCrit);
    });
  }

  private executeBuffSkill(skill: ClassSkill) {
    if (skill.id === 'k_shield') {
      this.player.triggerShield(6.0);
      this.particleSystem.emit('beacon_activate', this.player.position, '#00f2ff', 0.8);
      this.addFloatingText('Aegis Shield Active (-75% Dmg)', this.player.position.x, this.player.position.y + 2.5, '#00f2ff', 'lg');
    } else if (skill.id === 'e_heal') {
      this.player.heal(220);
      this.particleSystem.emit('heal_sparkle', this.player.position, '#10b981', 1.4);
      this.addFloatingText('+220 HP Recovered', this.player.position.x, this.player.position.y + 2.5, '#10b981', 'lg');
    } else if (skill.id === 'k_overdrive') {
      this.player.buffAttackMultiplier = 1.5;
      this.player.buffSpeedMultiplier = 1.35;
      this.player.buffTimer = 8.0;
      this.player.recalculateStats();
      this.particleSystem.emit('steam_vent', this.player.position, '#ef4444', 1.5);
      this.addFloatingText('Steam Overclock (+50% Atk)', this.player.position.x, this.player.position.y + 2.5, '#ef4444', 'lg');
    }
  }

  private executeUtilitySkill(skill: ClassSkill) {
    // Dash / Teleport forward
    const dashDist = skill.range || 12.0;
    this.particleSystem.emit('teleport_warp', this.player.position, skill.color, 1.0);
    this.player.position.x += Math.sin(this.player.facingAngle) * dashDist;
    this.player.position.z += Math.cos(this.player.facingAngle) * dashDist;
    this.particleSystem.emit('teleport_warp', this.player.position, skill.color, 1.2);
    this.addFloatingText('Chrono Warp Dash', this.player.position.x, this.player.position.y + 2, '#ec4899', 'md');
  }

  private executeTurretSkill(skill: ClassSkill) {
    const turretGeo = new THREE.CylinderGeometry(0.4, 0.6, 1.8, 8);
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9 });
    const turret = new THREE.Mesh(turretGeo, turretMat);
    turret.position.set(
      this.player.position.x + Math.sin(this.player.facingAngle) * 2.0,
      0.9,
      this.player.position.z + Math.cos(this.player.facingAngle) * 2.0
    );
    this.scene.add(turret);
    this.aoeEffects.push({ mesh: turret, timer: 18.0, maxTimer: 18.0 });
    this.particleSystem.emit('steam_vent', turret.position, '#0284c7', 1.0);
    this.addFloatingText('Gatling Turret Deployed', turret.position.x, turret.position.y + 2, '#0ea5e9', 'md');
  }

  private applyDamageToMob(mobId: string, damage: number, isCrit: boolean) {
    const result = this.mobManager.damageMob(mobId, damage);
    if (!result.mob) return;

    soundSynth.playHitSound();

    // Trigger Combat Particle Burst
    if (isCrit) {
      this.particleSystem.emit('combat_crit', { x: result.mob.x, y: result.mob.y + 1.2, z: result.mob.z }, '#fbbf24', 1.2);
    } else {
      this.particleSystem.emit('combat_hit', { x: result.mob.x, y: result.mob.y + 1.0, z: result.mob.z }, '#ffffff', 1.0);
    }

    // Floating damage text
    this.addFloatingText(
      isCrit ? `CRIT! ${damage}` : `${damage}`,
      result.mob.x + (this.simulation.random("loot:position") - 0.5) * 1.2,
      result.mob.y + 2.2,
      isCrit ? '#fbbf24' : '#ffffff',
      isCrit ? 'xl' : 'lg',
      isCrit
    );

    // Award Weapon Mastery Progression for equipped weapon type on combat hit
    const activeWep = this.player.getActiveWeaponType();
    const masteryHitXp = Math.max(5, Math.round(damage * 0.35));
    const hitMastery = this.player.gainWeaponMasteryXp(activeWep, masteryHitXp);
    if (hitMastery.leveledUp) {
      soundSynth.playLevelUp();
      this.particleSystem.emit('beacon_activate', this.player.position, hitMastery.mastery.color, 1.6);
      confetti({ particleCount: 60, spread: 70 });
      this.addFloatingText(
        `★ ${hitMastery.mastery.name.toUpperCase()} RANK ${hitMastery.newLevel}! ★`,
        this.player.position.x,
        this.player.position.y + 2.8,
        hitMastery.mastery.color,
        'xl'
      );
      this.addChatMessage(
        'system',
        'Mastery',
        `⚔️ Your ${hitMastery.mastery.name} advanced to Rank ${hitMastery.newLevel}! (${hitMastery.mastery.scalingAttr})`
      );
    }

    if (result.isKilled) {
      soundSynth.playMobDeath();
      this.player.stats.kills += 1;

      // Award bonus kill weapon mastery XP
      const killMastery = this.player.gainWeaponMasteryXp(activeWep, result.mob.expReward);
      if (killMastery.leveledUp && !hitMastery.leveledUp) {
        soundSynth.playLevelUp();
        this.particleSystem.emit('beacon_activate', this.player.position, killMastery.mastery.color, 1.6);
        confetti({ particleCount: 70, spread: 70 });
        this.addFloatingText(
          `★ ${killMastery.mastery.name.toUpperCase()} RANK ${killMastery.newLevel}! ★`,
          this.player.position.x,
          this.player.position.y + 2.8,
          killMastery.mastery.color,
          'xl'
        );
      }

      if (result.mob.isBoss) {
        this.player.stats.bossKills += 1;
        this.particleSystem.emit('explosion', { x: result.mob.x, y: result.mob.y + 1.8, z: result.mob.z }, '#f97316', 2.2);
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        this.addChatMessage(
          'system',
          'World Boss',
          `⚔️ HERO SLAYER ALERT: World Boss [${result.mob.name}] has been defeated by ${this.player.currentClassId.toUpperCase()}!`
        );
      } else {
        this.particleSystem.emit('blood_oil', { x: result.mob.x, y: result.mob.y + 0.6, z: result.mob.z }, '#991b1b', 1.2);
      }

      // Award XP & Gold
      this.player.stats.gold += result.mob.goldReward;
      const leveledUp = this.player.gainXp(result.mob.expReward);

      this.addFloatingText(
        `+${result.mob.expReward} EXP | +${result.mob.goldReward} Gold`,
        this.player.position.x,
        this.player.position.y + 2.0,
        '#10b981',
        'md'
      );

      if (leveledUp) {
        soundSynth.playLevelUp();
        this.particleSystem.emit('level_up', this.player.position, '#fbbf24', 1.5);
        confetti({ particleCount: 80, spread: 60 });
        this.addFloatingText(
          `★ LEVEL UP! (Lv.${this.player.stats.level}) ★`,
          this.player.position.x,
          this.player.position.y + 3.2,
          '#f59e0b',
          'xl'
        );
        this.addChatMessage(
          'guild',
          'System',
          `Congratulate player on reaching Level ${this.player.stats.level}!`
        );
      }

      // Progress Quests & Genkit Adapter Bounties
      this.genkitAdapter.onMobKilled(result.mob);
      this.progressQuests('kill_mobs', result.mob.type);
      if (result.mob.isBoss) {
        this.progressQuests('kill_boss', 'titan_boss');
      }

      // Party Shared Quest Progression
      const partyAssist = this.partyManager.handleSharedKill(result.mob.name, this.quests);
      if (partyAssist.sharedCount > 0) {
        this.addFloatingText(
          `★ Party Quest Shared (${partyAssist.sharedCount}) ★`,
          this.player.position.x,
          this.player.position.y + 3.4,
          '#38bdf8',
          'md'
        );
      }


      if (this.targetMob?.id === mobId) {
        this.targetMob = null;
      }
    }
  }

  public progressQuests(type: Quest['type'], mobType?: string) {
    this.quests.forEach((q) => {
      if (!q.completed && q.type === type) {
        if (mobType && q.targetMobType && q.targetMobType !== mobType) return;

        q.currentCount = Math.min(q.targetCount, q.currentCount + 1);
        if (q.currentCount >= q.targetCount) {
          q.completed = true;
          this.player.gainXp(q.rewardXp);
          this.player.stats.gold += q.rewardGold;
          if (q.rewardItem) {
            this.player.inventory.push(q.rewardItem);
          }
          soundSynth.playQuestComplete();
          this.addFloatingText(
            `QUEST COMPLETE: ${q.title}!`,
            this.player.position.x,
            this.player.position.y + 3.0,
            '#fbbf24',
            'xl'
          );
          this.addChatMessage('system', 'Quest Master', `Completed Quest: [${q.title}]! Received ${q.rewardGold} Gold.`);
        }
      }
    });
  }

  public addChatMessage(
    channel: ChatMessage['channel'],
    sender: string,
    text: string,
    isPlayer: boolean = false
  ) {
    const seconds = Math.floor(this.simulation.elapsedMilliseconds / 1000);
    const timeStr = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    this.chatMessages.push({
      id: this.simulation.nextId('chat'),
      channel,
      sender,
      text,
      timestamp: timeStr,
      isPlayer,
    });
    if (this.chatMessages.length > 50) {
      this.chatMessages.shift();
    }
  }

  public addFloatingText(
    text: string,
    x: number,
    y: number,
    color: string,
    size: FloatingCombatText['size'] = 'md',
    isCrit: boolean = false
  ) {
    this.floatingTexts.push({
      id: `ftext_${++this.textIdCounter}`,
      text,
      x,
      y,
      color,
      size,
      opacity: 1.0,
      lifespan: 1.4,
      vy: 1.2,
      isCrit,
    });
  }

  public setVirtualMovement(forward: number, right: number) {
    this.virtualForward = forward;
    this.virtualRight = right;
  }

  public start() {
    if (this.disposed) return;
    try {
      this.handleResize();
      this.frameLoop.start();
    } catch (error) {
      this.failRuntime(error);
    }
  }

  private failRuntime(error: unknown) {
    if (this.disposed) return;
    this.stop();
    this.onRuntimeError?.(error);
  }

  public stop() {
    if (this.disposed) return;
    this.disposed = true;
    this.frameLoop.stop();
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.unbindEvents();
    this.particleSystem?.dispose();

    try {
      if (this.renderer) {
        if (this.renderer.domElement && this.renderer.domElement.parentElement === this.container) {
          this.container.removeChild(this.renderer.domElement);
        }
        this.renderer.dispose();
      }
    } catch (e) {
      console.warn('MMOEngine: Error during renderer disposal', e);
    }
  }

  private update(delta: number) {
    // 1. Calculate Movement Vector from WASD / Arrow Keys / Virtual On-Screen Joystick
    let inputForward = this.virtualForward;
    let inputRight = this.virtualRight;

    if (this.keysPressed['w'] || this.keysPressed['arrowup']) inputForward += 1;
    if (this.keysPressed['s'] || this.keysPressed['arrowdown']) inputForward -= 1;
    if (this.keysPressed['d'] || this.keysPressed['arrowright']) inputRight += 1;
    if (this.keysPressed['a'] || this.keysPressed['arrowleft']) inputRight -= 1;

    // Rotate movement vector by Camera Yaw (Forward: camera facing direction, Right: camera strafe right)
    const forwardX = -Math.sin(this.cameraYaw);
    const forwardZ = -Math.cos(this.cameraYaw);
    const rightX = Math.cos(this.cameraYaw);
    const rightZ = -Math.sin(this.cameraYaw);

    const moveX = inputForward * forwardX + inputRight * rightX;
    const moveZ = inputForward * forwardZ + inputRight * rightZ;

    // 2. Update Player
    this.player.update(delta, { x: moveX, z: moveZ });

    // Terrain solid mass height enforcement - player cannot fall through the ground
    const elev = this.landscape.chunkManager.getElevationAt(this.player.position.x, this.player.position.z);
    this.player.position.y = elev;
    this.player.group.position.y = elev;

    // Update collision visualizer player hitbox
    if (this._enableCollisionVisualizer && this.collisionDebugGroup) {
      const pMesh = this.collisionDebugGroup.children.find(c => c.name === 'playerHitbox');
      if (pMesh) {
        pMesh.position.set(this.player.position.x, elev + 2, this.player.position.z);
      }
    }

    // Dynamic Procedural World Expansion (builds map forward as player approaches edges)
    this.landscape.chunkManager.checkPlayerProximity(this.player.position.x, this.player.position.z);

    // Update Landscape Animations (floating crystal, monoliths, etc.)
    this.landscape.update(delta);

    // 3. Update Skill Cooldowns
    const classDef = MMORPG_CLASSES[this.player.currentClassId];
    classDef.skills.forEach((s) => {
      if (s.currentCooldown > 0) {
        s.currentCooldown = Math.max(0, s.currentCooldown - delta);
      }
    });

    // 4. Update 3rd Person Orbit / Follow Camera
    const horizDist = this.cameraDistance * Math.cos(this.cameraPitch);
    const vertDist = this.cameraHeight + this.cameraDistance * Math.sin(this.cameraPitch);
    const targetCamX = this.player.position.x + Math.sin(this.cameraYaw) * horizDist;
    const targetCamY = this.player.position.y + vertDist;
    const targetCamZ = this.player.position.z + Math.cos(this.cameraYaw) * horizDist;

    this.camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), delta * 8.0);
    this.camera.lookAt(this.player.position.x, this.player.position.y + 1.6, this.player.position.z);

    // 5. Update Mobs AI
    this.mobManager.update(delta, this.player.position.x, this.player.position.z, (mob, dmg) => {
      // Mob attacks player
      const res = this.player.takeDamage(dmg);
      soundSynth.playHitSound();
      this.addFloatingText(`-${res.damageTaken}`, this.player.position.x, this.player.position.y + 1.8, '#ef4444', 'lg');

      if (res.isDead) {
        this.addFloatingText('DEFEATED - Respawning at Sanctum...', this.player.position.x, this.player.position.y + 2.5, '#ef4444', 'xl');
        this.player.position.set(0, 0, 8.0); // respawn at open city hub plaza
        this.player.stats.hp = this.player.stats.maxHp;
      }
    });

    // 6. Update Loot Drops & Check nearby interaction prompts
    this.lootManager.update(delta);
    this.nearbyLoot = this.lootManager.getNearbyLoot(this.player.position.x, this.player.position.z, 3.5);

    // Check nearby NPC
    this.nearbyNPC = null;
    for (const npc of this.npcs) {
      if (Math.hypot(npc.x - this.player.position.x, npc.z - this.player.position.z) <= 5.5) {
        this.nearbyNPC = npc;
        break;
      }
    }

    // 7. Update Active Projectiles
    const remainingProjs: ActiveProjectile[] = [];
    this.projectiles.forEach((proj) => {
      proj.progress += (proj.speed * delta) / proj.startPos.distanceTo(proj.targetPos);
      proj.mesh.position.lerpVectors(proj.startPos, proj.targetPos, Math.min(1.0, proj.progress));

      if (proj.progress >= 1.0) {
        this.scene.remove(proj.mesh);
        this.applyDamageToMob(proj.targetMobId, proj.damage, proj.isCrit);
      } else {
        remainingProjs.push(proj);
      }
    });
    this.projectiles = remainingProjs;

    // 8. Update AoE Effects
    const remainingAoE: ActiveAoEEffect[] = [];
    this.aoeEffects.forEach((aoe) => {
      aoe.timer -= delta;
      aoe.mesh.scale.multiplyScalar(1.0 + delta * 0.4);
      if (aoe.timer <= 0) {
        this.scene.remove(aoe.mesh);
      } else {
        remainingAoE.push(aoe);
      }
    });
    this.aoeEffects = remainingAoE;

    // 9. Update Simulated Players
    this.simPlayers.update(delta);

    // 10. Update Floating Combat Texts
    this.floatingTexts.forEach((t) => {
      t.y += t.vy * delta;
      t.lifespan -= delta;
      t.opacity = Math.max(0, t.lifespan / 1.4);
    });
    this.floatingTexts = this.floatingTexts.filter((t) => t.lifespan > 0);

    // 11. Update Particle System
    if (this.particleSystem) {
      this.particleSystem.update(delta, this.gmConfig.ambientParticles);
    }

    // 12. Dynamic Atmospheric Day-Night Cycle
    const dayNightInfo = this.updateDayNightCycle(delta);

    // 13. Update Party Manager & Synchronize Member Vitals
    this.partyManager.updatePlayerStats(
      this.player.stats.hp,
      this.player.stats.maxHp,
      this.player.stats.resource,
      this.player.stats.maxResource,
      this.player.stats.level,
      this.player.stats.currentZone
    );
    this.partyManager.update(delta, !!this.targetMob, this.targetMob);

    // 14. Update Companion Pet following Player
    if (this.petMeshGroup && this.activePet) {
      const offsetDist = 2.2;
      const angle = this.player.facingAngle + Math.PI * 0.75;
      const targetPetX = this.player.position.x + Math.sin(angle) * offsetDist;
      const targetPetZ = this.player.position.z + Math.cos(angle) * offsetDist;
      const targetPetY = this.player.position.y + (this.activePet.species === 'aether_wisp' ? 1.5 + Math.sin(this.simulation.elapsedMilliseconds * 0.004) * 0.3 : 0.3);

      this.petPosition.lerp(new THREE.Vector3(targetPetX, targetPetY, targetPetZ), delta * 5.0);
      this.petMeshGroup.position.copy(this.petPosition);
      this.petMeshGroup.rotation.y = this.player.facingAngle;

      if (this.activePet.species === 'aether_wisp') {
        this.petMeshGroup.rotation.y += delta * 3.0;
      }
    }

    // Update Zone Name
    this.player.stats.currentZone = this.landscape.getZoneName(this.player.position.x, this.player.position.z);

    // 15. Dispatch State to React HUD & Synchronize Backend State
    this.stateUpdateTimer += delta;
    if (this.stateUpdateTimer >= 0.045) {
      this.stateUpdateTimer = 0;

      // Sync state with SyncManager
      syncManager.updateLocalState({
        timestamp: this.simulation.elapsedMilliseconds,
        stats: { ...this.player.stats },
        inventory: [...this.player.inventory],
        quests: [...this.quests],
        activePetId: this.activePet?.id,
        unlockedHouses: this.unlockedHouses.map((h) => h.id),
      });

      this.onStateUpdate?.({
        stats: { ...this.player.stats },
        equipment: { ...this.player.equipment },
        inventory: [...this.player.inventory],
        targetMob: this.targetMob,
        nearbyNPC: this.nearbyNPC,
        nearbyLoot: this.nearbyLoot,
        quests: [...this.quests],
        chatMessages: [...this.chatMessages],
        floatingTexts: [...this.floatingTexts],
        simPlayers: this.simPlayers.getPlayers(),
        partyMembers: this.partyManager.getMembers(),
        dayNightInfo,
      });
    }
  }

  // --- Dynamic Day-Night Atmospheric Cycle Subsystem ---
  public updateDayNightCycle(delta: number): DayNightInfo {
    if (this.isDayNightActive) {
      this.timeOfDay = (this.timeOfDay + delta * this.dayNightSpeed) % 24.0;
    }

    const t = this.timeOfDay;
    const hours = Math.floor(t);
    const minutes = Math.floor((t - hours) * 60);
    const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    let phase: 'dawn' | 'day' | 'dusk' | 'night' = 'day';
    let phaseName = 'Golden Midday';
    let icon = '☀️';

    const targetSunColor = new THREE.Color();
    const targetHemiSky = new THREE.Color();
    const targetHemiGround = new THREE.Color();
    const targetFillColor = new THREE.Color();
    const targetSkyColor = new THREE.Color();

    let targetSunIntensity = 2.5;
    let targetHemiIntensity = 1.6;
    let targetFillIntensity = 1.0;
    let targetExposure = 1.35;

    // Solar angle: 0 at 6am, PI/2 at 12pm, PI at 6pm, 3PI/2 at 12am
    const solarAngle = ((t - 6.0) / 24.0) * Math.PI * 2;
    const sunDist = 120;
    const sunX = Math.cos(solarAngle) * sunDist;
    const sunY = Math.max(12, Math.sin(solarAngle) * sunDist);
    const sunZ = 50 + Math.cos(solarAngle * 0.5) * 30;

    this.sunLight.position.set(sunX, sunY, sunZ);
    this.fillLight.position.set(-sunX * 0.7, Math.max(15, -sunY * 0.4 + 45), -sunZ * 0.7);

    if (t >= 5.0 && t < 8.5) {
      // DAWN / SUNRISE (05:00 - 08:30)
      phase = 'dawn';
      phaseName = 'Amber Steam Dawn';
      icon = '🌅';
      const progress = (t - 5.0) / 3.5;

      targetSunColor.setHex(0xf59e0b).lerp(new THREE.Color(0xfffbeb), progress);
      targetHemiSky.setHex(0xf97316).lerp(new THREE.Color(0x93c5fd), progress);
      targetHemiGround.setHex(0x451a03).lerp(new THREE.Color(0x475569), progress);
      targetFillColor.setHex(0xc084fc).lerp(new THREE.Color(0x38bdf8), progress);
      targetSkyColor.setHex(0x2a1b2d).lerp(new THREE.Color(0x1e293b), progress);

      targetSunIntensity = 0.8 + progress * 1.7;
      targetHemiIntensity = 1.0 + progress * 0.6;
      targetFillIntensity = 0.6 + progress * 0.4;
      targetExposure = 1.1 + progress * 0.25;
    } else if (t >= 8.5 && t < 17.5) {
      // MIDDAY / DAY (08:30 - 17:30)
      phase = 'day';
      phaseName = 'Golden Sun Midday';
      icon = '☀️';

      targetSunColor.setHex(0xfffbeb);
      targetHemiSky.setHex(0x93c5fd);
      targetHemiGround.setHex(0x475569);
      targetFillColor.setHex(0x38bdf8);
      targetSkyColor.setHex(0x1e293b);

      targetSunIntensity = 2.6;
      targetHemiIntensity = 1.7;
      targetFillIntensity = 1.1;
      targetExposure = 1.35;
    } else if (t >= 17.5 && t < 21.0) {
      // DUSK / TWILIGHT (17:30 - 21:00)
      phase = 'dusk';
      phaseName = 'Crimson Aether Twilight';
      icon = '🌇';
      const progress = (t - 17.5) / 3.5;

      targetSunColor.setHex(0xea580c).lerp(new THREE.Color(0xa855f7), progress);
      targetHemiSky.setHex(0x7e22ce).lerp(new THREE.Color(0x1e1b4b), progress);
      targetHemiGround.setHex(0x7c2d12).lerp(new THREE.Color(0x0f172a), progress);
      targetFillColor.setHex(0xf59e0b).lerp(new THREE.Color(0x06b6d4), progress);
      targetSkyColor.setHex(0x27173a).lerp(new THREE.Color(0x0a0f1d), progress);

      targetSunIntensity = 2.2 - progress * 1.4;
      targetHemiIntensity = 1.5 - progress * 0.6;
      targetFillIntensity = 1.0 - progress * 0.2;
      targetExposure = 1.3 - progress * 0.3;
    } else {
      // NIGHT / MIDNIGHT (21:00 - 05:00)
      phase = 'night';
      phaseName = 'Starlit Aether Night';
      icon = '🌙';

      targetSunColor.setHex(0x7dd3fc); // Silvery moonlight
      targetHemiSky.setHex(0x1e1b4b); // Deep celestial indigo
      targetHemiGround.setHex(0x0f172a);
      targetFillColor.setHex(0x06b6d4); // Neon cyan aether glow
      targetSkyColor.setHex(0x080c18); // Midnight abyss

      targetSunIntensity = 0.95; // Moon radiance
      targetHemiIntensity = 0.95;
      targetFillIntensity = 0.85;
      targetExposure = 1.05;
    }

    // Smoothly blend light values
    const lerpRate = Math.min(1.0, delta * 4.0);
    this.sunLight.color.lerp(targetSunColor, lerpRate);
    this.sunLight.intensity = THREE.MathUtils.lerp(this.sunLight.intensity, targetSunIntensity, lerpRate);

    this.hemiLight.color.lerp(targetHemiSky, lerpRate);
    this.hemiLight.groundColor.lerp(targetHemiGround, lerpRate);
    this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, targetHemiIntensity, lerpRate);

    this.fillLight.color.lerp(targetFillColor, lerpRate);
    this.fillLight.intensity = THREE.MathUtils.lerp(this.fillLight.intensity, targetFillIntensity, lerpRate);

    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(this.renderer.toneMappingExposure, targetExposure, lerpRate);

    this.currentSkyColor.lerp(targetSkyColor, lerpRate);
    this.renderer.setClearColor(this.currentSkyColor, 1.0);
    if (this.scene.fog) {
      this.scene.fog.color.copy(this.currentSkyColor);
    }

    return {
      timeOfDay: t,
      formattedTime,
      phase,
      phaseName,
      icon,
      sunIntensity: this.sunLight.intensity,
      skyColorHex: '#' + this.currentSkyColor.getHexString(),
    };
  }

  // --- Inventory Auto-Sorting Subsystem ---
  public sortInventory(mode: 'rarity' | 'name' | 'type') {
    const rarityWeight: Record<string, number> = {
      legendary: 5,
      epic: 4,
      rare: 3,
      uncommon: 2,
      common: 1,
    };
    const slotWeight: Record<string, number> = {
      weapon: 1,
      shield: 2,
      helmet: 3,
      chest: 4,
      boots: 5,
      relic: 6,
      mount: 7,
      consumable: 8,
    };

    if (mode === 'rarity') {
      this.player.inventory.sort((a, b) => (rarityWeight[b.rarity] || 0) - (rarityWeight[a.rarity] || 0));
    } else if (mode === 'name') {
      this.player.inventory.sort((a, b) => a.name.localeCompare(b.name));
    } else if (mode === 'type') {
      this.player.inventory.sort((a, b) => (slotWeight[a.slot] || 99) - (slotWeight[b.slot] || 99));
    }

    soundSynth.playItemEquip();
  }


  // --- Companion Pet Subsystem ---
  public tamePet(pet: CompanionPet) {
    this.activePet = pet;

    // Apply pet stat buffs
    this.player.stats.attackPower += pet.bonusAttack;
    this.player.stats.moveSpeedMultiplier += pet.bonusSpeed / 100;
    this.player.recalculateStats();

    // Spawn 3D Mesh
    this.spawnPetMesh(pet);

    // Particles and sounds
    this.particleSystem.emit('beacon_activate', this.player.position, pet.color, 1.4);
    soundSynth.playQuestComplete();
    this.addFloatingText(`★ Pet Companion [${pet.name}] Bound! ★`, this.player.position.x, this.player.position.y + 2.8, pet.color, 'xl');
    this.addChatMessage('system', 'Beast Tamer', `Successfully bonded with companion pet [${pet.name}]! (+${pet.bonusAttack} Atk, +${pet.bonusSpeed}% Spd).`);

    this.progressQuests('tame_pet');
  }

  private spawnPetMesh(pet: CompanionPet) {
    if (this.petMeshGroup) {
      this.scene.remove(this.petMeshGroup);
      this.petMeshGroup = null;
    }

    const group = new THREE.Group();
    this.petPosition.set(this.player.position.x + 2, 0.3, this.player.position.z + 2);
    group.position.copy(this.petPosition);

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(pet.color),
      metalness: pet.species === 'clockwork_hound' ? 0.9 : 0.4,
      roughness: 0.3,
    });

    if (pet.species === 'aether_wisp') {
      const coreGeo = new THREE.SphereGeometry(0.4, 16, 16);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 2.0,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      const ringGeo = new THREE.TorusGeometry(0.7, 0.08, 8, 24);
      const ring = new THREE.Mesh(ringGeo, coreMat);
      ring.rotation.x = Math.PI / 3;
      group.add(ring);
    } else if (pet.species === 'clockwork_hound') {
      const bodyGeo = new THREE.BoxGeometry(0.8, 0.6, 1.2);
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 0.5;
      group.add(body);

      const headGeo = new THREE.BoxGeometry(0.5, 0.45, 0.6);
      const head = new THREE.Mesh(headGeo, mat);
      head.position.set(0, 0.8, 0.6);
      group.add(head);

      const earL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), mat);
      earL.position.set(-0.2, 1.1, 0.6);
      const earR = earL.clone();
      earR.position.x = 0.2;
      group.add(earL);
      group.add(earR);
    } else {
      // Drake / Gryphon miniature
      const bodyGeo = new THREE.ConeGeometry(0.5, 1.2, 6);
      bodyGeo.rotateX(Math.PI / 2);
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 0.6;
      group.add(body);

      const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.4), mat);
      wingL.position.set(-0.6, 0.8, 0);
      wingL.rotation.z = Math.PI / 6;
      const wingR = wingL.clone();
      wingR.position.x = 0.6;
      wingR.rotation.z = -Math.PI / 6;
      group.add(wingL);
      group.add(wingR);
    }

    this.petMeshGroup = group;
    this.scene.add(group);
  }

  // --- Homestead House Subsystem ---
  public buildHomestead(blueprint: HomesteadBlueprint) {
    if (this.unlockedHouses.some((h) => h.id === blueprint.id)) return;
    this.unlockedHouses.push(blueprint);

    // Apply House Perks
    this.player.stats.maxHp += blueprint.tier === 1 ? 50 : blueprint.tier === 2 ? 150 : 300;
    this.player.stats.hp = this.player.stats.maxHp;
    this.player.recalculateStats();

    // Spawn 3D Architecture in the West Homestead district
    const houseGroup = new THREE.Group();
    const houseX = -26 - (this.unlockedHouses.length - 1) * 8;
    const houseZ = 16 + (this.unlockedHouses.length - 1) * 6;
    houseGroup.position.set(houseX, 0, houseZ);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const roofMat = new THREE.MeshStandardMaterial({ color: blueprint.tier === 3 ? 0x1e3a8a : 0x991b1b, roughness: 0.6 });

    // Foundation & Walls
    const wallGeo = new THREE.BoxGeometry(6, 4 + blueprint.tier * 1.5, 6);
    const walls = new THREE.Mesh(wallGeo, woodMat);
    walls.position.y = (4 + blueprint.tier * 1.5) / 2;
    houseGroup.add(walls);

    // Stone Base Trim
    const baseGeo = new THREE.BoxGeometry(6.4, 1.2, 6.4);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 0.6;
    houseGroup.add(base);

    // Roof
    const roofGeo = new THREE.ConeGeometry(5.2, 3.5, 4);
    roofGeo.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 4 + blueprint.tier * 1.5 + 1.75;
    houseGroup.add(roof);

    // Chimney with steam smoke
    const chimneyGeo = new THREE.BoxGeometry(0.8, 4.0, 0.8);
    const chimney = new THREE.Mesh(chimneyGeo, stoneMat);
    chimney.position.set(2.0, 4 + blueprint.tier * 1.5, -1.5);
    houseGroup.add(chimney);

    this.particleSystem.registerSteamVent(houseX + 2.0, 4 + blueprint.tier * 1.5 + 2.0, houseZ - 1.5);

    this.houseMeshes.push(houseGroup);
    this.scene.add(houseGroup);

    // Particles and announcements
    this.particleSystem.emit('beacon_activate', houseGroup.position, '#eab308', 2.0);
    soundSynth.playQuestComplete();
    this.addFloatingText(`★ HOMESTEAD CONSTRUCTED: ${blueprint.name}! ★`, this.player.position.x, this.player.position.y + 3.2, '#eab308', 'xl');
    this.addChatMessage('system', 'Architect Silas', `Congratulations on building your [${blueprint.name}] in the West District! Perks unlocked.`);

    this.progressQuests('build_house');
  }

  // --- Admin / GM World Edit Tools ---
  public applyGMConfig(config: Partial<GMWorldConfig>) {
    this.gmConfig = { ...this.gmConfig, ...config };

    if (config.timeOfDay !== undefined) {
      const angle = ((this.gmConfig.timeOfDay - 6) / 24) * Math.PI * 2;
      this.sunLight.position.set(Math.cos(angle) * 90, Math.sin(angle) * 90, 60);
      const isNight = this.gmConfig.timeOfDay < 6 || this.gmConfig.timeOfDay > 19;
      this.sunLight.intensity = isNight ? 0.3 : 2.5;
      this.hemiLight.intensity = isNight ? 0.6 : 1.6;
    }

    if (config.weatherState) {
      if (config.weatherState === 'blood_moon') {
        this.scene.background = new THREE.Color(0x2a0808);
        this.sunLight.color = new THREE.Color(0xef4444);
      } else if (config.weatherState === 'aether_aurora') {
        this.scene.background = new THREE.Color(0x042f2e);
        this.sunLight.color = new THREE.Color(0x2dd4bf);
      } else if (config.weatherState === 'void_storm') {
        this.scene.background = new THREE.Color(0x1e1035);
        this.sunLight.color = new THREE.Color(0xa855f7);
      } else {
        this.scene.background = new THREE.Color(0x1e293b);
        this.sunLight.color = new THREE.Color(0xfffbeb);
      }
    }

    if (this.gmConfig.godMode) {
      this.player.stats.hp = this.player.stats.maxHp;
      this.player.stats.resource = this.player.stats.maxResource;
    }

    if (this.gmConfig.infiniteResources) {
      this.player.stats.gold = Math.max(this.player.stats.gold, 999999);
    }

    this.addFloatingText('GM World Configuration Updated', this.player.position.x, this.player.position.y + 2.0, '#38bdf8', 'md');
  }

  public spawnCustomMob(type: WorldMobEntity['type'], x?: number, z?: number) {
    const spawnX = x !== undefined ? x : this.player.position.x + (this.simulation.random("mob:spawn") - 0.5) * 10;
    const spawnZ = z !== undefined ? z : this.player.position.z + (this.simulation.random("mob:spawn") - 0.5) * 10;

    this.mobManager.spawnCustomMob(type, spawnX, spawnZ);
    this.particleSystem.emit('teleport_warp', { x: spawnX, y: 1.0, z: spawnZ }, '#a855f7', 1.5);
    this.addFloatingText(`GM Spawned [${type.toUpperCase()}]`, spawnX, 2.5, '#a855f7', 'lg');
  }

  public equipItem(item: RPGItem): RPGItem | null {
    const prev = this.player.equipItem(item);
    this.player.observeEquipmentState();
    return prev;
  }

  public unequipItem(slotName: string): RPGItem | null {
    const unequipped = this.player.unequipSlot(slotName as any);
    this.player.observeEquipmentState();
    return unequipped;
  }

  public observePlayerEquipment(callback: (equipment: EquipmentState) => void): () => void {
    return this.player.addEquipmentListener(callback);
  }

  private handleResize = () => {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth || 1280;
    const height = this.container.clientHeight || window.innerHeight || 720;
    if (height <= 0 || width <= 0) return;
    const aspect = width / height;
    if (!isFinite(aspect) || isNaN(aspect) || aspect <= 0) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };
}
