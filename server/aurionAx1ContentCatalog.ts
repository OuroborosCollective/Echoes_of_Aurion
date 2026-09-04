import { createHash } from "node:crypto";
import { masteryScopeTypes, type MasteryScopeType } from "./scopedMasteryProtocol";

export const AURION_AX1_CONTENT_VERSION = "aurion-ax1-content.d356881.v1" as const;
export const AURION_AX1_CONTENT_SOURCE_REVISION = "d356881538dae23c3aa97364a5596d48b6ac3079" as const;

export type CatalogMasteryTuple = readonly [MasteryScopeType, string];
export type AurionAx1ContentCatalog = Readonly<{
  schemaVersion: 1;
  contentVersion: typeof AURION_AX1_CONTENT_VERSION;
  source: readonly ["OuroborosCollective/-ax1", typeof AURION_AX1_CONTENT_SOURCE_REVISION];
  normativeRules: readonly ["OuroborosCollective/Wasd", string];
  targetBaseline: readonly ["OuroborosCollective/Echoes_of_Aurion", string];
  authority: Readonly<{ definitionsOnly: true; liveState: false; progressionCap: null; mutation: "wasd_aurion_receipts" }>;
  professions: readonly Readonly<{ id: string; sourceId: string; category: "crafting" | "gathering" | "civic"; label: string; mastery: CatalogMasteryTuple; unbounded: true }>[];
  activities: readonly Readonly<{ id: string; professionId: string; kind: "gather" | "process" | "civic"; output: readonly [string, string]; sourceHint: readonly [number, string, string, string]; mastery: readonly CatalogMasteryTuple[] }>[];
  recipes: readonly Readonly<{ id: string; professionId: string; label: string; ingredients: readonly (readonly [string, string])[]; output: readonly [string, string]; sourceHint: readonly [string, number]; mastery: readonly CatalogMasteryTuple[] }>[];
  dungeons: readonly Readonly<{ id: string; label: string; zone: string; bosses: readonly string[]; sourceHint: readonly [string, string, string, string, string]; partyCapabilities: readonly [number, number, number]; classLocked: false }>[];
  lore: Readonly<{ chapters: readonly (readonly [string, string, readonly string[]])[]; entries: readonly (readonly [string, string, string])[] }>;
  worldBosses: readonly Readonly<{ id: string; label: string; zone: string; coordinatesMm: readonly [number, number]; respawnTicksExact: string; sourceCombatHint: readonly [string, string] }>[];
  homesteadBlueprints: readonly Readonly<{ id: string; label: string; tier: number; costExact: readonly [string, string, string]; sourcePerkCandidate: string }>[];
  guildBuildingBlueprints: readonly Readonly<{ id: string; label: string; maximumLevelExact: string; costExact: readonly [string, string, string, string]; sourcePerkCandidate: string }>[];
  catalogSha256: string;
}>;

