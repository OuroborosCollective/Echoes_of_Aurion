import * as THREE from 'three';
import { BiomeType, LandmarkType, SolidObstacle, WorldChunkData, WorldExpansionStats } from '../types';
import { collisionSystem } from './WorldCollisionSystem';

export class WorldChunkManager {
  public scene: THREE.Scene;
  public group: THREE.Group;
  public chunkSize: number = 80.0; // 80m x 80m per chunk = 6,400 m² per chunk
  public chunks: Map<string, WorldChunkData> = new Map();
  private chunkMeshes: Map<string, THREE.Group> = new Map();
  private isGenerating: boolean = false;
  private lastCheckedChunkKey: string = '';

  // Kingdom Definitions & Lore
  public readonly KINGDOMS = [
    { id: 'aurion', name: 'Königreich Aurion-Hochland', color: '#06b6d4', bannerColor: 0x06b6d4 },
    { id: 'fluesterhain', name: 'Großfürstentum Flüsterhain', color: '#10b981', bannerColor: 0x10b981 },
    { id: 'emberfall', name: 'Emberfall-Mark & Aschengebirge', color: '#f97316', bannerColor: 0xf97316 },
    { id: 'sonnenwacht', name: 'Baronie Sonnenwacht-Wüste', color: '#eab308', bannerColor: 0xeab308 },
    { id: 'frostkrone', name: 'Grenzmark Frostkrone', color: '#38bdf8', bannerColor: 0x38bdf8 },
  ];

