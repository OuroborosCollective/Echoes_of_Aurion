import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const AURION_DETERMINISTIC_ATLAS_ARTIFACT_SCHEMA =
  "aurion.deterministic-atlas-artifact.v1";

const SHA256 = /^([a-f0-9]{64})$/;

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertSha256(value, name) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`ATLAS_${name.toUpperCase()}_SHA256_INVALID`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`ATLAS_${name.toUpperCase()}_INVALID`);
  }
}

function mimeFor(sourcePath) {
  const lower = sourcePath.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".avif")) return "image/avif";
  throw new Error("ATLAS_SOURCE_IMAGE_FORMAT_UNSUPPORTED");
}

function canonicalBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value));
}

function sourceIndex(plan) {
  const index = new Map();
  for (const group of plan.groups ?? []) {
    for (const source of group.sourceInputs ?? []) {
      if (!index.has(source.contentSha256)) index.set(source.contentSha256, source);
    }
  }
  return index;
}

function placementsByPage(plan) {
  return (plan.groups ?? []).flatMap(group =>
    (group.pages ?? []).flatMap(page =>
      (page.placements ?? []).map(placement => ({
        group,
        page,
        placement,
      })),
    ),
  );
}

async function decodeAndMeasure(page, bytes, mime, expectedWidth, expectedHeight) {
  const base64 = Buffer.from(bytes).toString("base64");
  return page.evaluate(async ({ base64, mime, expectedWidth, expectedHeight }) => {
    const binary = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const blob = new Blob([binary], { type: mime });
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width !== expectedWidth || bitmap.height !== expectedHeight) {
      throw new Error("ATLAS_SOURCE_DIMENSIONS_MISMATCH");
    }
    return { width: bitmap.width, height: bitmap.height };
  }, { base64, mime, expectedWidth, expectedHeight });
}

async function renderPage(page, width, height, placements) {
  const payload = [];
  for (const entry of placements) {
    const source = entry.source;
    const bytes = await readFile(source.path);
    const actualSha = sha256Bytes(bytes);
    if (actualSha !== source.contentSha256) {
      throw new Error("ATLAS_SOURCE_CONTENT_SHA256_MISMATCH");
    }
    payload.push({
      placement: entry.placement,
      base64: bytes.toString("base64"),
      mime: mimeFor(source.path),
      expectedWidth: source.width,
      expectedHeight: source.height,
    });
  }

  return page.evaluate(async ({ width, height, payload }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("ATLAS_CANVAS_CONTEXT_UNAVAILABLE");
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, width, height);

    for (const item of payload) {
      const binary = Uint8Array.from(atob(item.base64), char => char.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([binary], { type: item.mime }));
      if (bitmap.width !== item.expectedWidth || bitmap.height !== item.expectedHeight) {
        throw new Error("ATLAS_SOURCE_DIMENSIONS_MISMATCH");
      }

      const p = item.placement;
      const targetWidth = p.rotated ? p.height : p.width;
      const targetHeight = p.rotated ? p.width : p.height;
      if (targetWidth < 1 || targetHeight < 1) throw new Error("ATLAS_PLACEMENT_DIMENSIONS_INVALID");
      if (p.x < 0 || p.y < 0 || p.x + targetWidth > width || p.y + targetHeight > height) {
        throw new Error("ATLAS_PLACEMENT_OUT_OF_BOUNDS");
      }

      ctx.save();
      if (p.rotated) {
        ctx.translate(p.x + p.height, p.y);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(bitmap, 0, 0, p.width, p.height);
      } else {
        ctx.drawImage(bitmap, p.x, p.y, p.width, p.height);
      }
      ctx.restore();
      bitmap.close();
    }

    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  }, { width, height, payload });
}

export async function buildDeterministicAtlasArtifact(plan, outputDirectory) {
  if (!plan || typeof plan !== "object") throw new Error("ATLAS_PLAN_INVALID");
  assertPositiveInteger(plan.pageWidth, "page_width");
  assertPositiveInteger(plan.pageHeight, "page_height");
  const sources = sourceIndex(plan);
  const entries = placementsByPage(plan);
  if (!entries.length) throw new Error("ATLAS_PLACEMENTS_EMPTY");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const generated = [];

  try {
    const maxPage = Math.max(...entries.map(entry => entry.page.page));
    for (let pageNumber = 0; pageNumber <= maxPage; pageNumber += 1) {
      const current = entries.filter(entry => entry.page.page === pageNumber);
      const pageArtifacts = [];
      for (const entry of current) {
        const source = sources.get(entry.placement.contentSha256);
        if (!source) throw new Error("ATLAS_SOURCE_FOR_PLACEMENT_MISSING");
        pageArtifacts.push({ placement: entry.placement, source });
      }
      const artifactBase64 = await renderPage(page, plan.pageWidth, plan.pageHeight, pageArtifacts);
      const bytes = Buffer.from(artifactBase64, "base64");
      const filename = `atlas-${String(pageNumber).padStart(3, "0")}.png`;
      const outputPath = path.resolve(outputDirectory, filename);
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(outputPath, bytes);
      generated.push(Object.freeze({
        page: pageNumber,
        file: filename,
        bytes: bytes.length,
        sha256: `sha256:${sha256Bytes(bytes)}`,
        placementCount: current.length,
      }));
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const artifactManifestUnsigned = {
    schemaVersion: AURION_DETERMINISTIC_ATLAS_ARTIFACT_SCHEMA,
    atlasId: plan.atlasId,
    family: plan.family,
    planHash: plan.planHash,
    packingAlgorithm: plan.packingAlgorithm,
    packingAlgorithmVersion: plan.packingAlgorithmVersion,
    pageWidth: plan.pageWidth,
    pageHeight: plan.pageHeight,
    padding: plan.padding,
    gutter: plan.gutter,
    rotationAllowed: plan.rotationAllowed,
    buildInputManifestHash: plan.sourceManifestHash,
    pages: generated,
  };
  const manifestHash = `sha256:${sha256Bytes(canonicalBytes(artifactManifestUnsigned))}`;
  const browserVersion = browser.version();
  const manifest = Object.freeze({
    ...artifactManifestUnsigned,
    browserVersion,
    manifestHash,
  });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.resolve(outputDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  return manifest;
}

async function cli() {
  const planPath = process.argv[2];
  const outputDirectory = process.argv[3] ?? ".asset-build/deterministic-atlas";
  if (!planPath) {
    console.error(
      "Usage: node scripts/atlas/buildDeterministicAtlasArtifact.mjs <plan.json> [output-directory]",
    );
    process.exit(2);
  }
  const plan = JSON.parse(await readFile(path.resolve(planPath), "utf8"));
  const manifest = await buildDeterministicAtlasArtifact(plan, outputDirectory);
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await cli();
}
