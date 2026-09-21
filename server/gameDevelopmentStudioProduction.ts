import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { MAX_GLB_BASE64_CHARS, decodeValidatedGlbBase64 } from "./adminProtocol";
import { buildGlbImportPlan } from "./glbImportPlan";
import { glbImportStore } from "./glbImportStore";
import type { GlbExternalProvenanceInput } from "../shared/glbExternalProvenanceContract";
import {
  GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
  GAME_DEVELOPMENT_STUDIO_VERSION,
  buildGameDevAssetArgs,
  gameDevelopmentStudioWorkspaceRoot,
  runGameDevelopmentStudioCommand,
} from "./gameDevelopmentStudioRuntime";

const LIVE_GAME_DEV_PURPOSES = [
  "npc-fallback",
  "enemy-fallback",
  "world-environment",
  "world-nature",
  "player-public",
  "equipment",
] as const;

const PACKAGE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const LICENSE = /^[0-9A-Za-z][0-9A-Za-z ._()+:/-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const PACKAGE_ID = /^pkg_[a-f0-9]{24}$/;

export const gameDevelopmentStudioLiveAssetInputSchema = z.object({
  displayName: z.string().trim().min(3).max(120).refine(value => !/[<>]/.test(value), "unsafe display name"),
  fileName: z.string().trim().min(5).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._ -]*\.glb$/i),
  contentBase64: z.string().min(16).max(MAX_GLB_BASE64_CHARS),
  purpose: z.enum(LIVE_GAME_DEV_PURPOSES),
  packageVersion: z.string().trim().regex(PACKAGE_VERSION).default("1.0.0"),
  rightsBasis: z.enum(["owner-created-private", "licensed"]).default("licensed"),
  license: z.string().trim().regex(LICENSE).refine(value => value.toLowerCase() !== "unknown", "explicit license required").optional(),
  designWorkOrderSha256: z.string().regex(SHA256).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.rightsBasis === "licensed" && !value.license) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "licensed assets require a license identifier", path: ["license"] });
  }
});

export type GameDevelopmentStudioLiveAssetInput = z.infer<typeof gameDevelopmentStudioLiveAssetInputSchema>;

export function gameDevelopmentStudioRightsLabel(input: Pick<GameDevelopmentStudioLiveAssetInput, "rightsBasis" | "license">): string {
  if (input.rightsBasis === "owner-created-private") return "Proprietary-Owner-Created";
  if (!input.license) throw new Error("GAME_DEV_LICENSE_REQUIRED");
  return input.license;
}

type JsonObject = Record<string, unknown>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]),
  );
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalSha256(value: unknown): string {
  return sha256(JSON.stringify(canonical(value)));
}

function normalizeRunEvidence(value: unknown, runDir: string): unknown {
  if (Array.isArray(value)) return value.map(entry => normalizeRunEvidence(entry, runDir));
  if (!value || typeof value !== "object") {
    if (typeof value !== "string" || !path.isAbsolute(value)) return value;
    const relative = path.relative(runDir, value);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return value;
    return `run://${relative.split(path.sep).join("/")}`;
  }
  return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, nested]) => [key, normalizeRunEvidence(nested, runDir)]),
  );
}

function object(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}

function parseCommandData(label: string, raw: string): JsonObject {
  let envelope: JsonObject;
  try {
    envelope = object(JSON.parse(raw), `GAME_DEV_${label}_INVALID_JSON`);
  } catch {
    throw new Error(`GAME_DEV_${label}_INVALID_JSON`);
  }
  if (envelope.ok !== true) throw new Error(`GAME_DEV_${label}_FAILED`);
  return object(envelope.data, `GAME_DEV_${label}_DATA_MISSING`);
}

function confined(root: string, candidate: string, code: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(code);
  return resolved;
}

async function ensureExactFile(target: string, bytes: Buffer): Promise<void> {
  try {
    const existing = await readFile(target);
    if (!existing.equals(bytes)) throw new Error("GAME_DEV_DURABLE_SOURCE_CONFLICT");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  }
}

