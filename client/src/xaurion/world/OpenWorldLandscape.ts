import { DeterministicSimulation } from "@shared/deterministicSimulation";
import * as THREE from 'three';
import { collisionSystem } from './WorldCollisionSystem';
import { WorldChunkManager } from './WorldChunkManager';
import { worldSurfaceMaterial, mapWorldGround } from './WorldSurfaceAtlas';
import { STARTER_CITY_FLAT_HALF_EXTENT_M, touchesStarterCityGround } from './starterCityGround';
import { attachMeshBVHToGroup } from '../spatial/bvhWorkerHelper';

export class OpenWorldLandscape {
  public scene: THREE.Scene;
  public group: THREE.Group;
  public groundMesh: THREE.Mesh;
  public steamVents: THREE.Vector3[] = [];
  public chunkManager: WorldChunkManager;
  private animatedProps: { mesh: THREE.Object3D; rotSpeed: number }[] = [];

  constructor(scene: THREE.Scene, private readonly simulation: DeterministicSimulation) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 0. Initialize Dynamic Persistent World Chunk Manager
    this.chunkManager = new WorldChunkManager(this.scene);

    // 1. Flat paved starter-city floor inside the city walls. Legacy client scenery
    //    (sanctum props, boss arena, plaza stones) is no longer built there: inside the
    //    walls only Aurion-confirmed, admin-editable content is projected.
    this.groundMesh = this.createStarterCityFloor();
    this.group.add(this.groundMesh);

    // 2. Legacy scenery outside the walls: Whispering Clockwork Woods (North-East)
    this.buildClockworkWoods();

    // 3. Legacy scenery outside the walls: Scorched Iron Quarry (West)
    this.buildScorchedQuarry();

    // 4. Ambient Environment Lighting & Skybox Stars
    this.buildEnvironmentProps();

    // 7. Accelerate scene-wide spatial queries with WebWorker BVH generation
    void attachMeshBVHToGroup(this.group, { useWorker: true });
  }

  /**
   * The paved, perfectly flat starter-city floor (owner design brief 2026-11-10).
   * It spans exactly the starter-city ground envelope; everything outside of it is
   * the chunk terrain of WorldChunkManager, which shares the same flat/blend rule.
   */
  private createStarterCityFloor(): THREE.Mesh {
    const size = STARTER_CITY_FLAT_HALF_EXTENT_M * 2;
    const geo = new THREE.PlaneGeometry(size, size, 24, 24);
    geo.rotateX(-Math.PI / 2);
    mapWorldGround(geo);
    const mesh = new THREE.Mesh(geo, worldSurfaceMaterial(this.scene, 'paving'));
    mesh.name = 'aurion-starter-city-floor';
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildClockworkWoods() {
    const woodsGroup = new THREE.Group();

    const woodMat = worldSurfaceMaterial(this.scene, 'wood');
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x526444,
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
      if (touchesStarterCityGround(x, z, 3.2)) continue; // nothing legacy inside the city walls

      const tree = new THREE.Group();
      const trunkHeight = 4 + (i % 3);
      tree.name = `woods-tree-visual-${i}`;
      tree.userData.aurionVisualKind = "tree";
      tree.userData.aurionTreeHeightMeters = trunkHeight + 4.25;
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
      if (touchesStarterCityGround(gx, gz, 2.2)) continue;
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
      if (touchesStarterCityGround(p.x, p.z, 1.3)) return;
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

    const rockMat = worldSurfaceMaterial(this.scene, 'rock');
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
      if (touchesStarterCityGround(x, z, rockRadius)) continue;

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
      sporePos[i] = (this.simulation.random("landscape:spores") - 0.5) * 240;
      sporePos[i + 1] = this.simulation.random("landscape:spores") * 25 + 0.5;
      sporePos[i + 2] = (this.simulation.random("landscape:spores") - 0.5) * 240;
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
