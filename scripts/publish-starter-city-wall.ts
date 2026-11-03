/** Operator entry point. No user creation, token minting, direct SQL writes or
 * client authority: ingestion and publication use the canonical Aurion stores.
 * Run only in the selected released runtime, with its existing owner identity.
 */
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { getUserById, getUserByOpenId } from "../server/db";
import { glbImportStore } from "../server/glbImportStore";
import { buildGlbImportPlan } from "../server/glbImportPlan";
import { applyWorldDesign, planWorldDesign, readActiveWorldDesign, recoverWorldAuthoringReceipt } from "../server/aurionAuthoringPersistence";
import { WorldDesignDraftSchema, WorldDesignPlanSchema } from "../shared/aurionAuthoringContract";
import { AURION_STARTER_CITY_WALL_LODS, starterCityWallAssetId } from "../shared/aurionStarterCityWallContract";

const mode = process.argv[2];
const location = process.argv[3];
const expectedRevision = process.env.AURION_EXPECTED_REVISION;
if (!expectedRevision || !/^[a-f0-9]{40}$/.test(expectedRevision) || expectedRevision !== process.env.AURION_RELEASE_SHA) throw new Error("CITY_WALL_RUNTIME_REVISION_MISMATCH");
const operatorId = process.env.AURION_CITY_WALL_ACTOR_USER_ID;
if (operatorId && !/^[1-9][0-9]*$/.test(operatorId)) throw new Error("CITY_WALL_OPERATOR_ID_INVALID");
const owner = operatorId
  ? await getUserById(Number(operatorId))
  : process.env.OWNER_OPEN_ID ? await getUserByOpenId(process.env.OWNER_OPEN_ID) : undefined;
if (!owner || owner.role !== "admin") throw new Error("CITY_WALL_EXISTING_OWNER_REQUIRED");
const store = glbImportStore();
const designKey = "starter-city-wall";
const envelope = z.object({ revision: z.literal(expectedRevision), actorUserId: z.literal(owner.id), plan: WorldDesignPlanSchema }).strict();

async function verifyCatalog() {
  const catalog = await store.catalog();
  const expected = AURION_STARTER_CITY_WALL_LODS;
  const family = catalog.entries.find(entry => entry.assetId === starterCityWallAssetId(expected[0].sha256));
  if (!family || family.purpose !== "world-environment" || family.subcategory !== "structure" || family.targetKey !== null
      || family.lods?.length !== 3 || !expected.every((source, index) => {
        const lod = family.lods![index];
        return lod?.sha256 === source.sha256 && lod.level === source.level && lod.bytes === source.bytes
          && lod.normalization?.scaleE8 === 100_000_000;
      })) throw new Error("CITY_WALL_CATALOG_READBACK_FAILED");
  return { catalog, family };
}

try {
  if (mode === "ingest" && location) {
    // Validate all three source files before the first catalog write.
    const sources = [];
    for (const source of AURION_STARTER_CITY_WALL_LODS) {
      const bytes = await readFile(resolve(location, source.fileName));
      const contentBase64 = bytes.toString("base64");
      const plan = await buildGlbImportPlan(contentBase64, "world-environment", source.fileName);
      if (plan.sha256 !== source.sha256 || plan.bytes !== source.bytes || plan.normalization.scaleE8 !== 100_000_000
          || plan.normalization.collision.triangleCount !== source.triangles || plan.classification.lod !== source.level
          || plan.classification.subcategory !== "structure") throw new Error("CITY_WALL_SOURCE_CONTRACT_MISMATCH");
      sources.push({ source, contentBase64, plan });
    }
    const receipts = [];
    for (const { source, contentBase64, plan } of sources) receipts.push(await store.ingest(owner.id, {
      displayName: `Aurion CityWall LOD${source.level}`, fileName: source.fileName, contentBase64,
      purpose: "world-environment", expectedPlanSha256: plan.planSha256,
    }));
    const { catalog, family } = await verifyCatalog();
    console.log(JSON.stringify({ revision: expectedRevision, catalogRevision: catalog.revision, assetId: family.assetId, receipts }));
  } else if (mode === "plan" && location) {
    const { catalog, family } = await verifyCatalog();
    const world = await readActiveWorldDesign();
    if (world.designs.some(item => item.designKey === designKey)) throw new Error("CITY_WALL_ALREADY_PUBLISHED_REVIEW_EXISTING_DESIGN");
    const draft = WorldDesignDraftSchema.parse({
      schemaVersion: "aurion.world-design.v1", designKey, version: 1, title: "Aurion Starterstadt — Stadtmauer",
      expectedCatalogRevision: catalog.revision,
      placements: [{ placementKey: "city-perimeter", assetId: family.assetId, chunkX: 0, chunkZ: 0,
        xMm: 32000, zMm: 32000, rotationQuarterTurns: 0, scalePermille: 1000 }],
    });
    const plan = await planWorldDesign(draft, undefined, randomBytes(16).toString("hex"));
    await writeFile(location, JSON.stringify({ revision: expectedRevision, actorUserId: owner.id, plan }, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ mode, planHash: plan.planHash, operationId: plan.operationId, draft }));
  } else if ((mode === "apply" || mode === "receipt") && location) {
    const { plan } = envelope.parse(JSON.parse(await readFile(location, "utf8")));
    if (plan.designKey !== designKey || !plan.operationId) throw new Error("CITY_WALL_PLAN_SCOPE_INVALID");
    if (mode === "receipt") {
      console.log(JSON.stringify(await recoverWorldAuthoringReceipt(owner.id, {
        designKey, version: plan.version, planHash: plan.planHash, operationId: plan.operationId,
      })));
    } else {
      if (process.argv[4] !== plan.planHash) throw new Error("CITY_WALL_REVIEWED_PLAN_HASH_REQUIRED");
      const { planHash, referencedAssetHashes: _assets, requiresHumanConfirmation: _confirmation,
        expectedPreviousHash: _previous, operationId, ...draft } = plan;
      const result = await applyWorldDesign(owner.id, WorldDesignDraftSchema.parse(draft), planHash, operationId);
      console.log(JSON.stringify(result));
    }
  } else if (mode === "readback") {
    const { catalog, family } = await verifyCatalog();
    const world = await readActiveWorldDesign();
    console.log(JSON.stringify({ revision: expectedRevision, catalogRevision: catalog.revision, family,
      worldRevision: world.revision, designs: world.designs.filter(item => item.designKey === designKey) }));
  } else throw new Error("CITY_WALL_MODE_REQUIRED_ingest_plan_apply_receipt_readback");
} finally {
  await store.close();
}
process.exit(0);
