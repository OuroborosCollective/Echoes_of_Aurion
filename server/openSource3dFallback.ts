import { createHash } from "node:crypto";
import { z } from "zod";
import catalogJson from "../shared/os3aFallbackCatalog.json";
import { assetBudgets, inspectGlbAllocation, type AssetTier } from "../shared/glbPresentationBudget";
import {
  GLB_EXTERNAL_PROVENANCE_VERSION,
  type GlbExternalProvenanceInput,
} from "../shared/glbExternalProvenanceContract";
import {
  applyGameDevelopmentStudioLiveAsset,
  planGameDevelopmentStudioLiveAsset,
  type GameDevelopmentStudioLiveAssetInput,
  type GameDevelopmentStudioLivePlan,
} from "./gameDevelopmentStudioProduction";
import { glbImportStore } from "./glbImportStore";

export const OS3A_FALLBACK_CONFIRMATION = "ADMIT_OS3A_FALLBACK" as const;
const PLAN_PURPOSES = ["npc-fallback", "world-environment", "world-nature", "player-public", "equipment"] as const;
const TIERS = ["phone", "tablet", "desktop"] as const;
const SOURCE_PATH = /^projects\/[A-Za-z0-9._/-]+\.glb$/;
const SHA256 = /^[a-f0-9]{64}$/;

type CatalogAsset = Readonly<{
  id: string;
  projectId: string;
  name: string;
  fileSize: number;
  sourcePath: string;
  attributes: Readonly<Record<string, string>>;
  discoveryOnly: boolean;
  discoveryNote: string | null;
}>;
type Catalog = Readonly<{
  schemaVersion: "aurion.os3a-fallback-catalog.v1";
  registryRepository: "ToxSam/open-source-3D-assets";
  registryRevision: string;
  modelRepository: "ToxSam/cc0-models-Polygonal-Mind";
  modelRevision: string;
  license: "CC0-1.0";
  licensePath: "License.md";
  sourceAssetCount: number;
  projectIds: readonly string[];
  assets: readonly CatalogAsset[];
}>;

const sourceCatalog = catalogJson as unknown as Catalog;
if (
  sourceCatalog.schemaVersion !== "aurion.os3a-fallback-catalog.v1" ||
  sourceCatalog.registryRepository !== "ToxSam/open-source-3D-assets" ||
  !/^[a-f0-9]{40}$/.test(sourceCatalog.registryRevision) ||
  sourceCatalog.modelRepository !== "ToxSam/cc0-models-Polygonal-Mind" ||
  !/^[a-f0-9]{40}$/.test(sourceCatalog.modelRevision) ||
  sourceCatalog.license !== "CC0-1.0" ||
  sourceCatalog.licensePath !== "License.md" ||
  sourceCatalog.sourceAssetCount !== sourceCatalog.assets.length ||
  sourceCatalog.assets.some(candidate =>
    !/^[a-z0-9][a-z0-9-]{2,95}$/.test(candidate.id) ||
    !/^pm-[a-z0-9-]{2,80}$/.test(candidate.projectId) ||
    typeof candidate.name !== "string" ||
    candidate.name.length < 1 ||
    !SOURCE_PATH.test(candidate.sourcePath) ||
    candidate.sourcePath.includes("..") ||
    !Number.isSafeInteger(candidate.fileSize) ||
    candidate.fileSize < 1 ||
    candidate.fileSize > 24 * 1024 * 1024 ||
    !candidate.attributes ||
    typeof candidate.attributes !== "object" ||
    Object.entries(candidate.attributes).some(([key, value]) => !key || typeof value !== "string") ||
    typeof candidate.discoveryOnly !== "boolean" ||
    (candidate.discoveryNote !== null && typeof candidate.discoveryNote !== "string")
  )
) throw new Error("OS3A_PINNED_CATALOG_INVALID");

export const os3aSearchInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
  tier: z.enum(TIERS).default("phone"),
  limit: z.number().int().min(1).max(24).default(12),
}).strict();

export const os3aPlanInputSchema = z.object({
  sourceAssetId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,95}$/),
  purpose: z.enum(PLAN_PURPOSES),
  tier: z.enum(TIERS).default("phone"),
}).strict();

export const os3aApplyInputSchema = os3aPlanInputSchema.extend({
  expectedPlanSha256: z.string().regex(SHA256),
  confirmation: z.literal(OS3A_FALLBACK_CONFIRMATION),
}).strict();

export type Os3aSearchInput = z.infer<typeof os3aSearchInputSchema>;
export type Os3aPlanInput = z.infer<typeof os3aPlanInputSchema>;
export type Os3aApplyInput = z.infer<typeof os3aApplyInputSchema>;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type GameDevPlanner = (input: GameDevelopmentStudioLiveAssetInput) => Promise<GameDevelopmentStudioLivePlan>;

