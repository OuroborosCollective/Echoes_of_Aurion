export interface Ax1CameraDirectorConfig {
  baseFov?: number;
  minDistance?: number;
  maxDistance?: number;
  defaultDistance?: number;
  defaultHeight?: number;
  minPitch?: number;
  maxPitch?: number;
  lookAheadDistance?: number;
  lookAheadSpeed?: number;
  minGroundClearance?: number;
  autoFollowDelay?: number;
  autoFollowRate?: number;
  inertiaDecay?: number;
  zoomDamping?: number;
}

export interface Ax1CameraState {
  distance: number;
  targetDistance: number;
  height: number;
  yaw: number;
  pitch: number;
  yawVelocity: number;
  pitchVelocity: number;
  lookAheadX: number;
  lookAheadZ: number;
  currentCamX: number;
  currentCamY: number;
  currentCamZ: number;
  lookAtX: number;
  lookAtY: number;
  lookAtZ: number;
  idleOrbitTime: number;
  autoFollowActive: boolean;
}

/**
 * Pure deterministic camera and viewport tracking controller for AX1 / Echoes of Aurion.
 * Zero Math.random(), zero Date.now(), zero non-deterministic time sources.
 * All state updates are strictly driven by frame delta.
 */
export class Ax1CameraDirector {
  public readonly baseFov: number;
  public readonly minDistance: number;
  public readonly maxDistance: number;
  public readonly defaultHeight: number;
  public readonly minPitch: number;
  public readonly maxPitch: number;
  public readonly lookAheadDistance: number;
  public readonly lookAheadSpeed: number;
  public readonly minGroundClearance: number;
  public readonly autoFollowDelay: number;
  public readonly autoFollowRate: number;
  public readonly inertiaDecay: number;
  public readonly zoomDamping: number;

  private distance: number;
  private targetDistance: number;
  private height: number;
  private yaw: number;
  private pitch: number;
  private yawVelocity: number = 0;
  private pitchVelocity: number = 0;

  private lookAheadX: number = 0;
  private lookAheadZ: number = 0;

  private camX: number = 0;
  private camY: number = 10;
  private camZ: number = 10;

  private lookAtX: number = 0;
  private lookAtY: number = 1.6;
  private lookAtZ: number = 0;

  private idleOrbitTime: number = 0;
  public autoFollowEnabled: boolean = true;
  private isManualOrbiting: boolean = false;

  constructor(config: Ax1CameraDirectorConfig = {}) {
    this.baseFov = config.baseFov ?? 60;
    this.minDistance = config.minDistance ?? 5.5;
    this.maxDistance = config.maxDistance ?? 30.0;
    this.distance = config.defaultDistance ?? 10.5;
    this.targetDistance = this.distance;
    this.defaultHeight = config.defaultHeight ?? 4.2;
    this.height = this.defaultHeight;
    this.minPitch = config.minPitch ?? 0.08;
    this.maxPitch = config.maxPitch ?? 1.25;
    this.pitch = 0.28;
    this.yaw = 0;

    this.lookAheadDistance = config.lookAheadDistance ?? 2.2;
    this.lookAheadSpeed = config.lookAheadSpeed ?? 4.0;
    this.minGroundClearance = config.minGroundClearance ?? 0.85;
    this.autoFollowDelay = config.autoFollowDelay ?? 1.5;
    this.autoFollowRate = config.autoFollowRate ?? 1.8;
    this.inertiaDecay = config.inertiaDecay ?? 6.5;
    this.zoomDamping = config.zoomDamping ?? 8.0;
  }

  public getState(): Ax1CameraState {
    return {
      distance: this.distance,
      targetDistance: this.targetDistance,
      height: this.height,
      yaw: this.yaw,
      pitch: this.pitch,
      yawVelocity: this.yawVelocity,
      pitchVelocity: this.pitchVelocity,
      lookAheadX: this.lookAheadX,
      lookAheadZ: this.lookAheadZ,
      currentCamX: this.camX,
      currentCamY: this.camY,
      currentCamZ: this.camZ,
      lookAtX: this.lookAtX,
      lookAtY: this.lookAtY,
      lookAtZ: this.lookAtZ,
      idleOrbitTime: this.idleOrbitTime,
      autoFollowActive: this.autoFollowEnabled && !this.isManualOrbiting && this.idleOrbitTime >= this.autoFollowDelay,
    };
  }

  public setManualOrbiting(active: boolean): void {
    this.isManualOrbiting = active;
    if (active) {
      this.idleOrbitTime = 0;
      this.yawVelocity = 0;
      this.pitchVelocity = 0;
    }
  }

