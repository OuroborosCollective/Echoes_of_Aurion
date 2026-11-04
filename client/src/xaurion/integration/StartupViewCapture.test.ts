import { describe, expect, it } from 'vitest';
import { StartupViewCapture } from '@/lib/startupViewCapture';

// Synthetic observer controls. Real screenshots are produced only by the
// protected live workflow, never by this unit test.
describe('first-session capture', () => {
  function observer() {
    let captures = 0;
    const canvas = { width: 640, height: 360, toDataURL: () => { captures++; return 'unit-only'; } } as HTMLCanvasElement;
    const capture = new StartupViewCapture('a'.repeat(32), () => ({ connected: true }), () => canvas);
    return { capture, captures: () => captures };
  }
  it('captures the exact armed tick once and preserves the received state', () => {
    const { capture, captures } = observer();
    const snapshot = { tick: 1, position: { x: 0 } };
    capture.observe(snapshot);
    capture.onFrame();
    expect(captures()).toBe(0);
    capture.arm(2);
    snapshot.tick = 2;
    capture.onFrame();
    expect(captures()).toBe(0);
    capture.observe(snapshot);
    snapshot.position.x = 340;
    capture.onFrame();
    capture.onFrame();
    expect(captures()).toBe(1);
    expect(capture.result()).toMatchObject({ captureIndex: 1, snapshot: { tick: 2, position: { x: 0 } } });
    expect(() => capture.arm(3)).toThrow('CAPTURE_ARM_INVALID');
  });
  it('captures the first published tick at or after the bound once, including idle gaps', () => {
    const { capture, captures } = observer();
    capture.observe({ tick: 1 }); capture.arm(2);
    capture.observe({ tick: 3 }); capture.onFrame();
    capture.observe({ tick: 4 }); capture.onFrame();
    expect(captures()).toBe(1);
    expect(capture.result()).toMatchObject({snapshot:{tick:3}});
    expect(capture.state().failure).toBeNull();
  });
  it('requires a confirmed tick and bounded future target', () => {
    const { capture } = observer();
    expect(() => capture.arm(2)).toThrow();
    capture.observe({ tick: 5 });
    for (const tick of [NaN, Infinity, 5, 4, 105.5, 106]) expect(() => capture.arm(tick)).toThrow();
    capture.arm(105);
    expect(capture.state().armed).toBe(true);
  });
});

// Real Three.js camera objects; synthetic scene, not a production readback.
import { PerspectiveCamera, Vector3 } from 'three';
it('aligns before capture and holds the actual camera despite follow/resize updates', () => {
  const camera = new PerspectiveCamera(58, 16/9, 0.1, 800);
  camera.position.set(12.1234, 5, 18);
  const target = new Vector3(12, 1, 8);
  camera.lookAt(target);
  const capture = new StartupViewCapture('a'.repeat(32), () => ({ camera: {
    positionMm: camera.position.toArray().map(v => Math.round(v*1000)),
    targetMm: target.toArray().map(v => Math.round(v*1000)), fovMilliDeg: Math.round(camera.fov*1000),
    nearMm: Math.round(camera.near*1000), farMm: Math.round(camera.far*1000)
  }}), () => ({width:1280,height:720,toDataURL:()=> 'unit-only'}) as HTMLCanvasElement);
  capture.bindCamera(camera);
  capture.observe({tick:1});
  expect(() => capture.arm(2)).toThrow('CAPTURE_CAMERA_NOT_ALIGNED');
  const pose = capture.alignCamera();
  expect(pose.positionMm).toEqual([12123,5000,18000]);
  camera.position.set(99,99,99); camera.fov=75; camera.near=1;
  capture.beforeFrame();
  expect(camera.position.toArray()).toEqual([12.123,5,18]);
  expect(camera.fov).toBe(58); expect(camera.near).toBe(0.1);
  expect(camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(12,1,8).sub(camera.position).normalize())).toBeLessThan(1e-12);
  expect(() => capture.alignCamera()).toThrow('CAPTURE_CAMERA_ALREADY_ALIGNED');
  capture.arm(2);
});