export type Os3aFallbackDependencies = Readonly<{
  fetcher?: Fetcher;
  gameDevPlanner?: GameDevPlanner;
}>;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonical(nested)]),
  );
}

function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function normalizedTokens(value: string): readonly string[] {
  return Object.freeze(Array.from(new Set(value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(token => token.length >= 2))));
}

function scoreCandidate(candidate: CatalogAsset, query: string): number {
  const tokens = normalizedTokens(query);
  const name = candidate.name.toLowerCase();
  const fields = Object.fromEntries(Object.entries(candidate.attributes).map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]));
  let score = name.includes(query.toLowerCase().trim()) ? 16 : 0;
  const weighted = [
    [name, 7],
    [fields.type ?? "", 6],
    [fields.category ?? "", 5],
    [fields.theme ?? "", 4],
    [fields.function ?? "", 4],
    [fields.setting ?? "", 3],
    [fields.style ?? "", 2],
    [Object.values(fields).join(" "), 1],
  ] as const;
  for (const token of tokens) for (const [field, weight] of weighted) if (field.includes(token)) score += weight;
  return score;
}

function candidateById(sourceAssetId: string): CatalogAsset {
  const matches = sourceCatalog.assets.filter(asset => asset.id === sourceAssetId);
  if (matches.length !== 1) throw new Error(matches.length ? "OS3A_SOURCE_IDENTITY_AMBIGUOUS" : "OS3A_SOURCE_ASSET_NOT_FOUND");
  const candidate = matches[0]!;
  if (
    !sourceCatalog.projectIds.includes(candidate.projectId) ||
    !SOURCE_PATH.test(candidate.sourcePath) ||
    candidate.sourcePath.includes("..") ||
    !Number.isSafeInteger(candidate.fileSize) ||
    candidate.fileSize < 1 ||
    candidate.fileSize > 24 * 1024 * 1024
  ) throw new Error("OS3A_SOURCE_METADATA_INVALID");
  return candidate;
}

function pinnedModelUrl(candidate: CatalogAsset): string {
  const encoded = candidate.sourcePath.split("/").map(segment => encodeURIComponent(segment)).join("/");
  return `https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/${sourceCatalog.modelRevision}/${encoded}`;
}

function displayName(candidate: CatalogAsset): string {
  return `OS3A · ${candidate.name}`.slice(0, 120);
}

function safeSourceFileName(candidate: CatalogAsset): string {
  const raw = candidate.sourcePath.split("/").at(-1) ?? `${candidate.id}.glb`;
  const sanitized = raw.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^[^A-Za-z0-9]+/, "").slice(0, 116);
  return /^[A-Za-z0-9][A-Za-z0-9._ -]*\.glb$/i.test(sanitized) ? sanitized : `${candidate.id}.glb`;
}

function assetInput(candidate: CatalogAsset, purpose: Os3aPlanInput["purpose"], contentBase64: string): GameDevelopmentStudioLiveAssetInput {
  return {
    displayName: displayName(candidate),
    fileName: safeSourceFileName(candidate),
    contentBase64,
    purpose,
    packageVersion: "1.0.0",
    rightsBasis: "licensed",
    license: sourceCatalog.license,
  };
}

function arrayBuffer(bytes: Buffer): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export function openSource3dFallbackSource() {
  const discoveryOnly = sourceCatalog.assets.filter(asset => asset.discoveryOnly).length;
  return Object.freeze({
    schemaVersion: sourceCatalog.schemaVersion,
    registryRepository: sourceCatalog.registryRepository,
    registryRevision: sourceCatalog.registryRevision,
    modelRepository: sourceCatalog.modelRepository,
    modelRevision: sourceCatalog.modelRevision,
    license: sourceCatalog.license,
    licensePath: sourceCatalog.licensePath,
    sourceAssetCount: sourceCatalog.sourceAssetCount,
    admissionCandidateCount: sourceCatalog.sourceAssetCount - discoveryOnly,
    discoveryOnlyCount: discoveryOnly,
    collections: Object.freeze([...sourceCatalog.projectIds]),
    runtimeDependency: false as const,
    gameplayAuthority: "none" as const,
    worldPlacementAuthority: "none" as const,
    admissionBoundary: "search -> pinned-byte-plan -> human-confirmed-gds-vendor -> aurion-local-catalog" as const,
  });
}

