import { readFile } from "node:fs/promises";
import * as db from "../server/db";
import { buildGlbImportPlan } from "../server/glbImportPlan";
import { GlbImportStore } from "../server/glbImportStore";
import {
  AURION_VILLAGE_STREET_LAMP_DISPLAY_NAME,
  AURION_VILLAGE_STREET_LAMP_LODS,
} from "../shared/aurionVillageStreetLampContract";

const databaseUrl = process.env.DATABASE_URL;
const storageRoot = process.env.AURION_GLB_STORAGE_DIR;
if (!databaseUrl || !storageRoot) throw new Error("STARTER_STREET_LAMP_GLB_ENV_REQUIRED");

const openId = "starter-village-street-lamp-asset-admin";
await db.upsertUser({ openId, name: "Starter Village Street Lamp Asset Admin", role: "admin" });
const admin = await db.getUserByOpenId(openId);
if (!admin || admin.role !== "admin") throw new Error("STARTER_STREET_LAMP_ADMIN_READBACK_FAILED");

const store = new GlbImportStore(databaseUrl, storageRoot);
try {
  const receipts = [];
  for (const expected of AURION_VILLAGE_STREET_LAMP_LODS) {
    const bytes = await readFile(`assets/environment/street-lamp/${expected.fileName}`);
    const contentBase64 = bytes.toString("base64");
    const plan = await buildGlbImportPlan(contentBase64, "world-environment", expected.fileName);
    if (
      plan.sha256 !== expected.sha256 ||
      plan.assetId !== expected.assetId ||
      plan.bytes !== expected.bytes ||
      plan.classification.subcategory !== "street-prop" ||
      plan.classification.lod !== expected.level
    ) throw new Error("STARTER_STREET_LAMP_SOURCE_CONTRACT_MISMATCH");

    const receipt = await store.ingest(admin.id, {
      displayName: `${AURION_VILLAGE_STREET_LAMP_DISPLAY_NAME} LOD${expected.level}`,
      fileName: expected.fileName,
      contentBase64,
      purpose: "world-environment",
      expectedPlanSha256: plan.planSha256,
    });
    receipts.push(receipt);
  }

  const catalog = await store.catalog();
  const [lod0, lod1, lod2, lod3] = AURION_VILLAGE_STREET_LAMP_LODS;
  const family = catalog.entries.find(entry =>
    entry.assetId === lod0.assetId &&
    entry.sha256 === lod0.sha256 &&
    entry.purpose === "world-environment" &&
    entry.assetType === "arena" &&
    entry.subcategory === "street-prop" &&
    entry.targetKey === null
  );
  const lods = family?.lods ?? [];
  if (
    !family ||
    lods.length !== 4 ||
    ![lod0, lod1, lod2, lod3].every((expected, index) =>
      lods[index]?.level === expected.level &&
      lods[index]?.assetId === expected.assetId &&
      lods[index]?.sha256 === expected.sha256 &&
      lods[index]?.bytes === expected.bytes
    )
  ) throw new Error("STARTER_STREET_LAMP_CATALOG_READBACK_FAILED");

  console.log(JSON.stringify({
    schema: "aurion.starter-village-street-lamp-seed.v1",
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
