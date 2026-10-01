import { canonicalSha256 } from "../shared/aurionCanonicalHash";

export const AURION_INVENTORY_TRANSACTION_RULESET_VERSION = "aurion.inventory.transaction.v1" as const;
export const aurionInventoryOperations = ["merge", "split", "consume"] as const;
export type AurionInventoryOperation = (typeof aurionInventoryOperations)[number];
export const aurionInventoryRecordVersions = ["legacy", "aurion_v2"] as const;
export type AurionInventoryRecordVersion = (typeof aurionInventoryRecordVersions)[number];

const exactPattern = /^(0|[1-9][0-9]*)$/;
const tokenPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const idempotencyKeyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type AurionInventoryStack = Readonly<{
  id: string;
  version: AurionInventoryRecordVersion;
  definitionId: string;
  provenanceHash: string;
  mergeKey: string;
  quantityExact: string;
  maxQuantityExact: string;
}>;

export type AurionInventoryState = Readonly<{
  ownerUserId: number;
  revisionExact: string;
  stacks: readonly AurionInventoryStack[];
}>;

type MergeCommand = Readonly<{
  operation: "merge";
  sourceStackId: string;
  targetStackId: string;
  quantityExact: string;
}>;

type SplitCommand = Readonly<{
  operation: "split";
  sourceStackId: string;
  quantityExact: string;
}>;

type ConsumeCommand = Readonly<{
  operation: "consume";
  sourceStackId: string;
  quantityExact: string;
}>;

export type AurionInventoryCommand = MergeCommand | SplitCommand | ConsumeCommand;

export type AurionInventoryReceipt = Readonly<{
  receiptId: string;
  idempotencyKey: string;
  commandHash: string;
  beforeStateHash: string;
  afterStateHash: string;
  operation: AurionInventoryOperation;
  after: AurionInventoryState;
  resultHash: string;
  ruleSetVersion: typeof AURION_INVENTORY_TRANSACTION_RULESET_VERSION;
}>;

export type AurionInventoryTransactionResult = Readonly<{
  status: "applied" | "replay";
  effectApplied: boolean;
  state: AurionInventoryState;
  receipt: AurionInventoryReceipt;
}>;

function token(value: unknown, label: string): string {
  if (typeof value !== "string" || !tokenPattern.test(value)) throw new Error(`${label}_INVALID`);
  return value;
}

function idempotencyToken(value: unknown, label: string): string {
  if (typeof value !== "string" || !idempotencyKeyPattern.test(value)) throw new Error(`${label}_INVALID`);
  return value;
}

function exact(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !exactPattern.test(value)) throw new Error(`${label}_INVALID`);
  return BigInt(value);
}

function userId(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error("OWNER_USER_ID_INVALID");
  return value as number;
}

function canonicalStack(stack: AurionInventoryStack): AurionInventoryStack {
  const id = token(stack.id, "STACK_ID");
  const version = stack.version;
  if (!aurionInventoryRecordVersions.includes(version)) throw new Error("STACK_VERSION_INVALID");
  const definitionId = token(stack.definitionId, "DEFINITION_ID");
  const provenanceHash = token(stack.provenanceHash, "PROVENANCE_HASH");
  const mergeKey = token(stack.mergeKey, "MERGE_KEY");
  const quantity = exact(stack.quantityExact, "STACK_QUANTITY");
  const maximum = exact(stack.maxQuantityExact, "STACK_CAPACITY");
  if (maximum < 1n || quantity < 1n || quantity > maximum) throw new Error("STACK_QUANTITY_OUT_OF_RANGE");
  return Object.freeze({
    id,
    version,
    definitionId,
    provenanceHash,
    mergeKey,
    quantityExact: quantity.toString(10),
    maxQuantityExact: maximum.toString(10),
  });
}

function canonicalState(state: AurionInventoryState): AurionInventoryState {
  const ownerUserId = userId(state.ownerUserId);
  const revision = exact(state.revisionExact, "REVISION");
  const seen = new Set<string>();
  const stacks = state.stacks.map(canonicalStack).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  for (const stack of stacks) {
    if (seen.has(stack.id)) throw new Error("STACK_ID_DUPLICATE");
    seen.add(stack.id);
  }
  return Object.freeze({ ownerUserId, revisionExact: revision.toString(10), stacks: Object.freeze(stacks) });
}

