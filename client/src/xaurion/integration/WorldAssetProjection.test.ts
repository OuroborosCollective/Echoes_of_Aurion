// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { WorldAssetProjection } from "./WorldAssetProjection";

describe("confirmed world-asset position units", () => {
  it.each([
    { positionMm: { x: -19_380, z: 7_480 }, center: { x: 0, z: 0 } },
    { positionMm: { x: -40_000, z: 8_000 }, center: { x: -1, z: 0 } },
    { positionMm: { x: 64_000, z: -64_000 }, center: { x: 1, z: -1 } },
  ])("reads the same chunk from a millimetre snapshot and a metre frame: $positionMm", ({ positionMm, center }) => {
    // An unresolved read avoids loading any GLBs: this checks the real event-to-
    // region boundary, before optional renderer support or network assets exist.
    const fetchRegion = vi.fn(() => new Promise<unknown>(() => {}));
    const projection = new WorldAssetProjection(new THREE.Scene(), new THREE.PerspectiveCamera(), () => 0, fetchRegion, vi.fn());
    try {
      window.dispatchEvent(new CustomEvent("aurion:zone-snapshot", { detail: { position: positionMm } }));
      expect(fetchRegion).toHaveBeenCalledTimes(1);
      expect(fetchRegion).toHaveBeenCalledWith(center);
      projection.update(1, { x: positionMm.x / 1000, z: positionMm.z / 1000 }, 1440);
      expect(fetchRegion).toHaveBeenCalledTimes(1);
    } finally { projection.dispose(); }
  });
});
