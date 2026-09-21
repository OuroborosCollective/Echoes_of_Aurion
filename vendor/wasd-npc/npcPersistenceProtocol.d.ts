import { z } from "zod/v3";
import type { NpcGoal, NpcNeedKey, NpcNeedState, NpcDecision } from "./npcNeeds.js";
import type {
  NpcLifeDecision,
  NpcLifeOpportunity,
  NpcLifePlan,
  NpcLifeState,
  NpcRelationshipEvent,
  NpcEconomyLifeState,
} from "./npcLifeProtocol.js";

export declare const NPC_MEMORY_VERSION = "aurion-npc-memory.v2";
export declare const NPC_RECEIPT_VERSION = "aurion-npc-decision.v2";
export declare const NPC_LIFE_RECEIPT_VERSION = "aurion-npc-decision.v3";
export declare const NPC_MEMORY_CAPACITY = 24;
export declare const NPC_MEMORY_AGE_TICKS = 3500;

export declare const npcNeedsSchema: z.ZodObject<{
  safety: z.ZodNumber;
  resources: z.ZodNumber;
  belonging: z.ZodNumber;
  status: z.ZodNumber;
  wealth: z.ZodNumber;
  power: z.ZodNumber;
}, "strict", z.ZodTypeAny, NpcNeedState, NpcNeedState>;

export declare const npcRequestSchema: z.ZodTypeAny;

export type NpcMemoryEntry = Readonly<{
  id: string;
  text: string;
  lastSeenIndex: number;
}>;

export type NpcMemoryState = Readonly<{
  version: "aurion-npc-memory.v2";
  entries: readonly NpcMemoryEntry[];
}>;

export type NpcRequest = Readonly<{
  npcId: string;
  regionId: string;
  resolutionIndex: number;
  needEvents: readonly {
    id: string;
    need: NpcNeedKey;
    delta: number;
    sourceReceiptId: string;
    resolutionIndex: number;
  }[];
  observationIds: readonly string[];
  memory: readonly string[];
  languageProfileId: string;
  roleId: string;
  relationshipEvents: readonly NpcRelationshipEvent[];
  opportunities: readonly NpcLifeOpportunity[];
  economy?: NpcEconomyLifeState;
}>;

export type NpcSnapshot = Readonly<{
  npcId: string;
  regionId: string;
  needs: NpcNeedState;
  memory: readonly string[];
  memoryState: NpcMemoryState;
  decision: NpcDecision;
}>;

export type NpcLifeSnapshot = Readonly<{
  npcId: string;
  regionId: string;
  needs: NpcNeedState;
  memory: readonly string[];
  memoryState: NpcMemoryState;
  lifeState: NpcLifeState;
  decision: NpcLifeDecision;
}>;

export declare function npcHash(value: unknown): string;
export declare function normalizeNpcRequest(input: unknown): NpcRequest;
export declare function npcRequestHash(input: any, version?: string): string;
export declare function parseNpcJson(raw: string): unknown;
export declare function parseNpcMemory(raw: string, lastIndex: number): NpcMemoryState;
export declare function advanceNpcMemory(current: NpcMemoryState, texts: readonly string[], resolutionIndex: number): NpcMemoryState;
export declare function parseNpcNeeds(value: unknown): NpcNeedState;
export declare function createNpcSnapshot(input: {
  npcId: string;
  regionId: string;
  needs: unknown;
  memoryState: NpcMemoryState;
  observationIds: readonly string[];
  resolutionIndex: number;
}): NpcSnapshot;
export declare function createNpcLifeSnapshot(input: {
  npcId: string;
  regionId: string;
  roleId: string;
  resolutionIndex: number;
  needs: unknown;
  memoryState: NpcMemoryState;
  observationIds: readonly string[];
  relationshipEvents: readonly NpcRelationshipEvent[];
  opportunities: readonly NpcLifeOpportunity[];
  previousLifeState?: NpcLifeState;
  economy?: NpcEconomyLifeState;
}): NpcLifeSnapshot;
export declare function encodeNpcReceipt(requestHash: string, snapshot: NpcSnapshot): string;
export declare function encodeNpcLifeReceipt(requestHash: string, snapshot: NpcLifeSnapshot): string;
export declare function npcReceiptVersion(raw: string): string;
export declare function decodeNpcReceipt(raw: string, expected: {
  npcId: string;
  regionId: string;
  resolutionIndex: number;
  decisionHash: string;
  goal: string;
  requestHash?: string;
}): NpcSnapshot | NpcLifeSnapshot;
