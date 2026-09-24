import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicAtlasPlan } from "./deterministicAtlasPack.mjs";

const sha = (n) => String(n).repeat(64).slice(0, 64);

function source(assetId, path, contentSha256, width, height, compatibilityClass, localityBucket) {
  return { assetId, path, contentSha256, width, height, compatibilityClass, localityBucket };
}

function input(sourceInputs) {
  return {
    schemaVersion: "aurion.deterministic-atlas-plan.v1",
    atlasId: "aurion-test-atlas",
    family: "test",
    pageWidth: 16,
    pageHeight: 16,
    padding: 1,
    gutter: 1,
    rotationAllowed: false,
    sourceInputs,
  };
}

test("canonical order makes shuffled inputs byte-identical", () => {
  const sources = [
    source("z", "textures/z.webp", sha(1), 4, 4, "basecolor-srgb", "city"),
    source("a", "textures/a.webp", sha(2), 8, 4, "basecolor-srgb", "city"),
    source("b", "textures/b.webp", sha(3), 4, 8, "basecolor-srgb", "city"),
  ];
  const first = buildDeterministicAtlasPlan(input(sources));
  const second = buildDeterministicAtlasPlan(input([sources[2], sources[0], sources[1]]));
  assert.deepEqual(second, first);
});

test("deduplicates identical content but keeps provenance aliases", () => {
  const duplicated = sha(10);
  const plan = buildDeterministicAtlasPlan(input([
    source("tree-a", "textures/tree-a.webp", duplicated, 4, 4, "basecolor-srgb", "nature"),
    source("tree-b", "textures/tree-b.webp", duplicated, 4, 4, "basecolor-srgb", "nature"),
  ]));
  const group = plan.groups[0];
  assert.equal(group.dedupeGroups.length, 1);
  assert.deepEqual(group.dedupeGroups[0].sourceAssetIds, ["tree-a", "tree-b"]);
  assert.equal(group.pages.length, 1);
  assert.equal(group.pages[0].placements.length, 1);
});

test("same bytes with incompatible semantic group do not dedupe across groups", () => {
  const shared = sha(11);
  const plan = buildDeterministicAtlasPlan(input([
    source("base", "textures/base.webp", shared, 4, 4, "basecolor-srgb", "city"),
    source("normal", "textures/normal.webp", shared, 4, 4, "normal-linear", "city"),
  ]));
  assert.equal(plan.groups.length, 2);
  assert.equal(plan.groups[0].pages[0].placements.length, 1);
  assert.equal(plan.groups[1].pages[0].placements.length, 1);
});

test("page overflow is deterministic and bounded", () => {
  const plan = buildDeterministicAtlasPlan({
    ...input([
      source("a", "a.webp", sha(20), 12, 12, "basecolor", "city"),
      source("b", "b.webp", sha(21), 12, 12, "basecolor", "city"),
      source("c", "c.webp", sha(22), 4, 4, "basecolor", "city"),
    ]),
    pageWidth: 16,
    pageHeight: 16,
    padding: 1,
    gutter: 0,
  });
  assert.equal(plan.groups[0].pages.length, 3);
  assert.deepEqual(plan.groups[0].pages.map(page => page.page), [0, 1, 2]);
});

test("oversized sources fail closed", () => {
  assert.throws(
    () => buildDeterministicAtlasPlan({
      ...input([source("huge", "huge.webp", sha(30), 14, 14, "basecolor", "city")]),
      pageWidth: 16,
      pageHeight: 16,
      padding: 2,
      gutter: 2,
    }),
    /ATLAS_SOURCE_DOES_NOT_FIT_PAGE/
  );
});
