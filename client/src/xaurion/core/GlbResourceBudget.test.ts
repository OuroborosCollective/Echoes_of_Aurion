// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { testGlb, testAnimatedPlayerGlb } from "../../../../server/glbImportFixtures";
import { GlbResourcePool, fetchVerifiedGlb, inspectGlbAllocation } from "./GlbResourceBudget";
import { glbManager } from "./GLBModelManager";
import { releaseGlbTree } from "./GlbModelLease";
import { AnimatedGlbActor } from "./AnimatedGlbActor";
import * as THREE from "three";

afterEach(() => { glbManager.trimIdle(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const buffer = (bytes: Buffer) => Uint8Array.from(bytes).buffer;

describe("bounded, verified GLB ownership", () => {
  it("never hands an occupied decode slot to two waiters", async () => {
    const pool = new GlbResourcePool(); let active = 0, peak = 0;
    const releases: Array<() => void> = [];
    const work = () => pool.job(1, async () => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>(resolve => releases.push(resolve)); active--;
    });
    const jobs = Array.from({length: 6}, work);
    for (let i = 0; i < 6; i++) { while (!releases[i]) await Promise.resolve(); releases[i]!(); await Promise.resolve(); }
    await Promise.all(jobs);
    expect(peak).toBe(2); expect(pool.evidence()).toMatchObject({decoderJobs: 0, networkInFlightBytes: 0, pending: 0});
  });

  it("rejects working sets and animation actions above the profile and releases once", () => {
    const pool = new GlbResourcePool();
    const release = pool.reserve({decodedBytes: pool.limits.decodedBytes, textureBytes: 0, animations: 0})!;
    expect(pool.reserve({decodedBytes: 1, textureBytes: 0, animations: 0})).toBeNull();
    release(); release(); expect(pool.evidence().reservedDecodedBytes).toBe(0);
    const actors = Array.from({length: pool.limits.animations / 2}, () => pool.actor(2)!);
    expect(pool.actor(1)).toBeNull(); actors.forEach(release => release());
    expect(pool.evidence()).toMatchObject({actors: 0, animations: 0});
  });

  it("rejects external dependencies before decode and hashes actual received bytes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    expect(() => inspectGlbAllocation(buffer(testGlb("invalid", {images: [{uri: "https://example.invalid/texture.png"}]})))).toThrow("GLB_EMBEDDED_IMAGE_REQUIRED");
    expect(() => inspectGlbAllocation(buffer(testGlb("oversized", {accessors: [{count: 1_000_000_000, componentType: 5126, type: "VEC3"}]})))).toThrow("GLB_RESOURCE_BOUNDS");
    const bytes = testGlb();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes)));
    await expect(fetchVerifiedGlb({url: "/unit.glb", bytes: bytes.length, sha256: "0".repeat(64)}, new AbortController().signal)).rejects.toThrow("GLB_HASH");
    await expect(fetchVerifiedGlb({url: "/unit.glb", bytes: bytes.length - 1, sha256: "0".repeat(64)}, new AbortController().signal)).rejects.toThrow("GLB_LENGTH");
  });

  it("deduplicates actual parsing while independent clones retain shared resources", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = testAnimatedPlayerGlb("budget-public-player", true);
    const url = `/api/assets/glb/${createHash("sha256").update(bytes).digest("hex")}.glb`;
    const fetch = vi.fn(async () => new Response(bytes)); vi.stubGlobal("fetch", fetch);
    const [first, second] = await Promise.all([glbManager.loadModel(url), glbManager.loadModel(url)]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first.scene).not.toBe(second.scene);
    const firstMesh = first.scene.children.find(node => (node as THREE.Mesh).isMesh) as THREE.Mesh;
    const secondMesh = second.scene.children.find(node => (node as THREE.Mesh).isMesh) as THREE.Mesh;
    expect(firstMesh.geometry).toBe(secondMesh.geometry);
    const dispose = vi.spyOn(firstMesh.geometry, "dispose");
    const actor = new AnimatedGlbActor(first.scene, first.animations);
    for (let i = 0; i < 20; i++) { actor.setLocomotion(i % 2 ? 1 : 4); actor.playOnce("attack"); }
    expect(actor.evidence().activeAnimationActions).toBeLessThanOrEqual(2);
    actor.dispose(); glbManager.trimIdle(); expect(dispose).not.toHaveBeenCalled();
    releaseGlbTree(second.scene); releaseGlbTree(second.scene); glbManager.trimIdle();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("rejects unbound visual URLs and item grants without fetching", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(glbManager.loadModel("/unverified.glb")).rejects.toThrow("GLB_SOURCE_HASH_REQUIRED");
    expect(() => glbManager.convertToRpgItem({url: "/old.glb"} as any)).toThrow("GLB_VISUAL_CATALOG_CANNOT_GRANT_ITEMS");
    expect(fetch).not.toHaveBeenCalled();
  });
});
