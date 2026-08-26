import { createHash } from "node:crypto";

/** Pure, receipt-bound Aurion adapters for Wasd land stewardship and structure semantics. */
export type FarmPlotState = { plotId: string; seedId: string; plantedResolutionIndex: number; growthStage: 0 | 1 | 2 | 3 | 4; receiptHash: string };
export type ConstructionTask = { id: string; structureId: string; targetLevel: number; order: number; receiptHash: string };
export type HouseState = { ownerId: string; plotId: string; upgrades: number; receiptHash: string };
export type FaithState = { religionId: string; adherents: readonly string[]; influence: number; receiptHash: string };
export type GateState = "open" | "closed" | "locked" | "damaged" | "destroyed";
export type GateResolution = { gateId: string; state: GateState; canOpen: boolean; receiptHash: string };
export type StructureDamageResolution = { structureId: string; hitpoints: number; destroyed: boolean; receiptHash: string };

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const nonNegative = (value: number) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));

export function resolveFarmPlot(input: { plotId: string; seedId: string; currentStage?: number; growSteps?: number; receiptId: string; resolutionIndex: number }): FarmPlotState {
  if (!input.plotId || !input.seedId || !input.receiptId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Farm plot requires stable ids, receipt and resolution index");
  const growthStage = Math.min(4, nonNegative(input.currentStage ?? 0) + nonNegative(input.growSteps ?? 0)) as FarmPlotState["growthStage"];
  return { plotId: input.plotId, seedId: input.seedId, plantedResolutionIndex: input.resolutionIndex, growthStage, receiptHash: hash(["wasd:farming:v1", input.plotId, input.seedId, input.receiptId, String(input.resolutionIndex), String(growthStage)]) };
}

export function resolveConstructionQueue(input: { tasks: readonly { structureId: string; targetLevel: number }[]; receiptId: string }): readonly ConstructionTask[] {
  if (!input.receiptId) throw new Error("Construction queue requires receipt");
  return input.tasks.map((task, index) => ({ structureId: task.structureId, targetLevel: Math.max(1, nonNegative(task.targetLevel)), index })).filter(task => task.structureId).sort((a, b) => compare(a.structureId, b.structureId) || a.targetLevel - b.targetLevel || a.index - b.index).map((task, order) => ({ id: `construction_${hash([task.structureId, String(task.targetLevel), input.receiptId, String(order)]).slice(0, 20)}`, structureId: task.structureId, targetLevel: task.targetLevel, order, receiptHash: hash(["wasd:construction:v1", task.structureId, String(task.targetLevel), input.receiptId, String(order)]) }));
}

export function resolveHouse(input: { ownerId: string; plotId: string; currentUpgrades?: number; targetUpgrade?: number; receiptId: string }): HouseState {
  if (!input.ownerId || !input.plotId || !input.receiptId) throw new Error("House requires owner, plot and receipt");
  const upgrades = Math.max(nonNegative(input.currentUpgrades ?? 0), nonNegative(input.targetUpgrade ?? 0));
  return { ownerId: input.ownerId, plotId: input.plotId, upgrades, receiptHash: hash(["wasd:housing:v1", input.ownerId, input.plotId, input.receiptId, String(upgrades)]) };
}

export function resolveFaith(input: { religionId: string; adherents: readonly string[]; influence: number; receiptId: string }): FaithState {
  if (!input.religionId || !input.receiptId) throw new Error("Faith requires religion and receipt");
  const adherents = Array.from(new Set(input.adherents.filter(Boolean))).sort(compare);
  const influence = Math.max(0, Math.min(1, Math.round(input.influence * 10_000) / 10_000));
  return { religionId: input.religionId, adherents, influence, receiptHash: hash(["wasd:religion:v1", input.religionId, input.receiptId, String(influence), ...adherents]) };
}

export function resolveGate(input: { gateId: string; state: GateState; actorPermissions: readonly string[]; receiptId: string }): GateResolution {
  if (!input.gateId || !input.receiptId) throw new Error("Gate requires id and receipt");
  const canOpen = input.state !== "destroyed" && (input.state !== "locked" || input.actorPermissions.includes("gate_access"));
  return { gateId: input.gateId, state: input.state, canOpen, receiptHash: hash(["wasd:gate:v1", input.gateId, input.state, input.receiptId, ...input.actorPermissions.slice().sort(compare)]) };
}

export function resolveStructureDamage(input: { structureId: string; currentHitpoints?: number; damage: number; receiptId: string; breachGate?: boolean }): StructureDamageResolution {
  if (!input.structureId || !input.receiptId) throw new Error("Structure damage requires id and receipt");
  const hitpoints = input.breachGate ? 0 : Math.max(0, nonNegative(input.currentHitpoints ?? 100) - nonNegative(input.damage));
  return { structureId: input.structureId, hitpoints, destroyed: hitpoints === 0, receiptHash: hash(["wasd:siege:v1", input.structureId, input.receiptId, String(hitpoints), String(Boolean(input.breachGate))]) };
}
