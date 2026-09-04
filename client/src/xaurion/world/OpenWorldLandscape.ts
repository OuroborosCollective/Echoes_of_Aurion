import * as THREE from 'three';
import { collisionSystem } from './WorldCollisionSystem';
import { WorldChunkManager } from './WorldChunkManager';

export class OpenWorldLandscape {
  public scene: THREE.Scene;
  public group: THREE.Group;
  public groundMesh: THREE.Mesh;
  public steamVents: THREE.Vector3[] = [];
  public chunkManager: WorldChunkManager;
  private animatedProps: { mesh: THREE.Object3D; rotSpeed: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 0. Initialize Dynamic Persistent World Chunk Manager
    this.chunkManager = new WorldChunkManager(this.scene);

    // 1. Build Vast Open World Ground Plane (280 x 280 meters)
    this.groundMesh = this.createOpenWorldTerrain();
    this.group.add(this.groundMesh);

    // 2. Build Zone 1: Aethelgard Sanctum (Center Hub)
    this.buildSanctumHub();

    // 3. Build Zone 2: Whispering Clockwork Woods (North-East)
    this.buildClockworkWoods();

    // 4. Build Zone 3: Scorched Iron Quarry (West)
    this.buildScorchedQuarry();

    // 5. Build Zone 4: Crystalline Void Spire & World Boss Arena (South)
    this.buildVoidSpireArena();

    // 6. Ambient Environment Lighting & Skybox Stars
    this.buildEnvironmentProps();
  }