export function searchOpenSource3dFallback(rawInput: Os3aSearchInput) {
  const input = os3aSearchInputSchema.parse(rawInput);
  const limit = assetBudgets[input.tier].assetBytes;
  const matches = sourceCatalog.assets
    .map(candidate => ({
      candidate,
      score: scoreCandidate(candidate, input.query),
      transferBudgetFit: candidate.fileSize <= limit,
    }))
    .filter(entry => entry.score > 0)
    .sort((left, right) =>
      Number(right.transferBudgetFit) - Number(left.transferBudgetFit) ||
      right.score - left.score ||
      left.candidate.fileSize - right.candidate.fileSize ||
      left.candidate.id.localeCompare(right.candidate.id))
    .slice(0, input.limit)
    .map(({ candidate, score, transferBudgetFit }) => Object.freeze({
      sourceAssetId: candidate.id,
      projectId: candidate.projectId,
      name: candidate.name,
      fileSize: candidate.fileSize,
      attributes: candidate.attributes,
      semanticScore: score,
      tier: input.tier,
      transferBudgetBytes: limit,
      transferBudgetFit,
      discoveryOnly: candidate.discoveryOnly,
      discoveryNote: candidate.discoveryNote,
      classificationStatus: "requires-pinned-byte-plan" as const,
    }));
  return Object.freeze({
    schemaVersion: "aurion.os3a-fallback-search.v1" as const,
    query: input.query,
    tier: input.tier,
    source: openSource3dFallbackSource(),
    matches: Object.freeze(matches),
  });
}

export async function downloadOpenSource3dCandidate(sourceAssetId: string, tier: AssetTier, fetcher: Fetcher = fetch): Promise<Readonly<{ candidate: CatalogAsset; bytes: Buffer; sha256: string; url: string }>> {
  const candidate = candidateById(sourceAssetId);
  if (candidate.discoveryOnly) throw new Error(candidate.discoveryNote ?? "OS3A_DISCOVERY_ONLY");
  const limits = assetBudgets[tier];
  if (candidate.fileSize > limits.assetBytes) throw new Error("OS3A_TRANSFER_BUDGET_EXCEEDED");
  const url = pinnedModelUrl(candidate);
  const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(20_000), headers: { accept: "model/gltf-binary,application/octet-stream" } });
  if (!response.ok || !response.body) throw new Error("OS3A_SOURCE_FETCH_FAILED");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > candidate.fileSize || length > limits.assetBytes) throw new Error("OS3A_SOURCE_SIZE_DRIFT");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length !== candidate.fileSize) throw new Error("OS3A_SOURCE_SIZE_DRIFT");
  const bytes = Buffer.allocUnsafe(length);
  let offset = 0;
  for (const chunk of chunks) { Buffer.from(chunk).copy(bytes, offset); offset += chunk.byteLength; }
  return Object.freeze({ candidate, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), url });
}

function budgetEvidence(bytes: Buffer, tier: AssetTier) {
  const limits = assetBudgets[tier];
  const inspected = inspectGlbAllocation(arrayBuffer(bytes));
  const conservativeWorkingSetBytes = inspected.allocation.decodedBytes + 2 * bytes.length;
  if (inspected.allocation.decodedBytes > limits.decodedBytes) throw new Error("OS3A_DECODED_BUDGET_EXCEEDED");
  if (inspected.allocation.textureBytes > limits.textureBytes) throw new Error("OS3A_TEXTURE_BUDGET_EXCEEDED");
  if (conservativeWorkingSetBytes > limits.assetWorkingSetBytes) throw new Error("OS3A_WORKING_SET_BUDGET_EXCEEDED");
  return Object.freeze({
    tier,
    limits,
    allocation: inspected.allocation,
    conservativeWorkingSetBytes,
    skinCount: Array.isArray(inspected.json?.skins) ? inspected.json.skins.length : 0,
  });
}

