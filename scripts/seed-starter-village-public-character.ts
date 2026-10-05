import { readFile } from "node:fs/promises";
import * as db from "../server/db";
import { buildGlbImportPlan } from "../server/glbImportPlan";
import { GlbImportStore } from "../server/glbImportStore";

const databaseUrl = process.env.DATABASE_URL;
const storageRoot = process.env.AURION_GLB_STORAGE_DIR;
if (!databaseUrl || !storageRoot) throw new Error("STARTER_PILOT_GLB_ENV_REQUIRED");

const openId = "starter-village-pilot-asset-admin";
await db.upsertUser({ openId, name: "Starter Village Pilot Asset Admin", role: "admin" });
const admin = await db.getUserByOpenId(openId);
if (!admin || admin.role !== "admin") throw new Error("STARTER_PILOT_ADMIN_READBACK_FAILED");

const bytes = await readFile("assets/characters/aurion-player-standard-animated.glb");
const contentBase64 = bytes.toString("base64");
const fileName = "aurion-player-standard-animated.glb";
const displayName = "Starter Village Pilot Public Avatar";
const plan = await buildGlbImportPlan(contentBase64, "player-public", fileName);
const store = new GlbImportStore(databaseUrl, storageRoot);

try {
  const before = await store.catalog();
  const beforePublic = before.entries.filter(entry =>
    entry.purpose === "player-public" &&
    entry.assetType === "character" &&
    entry.targetKey === null
  );
  if (beforePublic.length !== 0) throw new Error("STARTER_PILOT_PUBLIC_CATALOG_NOT_EMPTY");

  const receipt = await store.ingest(admin.id, {
    displayName,
    fileName,
    contentBase64,
    purpose: "player-public",
    expectedPlanSha256: plan.planSha256,
  });
  const after = await store.catalog();
  const admitted = after.entries.find(entry =>
    entry.assetId === receipt.assetId &&
    entry.purpose === "player-public" &&
    entry.assetType === "character" &&
    entry.targetKey === null &&
    entry.sha256 === plan.sha256
  );
  if (!admitted) throw new Error("STARTER_PILOT_PUBLIC_CATALOG_READBACK_FAILED");
  if (!/^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/.test(admitted.storageUrl))
    throw new Error("STARTER_PILOT_PUBLIC_STORAGE_ROUTE_INVALID");

  process.stdout.write(JSON.stringify({
    schema: "aurion.starter-village-public-character-seed.v1",
    sourceRevision: process.env.AURION_RELEASE_SHA ?? null,
    catalogRevision: after.revision,
    assetId: admitted.assetId,
    sha256: admitted.sha256,
    storageUrl: admitted.storageUrl,
    displayName: admitted.displayName,
    purpose: admitted.purpose,
    animationContract: ["Idle", "Walk", "Attack"],
  }) + "\n");
} finally {
  await store.close();
}
