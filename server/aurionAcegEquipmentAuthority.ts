import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  resolveAcegEquipment,
  type AcegCapabilitySnapshot,
  type AcegEquipDecision,
  type AcegItemDefinition,
  type AcegModifier,
  type AcegRequirement,
  type AcegResolution,
} from "../shared/aurionCapabilityEquipmentGraph";
import type { ItemRecordVersion, PlayerUiReadback, UiItem } from "../shared/playerUiProtocol";
import { aurionLootBaseCatalog } from "./aurionLootCatalog";
import { aurionMasteryDisciplineIds, resolveMasteryReadmodel, type MasteryProgressionEvent } from "./aurionMasteryEthosProtocol";

export const AURION_ACEG_EQUIPMENT_AUTHORITY_VERSION = "aurion.aceg.equipment-authority.v1" as const;
export const AURION_ACEG_DEFAULT_OE_PENALTY_PER_POINT_BPS = 25;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const EXACT = /^(0|[1-9][0-9]*)$/;

export type AcegEquipmentConfirmation = Readonly<{
  id: string;
  version: ItemRecordVersion;
  slot: string;
  confirmationReceiptId: string;
}>;

export type AcegEquipmentAuthoritySources = Readonly<{
  stateIndex: number;
  skillRanks: readonly AcegModifier[];
  professionModifiers: readonly AcegModifier[];
}>;

export type AcegEquipmentProjection = Readonly<{
  resolution: AcegResolution;
  items: readonly UiItem[];
}>;

const professionCapabilities = new Set<string>(["woodworking", "smithing", "weaving", "alchemy", "rune_crafting", "shaping"]);

export function acegSourcesFromMasteryEvents(
  userId: number,
  stateIndex: number,
  events: readonly MasteryProgressionEvent[],
): AcegEquipmentAuthoritySources {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("ACEG_OWNER_INVALID");
  if (!Number.isSafeInteger(stateIndex) || stateIndex < 0) throw new Error("ACEG_STATE_INDEX_INVALID");
  const skillRanks: AcegModifier[] = [];
  const professionModifiers: AcegModifier[] = [];
  for (const disciplineId of aurionMasteryDisciplineIds) {
    const readmodel = resolveMasteryReadmodel({
      playerId: String(userId),
      disciplineId,
      events: events.filter(event => event.disciplineId === disciplineId),
    });
    const modifier = acegCapabilityFromExact(disciplineId, readmodel.progression.levelExact);
    (professionCapabilities.has(disciplineId) ? professionModifiers : skillRanks).push(modifier);
  }
  return Object.freeze({
    stateIndex,
    skillRanks: Object.freeze(skillRanks),
    professionModifiers: Object.freeze(professionModifiers),
  });
}

const identity = (value: Pick<UiItem, "id" | "version">): string => `${value.version}:${value.id}`;

export function acegItemIdentity(value: Pick<UiItem, "id" | "version">): string {
  return identity(value);
}

export function acegStateIndexFromRevision(revisionExact: string): number {
  if (!EXACT.test(revisionExact)) throw new Error("ACEG_INVENTORY_REVISION_INVALID");
  const value = BigInt(revisionExact);
  return Number(value > MAX_SAFE ? MAX_SAFE : value);
}

export function acegCapabilityFromExact(capability: string, valueExact: string): AcegModifier {
  if (!capability.trim() || !EXACT.test(valueExact)) throw new Error("ACEG_CAPABILITY_EVIDENCE_INVALID");
  const value = BigInt(valueExact);
  return Object.freeze({ capability, delta: Number(value > MAX_SAFE ? MAX_SAFE : value) });
}

