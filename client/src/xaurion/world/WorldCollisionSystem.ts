import { SolidObstacle } from '../types';

/**
 * WorldCollisionSystem
 * High-performance spatial-partitioned obstacle collision & sliding resolution system.
 * Prevents characters from walking through trees, buildings, rocks, mounds, and towers like a ghost.
 */
export class WorldCollisionSystem {
  private static instance: WorldCollisionSystem | null = null;
  private obstacles: Map<string, SolidObstacle> = new Map();
  private grid: Map<string, SolidObstacle[]> = new Map();
  public cellSize: number = 16.0;

  constructor() {
    WorldCollisionSystem.instance = this;
  }

  public static getInstance(): WorldCollisionSystem {
    if (!WorldCollisionSystem.instance) {
      WorldCollisionSystem.instance = new WorldCollisionSystem();
    }
    return WorldCollisionSystem.instance;
  }

  private getGridKey(x: number, z: number): string {
    const gx = Math.floor(x / this.cellSize);
    const gz = Math.floor(z / this.cellSize);
    return `${gx}:${gz}`;
  }

  public registerObstacle(obstacle: SolidObstacle): void {
    if (this.obstacles.has(obstacle.id)) {
      this.removeObstacle(obstacle.id);
    }
    this.obstacles.set(obstacle.id, obstacle);

    // Insert into all overlapping grid cells
    const minX = obstacle.x - obstacle.radius;
    const maxX = obstacle.x + obstacle.radius;
    const minZ = obstacle.z - obstacle.radius;
    const maxZ = obstacle.z + obstacle.radius;

    const startGx = Math.floor(minX / this.cellSize);
    const endGx = Math.floor(maxX / this.cellSize);
    const startGz = Math.floor(minZ / this.cellSize);
    const endGz = Math.floor(maxZ / this.cellSize);

    for (let gx = startGx; gx <= endGx; gx++) {
      for (let gz = startGz; gz <= endGz; gz++) {
        const key = `${gx}:${gz}`;
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(obstacle);
      }
    }
  }

  public registerObstacles(list: SolidObstacle[]): void {
    for (const obs of list) {
      this.registerObstacle(obs);
    }
  }

  public removeObstacle(id: string): void {
    const obstacle = this.obstacles.get(id);
    if (!obstacle) return;
    this.obstacles.delete(id);

    const minX = obstacle.x - obstacle.radius;
    const maxX = obstacle.x + obstacle.radius;
    const minZ = obstacle.z - obstacle.radius;
    const maxZ = obstacle.z + obstacle.radius;

    const startGx = Math.floor(minX / this.cellSize);
    const endGx = Math.floor(maxX / this.cellSize);
    const startGz = Math.floor(minZ / this.cellSize);
    const endGz = Math.floor(maxZ / this.cellSize);

    for (let gx = startGx; gx <= endGx; gx++) {
      for (let gz = startGz; gz <= endGz; gz++) {
        const key = `${gx}:${gz}`;
        const list = this.grid.get(key);
        if (list) {
          const idx = list.findIndex((o) => o.id === id);
          if (idx !== -1) list.splice(idx, 1);
          if (list.length === 0) this.grid.delete(key);
        }
      }
    }
  }

  public removeObstaclesByChunk(chunkKey: string): void {
    const toRemove: string[] = [];
    this.obstacles.forEach((obs, id) => {
      if (obs.chunkKey === chunkKey) {
        toRemove.push(id);
      }
    });
    for (const id of toRemove) {
      this.removeObstacle(id);
    }
  }

  /**
   * Fast query for obstacles near a point
   */
  public getNearbyObstacles(x: number, z: number, queryRadius: number = 8.0): SolidObstacle[] {
    const results: SolidObstacle[] = [];
    const seen = new Set<string>();

    const startGx = Math.floor((x - queryRadius) / this.cellSize);
    const endGx = Math.floor((x + queryRadius) / this.cellSize);
    const startGz = Math.floor((z - queryRadius) / this.cellSize);
    const endGz = Math.floor((z + queryRadius) / this.cellSize);

    for (let gx = startGx; gx <= endGx; gx++) {
      for (let gz = startGz; gz <= endGz; gz++) {
        const key = `${gx}:${gz}`;
        const list = this.grid.get(key);
        if (list) {
          for (const obs of list) {
            if (!seen.has(obs.id)) {
              seen.add(obs.id);
              const d2 = (obs.x - x) * (obs.x - x) + (obs.z - z) * (obs.z - z);
              const maxD = obs.radius + queryRadius;
              if (d2 <= maxD * maxD) {
                results.push(obs);
              }
            }
          }
        }
      }
    }
    return results;
  }

  /**
   * Resolves player movement from currentPos to proposed targetPos.
   * Performs continuous intersection testing and normal-based sliding
   * so character gracefully slides along tree trunks, building facades, and boulders.
   */
  public resolveMovement(
    currentPos: { x: number; z: number },
    displacement: { x: number; z: number },
    playerRadius: number = 0.55
  ): {
    newPos: { x: number; z: number };
    collided: boolean;
    collidedObstacle?: SolidObstacle;
    slideVector: { x: number; z: number };
  } {
    let posX = currentPos.x + displacement.x;
    let posZ = currentPos.z + displacement.z;

    const queryRadius = playerRadius + Math.hypot(displacement.x, displacement.z) + 4.0;
    const candidates = this.getNearbyObstacles(currentPos.x, currentPos.z, queryRadius);

    if (candidates.length === 0) {
      return {
        newPos: { x: posX, z: posZ },
        collided: false,
        slideVector: displacement,
      };
    }

    let collided = false;
    let collidedObstacle: SolidObstacle | undefined = undefined;

    // Up to 3 relaxation passes to handle corner pinches (e.g. between two trees)
    const iterations = 3;
    for (let it = 0; it < iterations; it++) {
      let passCollided = false;

      for (const obs of candidates) {
        const dx = posX - obs.x;
        const dz = posZ - obs.z;
        const dist = Math.hypot(dx, dz);
        const minDist = obs.radius + playerRadius;

        if (dist < minDist) {
          collided = true;
          passCollided = true;
          collidedObstacle = obs;

          // Normal from obstacle center to player
          let nx = dx / (dist || 0.001);
          let nz = dz / (dist || 0.001);
          if (dist < 0.0001) {
            // Player is exactly on obstacle center; push outward along input direction or default
            nx = displacement.x !== 0 ? Math.sign(displacement.x) : 1;
            nz = displacement.z !== 0 ? Math.sign(displacement.z) : 0;
          }

          // Push player out to collision boundary
          posX = obs.x + nx * minDist;
          posZ = obs.z + nz * minDist;
        }
      }

      if (!passCollided) break;
    }

    return {
      newPos: { x: posX, z: posZ },
      collided,
      collidedObstacle,
      slideVector: {
        x: posX - currentPos.x,
        z: posZ - currentPos.z,
      },
    };
  }

  public getTotalObstaclesCount(): number {
    return this.obstacles.size;
  }

  public getAllObstacles(): SolidObstacle[] {
    return Array.from(this.obstacles.values());
  }
}

export const collisionSystem = WorldCollisionSystem.getInstance();
