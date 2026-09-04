import { createHash } from "node:crypto";
import {
  SCOPED_MASTERY_RULESET_VERSION,
  canonicalScopedMasteryKey,
  masteryKeys,
  resolveCoupledMasteries,
  type ScopedMasteryEvent,
  type ScopedMasteryKey,
  type ScopedMasteryState,
} from "./scopedMasteryProtocol";

export const AURION_PROFESSION_MASTERY_RULESET_VERSION = "aurion-profession-mastery.v1" as const;
export const AURION_PROFESSION_MASTERY_CONTENT_VERSION = "aurion-profession-mastery-content.v1" as const;

export const aurionProfessionIds = [
  "fishing",
  "mining",
  "herbalism",
  "alchemy",
  "enchanting",
  "carpentry",
] as const;
export type AurionProfessionId = (typeof aurionProfessionIds)[number];
export type ProfessionActivityKind = "craft" | "gather";

export type ProfessionResourceInput = Readonly<{
  originId: string;
  itemId: string;
  quantityExact: string;
}>;

export type BonusYieldCarry = Readonly<{
  masteryLevelExact: string;
  excessLevelsExact: string;
  guaranteedBonusBatchesExact: string;
  bonusChanceBps: number;
  expectedBonusMilliExact: string;
}>;

export type ProfessionYieldOutcome = Readonly<{
  baseQuantityExact: string;
  baseBatchesExact: "1";
  guaranteedBonusBatchesExact: string;
  chanceBonusApplied: boolean;
  bonusBatchesExact: string;
  totalBatchesExact: string;
  totalQuantityExact: string;
  bonusChanceBps: number;
  rollBps: number;
}>;

export type ProfessionMasteryModifiers = Readonly<{
  qualityScoreExact: string;
  efficiencyBps: number;
  speedBps: number;
  stabilityBps: number;
  errorChanceBps: number;
  rareFindBonusBps: number;
  qualityPowerBps: number;
}>;

export type ProfessionOperationInput = Readonly<{
  operationId: string;
  actorId: string;
  professionId: AurionProfessionId;
  activityKind: ProfessionActivityKind;
  activityId: string;
  outputItemId: string;
  baseOutputQuantityExact: string;
  masteryLevelExact: string;
  qualityScoreExact: string;
  serverSeed: string;
  sourceReceiptId: string;
  sourceEvidenceDigest: string;
  resolutionIndex: number;
  activeDurationTicks: number;
  repetitionStreak: number;
  distinctContextCount: number;
  resources: readonly ProfessionResourceInput[];
}>;

export type ProfessionEconomicControls = Readonly<{
  inputConsumption: "consume_once_atomically";
  replayPolicy: "return_existing_receipt";
  bonusOutputsGrantMasteryXp: false;
  bonusOutputsCarrySourceOperation: true;
  outputRepresentation: "exact_quantity_with_lazy_origin_range";
  recursiveSalvageMasteryCredit: false;
}>;

export type ProfessionOperationEnvelope = Readonly<{
  schemaVersion: 1;
  operationId: string;
  actorId: string;
  professionId: AurionProfessionId;
  activityKind: ProfessionActivityKind;
  activityId: string;
  outputItemId: string;
  resolutionIndex: number;
  sourceReceiptId: string;
  sourceEvidenceDigest: string;
  resourceInputs: readonly ProfessionResourceInput[];
  resourceDigest: string;
  masteryKeys: readonly ScopedMasteryKey[];
  yield: ProfessionYieldOutcome;
  modifiers: ProfessionMasteryModifiers;
  economicControls: ProfessionEconomicControls;
  outputOriginNamespace: string;
  receiptId: string;
  commitHash: string;
}>;

export type ProfessionMasteryXp = Readonly<{
  professionXpExact: string;
  activityXpExact: string;
  itemXpExact: string;
  qualityGainExact: string;
}>;

const safeId = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const safeToken = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const hash = (parts: readonly string[]): string => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");

