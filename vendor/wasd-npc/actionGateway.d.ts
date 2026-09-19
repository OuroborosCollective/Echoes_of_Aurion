import { npcAuthority } from "./authority.js";
import { type CommodityId, type HubId, type LivingWorldResolution, type MarketState, type NpcEconomyState } from "./ax1LivingWorldProtocol.js";
import { type MerchantDecisionRequests } from "./merchantRules.js";
import { type ConfirmedNpcDecision } from "./multiMemory.js";
import type { NpcGoal } from "./npcNeeds.js";
export declare const NPC_ACTION_GATEWAY_VERSION: "wasd-npc-action-gateway.v1";
export declare const NPC_ACTION_LEASE_VERSION: "wasd-npc-action-lease.v1";
export declare const NPC_ACTION_RECEIPT_VERSION: "wasd-npc-action-receipt.v1";
export declare const NPC_ACTION_GATEWAY_MAX_TARGETS = 16;
export declare const NPC_ACTION_GATEWAY_MAX_CANDIDATES = 8;
export type MerchantActionSourceDecision = Readonly<{ receiptId: string; receiptSha256: string; npcId: string; resolutionIndex: number; decisionHash: string; planHash: string; goal: NpcGoal; }>;
export type MerchantActionEpoch = Readonly<{ npcResolutionIndex: number; marketVersion: number; polityVersion: number; }>;
export type MerchantMarketEvidence = Readonly<{ version: number; stateHash: string; }>;
/** Full target evidence is supplied; the gateway derives a canonical target hash. */
export type MerchantActionTargetEvidence = Readonly<{ id: string; kind: "market"; market: MarketState; version: number; active: boolean; }>;
export type MerchantActionTarget = Readonly<{ id: string; kind: "market"; hubId: HubId; version: number; stateHash: string; active: boolean; }>;
export type MerchantInventoryEntry = Readonly<{ itemId: CommodityId; quantity: number; capacity: number; }>;
export type MerchantInventoryEvidence = Readonly<{ ownerId: string; stateHash: string; entries: readonly MerchantInventoryEntry[]; }>;
export type MerchantPolityEvidence = Readonly<{ polityId: string; version: number; stability: number; stateHash: string; }>;
export type MerchantGatewayContext = Readonly<{ worldSeed: string; homeHubId: HubId; /** The next persisted NPC resolution index; this is the lease's only time source. */ logicalIndex: number; confirmedDecision: ConfirmedNpcDecision; epoch: MerchantActionEpoch; npc: NpcEconomyState; market: MarketState; marketEvidence: MerchantMarketEvidence; polity: MerchantPolityEvidence; inventory: MerchantInventoryEvidence; targets: readonly MerchantActionTargetEvidence[]; }>;
export type MerchantActionIntent = Readonly<{ version: typeof NPC_ACTION_GATEWAY_VERSION; authority: ReturnType<typeof npcAuthority>; id: string; intentHash: string; npcId: string; sourceDecision: MerchantActionSourceDecision; resolutionIndex: number; worldSeedSha256: string; expectedEpoch: MerchantActionEpoch; expectedNpcHash: string; expectedMarketHash: string; expectedPolityHash: string; expectedInventoryHash: string; action: LivingWorldResolution["action"]; originHubId: HubId; target: MerchantActionTarget; commodity: CommodityId; quantity: number; unitPriceCopper: number; resolutionHash: string; }>;
export type MerchantActionLease = Readonly<{ version: typeof NPC_ACTION_LEASE_VERSION; id: string; npcId: string; intentId: string; targetId: string; sourceRevision: string; lockedStateHash: string; issuedAtLogicalIndex: number; expiresAtLogicalIndex: number; state: "active" | "revoked" | "consumed"; }>;
export type MerchantActionReceipt = Readonly<{ version: typeof NPC_ACTION_RECEIPT_VERSION; id: string; receiptHash: string; effectsHash: string; npcId: string; sourceDecision: MerchantActionSourceDecision; resolutionIndex: number; intentId: string; leaseId: string; authority: ReturnType<typeof npcAuthority>; action: LivingWorldResolution["action"]; originHubId: HubId; target: MerchantActionTarget; worldSeedSha256: string; resolutionHash: string; expectedEpoch: MerchantActionEpoch; npcStateHash: string; marketStateHash: string; polityStateHash: string; inventoryStateHash: string; }>;
export type MerchantActionBlocked = Readonly<{ status: "blocked"; code: "SOURCE_PLAN_BLOCKED" | "SOURCE_DECISION_MISMATCH" | "EPOCH_MISMATCH" | "MARKET_STATE_MISMATCH" | "POLITY_STATE_MISMATCH" | "REVISION_MISMATCH" | "INTENT_TAMPERED" | "TARGET_MISSING" | "TARGET_RANGE" | "TARGET_STATE_MISMATCH" | "INVENTORY_UNAVAILABLE" | "INVENTORY_STATE_MISMATCH" | "LEASE_MISSING" | "LEASE_REVOKED" | "LEASE_EXPIRED" | "LEASE_CONFLICT"; npcId: string; resolutionIndex: number; action: LivingWorldResolution["action"]; replanHash: string; }>;
export type MerchantActionReady = Readonly<{ status: "ready"; intent: MerchantActionIntent; proposedLease: MerchantActionLease; resolution: LivingWorldResolution; }>;
export type MerchantActionValidated = Readonly<{ status: "validated"; intent: MerchantActionIntent; lease: MerchantActionLease; receipt: MerchantActionReceipt; resolution: LivingWorldResolution; requests: MerchantDecisionRequests; }>;
export declare function merchantMarketStateHash(market: MarketState): string;
/** Includes capacity, so production headroom cannot change under a retained hash. */
export declare function merchantInventoryStateHash(input: Readonly<{ ownerId: string; market: MarketState; entries: readonly MerchantInventoryEntry[]; }>): string;
export declare function merchantPolityStateHash(input: Readonly<{ polityId: string; version: number; stability: number; }>): string;
export declare function merchantActionEffectsHash(requests: MerchantDecisionRequests): string;
export declare function merchantActionReceiptHash(receipt: Omit<MerchantActionReceipt, "receiptHash">): string;
export declare function merchantActionReceiptId(receipt: Omit<MerchantActionReceipt, "id" | "effectsHash" | "receiptHash">): string;
/** The only proposal API. A returned lease still requires persistence and re-read validation. */
export declare function planMerchantAction(input: MerchantGatewayContext): MerchantActionReady | MerchantActionBlocked;
/** Re-read context and persisted lease must pass this before any host mutation. */
export declare function validateMerchantAction(input: Readonly<{ context: MerchantGatewayContext; intent: MerchantActionIntent; lease: MerchantActionLease; }>): MerchantActionValidated | MerchantActionBlocked;
