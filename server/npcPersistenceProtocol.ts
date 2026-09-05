import { createHash } from "node:crypto";
import { z } from "zod";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { decideNpcGoal, npcNeedKeys, type NpcNeedState } from "./wasdAurionProtocol";

export const NPC_MEMORY_VERSION = "aurion-npc-memory.v2" as const;
export const NPC_RECEIPT_VERSION = "aurion-npc-decision.v2" as const;
export const NPC_MEMORY_CAPACITY = 24;
export const NPC_MEMORY_AGE_TICKS = 3500;
const index = z.number().int().min(0).max(2147483647);
const id = z.string().min(1).max(96).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const observations = z.array(z.string().min(1).max(120)).max(128);
const memoryText = z.string().min(1).max(280);
export const npcNeedsSchema = z.object({ safety: z.number().finite().min(0).max(1), resources: z.number().finite().min(0).max(1), belonging: z.number().finite().min(0).max(1), status: z.number().finite().min(0).max(1), wealth: z.number().finite().min(0).max(1), power: z.number().finite().min(0).max(1) }).strict();
export const npcRequestSchema = z.object({
  npcId: id, regionId: id, resolutionIndex: index,
  needEvents: z.array(z.object({ id, need: z.enum(npcNeedKeys), delta: z.number().finite().min(-1).max(1), sourceReceiptId: z.string().min(3).max(128), resolutionIndex: index }).strict()).max(128),
  observationIds: observations, memory: z.array(memoryText).max(NPC_MEMORY_CAPACITY),
  languageProfileId: id.default("aurion-common-v1"),
}).strict();
export type NpcRequest = Omit<z.input<typeof npcRequestSchema>, "needEvents" | "observationIds" | "memory"> & { needEvents: readonly z.input<typeof npcRequestSchema>["needEvents"][number][]; observationIds: readonly string[]; memory: readonly string[] };
export function npcHash(value: unknown): string { return createHash("sha256").update(stableCatalogStringify(value)).digest("hex"); }
export function normalizeNpcRequest(input: unknown) {
  const result = npcRequestSchema.parse(input);
  if (new Set(result.needEvents.map(e => e.id)).size !== result.needEvents.length || new Set(result.observationIds).size !== result.observationIds.length) throw new Error("NPC_DUPLICATE_EVIDENCE");
  if (result.needEvents.some(e => e.resolutionIndex !== result.resolutionIndex)) throw new Error("NPC_EVENT_RESOLUTION_MISMATCH");
  const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  result.needEvents.sort((a,b) => cmp(a.sourceReceiptId,b.sourceReceiptId) || cmp(a.id,b.id));
  result.observationIds.sort(cmp); result.memory = [...new Set(result.memory)].sort(cmp);
  return result;
}
export function parseNpcJson(raw: string): unknown {
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > 65535) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  try { return JSON.parse(raw); } catch { throw new Error("NPC_STORED_CONTENT_CORRUPT"); }
}
const entry = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), text: memoryText, lastSeenIndex: index }).strict();
const memorySchema = z.object({ version: z.literal(NPC_MEMORY_VERSION), entries: z.array(entry).max(NPC_MEMORY_CAPACITY) }).strict();
export type NpcMemory = Readonly<{ version: typeof NPC_MEMORY_VERSION; entries: readonly Readonly<z.infer<typeof entry>>[] }>;
function freezeMemory(entries: z.infer<typeof entry>[]): NpcMemory {
  return Object.freeze({ version: NPC_MEMORY_VERSION, entries: Object.freeze(entries.map(e => Object.freeze({ ...e }))) });
}
export function parseNpcMemory(raw: string, lastIndex: number): NpcMemory {
  const value = parseNpcJson(raw);
  // Old valid arrays are preserved and acquire the last confirmed logical index on the next write.
  if (Array.isArray(value)) {
    const texts = z.array(memoryText).max(NPC_MEMORY_CAPACITY).parse(value);
    if (texts.length && lastIndex < 0) throw new Error("NPC_STORED_CONTENT_CORRUPT");
    return freezeMemory([...new Set(texts)].map(text => ({ id: npcHash(text), text, lastSeenIndex: lastIndex })));
  }
  const parsed = memorySchema.parse(value);
  if (new Set(parsed.entries.map(e => e.id)).size !== parsed.entries.length || parsed.entries.some(e => e.id !== npcHash(e.text) || e.lastSeenIndex > lastIndex)) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  return freezeMemory(parsed.entries);
}
export function advanceNpcMemory(current: NpcMemory, texts: readonly string[], resolutionIndex: number): NpcMemory {
  index.parse(resolutionIndex);
  if (current.entries.some(e => e.lastSeenIndex > resolutionIndex)) throw new Error("NPC_MEMORY_CLOCK_REWIND");
  const next = new Map(current.entries.filter(e => resolutionIndex >= e.lastSeenIndex && resolutionIndex - e.lastSeenIndex < NPC_MEMORY_AGE_TICKS).map(e => [e.id, { ...e }]));
  for (const text of z.array(memoryText).max(NPC_MEMORY_CAPACITY).parse(texts)) next.set(npcHash(text), { id: npcHash(text), text, lastSeenIndex: resolutionIndex });
  const entries = [...next.values()].sort((a,b) => b.lastSeenIndex - a.lastSeenIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0,NPC_MEMORY_CAPACITY);
  return freezeMemory(entries);
}
export type NpcSnapshot = Readonly<{ npcId: string; regionId: string; needs: NpcNeedState; memory: readonly string[]; memoryState: NpcMemory; decision: ReturnType<typeof decideNpcGoal> }>;
export function createNpcSnapshot(input: { npcId: string; regionId: string; needs: NpcNeedState; memoryState: NpcMemory; observationIds: readonly string[]; resolutionIndex: number }): NpcSnapshot {
  const needs = Object.freeze(npcNeedsSchema.parse(input.needs));
  const decision = decideNpcGoal({ ...input, needs });
  return Object.freeze({ npcId: input.npcId, regionId: input.regionId, needs, memory: Object.freeze(input.memoryState.entries.map(e => e.text)), memoryState: freezeMemory(memorySchema.parse(input.memoryState).entries), decision: Object.freeze({ ...decision, needs, observationIds: Object.freeze([...decision.observationIds]) }) });
}
export function encodeNpcReceipt(requestHash: string, snapshot: NpcSnapshot): string {
  const raw = stableCatalogStringify({ version: NPC_RECEIPT_VERSION, requestHash, snapshot, snapshotHash: npcHash(snapshot) });
  parseNpcJson(raw);
  return raw;
}
export function decodeNpcReceipt(raw: string, expected: { npcId: string; regionId: string; resolutionIndex: number; decisionHash: string; goal: string; requestHash?: string }): NpcSnapshot {
  const value = parseNpcJson(raw);
  if (Array.isArray(value)) throw new Error("NPC_LEGACY_RECEIPT_REQUIRES_RECONCILIATION");
  const envelope = z.object({ version: z.literal(NPC_RECEIPT_VERSION), requestHash: z.string().regex(/^[a-f0-9]{64}$/), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/), snapshot: z.object({ npcId: id, regionId: id, needs: npcNeedsSchema, memory: z.array(memoryText).max(NPC_MEMORY_CAPACITY), memoryState: memorySchema, decision: z.object({ npcId: id, needs: npcNeedsSchema, goal: z.string(), observationIds: observations, resolutionIndex: index, decisionHash: z.string() }).strict() }).strict() }).strict().parse(value);
  if (envelope.snapshotHash !== npcHash(envelope.snapshot)) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  if (expected.requestHash && envelope.requestHash !== expected.requestHash) throw new Error("NPC_RESOLUTION_INPUT_CONFLICT");
  const stored = envelope.snapshot;
  const snapshot = createNpcSnapshot({ ...stored, observationIds: stored.decision.observationIds, resolutionIndex: stored.decision.resolutionIndex });
  if (snapshot.npcId !== expected.npcId || snapshot.regionId !== expected.regionId || snapshot.decision.resolutionIndex !== expected.resolutionIndex || snapshot.decision.decisionHash !== expected.decisionHash || snapshot.decision.goal !== expected.goal || npcHash(snapshot) !== envelope.snapshotHash) throw new Error("NPC_STORED_CONTENT_CORRUPT");
  return snapshot;
}
