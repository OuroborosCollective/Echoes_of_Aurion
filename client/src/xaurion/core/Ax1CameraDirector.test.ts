import { describe, it, expect } from 'vitest';
import { Ax1CameraDirector } from './Ax1CameraDirector';

describe('Ax1CameraDirector Pure Deterministic Camera Engine', () => {
  it('guarantees pure determinism across identical input sequences', () => {
    const directorA = new Ax1CameraDirector();
    const directorB = new Ax1CameraDirector();

    const playerPos = { x: 10, y: 5, z: 20 };
    const velocity = { x: 1.5, z: 2.0 };

    for (let step = 0; step < 60; step++) {
      directorA.update(0.016, playerPos, 0, velocity);
      directorB.update(0.016, playerPos, 0, velocity);
    }

    const posA = directorA.getCameraPosition();
    const posB = directorB.getCameraPosition();
    const lookA = directorA.getLookAt();
    const lookB = directorB.getLookAt();

    expect(posA.x).toBeCloseTo(posB.x, 6);
    expect(posA.y).toBeCloseTo(posB.y, 6);
    expect(posA.z).toBeCloseTo(posB.z, 6);

    expect(lookA.x).toBeCloseTo(lookB.x, 6);
    expect(lookA.z).toBeCloseTo(lookB.z, 6);
  });

  it('smoothly offsets lookAt target in movement direction (Look-Ahead)', () => {
    const director = new Ax1CameraDirector({ lookAheadDistance: 2.5, lookAheadSpeed: 5.0 });
    const playerPos = { x: 0, y: 0, z: 0 };

    // Initially at rest
    director.update(0.016, playerPos, 0, { x: 0, z: 0 });
    expect(director.getLookAt().x).toBeCloseTo(0, 3);
    expect(director.getLookAt().z).toBeCloseTo(0, 3);

    // Moving forward in +Z
    for (let i = 0; i < 30; i++) {
      director.update(0.016, playerPos, 0, { x: 0, z: 3.5 });
    }
    const lookMoving = director.getLookAt();
    expect(lookMoving.z).toBeGreaterThan(1.0);
    expect(lookMoving.x).toBeCloseTo(0, 2);

    // Stop moving: returns towards player
    for (let i = 0; i < 60; i++) {
      director.update(0.016, playerPos, 0, { x: 0, z: 0 });
    }
    const lookStopped = director.getLookAt();
    expect(lookStopped.z).toBeLessThan(0.1);
  });

  it('enforces terrain anti-clip and minimum ground clearance', () => {
    const director = new Ax1CameraDirector({ minGroundClearance: 1.0 });
    const playerPos = { x: 0, y: 2, z: 0 };

    // Flat terrain at y=0
    director.update(0.1, playerPos, 0, { x: 0, z: 0 }, (_x, _z) => 0);
    const flatCamY = director.getCameraPosition().y;
    expect(flatCamY).toBeGreaterThan(4);

    // Steep terrain peak behind camera at y=15
    for (let i = 0; i < 40; i++) {
      director.update(0.05, playerPos, 0, { x: 0, z: 0 }, (_x, _z) => 15.0);
    }
    const peakCamY = director.getCameraPosition().y;
    // Camera must be lifted above terrain (>= 15 + minGroundClearance 1.0 = 16.0)
    expect(peakCamY).toBeGreaterThanOrEqual(15.9);
  });

  it('dynamically adapts FOV for tablet 4:3 vs smartphone 16:9 aspect ratios', () => {
    const director = new Ax1CameraDirector({ baseFov: 60 });

    // Widescreen 16:9 (1920x1080 -> aspect ~1.777)
    const widescreenFov = director.computeDynamicFov(1920, 1080);
    expect(widescreenFov).toBe(60);

    // Tablet 4:3 iPad (1024x768 -> aspect ~1.333)
    const tabletFov = director.computeDynamicFov(1024, 768);
    expect(tabletFov).toBeGreaterThan(60);
    expect(tabletFov).toBeLessThanOrEqual(72);

    // Portrait smartphone (390x844 -> aspect ~0.46)
    const portraitFov = director.computeDynamicFov(390, 844);
    expect(portraitFov).toBeGreaterThan(65);
    expect(portraitFov).toBeLessThanOrEqual(75);
  });

  it('decays touch swipe inertia exponentially without exploding', () => {
    const director = new Ax1CameraDirector({ inertiaDecay: 6.0 });
    director.addInertia(0.2, 0.1, 0.016);

    const initialYaw = director.getYaw();
    director.update(0.016, { x: 0, y: 0, z: 0 }, 0);
    const movedYaw = director.getYaw();
    expect(movedYaw).not.toBe(initialYaw);

    // Over 1 second, velocity decays to 0
    for (let i = 0; i < 60; i++) {
      director.update(0.016, { x: 0, y: 0, z: 0 }, 0);
    }
    const state = director.getState();
    expect(state.yawVelocity).toBe(0);
    expect(state.pitchVelocity).toBe(0);
  });

  it('softly auto-follows player movement heading after idle delay and resets on manual orbit', () => {
    const director = new Ax1CameraDirector({ autoFollowDelay: 0.5, autoFollowRate: 2.0 });
    director.setYaw(0);

    const playerPos = { x: 0, y: 0, z: 0 };
    const moveVelocity = { x: 3.0, z: 0 }; // Moving in +X direction (angle = PI/2)

    // First 0.3s (below 0.5s idle threshold): yaw should stay at 0
    for (let i = 0; i < 18; i++) {
      director.update(0.016, playerPos, 0, moveVelocity);
    }
    expect(director.getYaw()).toBeCloseTo(0, 1);

    // Further 1.0s (past 0.5s idle threshold): yaw should rotate towards +X heading (PI/2 ~ 1.57)
    for (let i = 0; i < 60; i++) {
      director.update(0.016, playerPos, 0, moveVelocity);
    }
    expect(director.getYaw()).toBeGreaterThan(0.5);

    // Manual orbit touch cancels auto-follow and resets idle time
    director.setManualOrbiting(true);
    director.applyOrbitDelta(-0.8, 0);
    director.update(0.016, playerPos, 0, moveVelocity);
    expect(director.getState().idleOrbitTime).toBe(0);
  });

  it('strictly clamps pitch and distance within configured limits', () => {
    const director = new Ax1CameraDirector({ minPitch: 0.1, maxPitch: 1.2, minDistance: 5, maxDistance: 25 });

    director.applyOrbitDelta(0, 5.0); // Extreme pitch up
    expect(director.getPitch()).toBe(1.2);

    director.applyOrbitDelta(0, -10.0); // Extreme pitch down
    expect(director.getPitch()).toBe(0.1);

    director.zoomBy(50.0);
    expect(director.getState().targetDistance).toBe(25);

    director.zoomBy(-100.0);
    expect(director.getState().targetDistance).toBe(5);
  });
});
