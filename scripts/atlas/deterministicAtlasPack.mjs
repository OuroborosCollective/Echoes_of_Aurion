import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const AURION_DETERMINISTIC_ATLAS_PLAN_SCHEMA = "aurion.deterministic-atlas-plan.v1";
export const AURION_DETERMINISTIC_ATLAS_PACKING_ALGORITHM = "maxrects";
export const AURION_DETERMINISTIC_ATLAS_PACKING_VERSION = "aurion.maxrects.v1";

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[^\u0000\r\n]{1,256}$/;

function assertInteger(value, name, min = 1) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`ATLAS_${name.toUpperCase()}_INVALID`);
  }
}

function assertIdentifier(value, name) {
  if (typeof value !== "string" || !IDENTIFIER.test(value.trim())) {
    throw new Error(`ATLAS_${name.toUpperCase()}_INVALID`);
  }
}

function assertSha256(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`ATLAS_${name.toUpperCase()}_SHA256_INVALID`);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const record = value;
    return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + canonicalJson(record[key])).join(",") + "}";
  }
  throw new Error("ATLAS_CANONICAL_VALUE_UNSUPPORTED");
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function compareText(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function placementScore(free, width, height, rotated) {
  const leftoverHoriz = Math.abs(free.width - width);
  const leftoverVert = Math.abs(free.height - height);
  const shortSide = Math.min(leftoverHoriz, leftoverVert);
  const longSide = Math.max(leftoverHoriz, leftoverVert);
  const areaFit = free.width * free.height - width * height;
  return [
    shortSide,
    longSide,
    areaFit,
    free.y,
    free.x,
    rotated ? 1 : 0,
  ];
}

function compareScores(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function intersects(a, b) {
  return !(b.x >= a.x + a.width ||
    b.x + b.width <= a.x ||
    b.y >= a.y + a.height ||
    b.y + b.height <= a.y);
}

function contains(a, b) {
  return b.x >= a.x &&
    b.y >= a.y &&
    b.x + b.width <= a.x + a.width &&
    b.y + b.height <= a.y + a.height;
}

function splitFreeRectangles(freeRectangles, placed) {
  const next = [];
  for (const free of freeRectangles) {
    if (!intersects(free, placed)) {
      next.push(free);
      continue;
    }

    if (placed.x > free.x) {
      next.push({ x: free.x, y: free.y, width: placed.x - free.x, height: free.height });
    }
    if (placed.x + placed.width < free.x + free.width) {
      next.push({
        x: placed.x + placed.width,
        y: free.y,
        width: free.x + free.width - (placed.x + placed.width),
        height: free.height,
      });
    }
    if (placed.y > free.y) {
      next.push({ x: free.x, y: free.y, width: free.width, height: placed.y - free.y });
    }
    if (placed.y + placed.height < free.y + free.height) {
      next.push({
        x: free.x,
        y: placed.y + placed.height,
        width: free.width,
        height: free.y + free.height - (placed.y + placed.height),
      });
    }
  }

  const pruned = [];
  for (let i = 0; i < next.length; i++) {
    const candidate = next[i];
    if (candidate.width <= 0 || candidate.height <= 0) continue;
    let contained = false;
    for (let j = 0; j < next.length; j++) {
      if (i === j) continue;
      if (contains(next[j], candidate)) {
        contained = true;
        break;
      }
    }
    if (!contained) pruned.push(candidate);
  }
  pruned.sort((a, b) =>
    a.y - b.y ||
    a.x - b.x ||
    a.width - b.width ||
    a.height - b.height
  );
  return pruned;
}

function packUniqueItems(items, config) {
  const pages = [];
  let page = null;

  const openPage = () => {
    const next = {
      page: pages.length,
      width: config.pageWidth,
      height: config.pageHeight,
      placements: [],
      freeRectangles: [{ x: 0, y: 0, width: config.pageWidth, height: config.pageHeight }],
    };
    pages.push(next);
    page = next;
  };

  openPage();

  for (const item of items) {
    const paddedWidth = item.width + config.padding * 2 + config.gutter * 2;
    const paddedHeight = item.height + config.padding * 2 + config.gutter * 2;
    assertInteger(paddedWidth, "placement_width");
    assertInteger(paddedHeight, "placement_height");

    let best = null;
    const consider = (free, width, height, rotated) => {
      if (width > free.width || height > free.height) return;
      const score = placementScore(free, width, height, rotated);
      if (!best || compareScores(score, best.score) < 0) {
        best = { free, width, height, rotated, score };
      }
    };

    for (const free of page.freeRectangles) {
      consider(free, paddedWidth, paddedHeight, false);
      if (config.rotationAllowed && paddedWidth !== paddedHeight) {
        consider(free, paddedHeight, paddedWidth, true);
      }
    }

    if (!best) {
      if (paddedWidth > config.pageWidth || paddedHeight > config.pageHeight) {
        throw new Error("ATLAS_SOURCE_DOES_NOT_FIT_PAGE");
      }
      openPage();
      for (const free of page.freeRectangles) {
        consider(free, paddedWidth, paddedHeight, false);
        if (config.rotationAllowed && paddedWidth !== paddedHeight) {
          consider(free, paddedHeight, paddedWidth, true);
        }
      }
    }

    const placed = {
      x: best.free.x,
      y: best.free.y,
      width: best.width,
      height: best.height,
    };
    page.freeRectangles = splitFreeRectangles(page.freeRectangles, placed);

    const contentX = placed.x + config.padding + config.gutter;
    const contentY = placed.y + config.padding + config.gutter;
    page.placements.push({
      regionId: item.regionId,
      sourceAssetIds: item.sourceAssetIds,
      contentSha256: item.contentSha256,
      x: contentX,
      y: contentY,
      width: item.width,
      height: item.height,
      rotated: best.rotated,
      reservedX: placed.x,
      reservedY: placed.y,
      reservedWidth: placed.width,
      reservedHeight: placed.height,
    });
  }

  return pages.map(({ freeRectangles, ...publicPage }) => Object.freeze(publicPage));
}

export function buildDeterministicAtlasPlan(input) {
  if (!input || typeof input !== "object") throw new Error("ATLAS_INPUT_INVALID");
  assertIdentifier(input.schemaVersion, "schema_version");
  if (input.schemaVersion !== AURION_DETERMINISTIC_ATLAS_PLAN_SCHEMA) {
    throw new Error("ATLAS_SCHEMA_VERSION_UNSUPPORTED");
  }
  assertIdentifier(input.atlasId, "atlas_id");
  assertIdentifier(input.family, "family");

  const pageWidth = input.pageWidth;
  const pageHeight = input.pageHeight;
  const padding = input.padding ?? 0;
  const gutter = input.gutter ?? 0;
  const rotationAllowed = input.rotationAllowed ?? false;
  assertInteger(pageWidth, "page_width");
  assertInteger(pageHeight, "page_height");
  assertInteger(padding, "padding", 0);
  assertInteger(gutter, "gutter", 0);
  if (typeof rotationAllowed !== "boolean") throw new Error("ATLAS_ROTATION_POLICY_INVALID");
  if (!Array.isArray(input.sourceInputs) || input.sourceInputs.length === 0) {
    throw new Error("ATLAS_SOURCE_INPUTS_EMPTY");
  }
  if (input.sourceInputs.length > 512) throw new Error("ATLAS_SOURCE_INPUTS_TOO_LARGE");

  const normalized = input.sourceInputs.map((source) => {
    if (!source || typeof source !== "object") throw new Error("ATLAS_SOURCE_INPUT_INVALID");
    assertIdentifier(source.assetId, "asset_id");
    assertIdentifier(source.path, "path");
    assertIdentifier(source.compatibilityClass, "compatibility_class");
    assertIdentifier(source.localityBucket, "locality_bucket");
    assertSha256(source.contentSha256, "content");
    assertInteger(source.width, "width");
    assertInteger(source.height, "height");
    if (source.width + padding * 2 + gutter * 2 > pageWidth ||
        source.height + padding * 2 + gutter * 2 > pageHeight) {
      throw new Error("ATLAS_SOURCE_DOES_NOT_FIT_PAGE");
    }
    return Object.freeze({
      assetId: source.assetId,
      path: source.path,
      contentSha256: source.contentSha256,
      width: source.width,
      height: source.height,
      compatibilityClass: source.compatibilityClass,
      localityBucket: source.localityBucket,
    });
  }).sort((a, b) =>
    compareText(a.compatibilityClass, b.compatibilityClass) ||
    compareText(a.localityBucket, b.localityBucket) ||
    compareText(a.contentSha256, b.contentSha256) ||
    compareText(a.assetId, b.assetId) ||
    compareText(a.path, b.path)
  );

  const config = Object.freeze({
    pageWidth,
    pageHeight,
    padding,
    gutter,
    rotationAllowed,
    algorithm: AURION_DETERMINISTIC_ATLAS_PACKING_ALGORITHM,
    algorithmVersion: AURION_DETERMINISTIC_ATLAS_PACKING_VERSION,
  });

  const buildConfigHash = "sha256:" + sha256(canonicalJson(config));
  const grouped = new Map();

  for (const source of normalized) {
    const groupKey = source.compatibilityClass + "\u0000" + source.localityBucket;
    let group = grouped.get(groupKey);
    if (!group) {
      group = {
        compatibilityClass: source.compatibilityClass,
        localityBucket: source.localityBucket,
        canonicalSources: [],
      };
      grouped.set(groupKey, group);
    }
    group.canonicalSources.push(source);
  }

  const groups = [...grouped.values()]
    .sort((a, b) =>
      compareText(a.compatibilityClass, b.compatibilityClass) ||
      compareText(a.localityBucket, b.localityBucket)
    )
    .map(group => {
      const dedupe = new Map();
      for (const source of group.canonicalSources) {
        const dedupeKey = source.contentSha256;
        const existing = dedupe.get(dedupeKey);
        if (existing) {
          existing.sourceAssetIds.push(source.assetId);
          existing.sourcePaths.push(source.path);
        } else {
          dedupe.set(dedupeKey, {
            contentSha256: source.contentSha256,
            sourceAssetIds: [source.assetId],
            sourcePaths: [source.path],
          });
        }
      }

      const uniqueItems = [...dedupe.values()]
        .map(entry => {
          const first = group.canonicalSources.find(source => source.contentSha256 === entry.contentSha256);
          const regionId = "region-" + sha256(canonicalJson({
            schema: "aurion.atlas.region-id.v1",
            compatibilityClass: group.compatibilityClass,
            localityBucket: group.localityBucket,
            contentSha256: entry.contentSha256,
          })).slice(0, 24);
          return {
            regionId,
            sourceAssetIds: [...entry.sourceAssetIds].sort(compareText),
            sourcePaths: [...entry.sourcePaths].sort(compareText),
            contentSha256: entry.contentSha256,
            width: first.width,
            height: first.height,
          };
        })
        .sort((a, b) =>
          compareText(a.contentSha256, b.contentSha256) ||
          compareText(a.regionId, b.regionId)
        );

      const pages = packUniqueItems(uniqueItems, config);
      return Object.freeze({
        compatibilityClass: group.compatibilityClass,
        localityBucket: group.localityBucket,
        sourceInputs: group.canonicalSources.map(source => Object.freeze(source)),
        dedupeGroups: uniqueItems.map(item => Object.freeze({
          regionId: item.regionId,
          contentSha256: item.contentSha256,
          sourceAssetIds: [...item.sourceAssetIds],
          sourcePaths: [...item.sourcePaths],
        })),
        pages,
      });
    });

  const unsigned = {
    schemaVersion: AURION_DETERMINISTIC_ATLAS_PLAN_SCHEMA,
    atlasId: input.atlasId,
    family: input.family,
    packingAlgorithm: AURION_DETERMINISTIC_ATLAS_PACKING_ALGORITHM,
    packingAlgorithmVersion: AURION_DETERMINISTIC_ATLAS_PACKING_VERSION,
    pageWidth,
    pageHeight,
    padding,
    gutter,
    rotationAllowed,
    buildConfigHash,
    sourceManifestHash: input.sourceManifestHash ?? null,
    groups,
  };

  const planHash = "sha256:" + sha256(canonicalJson(unsigned));
  return Object.freeze({ ...unsigned, planHash });
}

async function cli() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] ?? null;
  if (!inputPath) {
    console.error("Usage: node scripts/atlas/deterministicAtlasPack.mjs <input.json> [output.json]");
    process.exit(2);
  }
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const plan = buildDeterministicAtlasPlan(input);
  const serialized = JSON.stringify(plan, null, 2) + "\n";
  if (outputPath) {
    await writeFile(resolve(outputPath), serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await cli();
}
