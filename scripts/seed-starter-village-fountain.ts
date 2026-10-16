import { readFile } from "node:fs/promises";
import * as db from "../server/db";
import { buildGlbImportPlan } from "../server/glbImportPlan";
import { GlbImportStore } from "../server/glbImportStore";
import {
  AURION_VILLAGE_FOUNTAIN_DISPLAY_NAME,
  AURION_VILLAGE_FOUNTAIN_LODS,
} from "../shared/aurionVillageFountainContract";

const databaseUrl = process.env.DATABASE_URL;
const storageRoot = process.env.AURION_GLB_STORAGE_DIR;
if (!databaseUrl || !storageRoot) throw new Error("STARTER_FOUNTAIN_GLB_ENV_REQUIRED");

const openId = "starter-village-fountain-asset-admin";
await db.upsertUser({ openId, name: "Starter Village Fountain Asset Admin", role: "admin" });
const admin = await db.getUserByOpenId(openId);
if (!admin || admin.role !== "admin") throw new Error("STARTER_FOUNTAIN_ADMIN_READBACK_FAILED");

const store = new GlbImportStore(databaseUrl, storageRoot);
try {
  const receipts = [];
  for (const expected of AURION_VILLAGE_FOUNTAIN_LODS) {
    const bytes = await readFile(`assets/environment/fountain/${expected.fileName}`);
    const contentBase64 = bytes.toString("base64");
    const plan = await buildGlbImportPlan(contentBase64, "world-environment", expected.fileName);
    if (
      plan.sha256 !== expected.sha256 ||
      plan.assetId !== expected.assetId ||
      plan.bytes !== expected.bytes ||
      plan.classification.subcategory !== "fountain" ||
      plan.classification.lod !== expected.level
    ) throw new Error("STARTER_FOUNTAIN_SOURCE_CONTRACT_MISMATCH");

    const receipt = await store.ingest(admin.id, {
      displayName: `${AURION_VILLAGE_FOUNTAIN_DISPLAY_NAME} LOD${expected.level}`,
      fileName: expected.fileName,
      contentBase64,
      purpose: "world-environment",
      expectedPlanSha256: plan.planSha256,
    });
    receipts.push(receipt);
  }

  const catalog = await store.catalog();
  const [lod1, lod2] = AURION_VILLAGE_FOUNTAIN_LODS;
  const family = catalog.entries.find(entry =>
    entry.assetId === lod1.assetId &&
    entry.sha256 === lod1.sha256 &&
    entry.purpose === "world-environment" &&
    entry.assetType === "arena" &&
    entry.subcategory === "fountain" &&
    entry.targetKey === null
  );
  const lods = family?.lods ?? [];
  if (
    !family ||
    lods.length !== 2 ||
    lods[0]?.level !== 1 ||
    lods[0]?.sha256 !== lod1.sha256 ||
    lods[1]?.level !== 2 ||
    lods[1]?.sha256 !== lod2.sha256
  ) throw new Error("STARTER_FOUNTAIN_CATALOG_READBACK_FAILED");

  console.log(JSON.stringify({
    schema: "aurion.starter-village-fountain-seed.v1",
    sourceRevision: process.env.AURION_RELEASE_SHA ?? null,
    catalogRevision: catalog.revision,
    displayName: family.displayName,
    purpose: family.purpose,
    subcategory: family.subcategory,
    primaryAssetId: family.assetId,
    lods: lods.map(lod => ({ level: lod.level, assetId: lod.assetId, sha256: lod.sha256, bytes: lod.bytes, storageUrl: lod.storageUrl })),
    receipts: receipts.map(receipt => ({ assetId: receipt.assetId, sha256: receipt.sha256, status: receipt.status })),
  }));
} finally {
  await store.close();
}

process.exit(0);
