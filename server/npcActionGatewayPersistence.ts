import { createHash } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import pin from "../config/wasd-npc-capsule.json" with { type: "json" };
import {
  aurionNpcActionConsentReceipts,
  aurionNpcActionEffectReadbacks,
  aurionNpcActionEpochStates,
  aurionNpcActionLeases,
  aurionNpcActionMemoryLinks,
  aurionNpcActionReceipts,
  aurionNpcDecisionReceipts,
  aurionNpcStates,
  aurionPolityStates,
  aurionWorldResolutions,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  appendNpcMultiMemory,
  readNpcMultiMemoryForDecision,
  readPreviousNpcMultiMemory,
  type ConfirmedNpcMultiMemory,
  type NpcTransaction,
} from "./npcMultiMemoryPersistence";
import {
  AURION_WASD_CONTENT_VERSION,
  AURION_WASD_RULESET_VERSION,
  NPC_LIFE_RECEIPT_VERSION,
  advanceNpcMemory,
  buildWorldSeedDigest,
  confirmedNpcEconomy,
  createNpcLifeSnapshot,
  decodeNpcReceipt,
  encodeNpcLifeReceipt,
  merchantActionEffectsHash,
  merchantActionReceiptHash,
  merchantBootstrapMarkets,
  merchantInventoryStateHash,
  merchantMarketStateHash,
  merchantPolityStateHash,
  normalizeNpcRequest,
  npcHash,
  npcIdentity,
  npcNeedsSchema,
  npcRequestHash,
  parseNpcJson,
  parseNpcMemory,
  planMerchantAction,
  resolveNpcNeeds,
  resolvePolityState,
  resolveWorldReaction,
  stableCatalogStringify,
  validateMerchantAction,
  verifyConfirmedNpcDecision,
  type ConfirmedNpcDecision,
  type HubId,
  type MarketState,
  type MerchantActionLease,
  type MerchantActionReceipt,
  type MerchantActionValidated,
  type MerchantDecisionRequests,
  type MerchantGatewayContext,
  type MerchantInventoryEvidence,
  type NpcSnapshot,
  type PolityState,
  type WorldReaction,
  type WorldSignal,
} from "./wasdNpcCapsule";

const ACTION_READBACK_VERSION = "aurion-npc-action-effect-readback.v1" as const;
const ACTION_MEMORY_LINK_VERSION = "aurion-npc-action-memory-link.v1" as const;
const CONSENT_VERSION = "aurion-npc-editorial-consent.v1" as const;
const NO_CONSENT_POLICY = "aurion-npc-editorial-consent.not-required.v1" as const;
const expectedHubIds = Object.keys(merchantBootstrapMarkets).sort();

type EpochRow = typeof aurionNpcActionEpochStates.$inferSelect;
type DecisionRow = typeof aurionNpcDecisionReceipts.$inferSelect;
type ActionRow = typeof aurionNpcActionReceipts.$inferSelect;

export type EditorialConsent = Readonly<{
  verdict: "ALLOW" | "DENY" | "NOT_REQUIRED";
  policyVersion: string;
}>;

export type ConfirmedMerchantActionResult =
  | Readonly<{ status: "blocked"; code: string; replanHash: string }>
  | Readonly<{ status: "denied"; consentReceiptId: string; intentId: string }>
  | Readonly<{
      status: "committed" | "persisted";
      actionReceiptId: string;
      effectReadbackId: string;
      effectReadbackHash: string;
      resolution: MerchantDecisionRequests["resolution"];
      npc: NpcSnapshot & { multiMemory: ConfirmedNpcMultiMemory["memory"] };
      world: WorldReaction;
      polity: PolityState;
    }>;

function parsed<T>(raw: string, code: string): T {
  try { return JSON.parse(raw) as T; } catch { throw new Error(code); }
}

function worldRowId(regionId: string, resolutionIndex: number): string {
  return `world_${createHash("sha256").update(`${regionId}\u001f${resolutionIndex}`).digest("hex").slice(0,58)}`;
}

