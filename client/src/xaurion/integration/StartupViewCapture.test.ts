import { describe, expect, it } from 'vitest';
import { StartupViewCapture } from './StartupViewCapture';

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
