export const AURION_GLOBAL_WORLD_VERSION = "aurion-global-world.v1" as const;
export const AURION_WORLD_SECTOR_CAP = 740 as const;
export const AURION_INITIAL_SECTOR_COUNT = 6 as const;
export const AURION_PLAYERS_PER_SECTOR = 4 as const;

export type GlobalWorldProfile = {
  worldSeed: string;
  epoch: number;
  activePlayerCount: number;
  highWaterPlayerCount: number;
};

export type WorldBiome = "forest" | "highland" | "riverland" | "plains" | "coast" | "ashland" | "ruins";
export type GovernmentType = "monarchy" | "council" | "trade_republic" | "theocracy" | "warband";
export type WorldProfession = "farmer" | "forester" | "trader" | "guard" | "builder" | "herbalist";
export type WorldMigrationReason = "drought" | "forest_recovery" | "market_demand" | "war" | "safety";
export type WorldQuestKind = "restore_forest" | "irrigate_fields" | "escort_caravan" | "secure_road" | "mediate_crisis" | "defend_settlement";

export type WorldResources = {
  timber: number;
  forestHealth: number;
  food: number;
  water: number;
  ore: number;
  drought: number;
};

export type WorldPolity = {
  governmentType: GovernmentType;
  stability: number;
  state: "stable" | "unrest" | "succession_crisis" | "warfront";
  conflictPressure: number;
};

export type WorldMigration = {
  id: string;
  profession: WorldProfession;
  fromSectorId: string;
  toSectorId: string;
  reason: WorldMigrationReason;
  count: number;
};

export type GeneratedWorldQuest = {
  id: string;
  kind: WorldQuestKind;
  sectorId: string;
  npcRole: WorldProfession;
  title: string;
  rationale: string;
  priority: number;
};

export type GlobalWorldSector = {
  id: string;
  ordinal: number;
  coordinates: { x: number; z: number };
  biome: WorldBiome;
  settlement: { id: string; kind: "capital" | "city" | "village" | "outpost"; population: number; capacity: number };
  resources: WorldResources;
  polity: WorldPolity;
  professions: Readonly<Record<WorldProfession, number>>;
  migrations: readonly WorldMigration[];
  quests: readonly GeneratedWorldQuest[];
};

export type GlobalWorldPlan = {
  version: typeof AURION_GLOBAL_WORLD_VERSION;
  worldSeed: string;
  epoch: number;
  activePlayerCount: number;
  highWaterPlayerCount: number;
  unlockedSectorCount: number;
  nextExpansionAtPlayerCount: number | null;
  sectors: readonly GlobalWorldSector[];
  deterministicHash: string;
};

/** Small, client-safe generation input. Baseline sectors are regenerated locally from this descriptor. */
export type GlobalWorldClientDescriptor = {
  version: typeof AURION_GLOBAL_WORLD_VERSION;
  worldId: "echoes-of-aurion-global";
  worldSeed: string;
  epoch: number;
  unlockedSectorCount: number;
  nextExpansionAtPlayerCount: number | null;
  deterministicHash: string;
};

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertWhole(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}

