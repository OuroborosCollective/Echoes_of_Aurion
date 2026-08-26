import { createHash } from "node:crypto";

/** Tick-free Aurion adapters for Wasd ARE integrity and city-layout semantics. */
export type WorldInvariantViolation = { code: "KAPPA_INVARIANT" | "INVALID_KAPPA_TYPE" | "MISSING_DETERMINISTIC_SEED" | "INVALID_RESOLUTION_INDEX" | "FORBIDDEN_NONDETERMINISM"; message: string; token?: string };
export type WorldIntegrityReport = { ok: boolean; kappa: number | null; seed: string | number | null; resolutionIndex: number; violations: readonly WorldInvariantViolation[]; receiptHash: string };
export type AurionLayoutEntity = { id: string; type: string; position?: { x?: number; y?: number; z?: number }; state?: string };
export type LayoutFix = { entityId: string; reason: "city_layout_missing_road_or_spacing" | "city_layout_spacing"; before: AurionLayoutEntity; after: AurionLayoutEntity };
export type CityLayoutResolution = { ok: boolean; sector: number; fixes: readonly LayoutFix[]; entities: readonly AurionLayoutEntity[]; receiptHash: string };

const forbiddenTokens = ["Math.random", "Date.now", "performance.now()", "crypto.randomUUID()", "new Date()"] as const;
const hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const sortEntities = (left: AurionLayoutEntity, right: AurionLayoutEntity) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);

export function resolveWorldIntegrity(input: { kappa: unknown; deterministicSeed: unknown; resolutionIndex: number; sourceFragments?: readonly string[]; receiptId: string }): WorldIntegrityReport {
  const violations: WorldInvariantViolation[] = [];
  const kappa: number | null = typeof input.kappa === "number" && Number.isFinite(input.kappa) ? input.kappa : null;
  if (kappa === null) violations.push({ code: "INVALID_KAPPA_TYPE", message: "Aurion kappa must be a finite number." });
  else if (kappa !== 1000) violations.push({ code: "KAPPA_INVARIANT", message: `Aurion kappa must equal 1000; received ${kappa}.` });
  const seed = typeof input.deterministicSeed === "string" || typeof input.deterministicSeed === "number" ? input.deterministicSeed : null;
  const seedString = String(seed ?? "").trim();
  if (!seedString || seedString.length < 8 || /random|date\.now|undefined|null|nan/i.test(seedString) || !/^[a-z0-9:_./|#-]+$/i.test(seedString)) violations.push({ code: "MISSING_DETERMINISTIC_SEED", message: "Aurion deterministic seed is missing or invalid." });
  if (!Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0 || input.resolutionIndex > 1e12) violations.push({ code: "INVALID_RESOLUTION_INDEX", message: "Aurion resolution index must be a bounded non-negative safe integer." });
  input.sourceFragments?.forEach(source => forbiddenTokens.forEach(token => { if (source.includes(token)) violations.push({ code: "FORBIDDEN_NONDETERMINISM", message: `Forbidden non-deterministic token ${token} found in adapted world rule.`, token }); }));
  return { ok: violations.length === 0, kappa, seed, resolutionIndex: input.resolutionIndex, violations, receiptHash: hash(["wasd:world-integrity:v1", input.receiptId, String(kappa), seedString, String(input.resolutionIndex), ...violations.map(violation => violation.code)]) };
}

function sectorOf(entity: AurionLayoutEntity): number {
  const x = Number(entity.position?.x ?? 0);
  const y = Number(entity.position?.y ?? 0);
  return Math.abs((Math.floor(x / 64) * 31 + Math.floor(y / 64) * 17) % 64);
}
function isBuilding(entity: AurionLayoutEntity): boolean { return /house|building|hall|forge|wall|gate|road/i.test(`${entity.type}:${entity.id}`); }
function isRoad(entity: AurionLayoutEntity): boolean { return /road|path|street/i.test(`${entity.type}:${entity.id}`); }
function distance(left: AurionLayoutEntity, right: AurionLayoutEntity): number { return Math.hypot(Number(left.position?.x ?? 0) - Number(right.position?.x ?? 0), Number(left.position?.y ?? 0) - Number(right.position?.y ?? 0)); }

export function resolveCityLayout(input: { entities: readonly AurionLayoutEntity[]; sector: number; receiptId: string }): CityLayoutResolution {
  if (!Number.isSafeInteger(input.sector) || input.sector < 0 || input.sector >= 64 || !input.receiptId) throw new Error("City layout requires bounded sector and receipt");
  const entities = input.entities.filter(entity => entity.id && isBuilding(entity) && sectorOf(entity) === input.sector).map(clone).sort(sortEntities);
  const roads = entities.filter(isRoad);
  const fixes: LayoutFix[] = [];
  entities.forEach((entity, index) => {
    const before = clone(entity);
    if (!entity.position) entity.position = { x: input.sector * 64, y: 0, z: 0 };
    entities.slice(0, index).forEach((other, otherIndex) => {
      if (isRoad(entity) || isRoad(other) || distance(entity, other) >= 2) return;
      entity.position = { x: Number(entity.position?.x ?? 0) + 2 + (index % 3), y: Number(entity.position?.y ?? 0) + 2 + (otherIndex % 5), z: Number(entity.position?.z ?? 0) };
    });
    if (!isRoad(entity) && roads.length === 0) entity.state = "needs_road_anchor";
    if (JSON.stringify(before) !== JSON.stringify(entity)) fixes.push({ entityId: entity.id, reason: roads.length === 0 ? "city_layout_missing_road_or_spacing" : "city_layout_spacing", before, after: clone(entity) });
  });
  return { ok: fixes.length === 0, sector: input.sector, fixes, entities, receiptHash: hash(["wasd:city-layout:v1", input.receiptId, String(input.sector), ...entities.map(entity => JSON.stringify(entity))]) };
}
