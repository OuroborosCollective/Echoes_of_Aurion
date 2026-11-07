// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import {
  testGlb,
  testAnimatedPlayerGlb,
} from "../../../../server/glbImportFixtures";
import { buildGlbImportPlan } from "../../../../server/glbImportPlan";
import type { GlbCatalogEntry } from "@shared/glbImportContract";
import { AURION_STARTER_CITY_WALL_LODS } from "@shared/aurionStarterCityWallContract";
import {
  GlbResourcePool,
  glbResourcePool,
  fetchVerifiedGlb,
  inspectGlbAllocation,
} from "./GlbResourceBudget";
import { glbManager, selectStaticWorldLodVariants } from "./GLBModelManager";
import { releaseGlbTree } from "./GlbModelLease";
import { AnimatedGlbActor } from "./AnimatedGlbActor";
import { requireDecodedMaterialTextures } from "./GlbTextureEvidence";
import * as THREE from "three";

afterEach(() => {
  glbManager.setAuthoritativeCatalog([]);
  glbManager.trimIdle();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const buffer = (bytes: Buffer) => Uint8Array.from(bytes).buffer;
function occupyAnimationSlots(): () => void {
  const slots = Array.from({ length: glbResourcePool.limits.animations }, () => glbResourcePool.animationActions(1));
  expect(slots.every(Boolean)).toBe(true);
  return () => slots.forEach(release => release?.());
}

describe("bounded, verified GLB ownership", () => {
  it.each([false, true])("keeps phone actor capacity independent of clips (clipless=%s) and scenery", async clipless => {
    vi.stubGlobal("crypto", webcrypto);
    const character = testAnimatedPlayerGlb("crowd-character", true);
    if (clipless) {
      const length = character.readUInt32LE(12);
      const json = JSON.parse(character.subarray(20, 20 + length).toString());
      delete json.animations;
      character.fill(0x20, 20, 20 + length);
      character.write(JSON.stringify(json), 20);
    }
    const sources = await Promise.all([
      ["crowd-character", character],
      ["crowd-scenery", testGlb("Aurion_Wall_LOD0")],
    ].map(async ([id, bytes]) => {
      const fixture = bytes as Buffer;
      const plan = await buildGlbImportPlan(fixture.toString("base64"));
      return { id: id as string, fixture, plan, url: `/api/assets/glb/${plan.sha256}.glb` };
    }));
    glbManager.setAuthoritativeCatalog(sources.map(source => ({
      id: source.id, name: source.id, fileName: `${source.plan.sha256}.glb`, url: source.url,
      category: source.id === "crowd-character" ? "character_avatar" : "architecture", normalization: source.plan.normalization,
      status: "approved", animations: [], description: "explicit decoded crowd fixture",
    })));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(sources.find(source => source.url === url)!.fixture)));
    const actors: AnimatedGlbActor[] = [], scenery: THREE.Group[] = [];
    try {
      for (let index = 0; index < 5; index++) scenery.push((await glbManager.loadModel("crowd-scenery")).scene);
      for (let index = 0; index < glbResourcePool.limits.actors; index++) {
        const loaded = await glbManager.loadModel("crowd-character");
        actors.push(new AnimatedGlbActor(loaded.scene, loaded.animations));
      }
      expect(glbResourcePool.tier).toBe("phone");
      expect(actors).toHaveLength(12);
      expect(actors.every(actor => actor.group.visible && !new THREE.Box3().setFromObject(actor.group).isEmpty())).toBe(true);
      expect(glbResourcePool.evidence()).toMatchObject({ actors: 12, staticInstances: 5, animations: clipless ? 0 : 8 });
      expect(actors.reduce((count, actor) => count + actor.evidence().activeAnimationActions, 0)).toBe(clipless ? 0 : 8);
      await expect(glbManager.loadModel("crowd-character")).rejects.toThrow("GLB_ACTOR_BUDGET");
      if (clipless) return;
      const waiting = actors[11]!;
      expect(waiting.evidence().activeAnimationActions).toBe(0);
      expect(waiting.evidence().clip).toMatch(/idle/i);
      expect(waiting.evidence().clipTime).toBe(0);
      actors[0]!.setAnimationEnabled(false);
      waiting.update(0.1);
      expect(waiting.evidence().activeAnimationActions).toBe(1);
      expect(waiting.evidence().clipTime).toBeGreaterThan(0);
      expect(actors[0]!.group.visible).toBe(true);
      for (const actor of actors) { actor.setLocomotion(2); actor.update(0.1); }
      expect(glbResourcePool.evidence().animations).toBeLessThanOrEqual(8);
    } finally {
      actors.forEach(actor => actor.dispose());
      scenery.forEach(model => releaseGlbTree(model));
    }
    expect(glbResourcePool.evidence()).toMatchObject({ actors: 0, staticInstances: 0, animations: 0 });
  });
  it("keeps static-clip locomotion moving while all mixer slots are occupied", () => {
    const release = occupyAnimationSlots();
    expect(release).not.toBeNull();
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
    const bone = new THREE.Bone(); bone.name = "thigh_l"; model.add(bone);
    const actor = new AnimatedGlbActor(model, [new THREE.AnimationClip("Idle", 1, []), new THREE.AnimationClip("Walk", 1, [])]);
    try {
      actor.setLocomotion(2);
      const before = bone.quaternion.clone();
      actor.update(.12);
      expect(bone.quaternion.equals(before)).toBe(false);
      expect(actor.evidence().activeAnimationActions).toBe(0);
      expect(actor.evidence().clipTime).toBe(0);
      expect(glbResourcePool.evidence().animations).toBe(glbResourcePool.limits.animations);
    } finally { actor.dispose(); release(); }
  });
  it("resumes a one-shot after repeated suspension while mixer capacity is full", () => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial()));
    const bone = new THREE.Bone(); bone.name = "Spine"; model.add(bone);
    const clips = ["Idle", "Attack", "Walk"].map(name => new THREE.AnimationClip(name, 1,
      [new THREE.NumberKeyframeTrack("Spine.position[x]", [0, 1], [0, .2])]));
    const actor = new AnimatedGlbActor(model, clips);
    let release: (() => void) | null = null;
    try {
      expect(actor.playOnce("attack")).toBe(true);
      actor.update(.1);
      const before = actor.evidence().clipTime;
      actor.setAnimationEnabled(false);
      release = occupyAnimationSlots();
      expect(release).not.toBeNull();
      actor.setAnimationEnabled(true); actor.update(.1);
      actor.setAnimationEnabled(false);
      release!(); release = null;
      actor.setAnimationEnabled(true); actor.update(.1);
      expect(actor.evidence().clipTime).toBeGreaterThan(before);
      for (let i = 0; i < 10; i++) actor.update(.2);
      actor.setLocomotion(2);
      expect(actor.evidence().clip).toBe("Walk");
    } finally { actor.dispose(); release?.(); }
    expect(glbResourcePool.evidence().animations).toBe(0);
  });
  it("rejects a resolved GLTF with a silently missing material texture", () => {
    const scene = new THREE.Group(),
      material = new THREE.MeshStandardMaterial();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    const associations = new Map<object, any>([[material, { materials: 0 }]]);
    const gltf = { scene, parser: { associations } } as any;
    const json = {
      materials: [
        {
          pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
          normalTexture: { index: 1 },
        },
      ],
    };
    material.map = new THREE.Texture();
    associations.set(material.map, { textures: 0 });
    expect(() => requireDecodedMaterialTextures(gltf, json)).toThrow(
      "GLB_TEXTURE_DECODE_INCOMPLETE"
    );
    material.normalMap = new THREE.Texture();
    associations.set(material.normalMap, { textures: 1 });
    expect(() => requireDecodedMaterialTextures(gltf, json)).not.toThrow();
  });
  it("never hands an occupied decode slot to two waiters", async () => {
    const pool = new GlbResourcePool();
    let active = 0,
      peak = 0;
    const releases: Array<() => void> = [];
    const work = () =>
      pool.job(1, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>(resolve => releases.push(resolve));
        active--;
      });
    const jobs = Array.from({ length: 6 }, work);
    for (let i = 0; i < 6; i++) {
      while (!releases[i]) await Promise.resolve();
      releases[i]!();
      await Promise.resolve();
    }
    await Promise.all(jobs);
    expect(peak).toBe(2);
    expect(pool.evidence()).toMatchObject({
      decoderJobs: 0,
      networkInFlightBytes: 0,
      pending: 0,
    });
  });

  it("rejects working sets and animation actions above the profile and releases once", () => {
    const pool = new GlbResourcePool();
    const release = pool.reserve({
      decodedBytes: pool.limits.decodedBytes,
      textureBytes: 0,
      animations: 0,
    })!;
    expect(
      pool.reserve({ decodedBytes: 1, textureBytes: 0, animations: 0 })
    ).toBeNull();
    release();
    release();
    expect(pool.evidence().reservedDecodedBytes).toBe(0);
    const actors = Array.from(
      { length: pool.limits.animations / 2 },
      () => pool.actor(2)!
    );
    expect(pool.actor(1)).toBeNull();
    actors.forEach(release => release());
    expect(pool.evidence()).toMatchObject({ actors: 0, animations: 0 });
  });

  it("bounds static instances and independently releases suspended animation slots exactly once", () => {
    const pool = new GlbResourcePool("phone");
    const models = Array.from({ length: pool.limits.worldInstances }, () => pool.staticInstance()!);
    const animations = Array.from({ length: pool.limits.animations }, () => pool.animationActions(1)!);
    expect(pool.staticInstance()).toBeNull();
    expect(pool.animationActions(1)).toBeNull();
    expect(pool.evidence()).toMatchObject({ staticInstances: 48, animations: 8, actors: 0 });
    for (const release of [...models, ...animations]) { release(); release(); }
    expect(pool.evidence()).toMatchObject({ staticInstances: 0, animations: 0, actors: 0 });
  });

  it("rejects external dependencies before decode and hashes actual received bytes", async () => {
    vi.stubGlobal("crypto", webcrypto);
    expect(() =>
      inspectGlbAllocation(
        buffer(
          testGlb("invalid", {
            images: [{ uri: "https://example.invalid/texture.png" }],
          })
        )
      )
    ).toThrow("GLB_EMBEDDED_IMAGE_REQUIRED");
    expect(() =>
      inspectGlbAllocation(
        buffer(
          testGlb("oversized", {
            accessors: [
              { count: 1_000_000_000, componentType: 5126, type: "VEC3" },
            ],
          })
        )
      )
    ).toThrow("GLB_RESOURCE_BOUNDS");
    const bytes = testGlb();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes))
    );
    await expect(
      fetchVerifiedGlb(
        { url: "/unit.glb", bytes: bytes.length, sha256: "0".repeat(64) },
        new AbortController().signal
      )
    ).rejects.toThrow("GLB_HASH");
    await expect(
      fetchVerifiedGlb(
        { url: "/unit.glb", bytes: bytes.length - 1, sha256: "0".repeat(64) },
        new AbortController().signal
      )
    ).rejects.toThrow("GLB_LENGTH");
  });

  it("deduplicates actual parsing while independent clones retain shared resources", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = testAnimatedPlayerGlb("budget-public-player", true);
    const url = `/api/assets/glb/${createHash("sha256").update(bytes).digest("hex")}.glb`;
    const plan = await buildGlbImportPlan(
      bytes.toString("base64"),
      "player-public",
      "budget-public-player.glb"
    );
    glbManager.setAuthoritativeCatalog([
      {
        id: "budget-public-player",
        name: "Budget Public Player",
        fileName: `${plan.sha256}.glb`,
        url,
        category: "character_avatar",
        normalization: plan.normalization,
        status: "approved",
        animations: [],
        description: "normalized test catalog asset",
      },
    ]);
    const fetch = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetch);
    const [first, second] = await Promise.all([
      glbManager.loadModel("budget-public-player"),
      glbManager.loadModel(url),
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first.scene).not.toBe(second.scene);
    expect(first.scene.userData.aurionNormalization.manifestSha256).toBe(
      plan.normalization.manifestSha256
    );
    expect(first.scene.scale.x).toBe(plan.normalization.scaleE8 / 100_000_000);
    const firstMesh = first.scene.children.find(
      node => (node as THREE.Mesh).isMesh
    ) as THREE.Mesh;
    const secondMesh = second.scene.children.find(
      node => (node as THREE.Mesh).isMesh
    ) as THREE.Mesh;
    expect(firstMesh.geometry).toBe(secondMesh.geometry);
    const dispose = vi.spyOn(firstMesh.geometry, "dispose");
    const actor = new AnimatedGlbActor(first.scene, first.animations);
    expect(glbResourcePool.evidence().animations).toBe(1);
    for (let i = 0; i < 20; i++) {
      actor.setLocomotion(i % 2 ? 1 : 4);
      actor.playOnce("attack");
    }
    expect(actor.evidence().activeAnimationActions).toBeLessThanOrEqual(2);
    expect(glbResourcePool.evidence().animations).toBe(actor.evidence().activeAnimationActions);
    actor.dispose();
    expect(glbResourcePool.evidence().animations).toBe(0);
    glbManager.trimIdle();
    expect(dispose).not.toHaveBeenCalled();
    releaseGlbTree(second.scene);
    releaseGlbTree(second.scene);
    glbManager.trimIdle();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("binds the authoritative catalog before loading a confirmed storage URL", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = testAnimatedPlayerGlb("catalog-bound-public-player", true);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const plan = await buildGlbImportPlan(
      bytes.toString("base64"),
      "player-public",
      "catalog-bound-public-player.glb"
    );
    const url = `/api/assets/glb/${sha256}.glb`;
    const fetch = vi.fn(async (request: string) => {
      if (request === "/api/game/glb-catalog") {
        return new Response(
          JSON.stringify({
            version: "aurion.glb-import.v1",
            revision: "c".repeat(64),
            entries: [
              {
                assetId: plan.assetId,
                sha256,
                displayName: "Catalog-bound public player",
                assetType: "character",
                storageUrl: url,
                targetKey: null,
                purpose: "player-public",
                subcategory: "rigged-character",
                equipmentSlot: null,
                normalization: plan.normalization,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(bytes, { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);

    const loaded = await glbManager.loadModel(url);

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/game/glb-catalog",
      expect.anything()
    );
    expect(fetch).toHaveBeenNthCalledWith(2, url, expect.anything());
    expect(loaded.scene.userData.aurionNormalization.sourceSha256).toBe(sha256);
    releaseGlbTree(loaded.scene);
  });

  it("loads each physical LOD with its own verified normalization and manifest distance", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const physical = await Promise.all(
      [0, 1].map(async level => {
        const bytes = testGlb(`Aurion_Spear_Weapon_LOD${level}`);
        const plan = await buildGlbImportPlan(bytes.toString("base64"));
        return {
          level: level as 0 | 1,
          bytes,
          plan,
          storageUrl: `/api/assets/glb/${plan.sha256}.glb`,
        };
      })
    );
    const byUrl = new Map(
      physical.map(entry => [entry.storageUrl, entry.bytes])
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const bytes = byUrl.get(url);
        return bytes
          ? new Response(bytes)
          : new Response(null, { status: 404 });
      })
    );
    const entry: GlbCatalogEntry = {
      assetId: physical[0]!.plan.assetId,
      sha256: physical[0]!.plan.sha256,
      displayName: "Aurion Spear LOD Family",
      assetType: "weapon",
      storageUrl: physical[0]!.storageUrl,
      targetKey: "weapon_spear",
      normalization: physical[0]!.plan.normalization,
      purpose: "auto",
      subcategory: "spear",
      equipmentSlot: null,
      lods: physical.map(variant => ({
        level: variant.level,
        assetId: variant.plan.assetId,
        sha256: variant.plan.sha256,
        bytes: variant.bytes.length,
        storageUrl: variant.storageUrl,
        targetKey: "weapon_spear",
        normalization: variant.plan.normalization,
      })),
    };
    const loaded = await glbManager.loadStaticLodFamily(entry);
    const runtimeLod = loaded.scene.children.find(
      node => (node as THREE.LOD).isLOD
    ) as THREE.LOD;
    expect(runtimeLod.levels.map(level => level.distance)).toEqual([0, 24]);
    expect(loaded.scene.userData.aurionCatalogLod).toMatchObject({
      levels: [0, 1],
      maxRenderDistancesMeters: [0, 24],
    });
    expect(loaded.lodLevels).toEqual([0, 1]);
    releaseGlbTree(loaded.scene);
    glbManager.trimIdle();
  });

  it("rejects unbound visual URLs and item grants without fetching", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(glbManager.loadModel("/unverified.glb")).rejects.toThrow(
      "GLB_SOURCE_HASH_REQUIRED"
    );
    expect(() =>
      glbManager.convertToRpgItem({ url: "/old.glb" } as any)
    ).toThrow("GLB_VISUAL_CATALOG_CANNOT_GRANT_ITEMS");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses a permitted lower LOD on phones without downloading the wall's oversized variants", async () => {
    vi.stubGlobal("crypto", webcrypto);
    // Real Three.js decoder and budget pool, with small static fixture GLBs.
    // Catalog sizes reproduce all three actual approved wall file sizes.
    const physical = await Promise.all(AURION_STARTER_CITY_WALL_LODS.map(async source => {
      const bytes = testGlb(`Aurion_CityWall_LOD${source.level}`);
      const plan = await buildGlbImportPlan(bytes.toString("base64"), "world-environment", source.fileName);
      return { level: source.level, assetId: plan.assetId, sha256: plan.sha256, bytes: source.bytes,
        storageUrl: `/api/assets/glb/${plan.sha256}.glb`, normalization: plan.normalization, targetKey: null, fixture: bytes };
    }));
    const entry = { ...physical[0]!, displayName: "Wall", purpose: "world-environment", assetType: "arena",
      subcategory: "structure", equipmentSlot: null, lods: physical } as GlbCatalogEntry;
    const fetch = vi.fn(async (url: string) => new Response(physical.find(lod => lod.storageUrl === url)!.fixture));
    vi.stubGlobal("fetch", fetch);
    const loaded = await glbManager.loadStaticLodFamily(entry);
    expect(loaded.lodLevels).toEqual([2]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(physical[2]!.storageUrl, expect.anything());
    expect(new THREE.Box3().setFromObject(loaded.scene).isEmpty()).toBe(false);
    releaseGlbTree(loaded.scene);
    await expect(glbManager.loadStaticLodFamily({ ...entry, lods: physical.slice(0, 2) })).rejects.toThrow("GLB_NO_SUPPORTED_LOD");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not disguise an invalid permitted LOD as a budget fallback", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = testGlb("Aurion_Wall_LOD2");
    const plan = await buildGlbImportPlan(bytes.toString("base64"), "world-environment", "Aurion_Wall_LOD2.glb");
    const variant = { level: 2 as const, assetId: plan.assetId, sha256: plan.sha256, bytes: bytes.length,
      storageUrl: `/api/assets/glb/${plan.sha256}.glb`, normalization: plan.normalization, targetKey: null };
    const entry: GlbCatalogEntry = { ...variant, displayName: "Wall", purpose: "world-environment", assetType: "arena",
      subcategory: "structure", equipmentSlot: null, lods: [variant] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(testGlb("different content"))));
    await expect(glbManager.loadStaticLodFamily(entry)).rejects.toThrow("GLB_HASH");
  });
});


describe("real pinned city wall mobile LOD admission", () => {
  const source = AURION_STARTER_CITY_WALL_LODS;
  const wall = {
    sha256: source[0]!.sha256,
    lods: source.map(lod => ({ level: lod.level, sha256: lod.sha256, bytes: lod.bytes,
      assetId: `glb_${lod.sha256.slice(0, 48)}`, storageUrl: `/api/assets/glb/${lod.sha256}.glb`,
      targetKey: null, normalization: { lod: { level: lod.level } } })),
  } as unknown as GlbCatalogEntry;

  it("selects one verified lowest-cost wall LOD on phones and tablets without relaxing resource ceilings", () => {
    expect(selectStaticWorldLodVariants(wall, "phone").map(lod => lod.level)).toEqual([2]);
    expect(selectStaticWorldLodVariants(wall, "tablet").map(lod => lod.level)).toEqual([2]);
    expect(selectStaticWorldLodVariants(wall, "desktop").map(lod => lod.level)).toEqual([0, 1, 2]);
  });

  it("does not reduce unrelated world models or admit missing oversized wall variants", () => {
    const unrelated = { ...wall, sha256: "f".repeat(64) } as GlbCatalogEntry;
    expect(selectStaticWorldLodVariants(unrelated, "tablet").map(lod => lod.level)).toEqual([0, 1, 2]);
    const missingPhoneFallback = { ...wall, lods: wall.lods!.slice(0, 2) } as GlbCatalogEntry;
    expect(selectStaticWorldLodVariants(missingPhoneFallback, "phone")).toEqual([]);
  });
});
