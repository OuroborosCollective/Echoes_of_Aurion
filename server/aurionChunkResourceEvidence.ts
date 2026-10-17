import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import type { BaseChunkResource, WorldChunkReadModel } from "../shared/worldChunkProtocol";

/** Server-only evidence of still-visible natural resource nodes; NOT material inventory. */
export const AURION_CHUNK_RESOURCE_EVIDENCE_VERSION = "aurion.chunk-resource-evidence.v1" as const;
export const AURION_CHUNK_RAW_RESOURCES = ["wood", "herbs", "ore", "water"] as const;
export type AurionChunkRawResource = (typeof AURION_CHUNK_RAW_RESOURCES)[number];
export type AurionRefinedResource = "iron" | "steel" | "bronze" | "gold" | "crystal" | "fiber" | "resin" | "stone" | "clay" | "bone" | "obsidian";
export type AurionIngredient = AurionChunkRawResource | AurionRefinedResource;

export type ChunkResourceEvidence = Readonly<{
  version: typeof AURION_CHUNK_RESOURCE_EVIDENCE_VERSION;
  worldId: string;
  coordinate: Readonly<{ x: number; z: number }>;
  baseHash: string;
  materializedHash: string;
  verifiedDeltaIds: readonly string[];
  visibleResourceIds: readonly string[];
  naturalSourceNodes: Readonly<Record<AurionChunkRawResource, number>>;
  sourceHash: string;
}>;

const FNV = /^fnv1a-[a-f0-9]{8}$/;
const RAW = new Set<string>(AURION_CHUNK_RAW_RESOURCES);
const REFINED = new Set<string>(["iron", "steel", "bronze", "gold", "crystal", "fiber", "resin", "stone", "clay", "bone", "obsidian"]);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function sameNode(left: BaseChunkResource, right: BaseChunkResource): boolean {
  return left.id === right.id && left.kind === right.kind && left.yieldKey === right.yieldKey
    && left.positionMm.x === right.positionMm.x && left.positionMm.z === right.positionMm.z;
}

function hashEvidence(value: Omit<ChunkResourceEvidence, "sourceHash">): string {
  return canonicalSha256({ domain: AURION_CHUNK_RESOURCE_EVIDENCE_VERSION, evidence: value });
}

export function projectChunkResourceEvidence(readmodel: WorldChunkReadModel): ChunkResourceEvidence {
  const { base } = readmodel;
  if (!base.worldId.trim() || !FNV.test(base.deterministicHash) || !FNV.test(readmodel.deterministicHash)
    || base.resources.length > 8 || !Number.isSafeInteger(base.coordinate.x) || !Number.isSafeInteger(base.coordinate.z)) {
    throw new Error("CHUNK_RESOURCE_SOURCE_INVALID");
  }
  const baseById = new Map<string, BaseChunkResource>();
  for (const node of base.resources) {
    if (!node.id.trim() || baseById.has(node.id) || !RAW.has(node.yieldKey)) throw new Error("CHUNK_RESOURCE_SOURCE_INVALID");
    baseById.set(node.id, node);
  }
  const visible = [...readmodel.visibleResources].sort((a, b) => compare(a.id, b.id));
  const seen = new Set<string>();
  const naturalSourceNodes: Record<AurionChunkRawResource, number> = { wood: 0, herbs: 0, ore: 0, water: 0 };
  for (const node of visible) {
    const canonical = baseById.get(node.id);
    if (seen.has(node.id) || !canonical || !sameNode(canonical, node)) throw new Error("CHUNK_RESOURCE_VISIBLE_MISMATCH");
    seen.add(node.id);
    naturalSourceNodes[node.yieldKey] += 1;
  }
  const verifiedDeltaIds = [...readmodel.appliedDeltaIds].sort(compare);
  if (new Set(verifiedDeltaIds).size !== verifiedDeltaIds.length) throw new Error("CHUNK_RESOURCE_DELTA_DUPLICATE");
  const values = Object.freeze({
    version: AURION_CHUNK_RESOURCE_EVIDENCE_VERSION,
    worldId: base.worldId,
    coordinate: Object.freeze({ ...base.coordinate }),
    baseHash: base.deterministicHash,
    materializedHash: readmodel.deterministicHash,
    verifiedDeltaIds: Object.freeze(verifiedDeltaIds),
    visibleResourceIds: Object.freeze(visible.map(node => node.id)),
    naturalSourceNodes: Object.freeze(naturalSourceNodes),
  });
  return Object.freeze({ ...values, sourceHash: hashEvidence(values) });
}

export type LocalResourceRequirement = Readonly<{ resource: AurionIngredient; minSourceNodes: number }>;

export function assessLocalResourceSources(evidence: ChunkResourceEvidence, requirements: readonly LocalResourceRequirement[]) {
  const { sourceHash: claimed, ...values } = evidence;
  if (hashEvidence(values) !== claimed || Object.keys(evidence.naturalSourceNodes).sort().join(",") !== "herbs,ore,water,wood"
    || Object.values(evidence.naturalSourceNodes).some(value => !Number.isSafeInteger(value) || value < 0 || value > 8)) {
    throw new Error("CHUNK_RESOURCE_EVIDENCE_INVALID");
  }
  if (requirements.length < 1 || requirements.length > 16) throw new Error("CHUNK_RESOURCE_REQUIREMENT_INVALID");
  const ordered = [...requirements].sort((a, b) => compare(a.resource, b.resource));
  const used = new Set<string>();
  const deficits: { resource: AurionIngredient; requiredNodes: number; availableNodes: number }[] = [];
  for (const requirement of ordered) {
    if (!RAW.has(requirement.resource) && !REFINED.has(requirement.resource)) throw new Error("CHUNK_RESOURCE_REQUIREMENT_INVALID");
    if (!Number.isSafeInteger(requirement.minSourceNodes) || requirement.minSourceNodes < 1 || requirement.minSourceNodes > 8) {
      throw new Error("CHUNK_RESOURCE_REQUIREMENT_INVALID");
    }
    if (used.has(requirement.resource)) throw new Error("CHUNK_RESOURCE_REQUIREMENT_DUPLICATE");
    used.add(requirement.resource);
    // A generic ore node is not evidence of iron, steel or other refined supplies.
    const availableNodes = RAW.has(requirement.resource)
      ? evidence.naturalSourceNodes[requirement.resource as AurionChunkRawResource] : 0;
    if (availableNodes < requirement.minSourceNodes) deficits.push(Object.freeze({
      resource: requirement.resource, requiredNodes: requirement.minSourceNodes, availableNodes,
    }));
  }
  return Object.freeze({ eligible: deficits.length === 0, deficits: Object.freeze(deficits), sourceHash: claimed });
}