  public onNewChunkCreated?: (chunk: WorldChunkData) => void;
  public onChunkLoaded?: (chunk: WorldChunkData) => void;
  public onKingdomBorderCrossed?: (fromKingdom: string, toKingdom: string) => void;
  private currentKingdom: string = 'Königreich Aurion-Hochland';

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Bootstrap initial central chunk (0,0) as Sanctum Hub.
    // Persistence stays owned by Aurion's authenticated server/runtime surfaces.
    this.registerCentralSanctumChunk();
  }

  /**
   * Bootstraps the central chunk so coordinate (0,0) is recognized in the runtime world map.
   */
  private registerCentralSanctumChunk(): void {
    const key = '0,0';
    if (this.chunks.has(key)) return;

    const chunkData: WorldChunkData = {
      chunkKey: key,
      chunkX: 0,
      chunkZ: 0,
      centerX: 0,
      centerZ: 0,
      size: this.chunkSize,
      biome: 'sanctum_capital',
      kingdom: 'Königreich Aurion-Hochland',
      landmarkType: 'sanctum',
      landmarkName: 'Aethelgard Sanctum (Hauptstadt)',
      elevationBase: 0,
      materialTheme: 'starpath',
      obstacles: [],
      featureDescription: 'Goldverzierte Palaststraße, Aetherium-Brunnen & königliche Wachtürme',
      createdAt: new Date(0).toISOString(),
    };

    this.chunks.set(key, chunkData);
  }

  /**
   * Client-side xaurion deliberately does not persist chunks.
   *
   * Aurion owns world persistence through its authenticated server-side
   * session / zone / MariaDB surfaces. This manager only builds the
   * deterministic visual/gameplay projection for the active runtime.
   */

  /**
   * Deterministic seed generator based on chunk coordinates
   */
  private getChunkSeed(cx: number, cz: number): number {
    let h = (cx * 73856093) ^ (cz * 19349663);
    h = (h ^ (h >>> 16)) * 0x85ebca6b;
    h = (h ^ (h >>> 13)) * 0xc2b2ae35;
    return (h ^ (h >>> 16)) >>> 0;
  }

  /**
   * Deterministic pseudo-random number generator for consistent chunk reconstruction
   */
  private createRng(seed: number) {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  /**
   * Returns the exact Y elevation of the terrain at a given world coordinate.
   * This guarantees player entities and models stay firmly on the ground.
   */
  public getElevationAt(worldX: number, worldZ: number): number {
    const cx = Math.round(worldX / this.chunkSize);
    const cz = Math.round(worldZ / this.chunkSize);
    const chunkKey = `${cx},${cz}`;
    const chunk = this.chunks.get(chunkKey);
    
    const elevationBase = chunk ? chunk.elevationBase : 0;
    
    // Exact match of the formula in renderChunkMeshes
    return Math.sin(worldX * 0.08) * Math.cos(worldZ * 0.08) * 1.8 + elevationBase * 0.5;
  }

  /**
   * Checks player coordinates. If within 50m of any unbuilt adjacent chunk,
   * generates the new territory into the deterministic runtime world projection.
   */
  public checkPlayerProximity(playerX: number, playerZ: number): void {
    if (this.isGenerating) return;

    const currentCx = Math.round(playerX / this.chunkSize);
    const currentCz = Math.round(playerZ / this.chunkSize);
    const key = `${currentCx},${currentCz}`;

    // Kingdom border transition detection
    const currentChunk = this.chunks.get(key);
    if (currentChunk && currentChunk.kingdom !== this.currentKingdom) {
      const oldKingdom = this.currentKingdom;
      this.currentKingdom = currentChunk.kingdom;
      this.onKingdomBorderCrossed?.(oldKingdom, this.currentKingdom);
    }

    if (key === this.lastCheckedChunkKey) return;
    this.lastCheckedChunkKey = key;

    // Check surrounding 3x3 radius of chunks (and expand up to 5x5 if near edges)
    const radius = 2; // Radius 2 gives 5x5 chunks around player = 400m x 400m = 160,000 m²!
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const cx = currentCx + dx;
        const cz = currentCz + dz;
        const chunkKey = `${cx},${cz}`;

        if (!this.chunks.has(chunkKey)) {
          this.buildAndSaveChunk(cx, cz);
        }
      }
    }
  }

  /**
   * Builds a new chunk and creates its geometry with solid colliders.
   * The legacy ZIP method name is retained for call-site compatibility; no persistence occurs here.
   */
  public buildAndSaveChunk(cx: number, cz: number): WorldChunkData {
    const chunkKey = `${cx},${cz}`;
    if (this.chunks.has(chunkKey)) {
      return this.chunks.get(chunkKey)!;
    }

    this.isGenerating = true;
    const seed = this.getChunkSeed(cx, cz);
    const rng = this.createRng(seed);

    const centerX = cx * this.chunkSize;
    const centerZ = cz * this.chunkSize;

    // Determine Kingdom & Landmark type deterministically based on coordinates
    let kingdom = this.KINGDOMS[0].name;
    let biome: BiomeType = 'whispering_forest';
    let landmarkType: LandmarkType = 'forest';
    let landmarkName = '';
    let materialTheme: WorldChunkData['materialTheme'] = 'grass';

    const distFromOrigin = Math.hypot(cx, cz);

    if (cz < -1 && cx >= 0) {
      // North-East: Whispering Forest
      kingdom = this.KINGDOMS[1].name;
      biome = 'whispering_forest';
      materialTheme = 'flower_meadow';
      if (Math.abs(cx) + Math.abs(cz) % 3 === 0) {
        landmarkType = 'dungeon';
        landmarkName = `Aschengewölbe-Krypta (${cx},${cz})`;
      } else {
        landmarkType = 'forest';
        landmarkName = `Flüsterwald-Dickicht (${cx},${cz})`;
      }
    } else if (cx < -1) {
      // West: Emberfall March & Volcano
      kingdom = this.KINGDOMS[2].name;
      biome = 'emberfall_march';
      materialTheme = 'earth';
      if ((Math.abs(cx) + Math.abs(cz)) % 4 === 0) {
        landmarkType = 'dungeon';
        landmarkName = `Schmelzkern-Verlies (${cx},${cz})`;
      } else if (Math.abs(cz) % 2 === 0) {
        landmarkType = 'city';
        landmarkName = `Emberfall-Außenposten (${cx},${cz})`;
      } else {
        landmarkType = 'quarry';
        landmarkName = `Scorched Crag Quarry (${cx},${cz})`;
      }
    } else if (cz > 1 && cx <= 0) {
      // South: Sunwatch Barony & Borderlands
      kingdom = this.KINGDOMS[3].name;
      biome = 'sunwatch_bastion';
      materialTheme = 'farmland';
      if (Math.abs(cz) >= 3 && Math.abs(cx) <= 1) {
        landmarkType = 'border';
        landmarkName = `Landesgrenze Aurion / Sonnenwacht (${cx},${cz})`;
      } else {
        landmarkType = 'city';
        landmarkName = `Bastion der Sonnenwacht (${cx},${cz})`;
      }
    } else {
      // General expansions: Distribute between Forests, Cities, Dungeons, and Borders
      const mod = Math.abs(cx * 3 + cz * 7) % 5;
      if (mod === 0) {
        landmarkType = 'city';
        landmarkName = `Aethelgard Freistadt (${cx},${cz})`;
        kingdom = this.KINGDOMS[0].name;
        materialTheme = 'starpath';
      } else if (mod === 1) {
        landmarkType = 'dungeon';
        landmarkName = `Vergessenes Runen-Dungeon (${cx},${cz})`;
        kingdom = this.KINGDOMS[1].name;
        materialTheme = 'earth';
      } else if (mod === 2) {
        landmarkType = 'forest';
        landmarkName = `Uralter Eichenhain (${cx},${cz})`;
        kingdom = this.KINGDOMS[1].name;
        materialTheme = 'flower_meadow';
      } else if (mod === 3) {
        landmarkType = 'border';
        landmarkName = `Reichsgrenzturm & Grenzwall (${cx},${cz})`;
        kingdom = this.KINGDOMS[4].name;
        materialTheme = 'starpath_crossing';
      } else {
        landmarkType = 'forest';
        landmarkName = `Mondlicht-Waldung (${cx},${cz})`;
        kingdom = this.KINGDOMS[0].name;
        materialTheme = 'grass';
      }
    }

    const obstacles: SolidObstacle[] = [];
    const elevationBase = (rng() - 0.5) * 4.0;

    // Generate Solid Obstacles based on landmark type
    if (landmarkType === 'forest') {
      // 14 to 20 solid trees, boulders, and ancient fallen trunks
      const treeCount = 12 + Math.floor(rng() * 8);
      for (let i = 0; i < treeCount; i++) {
        const ox = centerX + (rng() - 0.5) * (this.chunkSize - 12);
        const oz = centerZ + (rng() - 0.5) * (this.chunkSize - 12);
        const radius = 0.9 + rng() * 0.5; // Solid tree trunk radius
        obstacles.push({
          id: `tree_${chunkKey}_${i}`,
          type: 'tree',
          x: ox,
          z: oz,
          radius,
          height: 7.0 + rng() * 4.0,
          name: 'Flüsterwald-Baum',
          chunkKey,
        });
      }
      // 4 to 6 solid mossy rock boulders
      const rockCount = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < rockCount; i++) {
        const ox = centerX + (rng() - 0.5) * (this.chunkSize - 16);
        const oz = centerZ + (rng() - 0.5) * (this.chunkSize - 16);
        const radius = 2.0 + rng() * 1.5;
        obstacles.push({
          id: `rock_${chunkKey}_${i}`,
          type: 'rock',
          x: ox,
          z: oz,
          radius,
          height: 3.5,
          name: 'Moosiger Granitfelsen',
          chunkKey,
        });
      }
    } else if (landmarkType === 'city') {
      // 3 to 5 stone buildings, 2 guard towers, and stone walls
      const buildingCount = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < buildingCount; i++) {
        const angle = (i / buildingCount) * Math.PI * 2;
        const dist = 18 + rng() * 12;
        const ox = centerX + Math.cos(angle) * dist;
        const oz = centerZ + Math.sin(angle) * dist;
        obstacles.push({
          id: `bldg_${chunkKey}_${i}`,
          type: 'building',
          x: ox,
          z: oz,
          radius: 5.5, // 11m building bounding box
          height: 7.0,
          name: 'Stadtgebäude / Zunfthaus',
          chunkKey,
        });
      }
      // 2 Guard Watchtowers
      for (let i = 0; i < 2; i++) {
        const ox = centerX + (i === 0 ? -24 : 24);
        const oz = centerZ + (i === 0 ? -24 : 24);
        obstacles.push({
          id: `tower_${chunkKey}_${i}`,
          type: 'tower',
          x: ox,
          z: oz,
          radius: 3.2,
          height: 12.0,
          name: 'Königlicher Wachturm',
          chunkKey,
        });
      }
    } else if (landmarkType === 'dungeon') {
      // Dungeon Gateway Arch & 4 Sentinel Pillars
      obstacles.push({
        id: `dungeon_gate_${chunkKey}`,
        type: 'dungeon_gate',
        x: centerX,
        z: centerZ,
        radius: 4.8, // Solid gateway arch structure
        height: 9.0,
        name: 'Aschengewölbe-Dungeontor',
        chunkKey,
      });
      // 4 Surrounding Rune Obelisks / Pillars
      const pillarOffsets = [
        { dx: -12, dz: -12 },
        { dx: 12, dz: -12 },
        { dx: -12, dz: 12 },
        { dx: 12, dz: 12 },
      ];
      pillarOffsets.forEach((po, idx) => {
        obstacles.push({
          id: `pillar_${chunkKey}_${idx}`,
          type: 'ruin_pillar',
          x: centerX + po.dx,
          z: centerZ + po.dz,
          radius: 1.6,
          height: 5.5,
          name: 'Wächter-Monolith',
          chunkKey,
        });
      });
    } else if (landmarkType === 'border') {
      // Border Wall, Landmark Boundary Stone & Frontier Gate
      obstacles.push({
        id: `border_stone_${chunkKey}`,
        type: 'border_stone',
        x: centerX,
        z: centerZ,
        radius: 2.8,
        height: 6.0,
        name: 'Königlicher Grenzstein',
        chunkKey,
      });
      // Barrier Wall Segments (with road gap)
      obstacles.push(
        {
          id: `border_wall_left_${chunkKey}`,
          type: 'wall',
          x: centerX - 18,
          z: centerZ,
          radius: 4.0,
          height: 4.5,
          name: 'Grenzwall-Flügel West',
          chunkKey,
        },
        {
          id: `border_wall_right_${chunkKey}`,
          type: 'wall',
          x: centerX + 18,
          z: centerZ,
          radius: 4.0,
          height: 4.5,
          name: 'Grenzwall-Flügel Ost',
          chunkKey,
        }
      );
    } else {
      // Quarry / Mounds
      const moundCount = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < moundCount; i++) {
        const ox = centerX + (rng() - 0.5) * (this.chunkSize - 20);
        const oz = centerZ + (rng() - 0.5) * (this.chunkSize - 20);
        obstacles.push({
          id: `mound_${chunkKey}_${i}`,
          type: 'mound',
          x: ox,
          z: oz,
          radius: 3.5 + rng() * 2.0,
          height: 4.0,
          name: 'Erdhügel / Basaltfelsen',
          chunkKey,
        });
      }
    }

    const chunkData: WorldChunkData = {
      chunkKey,
      chunkX: cx,
      chunkZ: cz,
      centerX,
      centerZ,
      size: this.chunkSize,
      biome,
      kingdom,
      landmarkType,
      landmarkName,
      elevationBase,
      materialTheme,
      obstacles,
      featureDescription: `${kingdom} - ${landmarkName} mit ${obstacles.length} festen Objekten`,
      createdAt: new Date(0).toISOString(),
    };

    // Store in world state
    this.chunks.set(chunkKey, chunkData);

    // Register all obstacles in the solid collision system!
    collisionSystem.registerObstacles(obstacles);

    // Render 3D representation in the Three.js scene
    this.renderChunkMeshes(chunkData);

    this.isGenerating = false;
    this.onNewChunkCreated?.(chunkData);

    return chunkData;
  }

  /**
   * Renders the 3D meshes for a chunk (Terrain, Trees, Buildings, Dungeon Gates, Border Stones).
   */
  public renderChunkMeshes(chunk: WorldChunkData): void {
    if (this.chunkMeshes.has(chunk.chunkKey)) return;

    const group = new THREE.Group();
    group.position.set(chunk.centerX, 0, chunk.centerZ);

    // 1. Chunk Terrain Plane
    const half = this.chunkSize / 2;
    const segs = 16;
    const terrainGeo = new THREE.PlaneGeometry(this.chunkSize, this.chunkSize, segs, segs);
    terrainGeo.rotateX(-Math.PI / 2);

    // Biome color
    let terrainColor = 0x22c55e;
    if (chunk.materialTheme === 'flower_meadow') terrainColor = 0x10b981;
    else if (chunk.materialTheme === 'earth') terrainColor = 0x78350f;
    else if (chunk.materialTheme === 'farmland') terrainColor = 0xca8a04;
    else if (chunk.materialTheme === 'starpath' || chunk.materialTheme === 'starpath_crossing') terrainColor = 0x475569;

    const terrainMat = new THREE.MeshStandardMaterial({
      color: terrainColor,
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true,
    });

    // Add subtle procedural undulating elevation
    const pos = terrainGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const elev = Math.sin((chunk.centerX + lx) * 0.08) * Math.cos((chunk.centerZ + lz) * 0.08) * 1.8 + chunk.elevationBase * 0.5;
      pos.setY(i, elev);
    }
    terrainGeo.computeVertexNormals();

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    group.add(terrainMesh);

    // Materials Palette matching Art Direction (Honey-stone, Brushed Bronze, Midnight-Petrol, Aurion-Turquoise)
    const honeyStoneMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.85 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.85, roughness: 0.3 });
    const woodTrunkMat = new THREE.MeshStandardMaterial({ color: 0x3f2e21, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      emissive: 0x047857,
      emissiveIntensity: 0.25,
      roughness: 0.6,
    });
    const turquoiseGlowMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    });
    const stoneWallMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.5, side: THREE.DoubleSide });

    // 2. Render 3D Objects for each Solid Obstacle
    for (const obs of chunk.obstacles) {
      const localX = obs.x - chunk.centerX;
      const localZ = obs.z - chunk.centerZ;

      if (obs.type === 'tree') {
        const treeGroup = new THREE.Group();
        treeGroup.position.set(localX, 0, localZ);

        // Trunk
        const trunkH = obs.height || 7.0;
        const trunkGeo = new THREE.CylinderGeometry(obs.radius * 0.6, obs.radius, trunkH, 7);
        const trunk = new THREE.Mesh(trunkGeo, woodTrunkMat);
        trunk.position.y = trunkH / 2;
        treeGroup.add(trunk);

        // Tiered Canopy
        for (let t = 0; t < 3; t++) {
          const coneGeo = new THREE.ConeGeometry(obs.radius * 3.5 - t * 0.7, 3.2, 7);
          const cone = new THREE.Mesh(coneGeo, leafMat);
          cone.position.y = trunkH * 0.65 + t * 2.0;
          treeGroup.add(cone);
        }
        group.add(treeGroup);
      } else if (obs.type === 'building') {
        const bldgGroup = new THREE.Group();
        bldgGroup.position.set(localX, 0, localZ);

        // Masonry walls
        const wallGeo = new THREE.BoxGeometry(obs.radius * 1.7, obs.height || 6.5, obs.radius * 1.7);
        const wall = new THREE.Mesh(wallGeo, stoneWallMat);
        wall.position.y = (obs.height || 6.5) / 2;
        bldgGroup.add(wall);

        // Honey-stone base & bronze trim
        const trimGeo = new THREE.BoxGeometry(obs.radius * 1.75, 0.8, obs.radius * 1.75);
        const trim = new THREE.Mesh(trimGeo, honeyStoneMat);
        trim.position.y = 0.4;
        bldgGroup.add(trim);

        // Pitched Roof
        const roofGeo = new THREE.ConeGeometry(obs.radius * 1.35, 4.0, 4);
        roofGeo.rotateY(Math.PI / 4);
        const roof = new THREE.Mesh(roofGeo, bronzeMat);
        roof.position.y = (obs.height || 6.5) + 2.0;
        bldgGroup.add(roof);

        group.add(bldgGroup);
      } else if (obs.type === 'tower') {
        const towerGroup = new THREE.Group();
        towerGroup.position.set(localX, 0, localZ);

        const bodyGeo = new THREE.CylinderGeometry(obs.radius * 0.85, obs.radius, obs.height || 12, 8);
        const body = new THREE.Mesh(bodyGeo, honeyStoneMat);
        body.position.y = (obs.height || 12) / 2;
        towerGroup.add(body);

        const roofGeo = new THREE.ConeGeometry(obs.radius * 1.25, 4.5, 8);
        const roof = new THREE.Mesh(roofGeo, bronzeMat);
        roof.position.y = (obs.height || 12) + 2.25;
        towerGroup.add(roof);

        // Turquoise Beacon light at apex
        const beaconGeo = new THREE.SphereGeometry(0.6, 8, 8);
        const beacon = new THREE.Mesh(beaconGeo, turquoiseGlowMat);
        beacon.position.y = (obs.height || 12) + 4.8;
        towerGroup.add(beacon);

        group.add(towerGroup);
      } else if (obs.type === 'dungeon_gate') {
        const gateGroup = new THREE.Group();
        gateGroup.position.set(localX, 0, localZ);

        // Gateway Pillars
        [-3.5, 3.5].forEach((px) => {
          const pilGeo = new THREE.BoxGeometry(1.8, 8.5, 2.0);
          const pil = new THREE.Mesh(pilGeo, honeyStoneMat);
          pil.position.set(px, 4.25, 0);
          gateGroup.add(pil);
        });

        // Top Arch lintel
        const archGeo = new THREE.BoxGeometry(9.0, 1.8, 2.4);
        const arch = new THREE.Mesh(archGeo, bronzeMat);
        arch.position.set(0, 8.5, 0);
        gateGroup.add(arch);

        // Glowing Aurion-Turquoise Portal Vortex Plane
        const portalGeo = new THREE.PlaneGeometry(5.2, 7.5);
        const portal = new THREE.Mesh(portalGeo, turquoiseGlowMat);
        portal.position.set(0, 3.75, 0);
        gateGroup.add(portal);

        group.add(gateGroup);
      } else if (obs.type === 'border_stone' || obs.type === 'ruin_pillar') {
        const pillarGroup = new THREE.Group();
        pillarGroup.position.set(localX, 0, localZ);

        const pillarGeo = new THREE.OctahedronGeometry(obs.radius, 0);
        pillarGeo.scale(1.0, 3.2, 1.0);
        const pillar = new THREE.Mesh(pillarGeo, honeyStoneMat);
        pillar.position.y = (obs.height || 5.0) / 2;
        pillarGroup.add(pillar);

        // Territorial Rune Inlay
        const runeGeo = new THREE.RingGeometry(obs.radius * 0.8, obs.radius * 1.2, 12);
        runeGeo.rotateX(-Math.PI / 2);
        const rune = new THREE.Mesh(runeGeo, turquoiseGlowMat);
        rune.position.y = 0.05;
        pillarGroup.add(rune);

        // Flag banner
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 7.5, 6);
        const pole = new THREE.Mesh(poleGeo, bronzeMat);
        pole.position.set(obs.radius + 0.5, 3.75, 0);
        pillarGroup.add(pole);

        const flagGeo = new THREE.PlaneGeometry(2.0, 1.2);
        const flag = new THREE.Mesh(flagGeo, bannerMat);
        flag.position.set(obs.radius + 1.5, 6.2, 0);
        pillarGroup.add(flag);

        group.add(pillarGroup);
      } else if (obs.type === 'wall') {
        const wallGeo = new THREE.BoxGeometry(obs.radius * 2, obs.height || 4.5, 2.0);
        const wall = new THREE.Mesh(wallGeo, stoneWallMat);
        wall.position.set(localX, (obs.height || 4.5) / 2, localZ);
        group.add(wall);
      } else {
        // Rock / Mound / Boulder
        const rockGeo = new THREE.DodecahedronGeometry(obs.radius, 1);
        rockGeo.scale(1.2, 0.9, 1.1);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 });
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(localX, obs.radius * 0.7, localZ);
        rock.rotation.set(0.2, localX * 0.1, 0);
        group.add(rock);
      }
    }

    this.chunkMeshes.set(chunk.chunkKey, group);
    this.group.add(group);
    
    // Notify engine that a chunk (new or loaded) is fully rendered in the 3D world
    this.onChunkLoaded?.(chunk);
  }

  /**
   * Returns current world expansion statistics for the HUD & UI.
   */
  public getWorldStats(playerX: number, playerZ: number): WorldExpansionStats {
    const totalChunks = this.chunks.size;
    const totalAreaSqMeters = totalChunks * (this.chunkSize * this.chunkSize);

    const kingdomsSet = new Set<string>();
    const landmarks: { name: string; type: LandmarkType; kingdom: string; x: number; z: number }[] = [];

    this.chunks.forEach((chunk) => {
      kingdomsSet.add(chunk.kingdom);
      if (chunk.landmarkName && chunk.chunkKey !== '0,0') {
        landmarks.push({
          name: chunk.landmarkName,
          type: chunk.landmarkType,
          kingdom: chunk.kingdom,
          x: chunk.centerX,
          z: chunk.centerZ,
        });
      }
    });

    const currCx = Math.round(playerX / this.chunkSize);
    const currCz = Math.round(playerZ / this.chunkSize);
    const currentKey = `${currCx},${currCz}`;
    const currentChunk = this.chunks.get(currentKey);

    return {
      totalChunks,
      totalAreaSqMeters,
      targetMaxPlayers: 2900,
      discoveredKingdoms: Array.from(kingdomsSet),
      activeLandmarks: landmarks,
      currentChunkKey: currentKey,
      currentKingdom: currentChunk?.kingdom || this.currentKingdom,
      currentLandmark: currentChunk?.landmarkName || 'Unkartiertes Grenzland',
    };
  }
}