function requirementFor(item: UiItem): readonly AcegRequirement[] {
  if (!item.slot) return Object.freeze([]);
  if (item.version === "ax1_starter") {
    return Object.freeze([{ capability: "blade_mastery", minValue: 1 }]);
  }
  if (item.version === "legacy") {
    const capability = ({
      aurion_spear: "spear_mastery",
      sunspike_spear: "spear_mastery",
      archive_staff: "staff_mastery",
      warden_focus: "focus_mastery",
      ember_focus: "focus_mastery",
      asterion_blade: "blade_mastery",
      solarium_blade: "blade_mastery",
    } as Readonly<Record<string, string>>)[item.definition];
    return capability ? Object.freeze([{ capability, minValue: 1 }]) : Object.freeze([]);
  }
  const definition = aurionLootBaseCatalog.find(entry => entry.id === item.definition);
  if (!definition) throw new Error("ACEG_ITEM_CATALOG_MISMATCH");
  let capability: string | null = null;
  if (definition.category === "weapon") {
    capability = ({
      blade: "blade_mastery",
      staff: "staff_mastery",
      spear: "spear_mastery",
      focus: "focus_mastery",
      axe: "axe_mastery",
      mace: "mace_mastery",
      dagger: "dagger_mastery",
      bow: "bow_mastery",
      shield: "shield_mastery",
    } as Readonly<Record<string, string>>)[definition.familyId] ?? null;
  } else if (definition.category === "armor") {
    capability = ({
      light: "light_armor_mastery",
      medium: "medium_armor_mastery",
      heavy: "heavy_armor_mastery",
    } as Readonly<Record<string, string>>)[definition.familyId] ?? null;
  } else if (definition.category === "focus") {
    capability = ({
      ember: "ember_magic",
      tide: "tide_magic",
      gale: "gale_magic",
      stone: "stone_magic",
    } as Readonly<Record<string, string>>)[definition.familyId] ?? null;
  }
  // Existing content stays balance-compatible: the already-canonical mastery
  // protocols start at rank one. Higher gates remain explicit future content,
  // never inferred from player level or item level.
  return capability ? Object.freeze([{ capability, minValue: 1 }]) : Object.freeze([]);
}

export function acegItemDefinition(item: UiItem): AcegItemDefinition {
  if (!item.slot) throw new Error("ACEG_EQUIPMENT_SLOT_REQUIRED");
  const modifiers = Object.entries(item.stats).map(([capability, delta]) => {
    if (!capability.trim() || !Number.isSafeInteger(delta)) throw new Error("ACEG_ITEM_STAT_INVALID");
    return Object.freeze({ capability, delta });
  });
  return Object.freeze({
    itemId: identity(item),
    slot: item.slot,
    modifiers: Object.freeze(modifiers),
    requirements: requirementFor(item),
    overEquipPenaltyPerPointBps: AURION_ACEG_DEFAULT_OE_PENALTY_PER_POINT_BPS,
  });
}

function snapshot(userId: number, sources: AcegEquipmentAuthoritySources): AcegCapabilitySnapshot {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("ACEG_OWNER_INVALID");
  if (!Number.isSafeInteger(sources.stateIndex) || sources.stateIndex < 0) throw new Error("ACEG_STATE_INDEX_INVALID");
  return Object.freeze({
    entityId: `player:${userId}`,
    tickIndex: sources.stateIndex,
    permanentStats: Object.freeze([]),
    skillRanks: Object.freeze([...sources.skillRanks]),
    professionModifiers: Object.freeze([...sources.professionModifiers]),
    // No receipt-backed implant or temporary-buff persistence exists yet. Empty
    // is deliberately fail-closed: in-memory/client buffs are never promoted to
    // equipment authority merely because they exist elsewhere at runtime.
    implants: Object.freeze([]),
    buffs: Object.freeze([]),
  });
}

function equippedItems(ui: PlayerUiReadback): readonly UiItem[] {
  return Object.freeze(ui.equipment.map(entry => {
    const item = ui.items.find(candidate =>
      candidate.id === entry.id &&
      candidate.version === entry.version &&
      candidate.slot === entry.slot &&
      candidate.status === "equipped");
    if (!item) throw new Error("ACEG_EQUIPMENT_READBACK_CORRUPT");
    return item;
  }));
}

function confirmationMap(confirmations: readonly AcegEquipmentConfirmation[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const confirmation of confirmations) {
    if (!confirmation.confirmationReceiptId.trim()) throw new Error("ACEG_CONFIRMATION_RECEIPT_INVALID");
    const key = `${confirmation.version}:${confirmation.id}`;
    if (map.has(key)) throw new Error("ACEG_CONFIRMATION_DUPLICATE");
    map.set(key, confirmation.confirmationReceiptId);
  }
  return map;
}

function resolutionFor(input: Readonly<{
  userId: number;
  sources: AcegEquipmentAuthoritySources;
  items: readonly UiItem[];
  confirmations: readonly AcegEquipmentConfirmation[];
  candidate?: UiItem;
}>): AcegResolution {
  const confirmationByItem = confirmationMap(input.confirmations);
  const allItems = input.candidate ? [...input.items, input.candidate] : [...input.items];
  const unique = new Map<string, UiItem>();
  for (const item of allItems) {
    const key = identity(item);
    if (unique.has(key)) throw new Error("ACEG_EQUIPMENT_ITEM_DUPLICATE");
    unique.set(key, item);
  }
  const priorConfirmedEquip = input.items.map(item => {
    const confirmationReceiptId = confirmationByItem.get(identity(item));
    if (!confirmationReceiptId) throw new Error("ACEG_EQUIPMENT_CONFIRMATION_MISSING");
    return Object.freeze({ itemId: identity(item), confirmationReceiptId });
  });
  return resolveAcegEquipment({
    snapshot: snapshot(input.userId, input.sources),
    catalog: [...unique.values()].map(acegItemDefinition),
    ownedItems: [...unique.values()].map(item => Object.freeze({
      itemId: identity(item),
      ownershipReceiptId: item.receiptId,
    })),
    priorConfirmedEquip,
  });
}