export function buildGameDevPackageBuildArgs(
  sourcePath: string,
  outputDir: string,
  input: Pick<GameDevelopmentStudioLiveAssetInput, "displayName" | "packageVersion" | "rightsBasis" | "license">,
): readonly string[] {
  if (!path.isAbsolute(sourcePath) || !path.isAbsolute(outputDir)) throw new Error("GAME_DEV_ABSOLUTE_PATH_REQUIRED");
  return Object.freeze([
    "package", "build", sourcePath,
    "--name", input.displayName,
    "--version", input.packageVersion,
    "--license", gameDevelopmentStudioRightsLabel(input),
    "--output-dir", outputDir,
    "--json",
  ]);
}

export function buildGameDevPackageVerifyArgs(packagePath: string, outputDir: string): readonly string[] {
  if (!path.isAbsolute(packagePath) || !path.isAbsolute(outputDir)) throw new Error("GAME_DEV_ABSOLUTE_PATH_REQUIRED");
  return Object.freeze(["package", "verify", packagePath, "--output-dir", outputDir, "--json"]);
}

export function buildGameDevVendorAdmitArgs(
  packagePath: string,
  projectRoot: string,
  outputDir: string,
  confirm: boolean,
): readonly string[] {
  if (![packagePath, projectRoot, outputDir].every(path.isAbsolute)) throw new Error("GAME_DEV_ABSOLUTE_PATH_REQUIRED");
  return Object.freeze([
    "vendor", "admit", packagePath,
    "--project", projectRoot,
    "--output-dir", outputDir,
    ...(confirm ? ["--confirm"] : []),
    "--json",
  ]);
}

export type GameDevelopmentStudioLivePlan = Readonly<{
  schemaVersion: "aurion.game-dev-live-plan.v1";
  planSha256: string;
  sourceSha256: string;
  aurionPlanSha256: string;
  displayName: string;
  fileName: string;
  purpose: (typeof LIVE_GAME_DEV_PURPOSES)[number];
  packageVersion: string;
  rightsBasis: "owner-created-private" | "licensed";
  license: string;
  designWorkOrderSha256: string | null;
  inspectResultSha256: string;
  validateResultSha256: string;
  validationPassed: boolean;
  requiresHumanConfirmation: true;
  providerCalls: false;
  gameDevelopmentStudio: Readonly<{
    version: typeof GAME_DEVELOPMENT_STUDIO_VERSION;
    sourceRevision: typeof GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION;
  }>;
}>;

type GameDevRunner = (args: readonly string[], timeout?: number) => Promise<string>;