function exact(value: string, field: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${field} must be a canonical non-negative decimal`);
  return BigInt(value);
}

function positiveExact(value: string, field: string): bigint {
  const parsed = exact(value, field);
  if (parsed < 1n) throw new Error(`${field} must be positive`);
  return parsed;
}

function assertProfession(value: string): asserts value is AurionProfessionId {
  if (!(aurionProfessionIds as readonly string[]).includes(value)) throw new Error("unknown Aurion profession");
}

function boundedRatioBps(level: bigint, maximumBonusBps: bigint, halfSaturation: bigint): number {
  return Number(10_000n + (maximumBonusBps * level) / (level + halfSaturation));
}

/**
 * Owner rule, represented exactly for arbitrary levels:
 * E = max(0, level - 49) / 1000 bonus output batches.
 */
export function resolveBonusYieldCarry(masteryLevelExact: string): BonusYieldCarry {
  const level = positiveExact(masteryLevelExact, "masteryLevelExact");
  const excess = level > 49n ? level - 49n : 0n;
  const guaranteed = excess / 1000n;
  const remainderMilli = excess % 1000n;
  return Object.freeze({
    masteryLevelExact: level.toString(10),
    excessLevelsExact: excess.toString(10),
    guaranteedBonusBatchesExact: guaranteed.toString(10),
    bonusChanceBps: Number(remainderMilli * 10n),
    expectedBonusMilliExact: excess.toString(10),
  });
}

export function resolveProfessionYield(input: Readonly<{
  masteryLevelExact: string;
  baseQuantityExact: string;
  rollBps: number;
}>): ProfessionYieldOutcome {
  if (!Number.isSafeInteger(input.rollBps) || input.rollBps < 0 || input.rollBps > 9_999) throw new Error("rollBps must be an integer from 0 through 9999");
  const baseQuantity = positiveExact(input.baseQuantityExact, "baseQuantityExact");
  const carry = resolveBonusYieldCarry(input.masteryLevelExact);
  const chanceBonusApplied = input.rollBps < carry.bonusChanceBps;
  const bonusBatches = BigInt(carry.guaranteedBonusBatchesExact) + (chanceBonusApplied ? 1n : 0n);
  const totalBatches = 1n + bonusBatches;
  return Object.freeze({
    baseQuantityExact: baseQuantity.toString(10),
    baseBatchesExact: "1",
    guaranteedBonusBatchesExact: carry.guaranteedBonusBatchesExact,
    chanceBonusApplied,
    bonusBatchesExact: bonusBatches.toString(10),
    totalBatchesExact: totalBatches.toString(10),
    totalQuantityExact: (baseQuantity * totalBatches).toString(10),
    bonusChanceBps: carry.bonusChanceBps,
    rollBps: input.rollBps,
  });
}

/** Unbounded exact learning, bounded gameplay projections. */
export function resolveProfessionMasteryModifiers(input: Readonly<{
  masteryLevelExact: string;
  qualityScoreExact: string;
}>): ProfessionMasteryModifiers {
  const level = positiveExact(input.masteryLevelExact, "masteryLevelExact");
  const quality = exact(input.qualityScoreExact, "qualityScoreExact");
  const stabilityBps = Number(7_000n + (3_000n * level) / (level + 100n));
  const errorChanceBps = Number((2_000n * 100n) / (level + 100n));
  return Object.freeze({
    qualityScoreExact: quality.toString(10),
    efficiencyBps: boundedRatioBps(level, 2_000n, 200n),
    speedBps: boundedRatioBps(level, 4_000n, 250n),
    stabilityBps,
    errorChanceBps,
    rareFindBonusBps: Number((500n * level) / (level + 200n)),
    qualityPowerBps: Number(10_000n + (3_000n * quality) / (quality + 10_000n)),
  });
}

export function deterministicProfessionRollBps(serverSeed: string, operationId: string, lane: string): number {
  if (!serverSeed.trim() || serverSeed.length > 256 || !safeToken.test(operationId) || !safeId.test(lane)) throw new Error("invalid profession roll identity");
  const digest = createHash("sha256")
    .update([AURION_PROFESSION_MASTERY_RULESET_VERSION, serverSeed, operationId, lane].join("\u001f"), "utf8")
    .digest();
  return digest.readUInt32BE(0) % 10_000;
}

function canonicalResourceInputs(resources: readonly ProfessionResourceInput[], activityKind: ProfessionActivityKind): readonly ProfessionResourceInput[] {
  if (activityKind === "craft" && resources.length === 0) throw new Error("crafting requires consumed resource origins");
  const seenOrigins = new Set<string>();
  const canonical = resources.map(resource => {
    if (!safeToken.test(resource.originId) || !safeId.test(resource.itemId)) throw new Error("invalid profession resource identity");
    if (seenOrigins.has(resource.originId)) throw new Error("DUPLICATE_RESOURCE_ORIGIN");
    seenOrigins.add(resource.originId);
    return Object.freeze({
      originId: resource.originId,
      itemId: resource.itemId,
      quantityExact: positiveExact(resource.quantityExact, "resource quantity").toString(10),
    });
  }).sort((left, right) => compareText(left.originId, right.originId) || compareText(left.itemId, right.itemId));
  return Object.freeze(canonical);
}

export function professionMasteryKeys(input: Readonly<{
  professionId: AurionProfessionId;
  activityKind: ProfessionActivityKind;
  activityId: string;
  outputItemId: string;
}>): readonly ScopedMasteryKey[] {
  assertProfession(input.professionId);
  if (!safeId.test(input.activityId) || !safeId.test(input.outputItemId)) throw new Error("invalid profession mastery identity");
  const activityKey = input.activityKind === "craft" ? masteryKeys.recipe(input.activityId) : masteryKeys.gathering(input.activityId);
  return Object.freeze([
    masteryKeys.profession(input.professionId),
    activityKey,
    masteryKeys.item(input.outputItemId),
  ]);
}

const economicControls: ProfessionEconomicControls = Object.freeze({
  inputConsumption: "consume_once_atomically",
  replayPolicy: "return_existing_receipt",
  bonusOutputsGrantMasteryXp: false,
  bonusOutputsCarrySourceOperation: true,
  outputRepresentation: "exact_quantity_with_lazy_origin_range",
  recursiveSalvageMasteryCredit: false,
});

/**
 * Produces the deterministic commit envelope consumed by Aurion's existing
 * atomic crafting/gathering transaction. This is not a second crafting service.
 */
export function buildProfessionOperationEnvelope(input: ProfessionOperationInput): ProfessionOperationEnvelope {
  assertProfession(input.professionId);
  if (!safeToken.test(input.operationId) || !safeId.test(input.actorId) || !safeId.test(input.activityId) || !safeId.test(input.outputItemId) || !safeToken.test(input.sourceReceiptId)) throw new Error("invalid profession operation identity");
  if (!digestPattern.test(input.sourceEvidenceDigest)) throw new Error("sourceEvidenceDigest must be SHA-256 evidence");
  if (!Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("invalid profession resolution index");
  if (!Number.isSafeInteger(input.activeDurationTicks) || input.activeDurationTicks < 1 || !Number.isSafeInteger(input.repetitionStreak) || input.repetitionStreak < 0 || !Number.isSafeInteger(input.distinctContextCount) || input.distinctContextCount < 0) throw new Error("invalid profession activity metrics");

  const resourceInputs = canonicalResourceInputs(input.resources, input.activityKind);
  const resourceDigest = hash(resourceInputs.flatMap(resource => [resource.originId, resource.itemId, resource.quantityExact]));
  const keys = professionMasteryKeys(input);
  const rollBps = deterministicProfessionRollBps(input.serverSeed, input.operationId, "yield");
  const yieldOutcome = resolveProfessionYield({ masteryLevelExact: input.masteryLevelExact, baseQuantityExact: input.baseOutputQuantityExact, rollBps });
  const modifiers = resolveProfessionMasteryModifiers({ masteryLevelExact: input.masteryLevelExact, qualityScoreExact: input.qualityScoreExact });
  const operationDigest = hash([
    AURION_PROFESSION_MASTERY_RULESET_VERSION,
    AURION_PROFESSION_MASTERY_CONTENT_VERSION,
    input.operationId,
    input.actorId,
    input.professionId,
    input.activityKind,
    input.activityId,
    input.outputItemId,
    input.sourceReceiptId,
    input.sourceEvidenceDigest,
    String(input.resolutionIndex),
    resourceDigest,
    input.masteryLevelExact,
    input.qualityScoreExact,
    yieldOutcome.baseQuantityExact,
    yieldOutcome.totalQuantityExact,
    yieldOutcome.bonusBatchesExact,
    String(yieldOutcome.rollBps),
    ...keys.map(canonicalScopedMasteryKey).sort(compareText),
  ]);
  const receiptId = `profession_${operationDigest.slice(0, 48)}`;
  const outputOriginNamespace = `profession_output_${operationDigest.slice(0, 40)}`;
  const commitHash = hash([
    operationDigest,
    receiptId,
    outputOriginNamespace,
    economicControls.inputConsumption,
    economicControls.replayPolicy,
    economicControls.outputRepresentation,
  ]);

  return Object.freeze({
    schemaVersion: 1,
    operationId: input.operationId,
    actorId: input.actorId,
    professionId: input.professionId,
    activityKind: input.activityKind,
    activityId: input.activityId,
    outputItemId: input.outputItemId,
    resolutionIndex: input.resolutionIndex,
    sourceReceiptId: input.sourceReceiptId,
    sourceEvidenceDigest: input.sourceEvidenceDigest,
    resourceInputs,
    resourceDigest,
    masteryKeys: keys,
    yield: yieldOutcome,
    modifiers,
    economicControls,
    outputOriginNamespace,
    receiptId,
    commitHash,
  });
}

/** Lazily derives unique output origins without allocating an unbounded array. */
export function professionOutputOriginAt(envelope: ProfessionOperationEnvelope, outputIndexExact: string): string {
  const index = exact(outputIndexExact, "outputIndexExact");
  const total = positiveExact(envelope.yield.totalQuantityExact, "totalQuantityExact");
  if (index >= total) throw new Error("output index outside profession envelope");
  return `profession_item_${hash([envelope.commitHash, envelope.outputOriginNamespace, index.toString(10)]).slice(0, 48)}`;
}

function exactXp(input: ProfessionMasteryXp): ProfessionMasteryXp {
  return Object.freeze({
    professionXpExact: exact(input.professionXpExact, "professionXpExact").toString(10),
    activityXpExact: exact(input.activityXpExact, "activityXpExact").toString(10),
    itemXpExact: exact(input.itemXpExact, "itemXpExact").toString(10),
    qualityGainExact: exact(input.qualityGainExact, "qualityGainExact").toString(10),
  });
}

export function buildProfessionMasteryEvents(
  envelope: ProfessionOperationEnvelope,
  xp: ProfessionMasteryXp,
  activity: Pick<ProfessionOperationInput, "activeDurationTicks" | "repetitionStreak" | "distinctContextCount">,
): readonly ScopedMasteryEvent[] {
  const amounts = exactXp(xp);
  const amountFor = (key: ScopedMasteryKey): string => key.scopeType === "profession"
    ? amounts.professionXpExact
    : key.scopeType === "item"
      ? amounts.itemXpExact
      : amounts.activityXpExact;
  return Object.freeze(envelope.masteryKeys.map(key => Object.freeze({
    receiptId: envelope.receiptId,
    idempotencyKey: `mastery_${hash([envelope.operationId, canonicalScopedMasteryKey(key)]).slice(0, 48)}`,
    resolutionIndex: envelope.resolutionIndex,
    key,
    amountExact: amountFor(key),
    useCountExact: "1",
    qualityDeltaExact: key.scopeType === "item" ? amounts.qualityGainExact : "0",
    contextMetricsExact: Object.freeze({
      operations: "1",
      base_output_quantity: envelope.yield.baseQuantityExact,
      total_output_quantity: envelope.yield.totalQuantityExact,
      bonus_batches: envelope.yield.bonusBatchesExact,
    }),
    serverValidated: true,
    activeDurationTicks: activity.activeDurationTicks,
    repetitionStreak: activity.repetitionStreak,
    distinctContextCount: activity.distinctContextCount,
    ruleSetVersion: SCOPED_MASTERY_RULESET_VERSION,
    contentVersion: AURION_PROFESSION_MASTERY_CONTENT_VERSION,
  })));
}

export function resolveProfessionMasteryOperation(input: Readonly<{
  operation: ProfessionOperationInput;
  xp: ProfessionMasteryXp;
  currentByKey?: Readonly<Record<string, ScopedMasteryState>>;
}>): Readonly<{
  envelope: ProfessionOperationEnvelope;
  masteryEvents: readonly ScopedMasteryEvent[];
  masteryStates: readonly ScopedMasteryState[];
}> {
  const envelope = buildProfessionOperationEnvelope(input.operation);
  const masteryEvents = buildProfessionMasteryEvents(envelope, input.xp, input.operation);
  const masteryStates = resolveCoupledMasteries({
    actorId: envelope.actorId,
    keys: envelope.masteryKeys,
    events: masteryEvents,
    currentByKey: input.currentByKey,
  });
  return Object.freeze({ envelope, masteryEvents, masteryStates });
}

export type LegacyWasdSkillId = "woodcutting" | "mining" | "fishing" | "crafting" | "combat";

/** Preserves legacy WASD skills as parents/contexts inside the finer scoped hierarchy. */
export function legacyWasdSkillMasteryKeys(skillId: LegacyWasdSkillId, professionId?: AurionProfessionId): readonly ScopedMasteryKey[] {
  if (skillId === "woodcutting") return Object.freeze([masteryKeys.gathering("woodcutting"), masteryKeys.profession(professionId ?? "carpentry")]);
  if (skillId === "mining") return Object.freeze([masteryKeys.gathering("mining"), masteryKeys.profession("mining")]);
  if (skillId === "fishing") return Object.freeze([masteryKeys.gathering("fishing"), masteryKeys.profession("fishing")]);
  if (skillId === "crafting") {
    if (!professionId) throw new Error("legacy crafting migration requires a concrete profession");
    return Object.freeze([masteryKeys.action("crafting"), masteryKeys.profession(professionId)]);
  }
  return Object.freeze([masteryKeys.combat("general")]);
}