function hash32(...parts: readonly string[]): number {
  let value = 2166136261;
  for (const part of parts) {
    for (const character of part) {
      value ^= character.charCodeAt(0);
      value = Math.imul(value, 16777619);
    }
    value ^= 1249;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function hashUnit(...parts: readonly string[]): number {
  return hash32(...parts) / 0xffffffff;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function deterministicHash(value: unknown): string {
  return `fnv1a-${hash32(stableStringify(value)).toString(16).padStart(8, "0")}`;
}

function pick<T>(items: readonly T[], unit: number): T {
  return items[Math.min(items.length - 1, Math.floor(unit * items.length))]!;
}

function sectorCoordinate(ordinal: number): { x: number; z: number } {
  const width = 28;
  const x = ordinal % width;
  const z = Math.floor(ordinal / width);
  return { x: (x - 13) * 4, z: (z - 13) * 4 };
}

export function unlockedWorldSectorCount(highWaterPlayerCount: number): number {
  assertWhole(highWaterPlayerCount, "highWaterPlayerCount");
  return Math.min(AURION_WORLD_SECTOR_CAP, Math.max(AURION_INITIAL_SECTOR_COUNT, AURION_INITIAL_SECTOR_COUNT + Math.floor(Math.max(0, highWaterPlayerCount - 1) / AURION_PLAYERS_PER_SECTOR)));
}

function settlementKind(ordinal: number): GlobalWorldSector["settlement"]["kind"] {
  if (ordinal === 0) return "capital";
  if (ordinal % 17 === 0) return "city";
  if (ordinal % 5 === 0) return "outpost";
  return "village";
}

function governmentType(seed: string, ordinal: number): GovernmentType {
  return pick(["monarchy", "council", "trade_republic", "theocracy", "warband"] as const, hashUnit(seed, "government", String(ordinal)));
}

function buildResources(seed: string, epoch: number, ordinal: number, playerPressure: number): WorldResources {
  const drought = clamp(hashUnit(seed, "drought", String(epoch), String(ordinal)) * 0.9 + playerPressure * 0.1);
  const water = clamp(0.9 - drought * 0.68 + hashUnit(seed, "water", String(ordinal)) * 0.16);
  const timber = clamp(0.38 + hashUnit(seed, "timber", String(ordinal)) * 0.55 - playerPressure * 0.12);
  const forestHealth = clamp(0.48 + timber * 0.38 - drought * 0.35 + hashUnit(seed, "forest", String(epoch), String(ordinal)) * 0.12);
  const food = clamp(0.28 + water * 0.42 - drought * 0.2 + hashUnit(seed, "food", String(ordinal)) * 0.2);
  const ore = clamp(0.18 + hashUnit(seed, "ore", String(ordinal)) * 0.72);
  return { timber, forestHealth, food, water, ore, drought };
}

function buildPolity(seed: string, epoch: number, ordinal: number, resources: WorldResources): WorldPolity {
  const conflictPressure = clamp(0.08 + hashUnit(seed, "conflict", String(epoch), String(ordinal)) * 0.5 + (1 - resources.food) * 0.16 + resources.drought * 0.18);
  const stability = clamp(0.94 - conflictPressure * 0.78 - (1 - resources.water) * 0.12);
  const state = conflictPressure >= 0.72 ? "warfront" : stability < 0.38 ? "succession_crisis" : stability < 0.58 ? "unrest" : "stable";
  return { governmentType: governmentType(seed, ordinal), stability, state, conflictPressure };
}

function buildProfessions(resources: WorldResources, polity: WorldPolity, population: number): Readonly<Record<WorldProfession, number>> {
  const unit = Math.max(1, Math.floor(population / 12));
  return Object.freeze({
    farmer: Math.max(1, Math.round(unit * (0.5 + resources.food))),
    forester: Math.max(1, Math.round(unit * (0.28 + resources.forestHealth))),
    trader: Math.max(1, Math.round(unit * (0.22 + Math.abs(resources.food - resources.ore)))),
    guard: Math.max(1, Math.round(unit * (0.2 + polity.conflictPressure))),
    builder: Math.max(1, Math.round(unit * (0.2 + (1 - polity.stability) * 0.4))),
    herbalist: Math.max(1, Math.round(unit * (0.16 + resources.water * 0.24))),
  });
}

function questFor(sectorId: string, resources: WorldResources, polity: WorldPolity): readonly GeneratedWorldQuest[] {
  const quests: GeneratedWorldQuest[] = [];
  if (resources.forestHealth < 0.46) quests.push({ id: `quest:${sectorId}:restore-forest`, kind: "restore_forest", sectorId, npcRole: "forester", title: "Den Sternenforst erneuern", rationale: "Kahlschlag- und Dürredruck senken die Waldgesundheit.", priority: 3 });
  if (resources.drought > 0.62 || resources.water < 0.42) quests.push({ id: `quest:${sectorId}:irrigate`, kind: "irrigate_fields", sectorId, npcRole: "farmer", title: "Wasser für die Felder", rationale: "Die regionale Ernte benötigt gesicherte Wasserwege.", priority: 3 });
  if (Math.abs(resources.food - resources.ore) > 0.46) quests.push({ id: `quest:${sectorId}:caravan`, kind: "escort_caravan", sectorId, npcRole: "trader", title: "Karawane der Knappheit", rationale: "Angebot und Bedarf der Region weichen deutlich voneinander ab.", priority: 2 });
  if (polity.state === "unrest") quests.push({ id: `quest:${sectorId}:secure-road`, kind: "secure_road", sectorId, npcRole: "guard", title: "Die Wege sichern", rationale: "Unruhe gefährdet Handels- und Fluchtrouten.", priority: 2 });
  if (polity.state === "succession_crisis") quests.push({ id: `quest:${sectorId}:mediate-crisis`, kind: "mediate_crisis", sectorId, npcRole: "builder", title: "Rat unter zerbrochenen Bannern", rationale: "Die Regierungsstabilität hat eine Nachfolgekrise ausgelöst.", priority: 4 });
  if (polity.state === "warfront") quests.push({ id: `quest:${sectorId}:defend`, kind: "defend_settlement", sectorId, npcRole: "guard", title: "Die Grenze halten", rationale: "Der regionale Konfliktdruck hat eine Kriegsfront hervorgebracht.", priority: 4 });
  return quests.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
}

function migrationFor(sectorId: string, nextSectorId: string, resources: WorldResources, polity: WorldPolity, professions: Readonly<Record<WorldProfession, number>>): readonly WorldMigration[] {
  const migrations: WorldMigration[] = [];
  if (resources.drought > 0.62) migrations.push({ id: `migration:${sectorId}:farmer`, profession: "farmer", fromSectorId: sectorId, toSectorId: nextSectorId, reason: "drought", count: Math.max(1, Math.floor(professions.farmer / 4)) });
  if (resources.forestHealth < 0.46) migrations.push({ id: `migration:${sectorId}:forester`, profession: "forester", fromSectorId: sectorId, toSectorId: nextSectorId, reason: "forest_recovery", count: Math.max(1, Math.floor(professions.forester / 3)) });
  if (Math.abs(resources.food - resources.ore) > 0.46) migrations.push({ id: `migration:${sectorId}:trader`, profession: "trader", fromSectorId: sectorId, toSectorId: nextSectorId, reason: "market_demand", count: Math.max(1, Math.floor(professions.trader / 3)) });
  if (polity.state === "warfront" || polity.state === "succession_crisis") migrations.push({ id: `migration:${sectorId}:guard`, profession: "guard", fromSectorId: sectorId, toSectorId: nextSectorId, reason: polity.state === "warfront" ? "war" : "safety", count: Math.max(1, Math.floor(professions.guard / 2)) });
  return migrations.sort((left, right) => left.id.localeCompare(right.id));
}

export function toGlobalWorldClientDescriptor(plan: GlobalWorldPlan): GlobalWorldClientDescriptor {
  return Object.freeze({
    version: plan.version,
    worldId: "echoes-of-aurion-global",
    worldSeed: plan.worldSeed,
    epoch: plan.epoch,
    unlockedSectorCount: plan.unlockedSectorCount,
    nextExpansionAtPlayerCount: plan.nextExpansionAtPlayerCount,
    deterministicHash: plan.deterministicHash,
  });
}

export function buildGlobalWorldPlan(input: GlobalWorldProfile): GlobalWorldPlan {
  assertWhole(input.epoch, "epoch");
  assertWhole(input.activePlayerCount, "activePlayerCount");
  assertWhole(input.highWaterPlayerCount, "highWaterPlayerCount");
  if (!input.worldSeed.trim()) throw new Error("worldSeed is required");
  const effectiveHighWater = Math.max(input.activePlayerCount, input.highWaterPlayerCount);
  const unlockedSectorCount = unlockedWorldSectorCount(effectiveHighWater);
  const playerPressure = clamp(input.activePlayerCount / 12_000);
  const sectors = Array.from({ length: unlockedSectorCount }, (_, ordinal): GlobalWorldSector => {
    const id = `sector:${ordinal.toString().padStart(3, "0")}`;
    const kind = settlementKind(ordinal);
    const capacity = kind === "capital" ? 540 : kind === "city" ? 360 : kind === "village" ? 140 : 72;
    const population = Math.max(18, Math.floor(capacity * (0.38 + hashUnit(input.worldSeed, "population", String(ordinal)) * 0.45 + playerPressure * 0.12)));
    const resources = buildResources(input.worldSeed, input.epoch, ordinal, playerPressure);
    const polity = buildPolity(input.worldSeed, input.epoch, ordinal, resources);
    const professions = buildProfessions(resources, polity, population);
    return {
      id,
      ordinal,
      coordinates: sectorCoordinate(ordinal),
      biome: pick(["forest", "highland", "riverland", "plains", "coast", "ashland", "ruins"] as const, hashUnit(input.worldSeed, "biome", String(ordinal))),
      settlement: { id: `settlement:${ordinal.toString().padStart(3, "0")}`, kind, population, capacity },
      resources,
      polity,
      professions,
      migrations: migrationFor(id, `sector:${((ordinal + 1) % unlockedSectorCount).toString().padStart(3, "0")}`, resources, polity, professions),
      quests: questFor(id, resources, polity),
    };
  });
  const snapshot = {
    version: AURION_GLOBAL_WORLD_VERSION,
    worldSeed: input.worldSeed,
    epoch: input.epoch,
    activePlayerCount: input.activePlayerCount,
    highWaterPlayerCount: effectiveHighWater,
    unlockedSectorCount,
    nextExpansionAtPlayerCount: unlockedSectorCount >= AURION_WORLD_SECTOR_CAP ? null : Math.max(1, (unlockedSectorCount - AURION_INITIAL_SECTOR_COUNT + 1) * AURION_PLAYERS_PER_SECTOR + 1),
    sectors,
  };
  return Object.freeze({ ...snapshot, deterministicHash: deterministicHash(snapshot) });
}