export async function planGameDevelopmentStudioLiveAsset(
  rawInput: GameDevelopmentStudioLiveAssetInput,
  runner: GameDevRunner = runGameDevelopmentStudioCommand,
): Promise<GameDevelopmentStudioLivePlan> {
  const input = gameDevelopmentStudioLiveAssetInputSchema.parse(rawInput);
  const decoded = decodeValidatedGlbBase64(input.contentBase64);
  const aurionPlan = buildGlbImportPlan(input.contentBase64, input.purpose, input.fileName);
  if (aurionPlan.sha256 !== decoded.sha256) throw new Error("GAME_DEV_AURION_PLAN_SOURCE_MISMATCH");

  const workspace = gameDevelopmentStudioWorkspaceRoot();
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  const runDir = await mkdtemp(path.join(workspace, "plan-"));
  const sourcePath = path.join(runDir, "candidate.glb");
  const outputDir = path.join(runDir, "evidence");
  try {
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    await writeFile(sourcePath, decoded.bytes, { flag: "wx", mode: 0o600 });
    const inspect = parseCommandData("INSPECT", await runner(buildGameDevAssetArgs("inspect", sourcePath, outputDir), 30_000));
    const validate = parseCommandData("VALIDATE", await runner(buildGameDevAssetArgs("validate", sourcePath, outputDir), 30_000));
    const validationPassed = validate.schema === "org.gamedebug.asset_validation.v1" && validate.passed === true;

    const identity = {
      schemaVersion: "aurion.game-dev-live-plan.v1" as const,
      sourceSha256: decoded.sha256,
      aurionPlanSha256: aurionPlan.planSha256,
      displayName: input.displayName,
      fileName: input.fileName,
      purpose: input.purpose,
      packageVersion: input.packageVersion,
      rightsBasis: input.rightsBasis,
      license: gameDevelopmentStudioRightsLabel(input),
      designWorkOrderSha256: input.designWorkOrderSha256 ?? null,
      inspectResultSha256: canonicalSha256(normalizeRunEvidence(inspect, runDir)),
      validateResultSha256: canonicalSha256(normalizeRunEvidence(validate, runDir)),
      validationPassed,
      requiresHumanConfirmation: true as const,
      providerCalls: false as const,
      gameDevelopmentStudio: {
        version: GAME_DEVELOPMENT_STUDIO_VERSION,
        sourceRevision: GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
      },
    };
    return Object.freeze({ ...identity, planSha256: canonicalSha256(identity) });
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

export type GameDevelopmentStudioLiveAdmissionReceipt = Readonly<{
  schemaVersion: "aurion.game-dev-live-admission.v1";
  planSha256: string;
  sourceSha256: string;
  packageId: string;
  packageManifestSha256: string;
  packageVerificationSha256: string;
  vendorReceiptSha256: string;
  aurionAssetId: string;
  aurionStorageSha256: string;
  aurionCatalogRevision: string;
  aurionImportPlanSha256: string;
  humanConfirmed: true;
  providerCalls: false;
  gameDevelopmentStudio: Readonly<{
    version: typeof GAME_DEVELOPMENT_STUDIO_VERSION;
    sourceRevision: typeof GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION;
  }>;
}>;

export async function applyGameDevelopmentStudioLiveAsset(
  actorUserId: number,
  rawInput: GameDevelopmentStudioLiveAssetInput,
  expectedPlanSha256: string,
  externalProvenance?: GlbExternalProvenanceInput,
): Promise<GameDevelopmentStudioLiveAdmissionReceipt> {
  if (!Number.isSafeInteger(actorUserId) || actorUserId < 1) throw new Error("GAME_DEV_ACTOR_INVALID");
  if (!SHA256.test(expectedPlanSha256)) throw new Error("GAME_DEV_EXPECTED_PLAN_INVALID");

  const input = gameDevelopmentStudioLiveAssetInputSchema.parse(rawInput);
  const plan = await planGameDevelopmentStudioLiveAsset(input);
  if (plan.planSha256 !== expectedPlanSha256) throw new Error("GAME_DEV_LIVE_PLAN_CHANGED");
  if (!plan.validationPassed) throw new Error("GAME_DEV_VALIDATION_REQUIRED");

  const source = decodeValidatedGlbBase64(input.contentBase64);
  if (source.sha256 !== plan.sourceSha256) throw new Error("GAME_DEV_LIVE_SOURCE_CHANGED");

  const workspace = gameDevelopmentStudioWorkspaceRoot();
  const productionRoot = path.join(workspace, "production", plan.planSha256);
  const sourcePath = path.join(productionRoot, "candidate.glb");
  const projectRoot = path.join(workspace, "live-project");
  await mkdir(productionRoot, { recursive: true, mode: 0o700 });
  await mkdir(projectRoot, { recursive: true, mode: 0o700 });
  await ensureExactFile(sourcePath, source.bytes);

  const built = parseCommandData(
    "PACKAGE_BUILD",
    await runGameDevelopmentStudioCommand(buildGameDevPackageBuildArgs(sourcePath, productionRoot, input), 45_000),
  );
  const packageId = typeof built.packageId === "string" && PACKAGE_ID.test(built.packageId) ? built.packageId : null;
  const packagePathRaw = typeof built.packagePath === "string" ? built.packagePath : null;
  const manifestSha256 = typeof built.manifestSha256 === "string" && SHA256.test(built.manifestSha256) ? built.manifestSha256 : null;
  if (!packageId || !packagePathRaw || !manifestSha256) throw new Error("GAME_DEV_PACKAGE_BUILD_IDENTITY_INVALID");
  const packagePath = confined(productionRoot, packagePathRaw, "GAME_DEV_PACKAGE_PATH_ESCAPE");

  const verification = parseCommandData(
    "PACKAGE_VERIFY",
    await runGameDevelopmentStudioCommand(buildGameDevPackageVerifyArgs(packagePath, productionRoot), 30_000),
  );
  if (
    verification.schema !== "game_dev.package_verification.v1" ||
    verification.hashesVerified !== true ||
    object(verification.manifest, "GAME_DEV_PACKAGE_MANIFEST_MISSING").packageId !== packageId
  ) {
    throw new Error("GAME_DEV_PACKAGE_VERIFICATION_FAILED");
  }

  const dryRun = parseCommandData(
    "VENDOR_PLAN",
    await runGameDevelopmentStudioCommand(buildGameDevVendorAdmitArgs(packagePath, projectRoot, productionRoot, false), 30_000),
  );
  if (dryRun.dryRun !== true || !Array.isArray(dryRun.blockers) || dryRun.blockers.length !== 0) {
    throw new Error("GAME_DEV_VENDOR_PLAN_BLOCKED");
  }

  const admitted = parseCommandData(
    "VENDOR_ADMIT",
    await runGameDevelopmentStudioCommand(buildGameDevVendorAdmitArgs(packagePath, projectRoot, productionRoot, true), 45_000),
  );
  if (admitted.dryRun !== false || !Array.isArray(admitted.blockers) || admitted.blockers.length !== 0) {
    throw new Error("GAME_DEV_VENDOR_ADMISSION_FAILED");
  }
  const destinationRaw = typeof admitted.destination === "string" ? admitted.destination : null;
  const receiptPathRaw = typeof admitted.receiptPath === "string" ? admitted.receiptPath : null;
  if (!destinationRaw || !receiptPathRaw) throw new Error("GAME_DEV_VENDOR_RECEIPT_MISSING");
  const destination = confined(projectRoot, destinationRaw, "GAME_DEV_VENDOR_DESTINATION_ESCAPE");
  const receiptPath = confined(projectRoot, receiptPathRaw, "GAME_DEV_VENDOR_RECEIPT_ESCAPE");

  const vendoredBytes = await readFile(path.join(destination, "model.glb"));
  if (sha256(vendoredBytes) !== plan.sourceSha256) throw new Error("GAME_DEV_VENDORED_MODEL_DRIFT");
  const vendorReceiptBytes = await readFile(receiptPath);

  const aurionReceipt = await glbImportStore().ingest(actorUserId, {
    displayName: input.displayName,
    contentBase64: vendoredBytes.toString("base64"),
    purpose: input.purpose,
    fileName: input.fileName,
    expectedPlanSha256: plan.aurionPlanSha256,
    ...(externalProvenance ? { externalProvenance } : {}),
  });
  if (aurionReceipt.sha256 !== plan.sourceSha256 || aurionReceipt.planSha256 !== plan.aurionPlanSha256) {
    throw new Error("GAME_DEV_AURION_INGEST_IDENTITY_MISMATCH");
  }

  const catalog = await glbImportStore().catalog();
  const liveEntry = catalog.entries.find(entry => entry.assetId === aurionReceipt.assetId);
  if (!liveEntry || liveEntry.sha256 !== aurionReceipt.sha256 || liveEntry.purpose !== input.purpose) {
    throw new Error("GAME_DEV_LIVE_CATALOG_READBACK_FAILED");
  }

  return Object.freeze({
    schemaVersion: "aurion.game-dev-live-admission.v1",
    planSha256: plan.planSha256,
    sourceSha256: plan.sourceSha256,
    packageId,
    packageManifestSha256: manifestSha256,
    packageVerificationSha256: canonicalSha256(verification),
    vendorReceiptSha256: sha256(vendorReceiptBytes),
    aurionAssetId: aurionReceipt.assetId,
    aurionStorageSha256: aurionReceipt.sha256,
    aurionCatalogRevision: catalog.revision,
    aurionImportPlanSha256: aurionReceipt.planSha256,
    humanConfirmed: true,
    providerCalls: false,
    gameDevelopmentStudio: {
      version: GAME_DEVELOPMENT_STUDIO_VERSION,
      sourceRevision: GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION,
    },
  });
}