async function resolveOpenSource3dFallbackPlan(rawInput: Os3aPlanInput, deps: Os3aFallbackDependencies = {}) {
  const input = os3aPlanInputSchema.parse(rawInput);
  const downloaded = await downloadOpenSource3dCandidate(input.sourceAssetId, input.tier, deps.fetcher ?? fetch);
  const budget = budgetEvidence(downloaded.bytes, input.tier);
  const metadataIdentity = Object.freeze({
    catalogSchemaVersion: sourceCatalog.schemaVersion,
    registryRepository: sourceCatalog.registryRepository,
    registryRevision: sourceCatalog.registryRevision,
    modelRepository: sourceCatalog.modelRepository,
    modelRevision: sourceCatalog.modelRevision,
    license: sourceCatalog.license,
    licensePath: sourceCatalog.licensePath,
    candidate: downloaded.candidate,
  });
  const sourceMetadataSha256 = canonicalSha256(metadataIdentity);
  const liveAsset = assetInput(downloaded.candidate, input.purpose, downloaded.bytes.toString("base64"));
  const gameDevPlan = await (deps.gameDevPlanner ?? planGameDevelopmentStudioLiveAsset)(liveAsset);
  if (gameDevPlan.sourceSha256 !== downloaded.sha256) throw new Error("OS3A_GDS_SOURCE_IDENTITY_MISMATCH");
  if (!gameDevPlan.validationPassed) throw new Error("OS3A_GDS_VALIDATION_BLOCKED");
  const identity = Object.freeze({
    schemaVersion: "aurion.os3a-fallback-plan.v1" as const,
    sourceAssetId: downloaded.candidate.id,
    projectId: downloaded.candidate.projectId,
    sourcePath: downloaded.candidate.sourcePath,
    registryRevision: sourceCatalog.registryRevision,
    modelRevision: sourceCatalog.modelRevision,
    license: sourceCatalog.license,
    sourceMetadataSha256,
    sourceSha256: downloaded.sha256,
    sourceBytes: downloaded.bytes.length,
    purpose: input.purpose,
    tier: input.tier,
    budget,
    gameDevPlanSha256: gameDevPlan.planSha256,
    aurionImportPlanSha256: gameDevPlan.aurionPlanSha256,
    gameDevInspectSha256: gameDevPlan.inspectResultSha256,
    gameDevValidateSha256: gameDevPlan.validateResultSha256,
    validationPassed: true as const,
    requiresHumanConfirmation: true as const,
    gameplayAuthority: "none" as const,
    worldPlacementAuthority: "none" as const,
  });
  const planSha256 = canonicalSha256(identity);
  return Object.freeze({
    publicPlan: Object.freeze({
      ...identity,
      planSha256,
      displayName: liveAsset.displayName,
      pinnedModelUrl: downloaded.url,
      confirmation: OS3A_FALLBACK_CONFIRMATION,
    }),
    liveAsset,
    gameDevPlan,
    downloaded,
    sourceMetadataSha256,
  });
}

export async function planOpenSource3dFallback(input: Os3aPlanInput, deps: Os3aFallbackDependencies = {}) {
  return (await resolveOpenSource3dFallbackPlan(input, deps)).publicPlan;
}

export async function applyOpenSource3dFallback(actorUserId: number, rawInput: Os3aApplyInput) {
  if (!Number.isSafeInteger(actorUserId) || actorUserId < 1) throw new Error("OS3A_ACTOR_INVALID");
  const input = os3aApplyInputSchema.parse(rawInput);
  const resolved = await resolveOpenSource3dFallbackPlan(input);
  if (resolved.publicPlan.planSha256 !== input.expectedPlanSha256) throw new Error("OS3A_FALLBACK_PLAN_CHANGED");

  const provenance: GlbExternalProvenanceInput = {
    version: GLB_EXTERNAL_PROVENANCE_VERSION,
    sourceKind: "os3a-cc0",
    registryRepository: sourceCatalog.registryRepository,
    registryRevision: sourceCatalog.registryRevision,
    modelRepository: sourceCatalog.modelRepository,
    modelRevision: sourceCatalog.modelRevision,
    licensePath: sourceCatalog.licensePath,
    projectId: resolved.downloaded.candidate.projectId,
    sourceAssetId: resolved.downloaded.candidate.id,
    sourcePath: resolved.downloaded.candidate.sourcePath,
    license: sourceCatalog.license,
    sourceSha256: resolved.downloaded.sha256,
    sourceBytes: resolved.downloaded.bytes.length,
    sourceMetadataSha256: resolved.sourceMetadataSha256,
    fallbackPlanSha256: resolved.publicPlan.planSha256,
  };

  const admission = await applyGameDevelopmentStudioLiveAsset(
    actorUserId,
    resolved.liveAsset,
    resolved.gameDevPlan.planSha256,
    provenance,
  );
  if (admission.sourceSha256 !== provenance.sourceSha256) throw new Error("OS3A_ADMISSION_SOURCE_MISMATCH");
  const provenanceReadback = await glbImportStore().externalProvenance(admission.aurionAssetId);
  if (!provenanceReadback || provenanceReadback.fallbackPlanSha256 !== resolved.publicPlan.planSha256 || provenanceReadback.sourceSha256 !== admission.sourceSha256) {
    throw new Error("OS3A_PROVENANCE_READBACK_FAILED");
  }

  return Object.freeze({
    schemaVersion: "aurion.os3a-fallback-admission.v1" as const,
    fallbackPlanSha256: resolved.publicPlan.planSha256,
    source: Object.freeze({
      sourceAssetId: provenance.sourceAssetId,
      projectId: provenance.projectId,
      sourcePath: provenance.sourcePath,
      registryRevision: provenance.registryRevision,
      modelRevision: provenance.modelRevision,
      license: provenance.license,
      sourceSha256: provenance.sourceSha256,
      sourceBytes: provenance.sourceBytes,
    }),
    admission,
    provenance: provenanceReadback,
    humanConfirmed: true as const,
    gameplayAuthority: "none" as const,
    worldPlacementAuthority: "none" as const,
  });
}