function canonicalSignals(signals: readonly WorldSignal[]): string {
  const values = signals.map(signal => ({
    id: signal.id,
    kind: signal.kind,
    regionId: signal.regionId,
    magnitude: signal.magnitude,
    sourceReceiptId: signal.sourceReceiptId,
    resolutionIndex: signal.resolutionIndex,
  })).sort((a,b) => a.resolutionIndex-b.resolutionIndex || a.regionId.localeCompare(b.regionId) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  if (new Set(values.map(value => value.id)).size !== values.length) throw new Error("NPC_ACTION_WORLD_SIGNAL_DUPLICATE");
  return stableCatalogStringify(values);
}

function assertPin(): void {
  if (!/^[a-f0-9]{40}$/.test(pin.sourceRevision) || !/^[a-f0-9]{64}$/.test(pin.sourceSha256) || !/^[a-f0-9]{64}$/.test(pin.manifestSha256)) {
    throw new Error("NPC_ACTION_CAPSULE_PIN_INVALID");
  }
}

function verifyEpochRow(row: EpochRow): Readonly<{ market: MarketState; inventory: MerchantInventoryEvidence }> {
  assertPin();
  if (row.sourceRevision !== pin.sourceRevision || row.sourceSha256 !== pin.sourceSha256) throw new Error("NPC_ACTION_EPOCH_SOURCE_DRIFT");
  const market = parsed<MarketState>(row.marketJson, "NPC_ACTION_MARKET_JSON_INVALID");
  if (market.hubId !== row.hubId || merchantMarketStateHash(market) !== row.marketHash) throw new Error("NPC_ACTION_MARKET_READBACK_MISMATCH");
  const inventory = parsed<MerchantInventoryEvidence>(row.inventoryJson, "NPC_ACTION_INVENTORY_JSON_INVALID");
  const computedInventoryHash = merchantInventoryStateHash({ ownerId: inventory.ownerId, market, entries: inventory.entries });
  if (inventory.ownerId !== `market:${row.hubId}` || inventory.stateHash !== row.inventoryHash || computedInventoryHash !== row.inventoryHash) {
    throw new Error("NPC_ACTION_INVENTORY_READBACK_MISMATCH");
  }
  const polityHash = merchantPolityStateHash({ polityId: row.polityId, version: row.polityVersion, stability: row.polityStability });
  if (row.polityId !== `polity:${row.hubId}` || polityHash !== row.polityStateHash) throw new Error("NPC_ACTION_POLITY_READBACK_MISMATCH");
  return Object.freeze({ market, inventory });
}

async function lockedContext(tx: NpcTransaction, homeHubId: HubId, confirmed: ConfirmedNpcDecision): Promise<Readonly<{ context: MerchantGatewayContext; rows: readonly EpochRow[]; origin: EpochRow }>> {
  const rows = await tx.select().from(aurionNpcActionEpochStates).orderBy(asc(aurionNpcActionEpochStates.hubId)).for("update");
  if (rows.length !== expectedHubIds.length || rows.map(row => row.hubId).sort().join("|") !== expectedHubIds.join("|")) throw new Error("NPC_ACTION_EPOCH_SET_INCOMPLETE");
  if (new Set(rows.map(row => row.marketVersion)).size !== 1) throw new Error("NPC_ACTION_MARKET_VERSION_DRIFT");
  const verified = new Map(rows.map(row => [row.hubId, verifyEpochRow(row)] as const));
  const npc = confirmedNpcEconomy(homeHubId, confirmed.snapshot);
  const origin = rows.find(row => row.hubId === npc.currentHubId);
  if (!origin) throw new Error("NPC_ACTION_ORIGIN_EPOCH_REQUIRED");
  const originState = verified.get(origin.hubId)!;
  const targets = rows.filter(row => row.active).map(row => ({
    id: `market:${row.hubId}`,
    kind: "market" as const,
    market: verified.get(row.hubId)!.market,
    version: row.marketVersion,
    active: true,
  }));
  const context: MerchantGatewayContext = Object.freeze({
    worldSeed: "",
    homeHubId,
    logicalIndex: confirmed.snapshot.decision.resolutionIndex + 1,
    confirmedDecision: confirmed,
    epoch: Object.freeze({ npcResolutionIndex: confirmed.snapshot.decision.resolutionIndex, marketVersion: origin.marketVersion, polityVersion: origin.polityVersion }),
    npc,
    market: originState.market,
    marketEvidence: Object.freeze({ version: origin.marketVersion, stateHash: origin.marketHash }),
    polity: Object.freeze({ polityId: origin.polityId, version: origin.polityVersion, stability: origin.polityStability, stateHash: origin.polityStateHash }),
    inventory: originState.inventory,
    targets: Object.freeze(targets),
  });
  return Object.freeze({ context, rows: Object.freeze(rows), origin });
}

function withWorldSeed(context: MerchantGatewayContext, worldSeed: string): MerchantGatewayContext {
  return Object.freeze({ ...context, worldSeed });
}

function assertReceiptBoundEffects(validated: MerchantActionValidated): void {
  const receiptId = validated.receipt.id;
  if (validated.requests.receiptId !== receiptId) throw new Error("NPC_ACTION_EFFECT_PROVENANCE_MISMATCH");
  if (merchantActionEffectsHash(validated.requests) !== validated.receipt.effectsHash) throw new Error("NPC_ACTION_EFFECT_HASH_MISMATCH");
  const sourceIds = [
    ...validated.requests.npcRequest.needEvents.map(event => event.sourceReceiptId),
    ...(validated.requests.npcRequest.opportunities ?? []).map(event => event.sourceReceiptId),
    ...validated.requests.worldRequest.signals.map(signal => signal.sourceReceiptId),
    ...validated.requests.polityRequest.warSignals.map(signal => signal.sourceReceiptId),
  ];
  if (sourceIds.some(id => id !== receiptId)) throw new Error("NPC_ACTION_EFFECT_PROVENANCE_MISMATCH");
}

async function persistedLease(tx: NpcTransaction, proposed: MerchantActionLease): Promise<MerchantActionLease> {
  const leaseJson = stableCatalogStringify(proposed);
  const leaseHash = npcHash(leaseJson);
  const prior = (await tx.select().from(aurionNpcActionLeases).where(eq(aurionNpcActionLeases.intentId, proposed.intentId)).limit(1))[0];
  if (!prior) {
    await tx.insert(aurionNpcActionLeases).values({
      id: proposed.id, npcId: proposed.npcId, intentId: proposed.intentId, targetId: proposed.targetId,
      sourceRevision: proposed.sourceRevision, lockedStateHash: proposed.lockedStateHash,
      issuedAtLogicalIndex: proposed.issuedAtLogicalIndex, expiresAtLogicalIndex: proposed.expiresAtLogicalIndex,
      state: proposed.state, leaseJson, leaseHash,
    });
  }
  const row = (await tx.select().from(aurionNpcActionLeases).where(eq(aurionNpcActionLeases.intentId, proposed.intentId)).limit(1))[0];
  if (!row || row.id !== proposed.id || row.leaseHash !== leaseHash || row.leaseJson !== leaseJson || row.state !== "active") throw new Error("NPC_ACTION_LEASE_PERSISTENCE_CONFLICT");
  return parsed<MerchantActionLease>(row.leaseJson, "NPC_ACTION_LEASE_JSON_INVALID");
}

async function persistConsent(tx: NpcTransaction, sourceDecisionReceiptId: string, intentId: string, npcId: string, input?: EditorialConsent): Promise<typeof aurionNpcActionConsentReceipts.$inferSelect> {
  const consent = input ?? { verdict: "NOT_REQUIRED" as const, policyVersion: NO_CONSENT_POLICY };
  if (!["ALLOW","DENY","NOT_REQUIRED"].includes(consent.verdict) || !consent.policyVersion || consent.policyVersion.length > 96) throw new Error("NPC_ACTION_CONSENT_INVALID");
  const policyHash = npcHash({ version: CONSENT_VERSION, verdict: consent.verdict, policyVersion: consent.policyVersion });
  const core = { version: CONSENT_VERSION, npcId, sourceDecisionReceiptId, intentId, verdict: consent.verdict, policyVersion: consent.policyVersion, policyHash };
  const consentHash = npcHash(core);
  const id = `nac_${consentHash.slice(0,56)}`;
  const prior = (await tx.select().from(aurionNpcActionConsentReceipts).where(eq(aurionNpcActionConsentReceipts.intentId,intentId)).limit(1))[0];
  if (!prior) await tx.insert(aurionNpcActionConsentReceipts).values({ id, npcId, sourceDecisionReceiptId, intentId, verdict: consent.verdict, policyVersion: consent.policyVersion, policyHash, consentHash });
  const row = (await tx.select().from(aurionNpcActionConsentReceipts).where(eq(aurionNpcActionConsentReceipts.intentId,intentId)).limit(1))[0];
  if (!row || row.id !== id || row.consentHash !== consentHash || row.verdict !== consent.verdict || row.policyVersion !== consent.policyVersion) throw new Error("NPC_ACTION_CONSENT_CONFLICT");
  return row;
}

async function persistNpcSuccessor(tx: NpcTransaction, current: typeof aurionNpcStates.$inferSelect, confirmed: ConfirmedNpcDecision, raw: MerchantDecisionRequests["npcRequest"]): Promise<Readonly<{ row: DecisionRow; snapshot: NpcSnapshot; previousMemory: ConfirmedNpcMultiMemory | null }>> {
  const input = normalizeNpcRequest(raw);
  if (input.npcId !== current.npcId || input.resolutionIndex !== current.lastResolutionIndex + 1) throw new Error("NPC_ACTION_SUCCESSOR_INDEX_INVALID");
  if (!("lifeState" in confirmed.snapshot)) throw new Error("NPC_ACTION_SOURCE_V3_REQUIRED");
  const previousMemory = await readPreviousNpcMultiMemory(tx, input.npcId, current.lastResolutionIndex);
  const currentNeeds = npcNeedsSchema.parse(parseNpcJson(current.needsJson));
  const currentMemory = parseNpcMemory(current.memoryJson,current.lastResolutionIndex);
  const needs = resolveNpcNeeds({ current: currentNeeds, events: input.needEvents });
  const memory = advanceNpcMemory(currentMemory,input.memory,input.resolutionIndex);
  const snapshot = createNpcLifeSnapshot({ ...input, needs, memoryState: memory, previousLifeState: confirmed.snapshot.lifeState });
  const requestHash = npcRequestHash(input,NPC_LIFE_RECEIPT_VERSION);
  const id = `npc_${npcHash([NPC_LIFE_RECEIPT_VERSION,input.npcId,input.resolutionIndex]).slice(0,56)}`;
  const envelope = encodeNpcLifeReceipt(requestHash,snapshot);
  await tx.update(aurionNpcStates).set({ regionId:input.regionId, needsJson:JSON.stringify(needs), memoryJson:JSON.stringify(memory), languageProfileId:input.languageProfileId, lastResolutionIndex:input.resolutionIndex }).where(eq(aurionNpcStates.npcId,input.npcId));
  await tx.insert(aurionNpcDecisionReceipts).values({ id, npcId:input.npcId, regionId:input.regionId, resolutionIndex:input.resolutionIndex, observationIdsJson:envelope, goal:snapshot.decision.goal, decisionHash:snapshot.decision.decisionHash });
  const row = (await tx.select().from(aurionNpcDecisionReceipts).where(eq(aurionNpcDecisionReceipts.id,id)).limit(1))[0];
  if (!row) throw new Error("NPC_ACTION_SUCCESSOR_RECEIPT_READBACK_REQUIRED");
  const readback = decodeNpcReceipt(row.observationIdsJson,{...row,requestHash});
  if (readback.decision.decisionHash !== snapshot.decision.decisionHash) throw new Error("NPC_ACTION_SUCCESSOR_RECEIPT_MISMATCH");
  return Object.freeze({ row, snapshot: readback, previousMemory });
}

async function persistWorld(tx: NpcTransaction, request: MerchantDecisionRequests["worldRequest"]): Promise<Readonly<{ row: typeof aurionWorldResolutions.$inferSelect; reaction: WorldReaction }>> {
  const reaction = resolveWorldReaction(request);
  const id = worldRowId(request.regionId,request.resolutionIndex);
  const signalsJson = canonicalSignals(request.signals);
  const seedDigest = buildWorldSeedDigest(request);
  const prior = (await tx.select().from(aurionWorldResolutions).where(eq(aurionWorldResolutions.id,id)).limit(1))[0];
  if (!prior) await tx.insert(aurionWorldResolutions).values({ id, regionId:request.regionId, worldSeedDigest:seedDigest, ruleSetVersion:reaction.ruleSetVersion, contentVersion:reaction.contentVersion, resolutionIndex:request.resolutionIndex, signalsJson, reactionJson:stableCatalogStringify(reaction), reactionHash:reaction.deterministicHash });
  const row = (await tx.select().from(aurionWorldResolutions).where(eq(aurionWorldResolutions.id,id)).limit(1))[0];
  if (!row || row.worldSeedDigest !== seedDigest || row.signalsJson !== signalsJson || row.reactionHash !== reaction.deterministicHash) throw new Error("NPC_ACTION_WORLD_READBACK_MISMATCH");
  return Object.freeze({ row, reaction });
}

async function persistPolity(tx: NpcTransaction, request: MerchantDecisionRequests["polityRequest"]): Promise<PolityState> {
  const state = resolvePolityState(request);
  await tx.insert(aurionPolityStates).values({ polityId:state.polityId, stateJson:stableCatalogStringify(state), reactionHash:state.reactionHash, ruleSetVersion:AURION_WASD_RULESET_VERSION, contentVersion:AURION_WASD_CONTENT_VERSION }).onDuplicateKeyUpdate({ set:{ stateJson:stableCatalogStringify(state), reactionHash:state.reactionHash, ruleSetVersion:AURION_WASD_RULESET_VERSION, contentVersion:AURION_WASD_CONTENT_VERSION } });
  const row = (await tx.select().from(aurionPolityStates).where(eq(aurionPolityStates.polityId,state.polityId)).limit(1))[0];
  if (!row || row.reactionHash !== state.reactionHash || row.stateJson !== stableCatalogStringify(state)) throw new Error("NPC_ACTION_POLITY_EFFECT_READBACK_MISMATCH");
  return state;
}

async function readPersistedAction(tx: NpcTransaction, row: ActionRow): Promise<ConfirmedMerchantActionResult> {
  if (row.sourceRevision !== pin.sourceRevision || row.sourceSha256 !== pin.sourceSha256 || row.capsuleManifestSha256 !== pin.manifestSha256) throw new Error("NPC_ACTION_COMMITTED_SOURCE_DRIFT");
  const receipt = parsed<MerchantActionReceipt>(row.receiptJson,"NPC_ACTION_RECEIPT_JSON_INVALID");
  const effects = parsed<MerchantDecisionRequests>(row.effectSetJson,"NPC_ACTION_EFFECT_SET_JSON_INVALID");
  const { receiptHash: _receiptHash, ...unsignedReceipt } = receipt;
  if (receipt.id !== row.id || receipt.receiptHash !== row.receiptHash || receipt.effectsHash !== row.effectsHash
      || merchantActionReceiptHash(unsignedReceipt) !== row.receiptHash
      || merchantActionEffectsHash(effects) !== row.effectsHash) throw new Error("NPC_ACTION_COMMITTED_RECEIPT_CONFLICT");
  const effectReadback = (await tx.select().from(aurionNpcActionEffectReadbacks).where(eq(aurionNpcActionEffectReadbacks.actionReceiptId,row.id)).limit(1))[0];
  if (!effectReadback || effectReadback.effectsHash !== row.effectsHash || effectReadback.sourceRevision !== pin.sourceRevision) throw new Error("NPC_ACTION_COMMITTED_READBACK_REQUIRED");
  const readbackPayload = parsed<Record<string,unknown>>(effectReadback.readbackJson,"NPC_ACTION_READBACK_JSON_INVALID");
  if (npcHash(readbackPayload) !== effectReadback.readbackHash) throw new Error("NPC_ACTION_COMMITTED_READBACK_HASH_MISMATCH");
  const link = (await tx.select().from(aurionNpcActionMemoryLinks).where(eq(aurionNpcActionMemoryLinks.actionReceiptId,row.id)).limit(1))[0];
  if (!link || link.effectReadbackId !== effectReadback.id) throw new Error("NPC_ACTION_COMMITTED_MEMORY_LINK_REQUIRED");
  const linkPayload = { version:ACTION_MEMORY_LINK_VERSION, actionReceiptId:link.actionReceiptId, effectReadbackId:link.effectReadbackId, memoryReceiptId:link.memoryReceiptId, npcId:link.npcId, resolutionIndex:link.resolutionIndex };
  if (npcHash(linkPayload) !== link.linkHash) throw new Error("NPC_ACTION_COMMITTED_MEMORY_LINK_HASH_MISMATCH");
  const decision = (await tx.select().from(aurionNpcDecisionReceipts).where(eq(aurionNpcDecisionReceipts.id,row.successorNpcReceiptId)).limit(1))[0];
  if (!decision) throw new Error("NPC_ACTION_COMMITTED_NPC_RECEIPT_REQUIRED");
  const snapshot = decodeNpcReceipt(decision.observationIdsJson,decision);
  const memory = await readNpcMultiMemoryForDecision(tx,decision.id);
  if (!memory || memory.row.id !== link.memoryReceiptId) throw new Error("NPC_ACTION_COMMITTED_MEMORY_READBACK_MISMATCH");
  const worldRow = (await tx.select().from(aurionWorldResolutions).where(eq(aurionWorldResolutions.id,row.successorWorldReceiptId)).limit(1))[0];
  if (!worldRow || worldRow.reactionHash !== effectReadback.worldReactionHash) throw new Error("NPC_ACTION_COMMITTED_WORLD_READBACK_MISMATCH");
  const world = parsed<WorldReaction>(worldRow.reactionJson,"NPC_ACTION_WORLD_JSON_INVALID");
  const polityRow = (await tx.select().from(aurionPolityStates).where(eq(aurionPolityStates.polityId,effectReadback.polityId)).limit(1))[0];
  if (!polityRow || polityRow.reactionHash !== row.successorPolityHash) throw new Error("NPC_ACTION_COMMITTED_POLITY_READBACK_MISMATCH");
  const polity = parsed<PolityState>(polityRow.stateJson,"NPC_ACTION_POLITY_JSON_INVALID");
  return Object.freeze({ status:"persisted" as const, actionReceiptId:row.id, effectReadbackId:effectReadback.id, effectReadbackHash:effectReadback.readbackHash, resolution:effects.resolution, npc:Object.freeze({ ...snapshot, multiMemory:memory.memory }), world, polity });
}

export async function readConfirmedMerchantActionSource(npcId: string): Promise<Readonly<{ receiptId:string; resolutionIndex:number }> | null> {
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const state = (await tx.select().from(aurionNpcStates).where(eq(aurionNpcStates.npcId,npcId)).limit(1))[0];
    if (!state || state.lastResolutionIndex < 0) return null;
    const row = (await tx.select().from(aurionNpcDecisionReceipts).where(and(eq(aurionNpcDecisionReceipts.npcId,npcId),eq(aurionNpcDecisionReceipts.resolutionIndex,state.lastResolutionIndex))).limit(1))[0];
    if (!row) throw new Error("NPC_ACTION_SOURCE_RECEIPT_REQUIRED");
    verifyConfirmedNpcDecision(row.observationIdsJson,{...row,receiptId:row.id});
    return Object.freeze({receiptId:row.id,resolutionIndex:row.resolutionIndex});
  });
}