const safeId = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const exact = /^(0|[1-9][0-9]*)$/;
const digest = /^[a-f0-9]{64}$/;
const forbiddenLiveKeys = new Set(["level", "xp", "maxXp", "unlocked", "completed", "lastDefeatedTimestamp", "defeatCount", "lastSlayerName", "status", "isOnline", "treasuryGold"]);

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}
function id(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !safeId.test(value)) throw new Error(`${label} must be a canonical id`);
}
function decimal(value: unknown, label: string, positive = false): asserts value is string {
  if (typeof value !== "string" || !exact.test(value) || (positive && value === "0")) throw new Error(`${label} must be a canonical decimal`);
}
function unique(items: readonly Record<string, unknown>[], label: string): void {
  const ids = items.map((entry, index) => { id(entry.id, `${label}[${index}].id`); return entry.id; });
  if (new Set(ids).size !== ids.length) throw new Error(`${label} contains duplicate ids`);
}
function forbidden(value: unknown, path = "catalog"): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbidden(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenLiveKeys.has(key)) return `${path}.${key}`;
    const found = forbidden(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
function mastery(tuple: unknown, expectedType: MasteryScopeType, expectedId: string, label: string): void {
  if (!Array.isArray(tuple) || tuple.length !== 2 || tuple[0] !== expectedType || tuple[1] !== expectedId || !(masteryScopeTypes as readonly string[]).includes(tuple[0])) {
    throw new Error(`${label} mastery mismatch`);
  }
}
function tupleDecimals(values: readonly string[], label: string): void {
  values.forEach((value, index) => decimal(value, `${label}[${index}]`, true));
}

export function stableCatalogStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableCatalogStringify).join(",")}]`;
  const valueRecord = value as Record<string, unknown>;
  return `{${Object.keys(valueRecord).sort().map(key => `${JSON.stringify(key)}:${stableCatalogStringify(valueRecord[key])}`).join(",")}}`;
}

export function aurionAx1ContentDigest(catalog: AurionAx1ContentCatalog): string {
  const { catalogSha256: _ignored, ...unsigned } = catalog;
  return createHash("sha256").update(stableCatalogStringify(unsigned), "utf8").digest("hex");
}

export function validateAurionAx1ContentCatalog(value: unknown): AurionAx1ContentCatalog {
  record(value, "catalog");
  if (value.schemaVersion !== 1 || value.contentVersion !== AURION_AX1_CONTENT_VERSION) throw new Error("unsupported content catalog version");
  if (!Array.isArray(value.source) || value.source[0] !== "OuroborosCollective/-ax1" || value.source[1] !== AURION_AX1_CONTENT_SOURCE_REVISION) throw new Error("content source mismatch");
  record(value.authority, "authority");
  if (value.authority.definitionsOnly !== true || value.authority.liveState !== false || value.authority.progressionCap !== null || value.authority.mutation !== "wasd_aurion_receipts") throw new Error("content authority mismatch");
  const forbiddenPath = forbidden(value);
  if (forbiddenPath) throw new Error(`live-state key forbidden: ${forbiddenPath}`);

  for (const key of ["professions", "activities", "recipes", "dungeons", "worldBosses", "homesteadBlueprints", "guildBuildingBlueprints"] as const) {
    if (!Array.isArray(value[key])) throw new Error(`${key} must be an array`);
    unique(value[key] as Record<string, unknown>[], key);
  }
  record(value.lore, "lore");
  if (!Array.isArray(value.lore.chapters) || !Array.isArray(value.lore.entries)) throw new Error("lore arrays missing");

  const catalog = value as unknown as AurionAx1ContentCatalog;
  const expectedCounts = [14, 9, 11, 4, 4, 4, 4, 6];
  const observedCounts = [catalog.professions.length, catalog.activities.length, catalog.recipes.length, catalog.dungeons.length, catalog.lore.chapters.length, catalog.worldBosses.length, catalog.homesteadBlueprints.length, catalog.guildBuildingBlueprints.length];
  if (observedCounts.some((count, index) => count !== expectedCounts[index])) throw new Error("catalog completeness mismatch");

  const professionIds = new Set(catalog.professions.map(entry => entry.id));
  const sourceIds = new Set(catalog.professions.map(entry => entry.sourceId));
  if (professionIds.size !== 14 || sourceIds.size !== 14) throw new Error("profession mapping must be one-to-one");
  for (const profession of catalog.professions) {
    id(profession.id, "profession.id"); id(profession.sourceId, "profession.sourceId");
    if (profession.unbounded !== true) throw new Error("profession must be unbounded");
    mastery(profession.mastery, "profession", profession.id, profession.id);
  }
  const enchanter = catalog.professions.find(entry => entry.sourceId === "enchanter");
  if (!enchanter || enchanter.id !== "enchanting" || enchanter.category !== "crafting") throw new Error("enchanter normalization mismatch");

  const materialIds = new Set<string>();
  for (const activity of catalog.activities) {
    if (!professionIds.has(activity.professionId)) throw new Error(`unknown activity profession ${activity.professionId}`);
    id(activity.id, "activity.id"); id(activity.output[0], "activity.output");
    if (!Number.isSafeInteger(activity.sourceHint[0]) || activity.sourceHint[0] < 1) throw new Error("invalid activity duration");
    tupleDecimals(activity.sourceHint.slice(1) as string[], `${activity.id}.sourceHint`);
    materialIds.add(activity.output[0]);
    const actionType: MasteryScopeType = activity.kind === "gather" ? "gathering" : "action";
    if (activity.mastery.length !== 3) throw new Error("activity mastery count mismatch");
    mastery(activity.mastery[0], "profession", activity.professionId, activity.id);
    mastery(activity.mastery[1], actionType, activity.id, activity.id);
    mastery(activity.mastery[2], "item", activity.output[0], activity.id);
  }

  const outputIds = new Set<string>();
  for (const recipe of catalog.recipes) {
    if (!professionIds.has(recipe.professionId) || !recipe.ingredients.length) throw new Error(`invalid recipe ${recipe.id}`);
    for (const [itemId, amount] of recipe.ingredients) {
      if (!materialIds.has(itemId)) throw new Error(`unknown material ${itemId}`);
      decimal(amount, `${recipe.id}.ingredient`, true);
    }
    id(recipe.output[0], `${recipe.id}.output`); decimal(recipe.output[1], `${recipe.id}.output`, true);
    if (outputIds.has(recipe.output[0])) throw new Error("duplicate recipe output");
    outputIds.add(recipe.output[0]);
    decimal(recipe.sourceHint[0], `${recipe.id}.sourceXp`);
    if (!Number.isSafeInteger(recipe.sourceHint[1]) || recipe.sourceHint[1] < 1) throw new Error("invalid craft duration");
    if (recipe.mastery.length !== 3) throw new Error("recipe mastery count mismatch");
    mastery(recipe.mastery[0], "profession", recipe.professionId, recipe.id);
    mastery(recipe.mastery[1], "recipe", recipe.id, recipe.id);
    mastery(recipe.mastery[2], "item", recipe.output[0], recipe.id);
  }

  for (const dungeon of catalog.dungeons) {
    if (dungeon.classLocked !== false || dungeon.bosses.length < 2 || dungeon.partyCapabilities.join(",") !== "1,1,3") throw new Error("dungeon capability contract mismatch");
    tupleDecimals(dungeon.sourceHint.slice(0, 4), `${dungeon.id}.sourceHint`);
  }
  const chapterIds = new Set(catalog.lore.chapters.map(entry => entry[0]));
  if (chapterIds.size !== 4 || catalog.lore.entries.length !== 4 || catalog.lore.entries.some(entry => !chapterIds.has(entry[1]))) throw new Error("lore reference mismatch");

  for (const boss of catalog.worldBosses) {
    decimal(boss.respawnTicksExact, `${boss.id}.respawn`, true);
    tupleDecimals(boss.sourceCombatHint, `${boss.id}.combatHint`);
    if (!boss.coordinatesMm.every(Number.isSafeInteger)) throw new Error("boss coordinates must be integer millimeters");
  }
  for (const blueprint of catalog.homesteadBlueprints) {
    if (!Number.isSafeInteger(blueprint.tier) || blueprint.tier < 1) throw new Error("invalid homestead tier");
    tupleDecimals(blueprint.costExact, `${blueprint.id}.cost`);
  }
  for (const building of catalog.guildBuildingBlueprints) {
    decimal(building.maximumLevelExact, `${building.id}.maximumLevel`, true);
    tupleDecimals(building.costExact, `${building.id}.cost`);
  }

  if (!digest.test(catalog.catalogSha256) || aurionAx1ContentDigest(catalog) !== catalog.catalogSha256) throw new Error("catalog digest mismatch");
  return Object.freeze(catalog);
}
