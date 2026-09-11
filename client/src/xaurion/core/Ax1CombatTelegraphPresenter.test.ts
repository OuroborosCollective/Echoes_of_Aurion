import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Ax1CombatTelegraphPresenter, type Ax1ConfirmedTelegraphSpec } from "./Ax1CombatTelegraphPresenter";

const spec = (overrides: Partial<Ax1ConfirmedTelegraphSpec> = {}): Ax1ConfirmedTelegraphSpec => ({
  id: "telegraph:mob_6:1",
  kind: "line",
  x: 1,
  y: 2,
  z: 3,
  color: "#ef4444",
  startTick: 10,
  impactTick: 18,
  angleRadians: 0.5,
  width: 2.75,
  length: 5,
  ...overrides,
});

describe("AX1 confirmed telegraph presenter", () => {
  it("keeps a telegraph alive until the confirmed impact tick", () => {
    const scene = new THREE.Scene();
    const presenter = new Ax1CombatTelegraphPresenter(scene);
    presenter.addConfirmed(spec());
    expect(presenter.activeCount()).toBe(1);
    expect(scene.children).toHaveLength(2);

    presenter.updateConfirmedTick(10);
    expect(presenter.activeCount()).toBe(1);
    presenter.updateConfirmedTick(17);
    expect(presenter.activeCount()).toBe(1);
    presenter.updateConfirmedTick(18);
    expect(presenter.activeCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });

  it("does not advance or expire from wall-clock/frame deltas", () => {
    const scene = new THREE.Scene();
    const presenter = new Ax1CombatTelegraphPresenter(scene);
    presenter.addConfirmed(spec());
    expect("updatePresentation" in presenter).toBe(false);
    expect(presenter.activeCount()).toBe(1);
  });

  it("ignores regressing confirmed ticks", () => {
    const scene = new THREE.Scene();
    const presenter = new Ax1CombatTelegraphPresenter(scene);
    presenter.addConfirmed(spec());
    presenter.updateConfirmedTick(17);
    const inner = scene.children[1] as THREE.Mesh;
    const scaleAt17 = inner.scale.x;
    presenter.updateConfirmedTick(12);
    expect(inner.scale.x).toBe(scaleAt17);
    expect(presenter.activeCount()).toBe(1);
  });

  it("rejects invalid tick windows and deduplicates confirmed ids", () => {
    const scene = new THREE.Scene();
    const presenter = new Ax1CombatTelegraphPresenter(scene);
    presenter.addConfirmed(spec({ impactTick: 10 }));
    presenter.addConfirmed(spec({ startTick: -1 }));
    expect(presenter.activeCount()).toBe(0);
    presenter.addConfirmed(spec());
    presenter.addConfirmed(spec());
    expect(presenter.activeCount()).toBe(1);
    expect(scene.children).toHaveLength(2);
  });

  it("clears every presentation object without changing gameplay state", () => {
    const scene = new THREE.Scene();
    const presenter = new Ax1CombatTelegraphPresenter(scene);
    presenter.addConfirmed(spec());
    presenter.addConfirmed(spec({ id: "telegraph:mob_9:2", startTick: 20, impactTick: 25 }));
    expect(presenter.activeCount()).toBe(2);
    presenter.clear();
    expect(presenter.activeCount()).toBe(0);
    expect(scene.children).toHaveLength(0);
  });
});
