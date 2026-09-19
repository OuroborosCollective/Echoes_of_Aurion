import { createHash } from "node:crypto";
import { z } from "zod";
import { MAX_GLB_BASE64_CHARS } from "./adminProtocol";
import { buildGlbImportPlan } from "./glbImportPlan";
import { glbImportStore } from "./glbImportStore";
import {
  GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
  GAME_DEVELOPMENT_STUDIO_VERSION,
  type GameDevelopmentStudioRuntimeReadback,
  resolveGameDevelopmentStudioRuntimeReadback,
} from "./gameDevelopmentStudioRuntime";

export const gameDevelopmentStudioLiveAssetInputSchema = z.object({
  displayName: z.string().trim().min(3).max(120),
  fileName: z.string().trim().min(3).max(120),
  contentBase64: z.string().min(16).max(MAX_GLB_BASE64_CHARS),
  purpose: z.enum([
    "world-environment",
    "world-nature",
    "npc-fallback",
    "player-public",
    "equipment",
  ]),
  packageVersion: z.string().trim().default("1.0.0"),
  rightsBasis: z.enum(["owner-created-private", "licensed"]).default("owner-created-private"),
  license: z.string().trim().max(120).optional(),
  designWorkOrderSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export type GameDevelopmentStudioLiveAssetInput = z.infer<typeof gameDevelopmentStudioLiveAssetInputSchema>;

export type GameDevelopmentStudioPlanResult = Readonly<{
  planSha256: string;
  assetSha256: string;
  byteLength: number;
  displayName: string;
  fileName: string;
  purpose: string;
  rightsBasis: "owner-created-private" | "licensed";
  license: string;
  packageVersion: string;
  assetType: string;
  targetKey: string | null;
  importPlanSha256: string;
  gameDevelopmentStudio: {
    version: string;
    sourceRevision: string;
  };
  validationStatus: "valid";
  providerSpend: false;
}>;

export type GameDevelopmentStudioApplyResult = Readonly<{
  status: "admitted_to_live_aurion";
  planSha256: string;
  assetId: string;
  sha256: string;
  catalogRevision: string;
  storageUrl: string;
  receiptStatus: string;
}>;

function resolveLicenseText(rightsBasis: "owner-created-private" | "licensed", license?: string): string {
  if (rightsBasis === "owner-created-private") {
    return "Proprietary-Owner-Created";
  }
  if (!license || !license.trim()) {
    throw new Error("GDS_LICENSED_ASSET_REQUIRES_LICENSE");
  }
  return license.trim();
}

export async function planGameDevelopmentStudioLiveAsset(
  input: GameDevelopmentStudioLiveAssetInput
): Promise<GameDevelopmentStudioPlanResult> {
  const buffer = Buffer.from(input.contentBase64, "base64");
  if (buffer.length < 20) {
    throw new Error("GDS_INVALID_GLB_BUFFER");
  }

  // GLB magic 'glTF' (0x46546C67)
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    throw new Error("GDS_INVALID_GLB_MAGIC");
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error("GDS_UNSUPPORTED_GLB_VERSION");
  }

  const assetSha256 = createHash("sha256").update(buffer).digest("hex");
  const license = resolveLicenseText(input.rightsBasis, input.license);
  const importPlan = buildGlbImportPlan(input.contentBase64, input.purpose, input.fileName);

  const planPayload = {
    assetSha256,
    byteLength: buffer.length,
    displayName: input.displayName,
    fileName: input.fileName,
    purpose: input.purpose,
    rightsBasis: input.rightsBasis,
    license,
    packageVersion: input.packageVersion,
    assetType: importPlan.assetType,
    targetKey: importPlan.targetKey,
    importPlanSha256: importPlan.planSha256,
    designWorkOrderSha256: input.designWorkOrderSha256 ?? null,
  };

  const planSha256 = createHash("sha256").update(JSON.stringify(planPayload)).digest("hex");

  return Object.freeze({
    planSha256,
    assetSha256,
    byteLength: buffer.length,
    displayName: input.displayName,
    fileName: input.fileName,
    purpose: input.purpose,
    rightsBasis: input.rightsBasis,
    license,
    packageVersion: input.packageVersion,
    assetType: importPlan.assetType,
    targetKey: importPlan.targetKey,
    importPlanSha256: importPlan.planSha256,
    gameDevelopmentStudio: {
      version: GAME_DEVELOPMENT_STUDIO_VERSION,
      sourceRevision: GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
    },
    validationStatus: "valid",
    providerSpend: false,
  });
}

export async function applyGameDevelopmentStudioLiveAsset(
  actorUserId: number,
  asset: GameDevelopmentStudioLiveAssetInput,
  expectedPlanSha256: string
): Promise<GameDevelopmentStudioApplyResult> {
  const plan = await planGameDevelopmentStudioLiveAsset(asset);
  if (plan.planSha256 !== expectedPlanSha256) {
    throw new Error("GDS_PLAN_SHA_MISMATCH");
  }

  const store = glbImportStore();
  const receipt = await store.ingest(actorUserId, {
    displayName: asset.displayName,
    contentBase64: asset.contentBase64,
    purpose: asset.purpose,
    fileName: asset.fileName,
    expectedPlanSha256: plan.importPlanSha256,
  });

  const catalog = await store.catalog();

  return Object.freeze({
    status: "admitted_to_live_aurion",
    planSha256: plan.planSha256,
    assetId: receipt.assetId,
    sha256: receipt.sha256,
    catalogRevision: catalog.revision,
    storageUrl: receipt.storageUrl,
    receiptStatus: receipt.status,
  });
}
