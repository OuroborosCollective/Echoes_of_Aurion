import { createHash } from "node:crypto";
import { z } from "zod";
import {
  glbEquipmentSlots,
  type GlbEquipmentSlot,
  type GlbImportPurpose,
  type GlbRuntimeCatalog,
} from "../shared/glbImportContract";
import { glbImportStore } from "./glbImportStore";
import {
  OS3A_FALLBACK_CONFIRMATION,
  applyOpenSource3dFallback,
  planOpenSource3dFallback,
  searchOpenSource3dFallback,
} from "./openSource3dFallback";
import { STARTER_GLB_TARGET_KEYS } from "./starterGlbRuntimeAssets";

export const AUTOMATIC_GLB_FALLBACK_CONFIRMATION = "RECONCILE_MISSING_VISUAL_FALLBACKS" as const;
const MAX_VALIDATION_ATTEMPTS_PER_GAP = 6;

type ClassificationNeed = Readonly<{
  assetType: "character" | "enemy" | "weapon" | "armor" | "arena";
  subcategory?: string;
  equipmentSlot?: GlbEquipmentSlot;
  rejectSubcategory?: string;
}>;

type Requirement = Readonly<{
  id: string;
  label: string;
  query: string;
  purpose: Exclude<GlbImportPurpose, "auto" | "player-public">;
  need: ClassificationNeed;
  assignment?: Readonly<{
    targetType: "enemy" | "arena";
    targetKey: "starter_spider" | "starter_beast_lod0" | "asterion_courtyard";
  }>;
}>;

const requirements: readonly Requirement[] = Object.freeze([
  Object.freeze({
    id: "arena:asterion-courtyard",
    label: "Asterion courtyard active arena",
    query: "medieval courtyard plaza building",
    purpose: "world-environment",
    need: Object.freeze({ assetType: "arena" }),
    assignment: Object.freeze({ targetType: "arena", targetKey: "asterion_courtyard" }),
  }),
  Object.freeze({
    id: "enemy:starter-beast",
    label: "Starter beast fallback",
    query: "dragon lion beast creature",
    purpose: "enemy-fallback",
    need: Object.freeze({ assetType: "enemy", rejectSubcategory: "spider" }),
    assignment: Object.freeze({ targetType: "enemy", targetKey: STARTER_GLB_TARGET_KEYS.beastLods[0] }),
  }),
  Object.freeze({
    id: "enemy:starter-spider",
    label: "Starter spider fallback",
    query: "spider creature monster",
    purpose: "enemy-fallback",
    need: Object.freeze({ assetType: "enemy", subcategory: "spider" }),
    assignment: Object.freeze({ targetType: "enemy", targetKey: STARTER_GLB_TARGET_KEYS.spider }),
  }),
  Object.freeze({
    id: "npc:generic-fallback",
    label: "Generic NPC fallback pool",
    query: "humanoid character avatar",
    purpose: "npc-fallback",
    need: Object.freeze({ assetType: "character" }),
  }),
  Object.freeze({
    id: "world:environment:building",
    label: "World building",
    query: "medieval building house",
    purpose: "world-environment",
    need: Object.freeze({ assetType: "arena", subcategory: "building" }),
  }),
  Object.freeze({
    id: "world:environment:fountain",
    label: "World fountain",
    query: "fountain well",
    purpose: "world-environment",
    need: Object.freeze({ assetType: "arena", subcategory: "fountain" }),
  }),
  Object.freeze({
    id: "world:environment:street-prop",
    label: "World street prop",
    query: "market stall barrel crate street prop",
    purpose: "world-environment",
    need: Object.freeze({ assetType: "arena", subcategory: "street-prop" }),
  }),
  Object.freeze({
    id: "world:nature:plant",
    label: "World plant",
    query: "plant grass flower bush",
    purpose: "world-nature",
    need: Object.freeze({ assetType: "arena", subcategory: "plant" }),
  }),
  Object.freeze({
    id: "world:nature:rock",
    label: "World rock",
    query: "rock stone boulder",
    purpose: "world-nature",
    need: Object.freeze({ assetType: "arena", subcategory: "rock" }),
  }),
  Object.freeze({
    id: "world:nature:tree",
    label: "World tree",
    query: "tree oak forest",
    purpose: "world-nature",
    need: Object.freeze({ assetType: "arena", subcategory: "tree" }),
  }),
  ...glbEquipmentSlots.map(slot => Object.freeze({
    id: `equipment:${slot}`,
    label: `Equipment ${slot}`,
    query: slot === "weapon" ? "weapon sword axe" : slot === "shield" ? "shield buckler" : `${slot} armor`,
    purpose: "equipment" as const,
    need: Object.freeze({
      assetType: slot === "weapon" ? "weapon" as const : "armor" as const,
      equipmentSlot: slot,
    }),
  })),
].sort((left, right) => left.id.localeCompare(right.id)));