function normalizeCommand(command: AurionInventoryCommand): AurionInventoryCommand {
  if (command.operation === "merge") {
    const sourceStackId = token(command.sourceStackId, "SOURCE_STACK_ID");
    const targetStackId = token(command.targetStackId, "TARGET_STACK_ID");
    if (sourceStackId === targetStackId) throw new Error("MERGE_SELF_REFERENCE");
    const quantity = exact(command.quantityExact, "MERGE_QUANTITY");
    if (quantity < 1n) throw new Error("MERGE_QUANTITY_INVALID");
    return Object.freeze({ operation: "merge", sourceStackId, targetStackId, quantityExact: quantity.toString(10) });
  }
  const sourceStackId = token(command.sourceStackId, "SOURCE_STACK_ID");
  const quantity = exact(command.quantityExact, command.operation === "split" ? "SPLIT_QUANTITY" : "CONSUME_QUANTITY");
  if (quantity < 1n) throw new Error(`${command.operation.toUpperCase()}_QUANTITY_INVALID`);
  return Object.freeze({ operation: command.operation, sourceStackId, quantityExact: quantity.toString(10) });
}

export function aurionInventoryStateHash(state: AurionInventoryState): string {
  return canonicalSha256({ domain: "aurion.inventory.state.v1", state: canonicalState(state) });
}

function commandHash(command: AurionInventoryCommand): string {
  return canonicalSha256({
    domain: "aurion.inventory.command.v1",
    ruleSetVersion: AURION_INVENTORY_TRANSACTION_RULESET_VERSION,
    command: normalizeCommand(command),
  });
}

function replaceStacks(state: AurionInventoryState, replacements: readonly AurionInventoryStack[]): AurionInventoryState {
  const byId = new Map(replacements.map(stack => [stack.id, stack]));
  const nextRevision = (BigInt(state.revisionExact) + 1n).toString(10);
  return canonicalState({ ...state, revisionExact: nextRevision, stacks: [...byId.values()] });
}

function receiptFor(input: Readonly<{ idempotencyKey: string; command: AurionInventoryCommand; before: AurionInventoryState; after: AurionInventoryState }>): AurionInventoryReceipt {
  const idempotencyKey = idempotencyToken(input.idempotencyKey, "IDEMPOTENCY_KEY");
  const commandDigest = commandHash(input.command);
  const beforeStateHash = aurionInventoryStateHash(input.before);
  const afterStateHash = aurionInventoryStateHash(input.after);
  const resultHash = canonicalSha256({
    domain: "aurion.inventory.result.v1",
    operation: input.command.operation,
    commandHash: commandDigest,
    beforeStateHash,
    afterStateHash,
  });
  return Object.freeze({
    receiptId: `invtx:${resultHash.slice(7, 55)}`,
    idempotencyKey,
    commandHash: commandDigest,
    beforeStateHash,
    afterStateHash,
    operation: input.command.operation,
    after: input.after,
    resultHash,
    ruleSetVersion: AURION_INVENTORY_TRANSACTION_RULESET_VERSION,
  });
}

