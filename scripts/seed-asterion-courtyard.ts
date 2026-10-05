import { readFile } from "node:fs/promises";
import * as db from "../server/db";
import { buildGlbImportPlan } from "../server/glbImportPlan";
import { GlbImportStore } from "../server/glbImportStore";
import {
  ASTERION_COURTYARD_DISPLAY_NAME,
  ASTERION_COURTYARD_LODS,
  ASTERION_COURTYARD_TARGET_KEY,
} from "../shared/asterionCourtyardContract";

const databaseUrl = process.env.DATABASE_URL;
const storageRoot = process.env.AURION_GLB_STORAGE_DIR;
if (!databaseUrl || !storageRoot) throw new Error("ASTERION_COURTYARD_GLB_ENV_REQUIRED");

const openId = "asterion-courtyard-asset-admin";
await db.upsertUser({ openId, name: "Asterion Courtyard Asset Admin", role: "admin" });
const admin = await db.getUserByOpenId(openId);
if (!admin || admin.role !== "admin") throw new Error("ASTERION_COURTYARD_ADMIN_READBACK_FAILED");

const before = await db.getActiveGlbAssignment("arena", ASTERION_COURTYARD_TARGET_KEY);
if (before !== null) throw new Error("ASTERION_COURTYARD_TARGET_NOT_EMPTY");

const store = new GlbImportStore(databaseUrl, storageRoot);
try {
  const receipts = [];
  for (const expected of ASTERION_COURTYARD_LODS) {
    const bytes = await readFile(`assets/environment/asterion-courtyard/${expected.fileName}`);
    const contentBase64 = bytes.toString("base64");
    const plan = await buildGlbImportPlan(contentBase64, "auto", expected.fileName);
    if (
      plan.sha256 !== expected.sha256 ||
      plan.assetId !== expected.assetId ||
      plan.bytes !== expected.bytes ||
      plan.targetKey !== ASTERION_COURTYARD_TARGET_KEY ||
      plan.classification.lod !== expected.level
    ) throw new Error("ASTERION_COURTYARD_SOURCE_CONTRACT_MISMATCH");

    const receipt = await store.ingest(admin.id, {
      displayName: `${ASTERION_COURTYARD_DISPLAY_NAME} LOD${expected.level}`,
      fileName: expected.fileName,
      contentBase64,
      purpose: "auto",
      expectedPlanSha256: plan.planSha256,
    });
    receipts.push(receipt);
  }

  const [lod0, lod1, lod2] = ASTERION_COURTYARD_LODS;
  if (receipts[0]?.status !== "assigned" || receipts[0]?.activeAssetId !== lod0.assetId)
    throw new Error("ASTERION_COURTYARD_PRIMARY_ASSIGNMENT_FAILED");
  for (const receipt of receipts.slice(1))
    if (receipt.status !== "conflict" || receipt.activeAssetId !== lod0.assetId)
      throw new Error("ASTERION_COURTYARD_VARIANT_REPLACED_PRIMARY");

  const catalog = await store.catalog();
  const family = catalog.entries.find(entry =>
    entry.assetId === lod0.assetId &&
    entry.targetKey === ASTERION_COURTYARD_TARGET_KEY &&
    entry.assetType === "arena" &&
    entry.sha256 === lod0.sha256
  );
  const lods = family?.lods ?? [];
  if (
    !family ||
    family.displayName !== ASTERION_COURTYARD_DISPLAY_NAME ||
    lods.length !== 3 ||
    lods[0]?.level !== 0 || lods[0]?.sha256 !== lod0.sha256 ||
    lods[1]?.level !== 1 || lods[1]?.sha256 !== lod1.sha256 ||
    lods[2]?.level !== 2 || lods[2]?.sha256 !== lod2.sha256
  ) throw new Error("ASTERION_COURTYARD_CATALOG_FAMILY_READBACK_FAILED");

  const active = await db.getActiveGlbAssignment("arena", ASTERION_COURTYARD_TARGET_KEY);
  if (
    !active ||
    active.assetId !== lod0.assetId ||
    active.targetKey !== ASTERION_COURTYARD_TARGET_KEY ||
    active.storageUrl !== `/api/assets/glb/${lod0.sha256}.glb`
  ) throw new Error("ASTERION_COURTYARD_PUBLIC_ASSIGNMENT_READBACK_FAILED");

  console.log(JSON.stringify({
    schema: "aurion.asterion-courtyard-seed.v1",
    sourceRevision: process.env.AURION_RELEASE_SHA ?? null,
    targetKey: ASTERION_COURTYARD_TARGET_KEY,
    active: {
      assetId: active.assetId,
      storageUrl: active.storageUrl,
    },
    catalogRevision: catalog.revision,
    family: {
      displayName: family.displayName,
      assetId: family.assetId,
      sha256: family.sha256,
      lods: lods.map(lod => ({ level: lod.level, assetId: lod.assetId, sha256: lod.sha256, bytes: lod.bytes, storageUrl: lod.storageUrl })),
    },
    receipts: receipts.map(receipt => ({ assetId: receipt.assetId, sha256: receipt.sha256, status: receipt.status, activeAssetId: receipt.activeAssetId })),
  }));
} finally {
  await store.close();
}

process.exit(0);