  private createOpenWorldTerrain(): THREE.Mesh {
    const size = 280;
    const segments = 96;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position;
    const count = posAttr.count;

    // Procedural terrain elevation & biome coloring
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      let height = 0;
      let r = 0.22, g = 0.25, b = 0.28; // Default Slate

      // Sanctum Hub (Center: radius < 35) -> Flat paved marble plaza
      const distFromCenter = Math.hypot(x, z);
      if (distFromCenter < 34) {
        height = 0;
        // Paved stone with gold trim
        r = 0.35; g = 0.36; b = 0.40;
        if (Math.abs(x) < 4 || Math.abs(z) < 4) {
          // Gilded grand thoroughfare roads
          r = 0.52; g = 0.44; b = 0.25;
        } else if (distFromCenter < 12) {
          // Central plaza circle
          r = 0.42; g = 0.38; b = 0.48;
        }
      } else if (x > 15 && z < 20) {
        // Whispering Woods (North-East) -> Rolling gentle hills & emerald aether meadows
        height = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2.2 + Math.sin(x * 0.2) * 0.8;
        r = 0.18; g = 0.45; b = 0.24; // Forest Green Emerald
      } else if (x < -15) {
        // Scorched Quarry (West) -> Rugged jagged cliffs & copper rust canyons
        height = Math.sin(x * 0.1) * 3.5 + Math.cos(z * 0.06) * 2.5;
        r = 0.45; g = 0.25; b = 0.15; // Terracotta Volcanic Rust
      } else if (z > 25) {
        // Void Spire Boss Arena (South) -> Sunken circular crater with raised perimeter
        const bossDist = Math.hypot(x, z - 65);
        if (bossDist < 32) {
          height = Math.sin(bossDist * 0.2) * 1.8 - 1.0;
          r = 0.32; g = 0.16; b = 0.48; // Void Amethyst Violet
        } else {
          height = Math.sin(x * 0.05) * 2.2;
          r = 0.26; g = 0.22; b = 0.36;
        }
      }

      posAttr.setY(i, height);

      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.2,
      flatShading: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildSanctumHub() {
    const hubGroup = new THREE.Group();

    // 1. Central Aethelgard Aetherium Fountain & Levitating Core
    const brassTrimMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.85, roughness: 0.25 });
    const marbleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.9,
      roughness: 0.1,
      metalness: 0.8,
    });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.5,
      roughness: 0.1,
    });

    // Fountain Outer Marble Basin (Low rim, y: 0 to 0.35)
    const basinGeo = new THREE.CylinderGeometry(4.0, 4.4, 0.4, 16);
    const basin = new THREE.Mesh(basinGeo, marbleMat);
    basin.position.set(0, 0.2, 0);
    hubGroup.add(basin);

    collisionSystem.registerObstacle({
      id: 'hub_fountain_basin',
      type: 'fountain',
      x: 0,
      z: 0,
      radius: 4.4,
      name: 'Aethelgard Aetherium-Brunnen',
    });

    // Glowing Azure Aether Basin Pool
    const poolGeo = new THREE.CylinderGeometry(3.6, 3.6, 0.15, 16);
    const pool = new THREE.Mesh(poolGeo, waterMat);
    pool.position.set(0, 0.38, 0);
    hubGroup.add(pool);

    // 4 Slim Decorative Brass Arch Struts supporting the levitation field
    const strutPositions = [
      { x: -2.4, z: -2.4 },
      { x: 2.4, z: -2.4 },
      { x: -2.4, z: 2.4 },
      { x: 2.4, z: 2.4 },
    ];
    strutPositions.forEach((sp) => {
      const strutGeo = new THREE.CylinderGeometry(0.12, 0.16, 2.8, 6);
      const strut = new THREE.Mesh(strutGeo, brassTrimMat);
      strut.position.set(sp.x, 1.4, sp.z);
      hubGroup.add(strut);

      const capGeo = new THREE.SphereGeometry(0.22, 8, 8);
      const cap = new THREE.Mesh(capGeo, brassTrimMat);
      cap.position.set(sp.x, 2.8, sp.z);
      hubGroup.add(cap);
    });

    // Levitating Floating Core Crystal (Suspended above eye-line at Y: 4.8)
    const crystalGeo = new THREE.OctahedronGeometry(1.2, 0);
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(0, 4.8, 0);
    hubGroup.add(crystal);
    this.animatedProps.push({ mesh: crystal, rotSpeed: 1.0 });

    // Orbiting Golden Halo Ring
    const haloGeo = new THREE.TorusGeometry(1.8, 0.1, 6, 16);
    const halo = new THREE.Mesh(haloGeo, brassTrimMat);
    halo.position.set(0, 4.8, 0);
    halo.rotation.x = Math.PI / 4;
    hubGroup.add(halo);
    this.animatedProps.push({ mesh: halo, rotSpeed: -0.6 });

    // 2. City Castle Watchtowers at 4 Corners
    const towerPositions = [
      { x: -26, z: -26 },
      { x: 26, z: -26 },
      { x: -26, z: 26 },
      { x: 26, z: 26 },
    ];

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 });

    towerPositions.forEach((pos, idx) => {
      const tower = new THREE.Group();
      const bodyGeo = new THREE.CylinderGeometry(2.4, 2.8, 10, 8);
      const body = new THREE.Mesh(bodyGeo, stoneMat);
      body.position.y = 5;
      tower.add(body);

      const roofGeo = new THREE.ConeGeometry(3.2, 4.5, 8);
      const roof = new THREE.Mesh(roofGeo, brassTrimMat);
      roof.position.y = 12.2;
      tower.add(roof);

      // Light beacon
      const beaconGeo = new THREE.SphereGeometry(0.5, 8, 8);
      const beacon = new THREE.Mesh(beaconGeo, crystalMat);
      beacon.position.y = 14.8;
      tower.add(beacon);

      tower.position.set(pos.x, 0, pos.z);
      hubGroup.add(tower);

      collisionSystem.registerObstacle({
        id: `hub_tower_${idx}`,
        type: 'tower',
        x: pos.x,
        z: pos.z,
        radius: 3.0,
        name: 'Sanctum Eck-Wachturm',
      });
    });

    // 3. Royal Forge Pavilion (North)
    const forgeGroup = new THREE.Group();
    const anvilGeo = new THREE.BoxGeometry(2.2, 1.2, 1.4);
    const anvilMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.9, roughness: 0.3 });
    const anvil = new THREE.Mesh(anvilGeo, anvilMat);
    anvil.position.set(0, 0.6, -14);
    forgeGroup.add(anvil);

    collisionSystem.registerObstacle({
      id: 'hub_forge_anvil',
      type: 'anvil',
      x: 0,
      z: -14,
      radius: 1.4,
      name: 'Königlicher Meisterschmiede-Amboss',
    });

    // Glowing Furnace
    const furnaceGeo = new THREE.BoxGeometry(3.5, 3.5, 3.5);
    const furnaceMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xd97706,
      emissiveIntensity: 1.0,
    });
    const furnace = new THREE.Mesh(furnaceGeo, furnaceMat);
    furnace.position.set(0, 1.75, -17);
    forgeGroup.add(furnace);

    collisionSystem.registerObstacle({
      id: 'hub_forge_furnace',
      type: 'furnace',
      x: 0,
      z: -17,
      radius: 2.2,
      name: 'Aetherium-Schmelzofen',
    });

    // Chimney with steam
    const pipeGeo = new THREE.CylinderGeometry(0.4, 0.4, 5, 8);
    const pipe = new THREE.Mesh(pipeGeo, brassTrimMat);
    pipe.position.set(0, 6, -17);
    forgeGroup.add(pipe);

    hubGroup.add(forgeGroup);

    // 4. Street Lamps along the plaza
    const lampPositions = [
      { x: -8, z: -8 },
      { x: 8, z: -8 },
      { x: -8, z: 8 },
      { x: 8, z: 8 },
      { x: -16, z: -16 },
      { x: 16, z: -16 },
      { x: -16, z: 16 },
      { x: 16, z: 16 },
    ];

    lampPositions.forEach((p, idx) => {
      const lamp = new THREE.Group();
      const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 4.2, 6);
      const pole = new THREE.Mesh(poleGeo, brassTrimMat);
      pole.position.y = 2.1;
      lamp.add(pole);

      const lanternGeo = new THREE.OctahedronGeometry(0.4, 0);
      const lanternMat = new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        emissive: 0xeab308,
        emissiveIntensity: 1.5,
      });
      const lantern = new THREE.Mesh(lanternGeo, lanternMat);
      lantern.position.y = 4.2;
      lamp.add(lantern);

      lamp.position.set(p.x, 0, p.z);
      hubGroup.add(lamp);

      collisionSystem.registerObstacle({
        id: `hub_lamp_${idx}`,
        type: 'streetlamp',
        x: p.x,
        z: p.z,
        radius: 0.5,
        name: 'Laternenmast',
      });
    });

    this.group.add(hubGroup);
  }

  private buildClockworkWoods() {
    const woodsGroup = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x3f2e21, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x064e3b,
      emissiveIntensity: 0.3,
      roughness: 0.6,
    });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.8,
    });

    // Spawn 28 Procedural Luminescent Trees & Giant Gears with Solid Collision
    for (let i = 0; i < 28; i++) {
      const x = 32 + ((i * 37 + 11) % 68);
      const z = -20 - ((i * 47 + 19) % 68);

      const tree = new THREE.Group();
      const trunkHeight = 4 + (i % 3);
      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.6, trunkHeight, 6);
      const trunk = new THREE.Mesh(trunkGeo, woodMat);
      trunk.position.y = trunkHeight / 2;
      tree.add(trunk);

      // Tiered foliage
      const foliageCount = 3;
      for (let f = 0; f < foliageCount; f++) {
        const coneRadius = 2.4 - f * 0.5;
        const coneHeight = 2.5;
        const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 6);
        const cone = new THREE.Mesh(coneGeo, leafMat);
        cone.position.y = trunkHeight + f * 1.5;
        tree.add(cone);
      }

      tree.position.set(x, 0, z);
      tree.rotation.y = (i * 1.3) % (Math.PI * 2);
      woodsGroup.add(tree);

      collisionSystem.registerObstacle({
        id: `woods_tree_${i}`,
        type: 'tree',
        x,
        z,
        radius: 0.95,
        name: 'Flüsterwald-Baum',
      });
    }

    // Half-buried Giant Clockwork Gears
    for (let g = 0; g < 6; g++) {
      const gx = 45 + (g * 14) % 45;
      const gz = -35 - (g * 16) % 45;
      const gearGeo = new THREE.TorusGeometry(3.5, 0.6, 6, 12);
      const gearMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.3 });
      const gear = new THREE.Mesh(gearGeo, gearMat);
      gear.position.set(gx, 1.2, gz);
      gear.rotation.set(Math.PI / 3 + (g * 0.1), (g * 0.8), 0);
      woodsGroup.add(gear);

      collisionSystem.registerObstacle({
        id: `woods_gear_${g}`,
        type: 'rock',
        x: gx,
        z: gz,
        radius: 2.2,
        name: 'Uraltes Zahnrad',
      });
    }

    // Ancient Rune Obelisks
    const runePositions = [
      { x: 55, z: -35 },
      { x: 75, z: -55 },
      { x: 60, z: -75 },
    ];
    runePositions.forEach((p, idx) => {
      const obeliskGeo = new THREE.BoxGeometry(1.2, 4.5, 1.2);
      const obelisk = new THREE.Mesh(obeliskGeo, runeMat);
      obelisk.position.set(p.x, 2.25, p.z);
      woodsGroup.add(obelisk);

      collisionSystem.registerObstacle({
        id: `woods_obelisk_${idx}`,
        type: 'monolith',
        x: p.x,
        z: p.z,
        radius: 1.3,
        name: 'Uralter Runenobelisk',
      });
    });

    this.group.add(woodsGroup);
  }

  private buildScorchedQuarry() {
    const quarryGroup = new THREE.Group();

    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.95 });
    const lavaMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xf97316,
      emissiveIntensity: 1.2,
    });
    const ironScaffoldMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.9 });

    // Jagged Cliff Formations & Mining Scaffolds
    for (let i = 0; i < 18; i++) {
      const x = -35 - ((i * 23 + 7) % 65);
      const z = -45 + ((i * 31 + 13) % 90);
      const rockRadius = 2.4 + (i % 3) * 0.7;

      const rockGeo = new THREE.DodecahedronGeometry(rockRadius, 0);
      rockGeo.scale(1.2, 1.8, 1.0);
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(x, 2 + (i % 2), z);
      rock.rotation.set((i * 0.4), (i * 0.7), (i * 0.3));
      quarryGroup.add(rock);

      collisionSystem.registerObstacle({
        id: `quarry_rock_${i}`,
        type: 'rock',
        x,
        z,
        radius: rockRadius,
        name: 'Vulkanischer Basaltfels',
      });

      // Steam Vent
      if (i % 3 === 0) {
        this.steamVents.push(new THREE.Vector3(x, 0.5, z));
        const ventGeo = new THREE.CylinderGeometry(0.8, 1.2, 0.6, 8);
        const vent = new THREE.Mesh(ventGeo, lavaMat);
        vent.position.set(x, 0.3, z);
        quarryGroup.add(vent);
      }
    }

    // Iron Mining Tower
    const scaffold = new THREE.Group();
    const frameGeo = new THREE.BoxGeometry(4, 12, 4);
    const frame = new THREE.Mesh(frameGeo, ironScaffoldMat);
    frame.position.set(-65, 6, 0);
    scaffold.add(frame);
    quarryGroup.add(scaffold);

    collisionSystem.registerObstacle({
      id: 'quarry_scaffold_tower',
      type: 'tower',
      x: -65,
      z: 0,
      radius: 3.2,
      name: 'Eisengruben-Förderturm',
    });

    this.group.add(quarryGroup);
  }

  private buildVoidSpireArena() {
    const arenaGroup = new THREE.Group();

    const spireMat = new THREE.MeshStandardMaterial({
      color: 0x581c87,
      emissive: 0x7e22ce,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });

    const riftMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0xc084fc,
      emissiveIntensity: 1.8,
      wireframe: true,
    });

    // Central Boss Arena Portal (Z = 65, X = 0)
    const bossArenaCenter = new THREE.Vector3(0, 0, 65);

    // Floating Rune Monoliths around the arena perimeter
    const numMonoliths = 8;
    const arenaRadius = 24;
    for (let i = 0; i < numMonoliths; i++) {
      const angle = (i / numMonoliths) * Math.PI * 2;
      const mx = bossArenaCenter.x + Math.cos(angle) * arenaRadius;
      const mz = bossArenaCenter.z + Math.sin(angle) * arenaRadius;

      const monoGeo = new THREE.OctahedronGeometry(1.8, 0);
      monoGeo.scale(0.8, 3.2, 0.8);
      const monolith = new THREE.Mesh(monoGeo, spireMat);
      monolith.position.set(mx, 4.5, mz);
      arenaGroup.add(monolith);

      this.animatedProps.push({ mesh: monolith, rotSpeed: 0.4 + (i * 0.05) });

      collisionSystem.registerObstacle({
        id: `void_monolith_${i}`,
        type: 'monolith',
        x: mx,
        z: mz,
        radius: 1.6,
        name: 'Leeren-Monolith',
      });
    }

    // Central Void Rift Core Sphere
    const riftGeo = new THREE.IcosahedronGeometry(3.5, 2);
    const riftCore = new THREE.Mesh(riftGeo, riftMat);
    riftCore.position.set(bossArenaCenter.x, 8, bossArenaCenter.z);
    arenaGroup.add(riftCore);
    this.animatedProps.push({ mesh: riftCore, rotSpeed: 1.2 });

    collisionSystem.registerObstacle({
      id: 'void_rift_pedestal',
      type: 'monolith',
      x: bossArenaCenter.x,
      z: bossArenaCenter.z,
      radius: 3.5,
      name: 'Leerenriss-Sphäre',
    });

    // Boss Summoning Rune Ring on ground
    const ringGeo = new THREE.RingGeometry(18, 20, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x9333ea,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(bossArenaCenter.x, 0.05, bossArenaCenter.z);
    arenaGroup.add(ring);
    this.animatedProps.push({ mesh: ring, rotSpeed: 0.2 });

    this.group.add(arenaGroup);
  }

  private buildEnvironmentProps() {
    // 1. Celestial Atmospheric Sky Dome (Fantasy Cyan/Blue Twilight Horizon)
    const skyGeo = new THREE.SphereGeometry(300, 32, 20);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x1e293b,
      side: THREE.BackSide,
      fog: false,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(sky);

    // 2. Radiant Sun / Celestial Star
    const sunGeo = new THREE.SphereGeometry(22, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfffbeb,
      fog: false,
    });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(90, 130, 90);
    this.group.add(sunMesh);

    // Sun Corona Halo
    const coronaGeo = new THREE.RingGeometry(24, 38, 32);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      fog: false,
    });
    const corona = new THREE.Mesh(coronaGeo, coronaMat);
    corona.position.set(90, 130, 90);
    corona.lookAt(0, 0, 0);
    this.group.add(corona);

    // 3. Floating Dust & Aether Spores
    const sporeCount = 280;
    const sporeGeo = new THREE.BufferGeometry();
    const sporePos = new Float32Array(sporeCount * 3);

    for (let i = 0; i < sporeCount * 3; i += 3) {
      sporePos[i] = (Math.random() - 0.5) * 240;
      sporePos[i + 1] = Math.random() * 25 + 0.5;
      sporePos[i + 2] = (Math.random() - 0.5) * 240;
    }

    sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
    const sporeMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.55,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });

    const spores = new THREE.Points(sporeGeo, sporeMat);
    this.group.add(spores);
  }

  public update(delta: number) {
    this.animatedProps.forEach((prop) => {
      prop.mesh.rotation.y += prop.rotSpeed * delta;
    });
  }

  public getZoneName(x: number, z: number): string {
    const distCenter = Math.hypot(x, z);
    if (distCenter < 35) return 'Aethelgard Sanctum (Hauptstadt)';
    if (x > 15 && z < 15 && distCenter < 95) return 'Whispering Clockwork Woods';
    if (x < -15 && z < 35 && distCenter < 95) return 'Scorched Iron Quarry';
    if (z > 35 && distCenter < 95) return 'Crystalline Void Spire (World Boss)';

    const cx = Math.round(x / this.chunkManager.chunkSize);
    const cz = Math.round(z / this.chunkManager.chunkSize);
    const chunk = this.chunkManager.chunks.get(`${cx},${cz}`);
    if (chunk) {
      return `${chunk.kingdom} • ${chunk.landmarkName}`;
    }
    return 'Unkartierte Aurion-Grenzmark';
  }
}