export function starterAcegConfirmationId(userId: number, item: UiItem): string {
  if (item.version !== "ax1_starter" || item.status !== "equipped") throw new Error("ACEG_STARTER_CONFIRMATION_INVALID");
  const digest = canonicalSha256({
    domain: "aurion.aceg.starter-confirmation.v1",
    authorityVersion: AURION_ACEG_EQUIPMENT_AUTHORITY_VERSION,
    userId,
    itemId: item.id,
    ownershipReceiptId: item.receiptId,
    slot: item.slot,
  });
  return `aceg-starter:${digest.slice(7, 58)}`;
}

export function resolveCurrentAcegEquipment(input: Readonly<{
  userId: number;
  sources: AcegEquipmentAuthoritySources;
  ui: PlayerUiReadback;
  confirmations: readonly AcegEquipmentConfirmation[];
}>): AcegEquipmentProjection {
  const items = equippedItems(input.ui);
  const resolution = resolutionFor({
    userId: input.userId,
    sources: input.sources,
    items,
    confirmations: input.confirmations,
  });
  if (resolution.equipDecisions.length !== items.length) throw new Error("ACEG_EQUIPMENT_PROJECTION_INCOMPLETE");
  return Object.freeze({ resolution, items });
}

export function resolveAcegEquipIntent(input: Readonly<{
  userId: number;
  sources: AcegEquipmentAuthoritySources;
  ui: PlayerUiReadback;
  confirmations: readonly AcegEquipmentConfirmation[];
  candidate: UiItem;
  expectedItem: Pick<UiItem, "id" | "version"> | null;
  inventoryRevisionExact: string;
  inventoryStateHash: string;
}>): Readonly<{
  resolution: AcegResolution;
  decision: AcegEquipDecision;
  confirmationReceiptId: string;
}> {
  if (!input.candidate.slot || input.candidate.status === "pending_pickup") throw new Error("ACEG_CANDIDATE_INVALID");
  if (!EXACT.test(input.inventoryRevisionExact) || !SHA256.test(input.inventoryStateHash)) throw new Error("ACEG_INVENTORY_EVIDENCE_INVALID");
  const current = equippedItems(input.ui).filter(item => item.slot !== input.candidate.slot);
  const currentKeys = new Set(current.map(identity));
  const confirmations = input.confirmations.filter(entry => currentKeys.has(`${entry.version}:${entry.id}`));
  const resolution = resolutionFor({
    userId: input.userId,
    sources: input.sources,
    items: current,
    confirmations,
    candidate: input.candidate,
  });
  const decision = resolution.equipDecisions.find(entry => entry.itemId === identity(input.candidate));
  if (!decision || decision.confirmationReceiptId !== null || decision.retention !== "eligible") throw new Error("ACEG_EQUIPMENT_REQUIREMENTS_UNMET");
  const digest = canonicalSha256({
    domain: "aurion.aceg.equipment-confirmation.v1",
    authorityVersion: AURION_ACEG_EQUIPMENT_AUTHORITY_VERSION,
    userId: input.userId,
    candidate: identity(input.candidate),
    slot: input.candidate.slot,
    ownershipReceiptId: input.candidate.receiptId,
    expectedItem: input.expectedItem ? `${input.expectedItem.version}:${input.expectedItem.id}` : null,
    inventoryRevisionExact: input.inventoryRevisionExact,
    inventoryStateHash: input.inventoryStateHash,
    sourceEvidenceHash: resolution.sourceEvidenceHash,
    resolutionHash: resolution.resolutionHash,
  });
  // 5 + 59 = 64 chars, fitting the canonical equipment-row primary key.
  const confirmationReceiptId = `aceg:${digest.slice(7, 66)}`;
  return Object.freeze({ resolution, decision, confirmationReceiptId });
}

export function scaleAcegEquipmentStat(value: number, effectivenessBps: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(effectivenessBps) || effectivenessBps < 0 || effectivenessBps > 10_000) {
    throw new Error("ACEG_EFFECT_SCALE_INVALID");
  }
  const scaled = (BigInt(value) * BigInt(effectivenessBps)) / 10_000n;
  if (scaled > MAX_SAFE) throw new Error("ACEG_EFFECT_SCALE_OVERFLOW");
  return Number(scaled);
}