function resolveApplied(before: AurionInventoryState, command: AurionInventoryCommand): AurionInventoryState {
  const state = canonicalState(before);
  const normalized = normalizeCommand(command);
  const stacks = new Map(state.stacks.map(stack => [stack.id, stack]));
  const source = stacks.get(normalized.sourceStackId);
  if (!source) throw new Error("SOURCE_STACK_NOT_FOUND");

  if (normalized.operation === "merge") {
    const target = stacks.get(normalized.targetStackId);
    if (!target) throw new Error("TARGET_STACK_NOT_FOUND");
    if (source.mergeKey !== target.mergeKey || source.definitionId !== target.definitionId || source.provenanceHash !== target.provenanceHash) {
      throw new Error("STACKS_NOT_COMPATIBLE");
    }
    const quantity = exact(normalized.quantityExact, "MERGE_QUANTITY");
    const sourceQuantity = exact(source.quantityExact, "SOURCE_QUANTITY");
    const targetQuantity = exact(target.quantityExact, "TARGET_QUANTITY");
    const targetCapacity = exact(target.maxQuantityExact, "TARGET_CAPACITY");
    if (quantity > sourceQuantity) throw new Error("MERGE_SOURCE_INSUFFICIENT");
    if (targetQuantity + quantity > targetCapacity) throw new Error("MERGE_CAPACITY_EXCEEDED");

    const nextSourceQuantity = sourceQuantity - quantity;
    stacks.set(target.id, { ...target, quantityExact: (targetQuantity + quantity).toString(10) });
    if (nextSourceQuantity === 0n) stacks.delete(source.id);
    else stacks.set(source.id, { ...source, quantityExact: nextSourceQuantity.toString(10) });
    return replaceStacks(state, [...stacks.values()]);
  }

  const quantity = exact(normalized.quantityExact, normalized.operation === "split" ? "SPLIT_QUANTITY" : "CONSUME_QUANTITY");
  const sourceQuantity = exact(source.quantityExact, "SOURCE_QUANTITY");
  if (quantity > sourceQuantity) {
    throw new Error(normalized.operation === "split" ? "SPLIT_SOURCE_INSUFFICIENT" : "CONSUME_SOURCE_INSUFFICIENT");
  }

  if (normalized.operation === "split") {
    if (quantity >= sourceQuantity) throw new Error("SPLIT_REQUIRES_TWO_NON_EMPTY_STACKS");
    const splitId = canonicalSha256({
      domain: "aurion.inventory.split-id.v1",
      sourceStackId: source.id,
      sourceStateHash: aurionInventoryStateHash(state),
      command: normalized,
    }).slice(7);
    if (stacks.has(splitId)) throw new Error("SPLIT_ID_COLLISION");
    stacks.set(source.id, { ...source, quantityExact: (sourceQuantity - quantity).toString(10) });
    stacks.set(splitId, { ...source, id: splitId, quantityExact: quantity.toString(10) });
    return replaceStacks(state, [...stacks.values()]);
  }

  if (quantity === sourceQuantity) stacks.delete(source.id);
  else stacks.set(source.id, { ...source, quantityExact: (sourceQuantity - quantity).toString(10) });
  return replaceStacks(state, [...stacks.values()]);
}

export function resolveAurionInventoryTransaction(input: Readonly<{
  before: AurionInventoryState;
  command: AurionInventoryCommand;
  idempotencyKey: string;
  priorReceipt?: AurionInventoryReceipt;
}>): AurionInventoryTransactionResult {
  const before = canonicalState(input.before);
  const normalizedCommand = normalizeCommand(input.command);
  const normalizedKey = idempotencyToken(input.idempotencyKey, "IDEMPOTENCY_KEY");

  if (input.priorReceipt) {
    const expectedCommandHash = commandHash(normalizedCommand);
    const expectedResultHash = canonicalSha256({
      domain: "aurion.inventory.result.v1",
      operation: normalizedCommand.operation,
      commandHash: expectedCommandHash,
      beforeStateHash: input.priorReceipt.beforeStateHash,
      afterStateHash: input.priorReceipt.afterStateHash,
    });
    if (
      input.priorReceipt.idempotencyKey !== normalizedKey ||
      input.priorReceipt.commandHash !== expectedCommandHash ||
      input.priorReceipt.operation !== normalizedCommand.operation ||
      input.priorReceipt.resultHash !== expectedResultHash
    ) {
      throw new Error("INVENTORY_IDEMPOTENCY_CONFLICT");
    }
    return Object.freeze({ status: "replay", effectApplied: false, state: input.priorReceipt.after, receipt: input.priorReceipt });
  }

  const after = resolveApplied(before, normalizedCommand);
  return Object.freeze({
    status: "applied",
    effectApplied: true,
    state: after,
    receipt: receiptFor({ idempotencyKey: normalizedKey, command: normalizedCommand, before, after }),
  });
}

export function reconcileAurionInventoryReplay(existing: AurionInventoryReceipt, candidate: AurionInventoryReceipt): Readonly<{ replay: true; receipt: AurionInventoryReceipt }> {
  if (
    existing.idempotencyKey !== candidate.idempotencyKey ||
    existing.commandHash !== candidate.commandHash ||
    existing.resultHash !== candidate.resultHash ||
    existing.afterStateHash !== candidate.afterStateHash ||
    existing.receiptId !== candidate.receiptId
  ) {
    throw new Error("INVENTORY_IDEMPOTENCY_CONFLICT");
  }
  return Object.freeze({ replay: true, receipt: existing });
}