export async function executeConfirmedMerchantAction(input: Readonly<{
  worldSeed:string;
  homeHubId:HubId;
  sourceDecisionReceiptId:string;
  consent?:EditorialConsent;
  failureInjection?:"after_epoch_effect"|"before_effect_readback"|"before_memory_commit";
}>): Promise<ConfirmedMerchantActionResult> {
  assertPin();
  if (!input.worldSeed || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(input.sourceDecisionReceiptId)) throw new Error("NPC_ACTION_EXECUTION_INPUT_INVALID");
  const npcId = npcIdentity(input.homeHubId);
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const current = (await tx.select().from(aurionNpcStates).where(eq(aurionNpcStates.npcId,npcId)).limit(1).for("update"))[0];
    if (!current) throw new Error("NPC_ACTION_SOURCE_STATE_REQUIRED");

    const existing = (await tx.select().from(aurionNpcActionReceipts).where(eq(aurionNpcActionReceipts.sourceDecisionReceiptId,input.sourceDecisionReceiptId)).limit(1))[0];
    if (existing) return readPersistedAction(tx,existing);

    const source = (await tx.select().from(aurionNpcDecisionReceipts).where(and(eq(aurionNpcDecisionReceipts.id,input.sourceDecisionReceiptId),eq(aurionNpcDecisionReceipts.npcId,npcId))).limit(1))[0];
    if (!source) throw new Error("NPC_ACTION_SOURCE_RECEIPT_REQUIRED");
    if (source.resolutionIndex !== current.lastResolutionIndex) throw new Error("NPC_ACTION_SOURCE_STALE");
    const confirmed = verifyConfirmedNpcDecision(source.observationIdsJson,{...source,receiptId:source.id});
    if (confirmed.authority.sourceRevision !== pin.sourceRevision || confirmed.authority.sourceSha256 !== pin.sourceSha256) throw new Error("NPC_ACTION_SOURCE_CAPSULE_DRIFT");

    const locked = await lockedContext(tx,input.homeHubId,confirmed);
    const context = withWorldSeed(locked.context,input.worldSeed);
    const planned = planMerchantAction(context);
    if (planned.status === "blocked") return Object.freeze({status:"blocked" as const,code:planned.code,replanHash:planned.replanHash});

    const consent = await persistConsent(tx,source.id,planned.intent.id,npcId,input.consent);
    if (consent.verdict === "DENY") {
      return Object.freeze({status:"denied" as const,consentReceiptId:consent.id,intentId:planned.intent.id});
    }
    const lease = await persistedLease(tx,planned.proposedLease);

    const validated = validateMerchantAction({context,intent:planned.intent,lease});
    if (validated.status !== "validated") throw new Error(`NPC_ACTION_REVALIDATION_BLOCKED:${validated.code}`);
    assertReceiptBoundEffects(validated);

    const originState = verifyEpochRow(locked.origin);
    const nextMarketVersion = locked.origin.marketVersion + 1;
    const nextPolityVersion = locked.origin.polityVersion + 1;
    const nextMarket = validated.resolution.market;
    const nextMarketHash = merchantMarketStateHash(nextMarket);
    const nextInventory = Object.freeze({
      ownerId: originState.inventory.ownerId,
      entries: Object.freeze(originState.inventory.entries.map(entry => Object.freeze({ ...entry, quantity: nextMarket.stock[entry.itemId] }))),
      stateHash: "",
    }) as MerchantInventoryEvidence;
    const nextInventoryHash = merchantInventoryStateHash({ownerId:nextInventory.ownerId,market:nextMarket,entries:nextInventory.entries});
    const persistedInventory = Object.freeze({ ...nextInventory, stateHash:nextInventoryHash });
    const nextPolityEvidenceHash = merchantPolityStateHash({polityId:locked.origin.polityId,version:nextPolityVersion,stability:validated.requests.polityRequest.stability});
    const successorNpcReceiptId = `npc_${npcHash([NPC_LIFE_RECEIPT_VERSION,npcId,validated.requests.npcRequest.resolutionIndex]).slice(0,56)}`;
    const successorWorldReceiptId = worldRowId(validated.requests.worldRequest.regionId,validated.requests.worldRequest.resolutionIndex);
    const successorPolity = resolvePolityState(validated.requests.polityRequest);

    const actionRow = {
      id:validated.receipt.id, receiptHash:validated.receipt.receiptHash, npcId, resolutionIndex:validated.receipt.resolutionIndex,
      sourceDecisionReceiptId:source.id, sourceDecisionSha256:validated.receipt.sourceDecision.receiptSha256,
      sourcePlanHash:validated.receipt.sourceDecision.planHash, sourceGoal:validated.receipt.sourceDecision.goal,
      sourceRevision:validated.receipt.authority.sourceRevision, sourceSha256:validated.receipt.authority.sourceSha256,
      capsuleManifestSha256:pin.manifestSha256, intentId:validated.intent.id, intentHash:validated.intent.intentHash, leaseId:lease.id,
      effectsHash:validated.receipt.effectsHash, effectSetJson:stableCatalogStringify(validated.requests),
      expectedMarketVersion:validated.receipt.expectedEpoch.marketVersion, expectedMarketHash:validated.receipt.marketStateHash,
      expectedPolityVersion:validated.receipt.expectedEpoch.polityVersion, expectedPolityHash:validated.receipt.polityStateHash,
      expectedInventoryHash:validated.receipt.inventoryStateHash, expectedTargetHash:validated.receipt.target.stateHash,
      consentReceiptId:consent.id, successorNpcReceiptId, successorWorldReceiptId, successorPolityHash:successorPolity.reactionHash,
      successorMarketHash:nextMarketHash, successorInventoryHash:nextInventoryHash, receiptJson:stableCatalogStringify(validated.receipt),
    };
    await tx.insert(aurionNpcActionReceipts).values(actionRow);
    const storedAction = (await tx.select().from(aurionNpcActionReceipts).where(eq(aurionNpcActionReceipts.id,validated.receipt.id)).limit(1))[0];
    if (!storedAction || storedAction.receiptHash !== validated.receipt.receiptHash || storedAction.effectsHash !== validated.receipt.effectsHash) throw new Error("NPC_ACTION_RECEIPT_READBACK_MISMATCH");

    for (const epoch of locked.rows) {
      const common = { marketVersion:nextMarketVersion, sourceRevision:pin.sourceRevision, sourceSha256:pin.sourceSha256 };
      if (epoch.hubId === locked.origin.hubId) {
        await tx.update(aurionNpcActionEpochStates).set({ ...common, marketJson:stableCatalogStringify(nextMarket), marketHash:nextMarketHash, inventoryJson:stableCatalogStringify(persistedInventory), inventoryHash:nextInventoryHash, polityVersion:nextPolityVersion, polityStability:validated.requests.polityRequest.stability, polityStateHash:nextPolityEvidenceHash }).where(eq(aurionNpcActionEpochStates.hubId,epoch.hubId));
      } else {
        await tx.update(aurionNpcActionEpochStates).set(common).where(eq(aurionNpcActionEpochStates.hubId,epoch.hubId));
      }
    }
    if (input.failureInjection === "after_epoch_effect" && process.env.AURION_NPC_ACTION_E2E === "1") throw new Error("AIM293_FORCED_AFTER_EFFECT_1");

    const npcEffect = await persistNpcSuccessor(tx,current,confirmed,validated.requests.npcRequest);
    const worldEffect = await persistWorld(tx,validated.requests.worldRequest);
    const polityEffect = await persistPolity(tx,validated.requests.polityRequest);

    if (input.failureInjection === "before_effect_readback" && process.env.AURION_NPC_ACTION_E2E === "1") throw new Error("AIM293_FORCED_BEFORE_READBACK");

    const epochReadback = (await tx.select().from(aurionNpcActionEpochStates).where(eq(aurionNpcActionEpochStates.hubId,locked.origin.hubId)).limit(1))[0];
    if (!epochReadback || epochReadback.marketVersion !== nextMarketVersion || epochReadback.marketHash !== nextMarketHash || epochReadback.inventoryHash !== nextInventoryHash || epochReadback.polityVersion !== nextPolityVersion || epochReadback.polityStateHash !== nextPolityEvidenceHash) throw new Error("NPC_ACTION_EFFECT_EPOCH_READBACK_MISMATCH");
    const readbackPayload = {
      version:ACTION_READBACK_VERSION, actionReceiptId:validated.receipt.id, effectsHash:validated.receipt.effectsHash,
      npcReceiptId:npcEffect.row.id, npcDecisionHash:npcEffect.row.decisionHash,
      worldReceiptId:worldEffect.row.id, worldReactionHash:worldEffect.row.reactionHash,
      polityId:polityEffect.polityId, polityStateHash:nextPolityEvidenceHash,
      marketStateHash:nextMarketHash, inventoryStateHash:nextInventoryHash, sourceRevision:pin.sourceRevision,
    };
    const readbackHash = npcHash(readbackPayload);
    const readbackId = `narb_${readbackHash.slice(0,55)}`;
    await tx.insert(aurionNpcActionEffectReadbacks).values({ id:readbackId, actionReceiptId:validated.receipt.id, effectsHash:validated.receipt.effectsHash, npcReceiptId:npcEffect.row.id, npcDecisionHash:npcEffect.row.decisionHash, worldReceiptId:worldEffect.row.id, worldReactionHash:worldEffect.row.reactionHash, polityId:polityEffect.polityId, polityStateHash:nextPolityEvidenceHash, marketStateHash:nextMarketHash, inventoryStateHash:nextInventoryHash, sourceRevision:pin.sourceRevision, readbackHash, readbackJson:stableCatalogStringify(readbackPayload) });
    const readback = (await tx.select().from(aurionNpcActionEffectReadbacks).where(eq(aurionNpcActionEffectReadbacks.id,readbackId)).limit(1))[0];
    if (!readback || readback.readbackHash !== readbackHash || readback.effectsHash !== validated.receipt.effectsHash) throw new Error("NPC_ACTION_EFFECT_READBACK_MISMATCH");

    if (input.failureInjection === "before_memory_commit" && process.env.AURION_NPC_ACTION_E2E === "1") throw new Error("AIM293_FORCED_BEFORE_MEMORY");

    const multiMemory = await appendNpcMultiMemory(tx,npcEffect.row,npcEffect.previousMemory);
    const linkPayload = { version:ACTION_MEMORY_LINK_VERSION, actionReceiptId:validated.receipt.id, effectReadbackId:readback.id, memoryReceiptId:multiMemory.row.id, npcId, resolutionIndex:npcEffect.row.resolutionIndex };
    const linkHash = npcHash(linkPayload);
    const linkId = `naml_${linkHash.slice(0,55)}`;
    await tx.insert(aurionNpcActionMemoryLinks).values({ id:linkId, actionReceiptId:validated.receipt.id, effectReadbackId:readback.id, memoryReceiptId:multiMemory.row.id, npcId, resolutionIndex:npcEffect.row.resolutionIndex, linkHash });
    const link = (await tx.select().from(aurionNpcActionMemoryLinks).where(eq(aurionNpcActionMemoryLinks.id,linkId)).limit(1))[0];
    if (!link || link.linkHash !== linkHash) throw new Error("NPC_ACTION_MEMORY_LINK_READBACK_MISMATCH");
    await tx.update(aurionNpcActionLeases).set({state:"consumed"}).where(eq(aurionNpcActionLeases.id,lease.id));

    return Object.freeze({ status:"committed" as const, actionReceiptId:validated.receipt.id, effectReadbackId:readback.id, effectReadbackHash:readback.readbackHash, resolution:validated.resolution, npc:Object.freeze({ ...npcEffect.snapshot, multiMemory:multiMemory.memory }), world:worldEffect.reaction, polity:polityEffect });
  });
}

export async function readLatestConfirmedNpcAction(npcId:string) {
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const row = (await tx.select().from(aurionNpcActionReceipts).where(eq(aurionNpcActionReceipts.npcId,npcId)).orderBy(desc(aurionNpcActionReceipts.resolutionIndex)).limit(1))[0];
    if (!row) return null;
    const readback = (await tx.select().from(aurionNpcActionEffectReadbacks).where(eq(aurionNpcActionEffectReadbacks.actionReceiptId,row.id)).limit(1))[0];
    if (!readback) throw new Error("NPC_ACTION_CONFIRMED_READBACK_REQUIRED");
    return Object.freeze({ version:"aurion-public-npc-action.v1" as const, npcId, actionReceiptId:row.id, resolutionIndex:row.resolutionIndex, action:parsed<MerchantActionReceipt>(row.receiptJson,"NPC_ACTION_RECEIPT_JSON_INVALID").action, effectsHash:row.effectsHash, readbackHash:readback.readbackHash, sourceRevision:row.sourceRevision });
  });
}