export const automaticGlbFallbackReconcileInputSchema = z.object({
  confirmation: z.literal(AUTOMATIC_GLB_FALLBACK_CONFIRMATION),
}).strict();

export type AutomaticGlbFallbackReconcileInput = z.infer<typeof automaticGlbFallbackReconcileInputSchema>;

type SearchResult = ReturnType<typeof searchOpenSource3dFallback>;
type Plan = Awaited<ReturnType<typeof planOpenSource3dFallback>>;
type Admission = Awaited<ReturnType<typeof applyOpenSource3dFallback>>;

type Dependencies = Readonly<{
  catalog?: () => Promise<GlbRuntimeCatalog>;
  search?: typeof searchOpenSource3dFallback;
  plan?: typeof planOpenSource3dFallback;
  apply?: typeof applyOpenSource3dFallback;
  assign?: (actorUserId: number, input: { assetId: string; targetType: "enemy" | "arena"; targetKey: "starter_spider" | "starter_beast_lod0" | "asterion_courtyard"; expectedActiveAssetId: null }) => Promise<unknown>;
}>;

function catalogSatisfies(catalog: GlbRuntimeCatalog, requirement: Requirement): boolean {
  if (requirement.assignment) {
    return catalog.entries.some(entry =>
      entry.targetKey === requirement.assignment!.targetKey
      && entry.assetType === requirement.assignment!.targetType,
    );
  }
  return catalog.entries.some(entry => {
    if (entry.purpose !== requirement.purpose || entry.targetKey !== null || entry.assetType !== requirement.need.assetType) return false;
    if (requirement.need.subcategory && entry.subcategory !== requirement.need.subcategory) return false;
    if (requirement.need.equipmentSlot && entry.equipmentSlot !== requirement.need.equipmentSlot) return false;
    if (requirement.need.rejectSubcategory && entry.subcategory === requirement.need.rejectSubcategory) return false;
    return true;
  });
}

function candidateAllowed(requirement: Requirement, candidate: SearchResult["matches"][number]): boolean {
  if (!candidate.transferBudgetFit) return false;
  if (!candidate.discoveryOnly) return true;
  return requirement.purpose === "enemy-fallback"
    && candidate.discoveryNote === "RIGGED_CREATURE_REQUIRES_DEDICATED_ENEMY_FALLBACK_LANE";
}

function planMatches(requirement: Requirement, plan: Plan): boolean {
  const classification = plan.classification;
  if (classification.assetType !== requirement.need.assetType) return false;
  if (requirement.need.subcategory && classification.subcategory !== requirement.need.subcategory) return false;
  if (requirement.need.equipmentSlot && classification.equipmentSlot !== requirement.need.equipmentSlot) return false;
  if (requirement.need.rejectSubcategory && classification.subcategory === requirement.need.rejectSubcategory) return false;
  return true;
}

function errorCode(error: unknown): string {
  if (!(error instanceof Error)) return "UNKNOWN";
  return error.message.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 160) || "UNKNOWN";
}

function scanRequirement(requirement: Requirement, catalog: GlbRuntimeCatalog, searcher: typeof searchOpenSource3dFallback) {
  const satisfied = catalogSatisfies(catalog, requirement);
  const result = searcher({ query: requirement.query, tier: "phone", limit: 24 });
  const candidates = result.matches.filter(candidate => candidateAllowed(requirement, candidate));
  const first = candidates[0] ?? null;
  const second = candidates[1] ?? null;
  return Object.freeze({
    id: requirement.id,
    label: requirement.label,
    purpose: requirement.purpose,
    query: requirement.query,
    status: satisfied ? "SATISFIED" as const : first ? "DISCOVERED" as const : "BLOCKED_NO_METADATA_CANDIDATE" as const,
    assignmentTarget: requirement.assignment?.targetKey ?? null,
    need: requirement.need,
    selectedCandidate: first ? Object.freeze({
      sourceAssetId: first.sourceAssetId,
      projectId: first.projectId,
      name: first.name,
      fileSize: first.fileSize,
      semanticScore: first.semanticScore,
      scoreMargin: first.semanticScore - (second?.semanticScore ?? 0),
      discoveryOnly: first.discoveryOnly,
    }) : null,
    candidateCount: candidates.length,
  });
}

export async function scanAutomaticGlbFallback(deps: Dependencies = {}) {
  const catalogReader = deps.catalog ?? (() => glbImportStore().catalog());
  const searcher = deps.search ?? searchOpenSource3dFallback;
  const catalog = await catalogReader();
  const gaps = requirements.map(requirement => scanRequirement(requirement, catalog, searcher));
  const missing = gaps.filter(gap => gap.status !== "SATISFIED");
  return Object.freeze({
    schemaVersion: "aurion.automatic-glb-fallback-scan.v1" as const,
    catalogRevision: catalog.revision,
    policy: Object.freeze({
      mode: "BATCH_AUTOMATIC_MISSING_ONLY" as const,
      overwriteExisting: false as const,
      targetTier: "phone" as const,
      gameplayAuthority: "none" as const,
      worldPlacementAuthority: "none" as const,
      confirmation: AUTOMATIC_GLB_FALLBACK_CONFIRMATION,
    }),
    requirementCount: requirements.length,
    satisfiedCount: gaps.length - missing.length,
    missingCount: missing.length,
    gaps: Object.freeze(gaps),
  });
}

