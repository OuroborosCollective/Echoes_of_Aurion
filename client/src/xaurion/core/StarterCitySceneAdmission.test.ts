// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AURION_STARTER_CITY_WALL_HEADROOM_KEY, AURION_STARTER_CITY_WALL_LODS } from "@shared/aurionStarterCityWallContract";
import { assetBudgets, cappedTextureSize, MIN_TEXTURE_DIMENSION, type AssetTier, type GlbImageSize } from "@shared/glbPresentationBudget";
import { GlbResourcePool } from "./GlbResourceBudget";
import { admitGlbAllocation } from "./GLBModelManager";

/**
 * The scene a player sees at the starter city, read back from production on
 * 2026-11-07 (runtime 5fc68dc3, catalog 62cdc30e…, world design 924b2764…):
 * every physical GLB the browser projection requests around the origin, plus the
 * largest NPC fallback models (per tier file-size limit). Values are the exact
 * stored bytes' geometry allocation and embedded image sizes.
 */
type SceneModel = Readonly<{ name: string; family: string; level: number; fileBytes: number; geometryBytes: number; images: readonly (readonly [number, number])[] }>;
const ORIGIN_SCENE: readonly SceneModel[] = Object.freeze([
  { name: "plant L0", family: "plant", level: 0, fileBytes: 401200, geometryBytes: 18480, images: [[512, 512]] },
  { name: "tree L0", family: "tree", level: 0, fileBytes: 1116224, geometryBytes: 413616, images: [[512, 512], [512, 512], [512, 512]] },
  { name: "rock L0", family: "rock", level: 0, fileBytes: 314892, geometryBytes: 33840, images: [[512, 512]] },
  { name: "building L0", family: "building", level: 0, fileBytes: 12978996, geometryBytes: 4472784, images: [[2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "building L1", family: "building", level: 1, fileBytes: 4234780, geometryBytes: 1293600, images: [[1024, 1024], [1024, 1024], [1024, 1024]] },
  { name: "building-2 L0", family: "building-2", level: 0, fileBytes: 1044832, geometryBytes: 341712, images: [[512, 512], [512, 512], [512, 512]] },
  { name: "fountain L0", family: "fountain", level: 0, fileBytes: 1229500, geometryBytes: 164736, images: [[512, 512], [512, 512]] },
  { name: "street-prop L0", family: "street-prop", level: 0, fileBytes: 4317280, geometryBytes: 4265184, images: [[1024, 1024], [1024, 1024], [1024, 1024]] },
  { name: "street-prop L1", family: "street-prop", level: 1, fileBytes: 3200012, geometryBytes: 643776, images: [[1024, 1024], [1024, 1024], [1024, 1024]] },
  { name: "teleporter L0", family: "teleporter", level: 0, fileBytes: 7954128, geometryBytes: 224784, images: [[2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "structure L0", family: "structure", level: 0, fileBytes: 9299064, geometryBytes: 8669472, images: [[512, 512], [512, 512], [512, 512], [1024, 1024], [1024, 1024], [1024, 1024], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512]] },
  { name: "structure L1", family: "structure", level: 1, fileBytes: 8421884, geometryBytes: 6005520, images: [[512, 512], [512, 512], [512, 512], [1024, 1024], [1024, 1024], [1024, 1024], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512]] },
  { name: "structure L2", family: "structure", level: 2, fileBytes: 7921780, geometryBytes: 4485216, images: [[512, 512], [512, 512], [512, 512], [1024, 1024], [1024, 1024], [1024, 1024], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512]] },
  { name: "npc-1 L0", family: "npc-1", level: 0, fileBytes: 21649816, geometryBytes: 473776, images: [[2048, 2048], [2048, 2048], [2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-2 L0", family: "npc-2", level: 0, fileBytes: 21416396, geometryBytes: 531440, images: [[2048, 2048], [2048, 2048], [2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-3 L0", family: "npc-3", level: 0, fileBytes: 21416232, geometryBytes: 531096, images: [[2048, 2048], [2048, 2048], [2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-4 L0", family: "npc-4", level: 0, fileBytes: 21414512, geometryBytes: 525288, images: [[2048, 2048], [2048, 2048], [2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-5 L0", family: "npc-5", level: 0, fileBytes: 21407352, geometryBytes: 490768, images: [[2048, 2048], [2048, 2048], [2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-6 L0", family: "npc-6", level: 0, fileBytes: 21369760, geometryBytes: 367168, images: [[2048, 2048], [2048, 2048], [2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-7 L0", family: "npc-7", level: 0, fileBytes: 21365572, geometryBytes: 364552, images: [[2048, 2048], [2048, 2048], [2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-8 L0", family: "npc-8", level: 0, fileBytes: 19532076, geometryBytes: 463272, images: [[2048, 2048], [2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-phone-1 L0", family: "npc-phone-1", level: 0, fileBytes: 15524708, geometryBytes: 541648, images: [[2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-phone-2 L0", family: "npc-phone-2", level: 0, fileBytes: 15521380, geometryBytes: 533848, images: [[2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-phone-3 L0", family: "npc-phone-3", level: 0, fileBytes: 15520624, geometryBytes: 532216, images: [[2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-phone-4 L0", family: "npc-phone-4", level: 0, fileBytes: 15474780, geometryBytes: 382664, images: [[2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-phone-5 L0", family: "npc-phone-5", level: 0, fileBytes: 15469756, geometryBytes: 360880, images: [[2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-phone-6 L0", family: "npc-phone-6", level: 0, fileBytes: 15209536, geometryBytes: 469160, images: [[2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-phone-7 L0", family: "npc-phone-7", level: 0, fileBytes: 15163136, geometryBytes: 313272, images: [[2048, 2048], [2048, 2048], [256, 256], [256, 256], [2048, 2048], [2048, 2048], [2048, 2048]] },
  { name: "npc-phone-8 L0", family: "npc-phone-8", level: 0, fileBytes: 7292672, geometryBytes: 6418704, images: [[512, 512], [512, 512], [256, 256], [256, 256], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512], [512, 512]] },
]);

const mipBytes = (width: number, height: number) => {
  let sum = 0;
  for (let w = width, h = height; ; w = Math.max(1, Math.floor(w / 2)), h = Math.max(1, Math.floor(h / 2))) { sum += w * h * 4; if (w === 1 && h === 1) break; }
  return sum;
};
function inspect(model: SceneModel, edge: number) {
  const images: GlbImageSize[] = model.images.map(([width, height]) => {
    const decoded = cappedTextureSize(width, height, edge);
    return { width, height, decodedWidth: decoded.width, decodedHeight: decoded.height };
  });
  const textureBytes = images.reduce((sum, image) => sum + mipBytes(image.decodedWidth, image.decodedHeight), 0);
  return { images, allocation: { decodedBytes: model.geometryBytes + textureBytes, textureBytes, animations: 0 } };
}

/** What the browser requests on this tier: file-size limit, one LOD per family on phones. */
function sceneFor(tier: AssetTier): SceneModel[] {
  const fits = ORIGIN_SCENE.filter(model => model.fileBytes <= assetBudgets[tier].assetBytes);
  return tier === "phone" ? fits.filter(model => model.level === 0) : fits;
}
const isWall = (model: SceneModel) => model.family === "structure";

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    const other = seed % (index + 1);
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

describe("everything at the starter city is shown on the owner's phone and tablet", () => {
  it("matches the production wall bytes", () => {
    const wall = ORIGIN_SCENE.filter(isWall);
    expect(wall.map(model => model.fileBytes)).toEqual(AURION_STARTER_CITY_WALL_LODS.map(lod => lod.bytes));
  });

  // Galaxy Tab A9 is classified "tablet" in any orientation; the Huawei P9 is "phone".
  it.each(["phone", "tablet"] as const)("admits every model of the production origin scene on %s in any download order", tier => {
    const scene = sceneFor(tier);
    expect(scene.length).toBeGreaterThan(10);
    const wallHeadroom = scene.filter(isWall).reduce((sum, model) => {
      const full = inspect(model, 4096).allocation;
      return { decodedBytes: sum.decodedBytes + full.decodedBytes, textureBytes: sum.textureBytes + full.textureBytes };
    }, { decodedBytes: 0, textureBytes: 0 });
    const orders = [scene, [...scene].reverse(), ...Array.from({ length: 30 }, (_, seed) => shuffled(scene, seed + 1))];
    for (const order of orders) {
      const pool = new GlbResourcePool(tier);
      const releaseHold = pool.holdHeadroom(AURION_STARTER_CITY_WALL_HEADROOM_KEY, wallHeadroom);
      const admitted = new Map<string, number>();
      for (const model of order) {
        const result = admitGlbAllocation(pool, edge => inspect(model, edge),
          { resizable: true, headroomKey: isWall(model) ? AURION_STARTER_CITY_WALL_HEADROOM_KEY : undefined });
        if (result) admitted.set(model.name, result.textureDimension);
      }
      releaseHold();
      // Nothing is missing: every requested model is admitted (possibly with smaller textures).
      expect([...admitted.keys()].sort()).toEqual(scene.map(model => model.name).sort());
      // The wall always keeps the full detail of its tier.
      for (const model of scene.filter(isWall)) expect(admitted.get(model.name)).toBe(assetBudgets[tier].textureDimension);
      for (const edge of admitted.values()) expect(edge).toBeGreaterThanOrEqual(MIN_TEXTURE_DIMENSION);
      // And no byte ceiling was exceeded to get there.
      const evidence = pool.evidence();
      expect(evidence.reservedDecodedBytes).toBeLessThanOrEqual(assetBudgets[tier].decodedBytes);
      expect(evidence.reservedTextureBytes).toBeLessThanOrEqual(assetBudgets[tier].textureBytes);
    }
  });

  // Desktop keeps full-size textures first come, first served (no share); only the wall is guaranteed there.
  it("always admits the wall at full detail on desktop", () => {
    const scene = sceneFor("desktop");
    for (const order of [scene, [...scene].reverse(), shuffled(scene, 3)]) {
      const pool = new GlbResourcePool("desktop");
      const release = pool.holdHeadroom(AURION_STARTER_CITY_WALL_HEADROOM_KEY, scene.filter(isWall).reduce((sum, model) => {
        const full = inspect(model, 4096).allocation;
        return { decodedBytes: sum.decodedBytes + full.decodedBytes, textureBytes: sum.textureBytes + full.textureBytes };
      }, { decodedBytes: 0, textureBytes: 0 }));
      const walls = order.filter(model => admitGlbAllocation(pool, edge => inspect(model, edge),
        { resizable: true, headroomKey: isWall(model) ? AURION_STARTER_CITY_WALL_HEADROOM_KEY : undefined }) && isWall(model));
      release();
      expect(walls).toHaveLength(3);
    }
  });

  it("would have dropped models without the texture edge and degradation (production baseline)", () => {
    for (const tier of ["phone", "tablet"] as const) {
      const pool = new GlbResourcePool(tier);
      const dropped = sceneFor(tier).filter(model => !admitGlbAllocation(pool, edge => inspect(model, edge), { resizable: false }));
      expect(dropped.length).toBeGreaterThan(0);
    }
  });
});