  public applyOrbitDelta(deltaYaw: number, deltaPitch: number): void {
    this.yaw += deltaYaw;
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch + deltaPitch));
    this.idleOrbitTime = 0;
  }

  public addInertia(deltaYaw: number, deltaPitch: number, sampleDeltaSec: number = 0.016): void {
    if (sampleDeltaSec > 0.0001) {
      this.yawVelocity = Math.max(-12, Math.min(12, deltaYaw / sampleDeltaSec));
      this.pitchVelocity = Math.max(-8, Math.min(8, deltaPitch / sampleDeltaSec));
    }
    this.idleOrbitTime = 0;
  }

  public setTargetDistance(target: number): void {
    this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, target));
  }

  public zoomBy(deltaDist: number): void {
    this.setTargetDistance(this.targetDistance + deltaDist);
  }

  public setYaw(yaw: number): void {
    this.yaw = yaw;
    this.idleOrbitTime = 0;
  }

  public setPitch(pitch: number): void {
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, pitch));
    this.idleOrbitTime = 0;
  }

  public computeDynamicFov(width: number, height: number): number {
    if (height <= 0 || width <= 0) return this.baseFov;
    const aspect = width / height;
    // Standard widescreen baseline is ~16:9 (1.777)
    // For narrower tablet viewports (e.g. 4:3 ~ 1.333 or portrait < 1.0),
    // increase vertical FOV slightly so horizontal coverage is preserved.
    if (aspect < 1.7) {
      const compensation = Math.max(1.0, Math.min(1.22, Math.sqrt(1.777 / Math.max(0.65, aspect))));
      return Math.round(this.baseFov * compensation * 10) / 10;
    }
    return this.baseFov;
  }

  public update(
    delta: number,
    playerPos: { x: number; y: number; z: number },
    playerFacing: number,
    velocity?: { x: number; z: number },
    getTerrainElevation?: (x: number, z: number) => number
  ): void {
    const dt = Math.max(0.0001, Math.min(0.1, delta));

    // 1. Inertial rotation decay if not manually dragging
    if (!this.isManualOrbiting) {
      if (Math.abs(this.yawVelocity) > 0.0001 || Math.abs(this.pitchVelocity) > 0.0001) {
        this.yaw += this.yawVelocity * dt;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch + this.pitchVelocity * dt));
        const decayFactor = Math.exp(-this.inertiaDecay * dt);
        this.yawVelocity *= decayFactor;
        this.pitchVelocity *= decayFactor;
        if (Math.abs(this.yawVelocity) < 0.05) this.yawVelocity = 0;
        if (Math.abs(this.pitchVelocity) < 0.05) this.pitchVelocity = 0;
      }
      this.idleOrbitTime += dt;
    } else {
      this.idleOrbitTime = 0;
    }

    // 2. Smooth zoom interpolation
    const zoomFactor = 1 - Math.exp(-this.zoomDamping * dt);
    this.distance += (this.targetDistance - this.distance) * zoomFactor;
    this.height = this.distance * 0.55;

    // 3. Movement speed & Direction for Look-Ahead and Auto-Follow
    const vx = velocity?.x ?? 0;
    const vz = velocity?.z ?? 0;
    const moveSpeed = Math.hypot(vx, vz);

    // 4. Soft Auto-Follow Alignment (when moving continuously with no manual orbit input)
    if (this.autoFollowEnabled && !this.isManualOrbiting && this.idleOrbitTime >= this.autoFollowDelay && moveSpeed > 0.4) {
      // Calculate target yaw behind player heading
      const moveAngle = Math.atan2(vx, vz);
      // Shortest angular difference
      let diff = ((moveAngle - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      const followFactor = 1 - Math.exp(-this.autoFollowRate * dt);
      this.yaw += diff * followFactor;
    }

    // 5. Look-Ahead Target Offset
    let targetAheadX = 0;
    let targetAheadZ = 0;
    if (moveSpeed > 0.2) {
      const normVx = vx / moveSpeed;
      const normVz = vz / moveSpeed;
      const speedScale = Math.min(1.5, moveSpeed / 3.5);
      targetAheadX = normVx * this.lookAheadDistance * speedScale;
      targetAheadZ = normVz * this.lookAheadDistance * speedScale;
    }
    const lookAheadFactor = 1 - Math.exp(-this.lookAheadSpeed * dt);
    this.lookAheadX += (targetAheadX - this.lookAheadX) * lookAheadFactor;
    this.lookAheadZ += (targetAheadZ - this.lookAheadZ) * lookAheadFactor;

    // 6. Look-At position calculation
    this.lookAtX = playerPos.x + this.lookAheadX;
    this.lookAtY = playerPos.y + 1.6;
    this.lookAtZ = playerPos.z + this.lookAheadZ;

    // 7. Calculate Ideal Camera Position
    const horizDist = this.distance * Math.cos(this.pitch);
    const vertDist = this.height + this.distance * Math.sin(this.pitch);

    let targetCamX = playerPos.x + Math.sin(this.yaw) * horizDist;
    let targetCamZ = playerPos.z + Math.cos(this.yaw) * horizDist;
    let targetCamY = playerPos.y + vertDist;

    // 8. Terrain Anti-Clip & Ground Clearance Enforcement
    if (getTerrainElevation) {
      const terrainElev = getTerrainElevation(targetCamX, targetCamZ);
      const minCamY = terrainElev + this.minGroundClearance;
      if (targetCamY < minCamY) {
        targetCamY = minCamY;
      }
    }

    // 9. Position smoothing
    const posLerpFactor = 1 - Math.exp(-8.0 * dt);
    this.camX += (targetCamX - this.camX) * posLerpFactor;
    this.camY += (targetCamY - this.camY) * posLerpFactor;
    this.camZ += (targetCamZ - this.camZ) * posLerpFactor;
  }

  public getCameraPosition(): { x: number; y: number; z: number } {
    return { x: this.camX, y: this.camY, z: this.camZ };
  }

  public getLookAt(): { x: number; y: number; z: number } {
    return { x: this.lookAtX, y: this.lookAtY, z: this.lookAtZ };
  }

  public getDistance(): number {
    return this.distance;
  }

  public getYaw(): number {
    return this.yaw;
  }

  public getPitch(): number {
    return this.pitch;
  }
}