export async function reconcileAutomaticGlbFallback(
  actorUserId: number,
  rawInput: AutomaticGlbFallbackReconcileInput,
  deps: Dependencies = {},
) {
  if (!Number.isSafeInteger(actorUserId) || actorUserId < 1) throw new Error("GLB_AUTO_FALLBACK_ACTOR_INVALID");
  automaticGlbFallbackReconcileInputSchema.parse(rawInput);
  const catalogReader = deps.catalog ?? (() => glbImportStore().catalog());
  const searcher = deps.search ?? searchOpenSource3dFallback;
  const planner = deps.plan ?? planOpenSource3dFallback;
  const applier = deps.apply ?? applyOpenSource3dFallback;
  const assigner = deps.assign ?? ((userId, input) => glbImportStore().assignAutomaticFallback(userId, input));

  const initial = await catalogReader();
  const actions: Array<Readonly<Record<string, unknown>>> = [];
  const blocked: Array<Readonly<Record<string, unknown>>> = [];

  for (const requirement of requirements) {
    let catalog = await catalogReader();
    if (catalogSatisfies(catalog, requirement)) continue;

    const ranked = searcher({ query: requirement.query, tier: "phone", limit: 24 }).matches
      .filter(candidate => candidateAllowed(requirement, candidate))
      .slice(0, MAX_VALIDATION_ATTEMPTS_PER_GAP);
    const rejected: Array<Readonly<{ sourceAssetId: string; reason: string }>> = [];
    let completed = false;

    for (let index = 0; index < ranked.length; index += 1) {
      const candidate = ranked[index]!;
      try {
        const plan = await planner({ sourceAssetId: candidate.sourceAssetId, purpose: requirement.purpose, tier: "phone" });
        if (!planMatches(requirement, plan)) {
          rejected.push(Object.freeze({ sourceAssetId: candidate.sourceAssetId, reason: "CLASSIFICATION_MISMATCH" }));
          continue;
        }

        catalog = await catalogReader();
        if (catalogSatisfies(catalog, requirement)) {
          completed = true;
          break;
        }

        const admission: Admission = await applier(actorUserId, {
          sourceAssetId: candidate.sourceAssetId,
          purpose: requirement.purpose,
          tier: "phone",
          expectedPlanSha256: plan.planSha256,
          confirmation: OS3A_FALLBACK_CONFIRMATION,
        });

        if (requirement.assignment) {
          await assigner(actorUserId, {
            assetId: admission.admission.aurionAssetId,
            targetType: requirement.assignment.targetType,
            targetKey: requirement.assignment.targetKey,
            expectedActiveAssetId: null,
          });
        }

        const readback = await catalogReader();
        if (!catalogSatisfies(readback, requirement)) throw new Error("GLB_AUTO_FALLBACK_READBACK_FAILED");
        const next = ranked[index + 1];
        actions.push(Object.freeze({
          requirementId: requirement.id,
          sourceAssetId: candidate.sourceAssetId,
          aurionAssetId: admission.admission.aurionAssetId,
          sourceSha256: admission.source.sourceSha256,
          fallbackPlanSha256: admission.fallbackPlanSha256,
          semanticScore: candidate.semanticScore,
          scoreMargin: candidate.semanticScore - (next?.semanticScore ?? 0),
          selectionRank: index,
          assignmentTarget: requirement.assignment?.targetKey ?? null,
          replacedExisting: false,
          catalogRevision: readback.revision,
        }));
        completed = true;
        break;
      } catch (error) {
        rejected.push(Object.freeze({ sourceAssetId: candidate.sourceAssetId, reason: errorCode(error) }));
      }
    }

    if (!completed) {
      blocked.push(Object.freeze({
        requirementId: requirement.id,
        candidateCount: ranked.length,
        rejected: Object.freeze(rejected),
      }));
    }
  }

  const finalCatalog = await catalogReader();
  const remaining = requirements.filter(requirement => !catalogSatisfies(finalCatalog, requirement)).map(requirement => requirement.id);
  const identity = Object.freeze({
    schemaVersion: "aurion.automatic-glb-fallback-reconcile.v1" as const,
    authority: "BATCH_AUTOMATIC_MISSING_ONLY" as const,
    initialCatalogRevision: initial.revision,
    finalCatalogRevision: finalCatalog.revision,
    actions: Object.freeze(actions),
    blocked: Object.freeze(blocked),
    remaining: Object.freeze(remaining),
    overwrittenExisting: false as const,
    gameplayAuthority: "none" as const,
    worldPlacementAuthority: "none" as const,
  });
  const receiptSha256 = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  return Object.freeze({ ...identity, receiptSha256 });
}
