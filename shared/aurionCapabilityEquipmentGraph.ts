import { browserCanonicalSha256 } from "./aurionBrowserHash";

export const AURION_ACEG_PROTOCOL = "aurion.capability-equipment-graph.v1" as const;
export const ACEG_MAX_LADDER_PASSES = 16;
export const ACEG_OVER_EQUIP_FLOOR_BPS = 1_000;
export const ACEG_FULL_EFFECTIVENESS_BPS = 10_000;

const SHA256 = /^sha256:[a-f0-9]{64}$/;

export type AcegCapability =
  | "strength"
  | "agility"
  | "stamina"
  | "intelligence"
  | "perception"
  | "willpower"
  | "medicine"
  | "treatment"
  | "engineering"
  | "politics"
  | "bureaucracy"
  | "knowledge"
  | string;

export type AcegSourceKind =
  | "permanent"
  | "skill"
  | "profession"
  | "equipment"
  | "implant"
  | "buff";

export type AcegModifier = Readonly<{
  capability: AcegCapability;
  delta: number;
}>;

export type AcegRequirement = Readonly<{
  capability: AcegCapability;
  minValue: number;
}>;

export type AcegItemDefinition = Readonly<{
  itemId: string;
  slot: string;
  modifiers: readonly AcegModifier[];
  requirements: readonly AcegRequirement[];
  overEquipPenaltyPerPointBps: number;
}>;

export type AcegBuff = Readonly<{
  buffId: string;
  modifiers: readonly AcegModifier[];
  expiresAtTick: number;
  confirmationReceiptId: string;
}>;

export type AcegImplant = Readonly<{
  implantId: string;
  modifiers: readonly AcegModifier[];
  installReceiptId: string;
}>;

export type AcegCapabilitySnapshot = Readonly<{
  entityId: string;
  tickIndex: number;
  permanentStats: readonly AcegModifier[];
  skillRanks: readonly AcegModifier[];
  professionModifiers: readonly AcegModifier[];
  implants: readonly AcegImplant[];
  buffs: readonly AcegBuff[];
}>;

export type AcegDeficit = Readonly<{
  capability: AcegCapability;
  required: number;
  actual: number;
  missing: number;
}>;

export type AcegEligibility = Readonly<{
  itemId: string;
  eligible: boolean;
  deficits: readonly AcegDeficit[];
}>;

export type AcegOverEquipEffectiveness = Readonly<{
  itemId: string;
  effectivenessBps: number;
  overEquip: boolean;
  deficits: readonly AcegDeficit[];
}>;

export type AcegEquipDecision = Readonly<{
  itemId: string;
  slot: string;
  ladderPass: number;
  retention: "eligible" | "over_equip_confirmed";
  effectivenessBps: number;
  ownershipReceiptId: string;
  confirmationReceiptId: string | null;
}>;

export type AcegResolution = Readonly<{
  protocol: typeof AURION_ACEG_PROTOCOL;
  entityId: string;
  tickIndex: number;
  capabilities: Readonly<Record<string, number>>;
  equipDecisions: readonly AcegEquipDecision[];
  sourceEvidenceHash: string;
  resolutionHash: string;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function nonEmpty(value: string, code: string): string {
  if (!value.trim()) fail(code);
  return value;
}

function int(value: number, code: string): number {
  if (!Number.isSafeInteger(value)) fail(code);
  return value;
}

function safeBigIntResult(value: bigint, code: string): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  )
    fail(code);
  return Number(value);
}

function safeAdd(left: number, right: number, code: string): number {
  return safeBigIntResult(BigInt(left) + BigInt(right), code);
}

function safeSubtract(left: number, right: number, code: string): number {
  return safeBigIntResult(BigInt(left) - BigInt(right), code);
}

function safeMultiply(left: number, right: number, code: string): number {
  return safeBigIntResult(BigInt(left) * BigInt(right), code);
}

function tick(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) fail("ACEG_TICK_INVALID");
  return value;
}

const textCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function modifier(mod: AcegModifier, code: string): AcegModifier {
  nonEmpty(mod.capability, code);
  int(mod.delta, code);
  return mod;
}

function sortModifiers(
  modifiers: readonly AcegModifier[],
  code: string
): readonly AcegModifier[] {
  return [...modifiers]
    .map(mod => modifier(mod, code))
    .sort(
      (left, right) =>
        textCompare(left.capability, right.capability) ||
        (left.delta < right.delta ? -1 : left.delta > right.delta ? 1 : 0)
    );
}

function apply(
  totals: Map<string, number>,
  modifiers: readonly AcegModifier[]
): void {
  for (const mod of modifiers)
    totals.set(
      mod.capability,
      safeAdd(
        totals.get(mod.capability) ?? 0,
        mod.delta,
        "ACEG_CAPABILITY_OVERFLOW"
      )
    );
}

function assertItemDefinition(item: AcegItemDefinition): void {
  nonEmpty(item.itemId, "ACEG_ITEM_ID_INVALID");
  nonEmpty(item.slot, "ACEG_ITEM_SLOT_INVALID");
  sortModifiers(item.modifiers, "ACEG_ITEM_MODIFIER_INVALID");
  for (const requirement of item.requirements) {
    nonEmpty(requirement.capability, "ACEG_REQUIREMENT_INVALID");
    if (
      !Number.isSafeInteger(requirement.minValue) ||
      requirement.minValue < 0
    )
      fail("ACEG_REQUIREMENT_INVALID");
  }
  if (
    !Number.isSafeInteger(item.overEquipPenaltyPerPointBps) ||
    item.overEquipPenaltyPerPointBps < 0 ||
    item.overEquipPenaltyPerPointBps > ACEG_FULL_EFFECTIVENESS_BPS
  )
    fail("ACEG_OVER_EQUIP_PENALTY_INVALID");
}

export function computeAcegCapabilities(
  snapshot: AcegCapabilitySnapshot
): Readonly<Record<string, number>> {
  nonEmpty(snapshot.entityId, "ACEG_ENTITY_INVALID");
  tick(snapshot.tickIndex);
  const totals = new Map<string, number>();
  // Canonical source order: permanent -> skill -> profession -> implant -> buff.
  apply(totals, sortModifiers(snapshot.permanentStats, "ACEG_PERMANENT_INVALID"));
  apply(totals, sortModifiers(snapshot.skillRanks, "ACEG_SKILL_INVALID"));
  apply(
    totals,
    sortModifiers(snapshot.professionModifiers, "ACEG_PROFESSION_INVALID")
  );
  const implants = [...snapshot.implants].sort((left, right) =>
    textCompare(left.implantId, right.implantId)
  );
  for (const implant of implants) {
    nonEmpty(implant.implantId, "ACEG_IMPLANT_INVALID");
    nonEmpty(implant.installReceiptId, "ACEG_IMPLANT_RECEIPT_INVALID");
    apply(totals, sortModifiers(implant.modifiers, "ACEG_IMPLANT_MODIFIER_INVALID"));
  }
  const buffs = [...snapshot.buffs].sort((left, right) =>
    textCompare(left.buffId, right.buffId)
  );
  for (const buff of buffs) {
    nonEmpty(buff.buffId, "ACEG_BUFF_INVALID");
    tick(buff.expiresAtTick);
    // Buffs wirken nur im bestaetigten fixed-tick Zustand; abgelaufene Buffs
    // werden ignoriert, unbestaetigte Buffs schlagen fail-closed fehl.
    if (!buff.confirmationReceiptId.trim()) fail("ACEG_BUFF_UNCONFIRMED");
    if (buff.expiresAtTick <= snapshot.tickIndex) continue;
    apply(totals, sortModifiers(buff.modifiers, "ACEG_BUFF_MODIFIER_INVALID"));
  }
  const capabilities: Record<string, number> = {};
  for (const key of [...totals.keys()].sort()) capabilities[key] = totals.get(key)!;
  return Object.freeze(capabilities);
}

function canonicalRequirements(
  requirements: readonly AcegRequirement[]
): readonly AcegRequirement[] {
  return Object.freeze(
    [...requirements].sort(
      (left, right) =>
        textCompare(left.capability, right.capability) ||
        (left.minValue < right.minValue ? -1 : left.minValue > right.minValue ? 1 : 0)
    )
  );
}

function collectDeficits(
  item: AcegItemDefinition,
  capabilities: Readonly<Record<string, number>>
): readonly AcegDeficit[] {
  const deficits = item.requirements
    .map(requirement => {
      const actual = capabilities[requirement.capability] ?? 0;
      if (!Number.isSafeInteger(actual)) fail("ACEG_CAPABILITY_VALUE_INVALID");
      const missing =
        actual >= requirement.minValue
          ? 0
          : safeSubtract(
              requirement.minValue,
              actual,
              "ACEG_CAPABILITY_OVERFLOW"
            );
      return Object.freeze({
        capability: requirement.capability,
        required: requirement.minValue,
        actual,
        missing,
      });
    })
    .filter(deficit => deficit.missing > 0)
    .sort((left, right) => textCompare(left.capability, right.capability));
  return Object.freeze(deficits);
}

export function resolveAcegEquipEligibility(
  item: AcegItemDefinition,
  capabilities: Readonly<Record<string, number>>
): AcegEligibility {
  assertItemDefinition(item);
  const deficits = collectDeficits(item, capabilities);
  return Object.freeze({
    itemId: item.itemId,
    eligible: deficits.length === 0,
    deficits,
  });
}

export function resolveAcegOverEquipEffectiveness(
  item: AcegItemDefinition,
  capabilities: Readonly<Record<string, number>>
): AcegOverEquipEffectiveness {
  assertItemDefinition(item);
  const deficits = collectDeficits(item, capabilities);
  const missingTotal = deficits.reduce(
    (sum, deficit) =>
      safeAdd(sum, deficit.missing, "ACEG_OVER_EQUIP_MISSING_OVERFLOW"),
    0
  );
  const penaltyBps = safeMultiply(
    missingTotal,
    item.overEquipPenaltyPerPointBps,
    "ACEG_OVER_EQUIP_PENALTY_OVERFLOW"
  );
  const effectivenessBps =
    missingTotal === 0
      ? ACEG_FULL_EFFECTIVENESS_BPS
      : Math.max(
          ACEG_OVER_EQUIP_FLOOR_BPS,
          safeSubtract(
            ACEG_FULL_EFFECTIVENESS_BPS,
            penaltyBps,
            "ACEG_OVER_EQUIP_EFFECTIVENESS_OVERFLOW"
          )
        );
  return Object.freeze({
    itemId: item.itemId,
    effectivenessBps,
    overEquip: deficits.length > 0,
    deficits,
  });
}

export type AcegResolutionInput = Readonly<{
  snapshot: AcegCapabilitySnapshot;
  catalog: readonly AcegItemDefinition[];
  ownedItems: readonly Readonly<{
    itemId: string;
    ownershipReceiptId: string;
  }>[];
  priorConfirmedEquip: readonly Readonly<{
    itemId: string;
    confirmationReceiptId: string;
  }>[];
}>;

export function resolveAcegEquipment(input: AcegResolutionInput): AcegResolution {
  const { snapshot } = input;
  nonEmpty(snapshot.entityId, "ACEG_ENTITY_INVALID");
  tick(snapshot.tickIndex);
  const catalog = new Map<string, AcegItemDefinition>();
  for (const item of input.catalog) {
    assertItemDefinition(item);
    if (catalog.has(item.itemId)) fail("ACEG_ITEM_DUPLICATE");
    catalog.set(item.itemId, item);
  }
  const receipts = new Set<string>();
  const owned = [...input.ownedItems]
    .map(entry => {
      nonEmpty(entry.itemId, "ACEG_OWNED_ITEM_INVALID");
      nonEmpty(entry.ownershipReceiptId, "ACEG_OWNERSHIP_RECEIPT_INVALID");
      if (!catalog.has(entry.itemId)) fail("ACEG_OWNED_ITEM_UNKNOWN");
      if (receipts.has(entry.ownershipReceiptId))
        fail("ACEG_RECEIPT_DUPLICATE");
      receipts.add(entry.ownershipReceiptId);
      return entry;
    })
    .sort((left, right) => textCompare(left.itemId, right.itemId));
  const ownedItemIds = new Set<string>();
  const ownershipReceiptByItem = new Map<string, string>();
  for (const entry of owned) {
    if (ownedItemIds.has(entry.itemId)) fail("ACEG_OWNED_ITEM_DUPLICATE");
    ownedItemIds.add(entry.itemId);
    ownershipReceiptByItem.set(entry.itemId, entry.ownershipReceiptId);
  }

  const priorConfirmed = new Map<string, string>();
  const priorConfirmedSlots = new Set<string>();
  for (const entry of input.priorConfirmedEquip) {
    nonEmpty(entry.itemId, "ACEG_CONFIRMED_ITEM_INVALID");
    nonEmpty(entry.confirmationReceiptId, "ACEG_CONFIRMATION_RECEIPT_INVALID");
    const item = catalog.get(entry.itemId);
    if (!item) fail("ACEG_CONFIRMED_ITEM_UNKNOWN");
    if (!ownedItemIds.has(entry.itemId)) fail("ACEG_CONFIRMED_ITEM_NOT_OWNED");
    if (priorConfirmed.has(entry.itemId)) fail("ACEG_CONFIRMED_ITEM_DUPLICATE");
    if (priorConfirmedSlots.has(item.slot)) fail("ACEG_CONFIRMED_SLOT_DUPLICATE");
    if (receipts.has(entry.confirmationReceiptId)) fail("ACEG_RECEIPT_DUPLICATE");
    receipts.add(entry.confirmationReceiptId);
    priorConfirmed.set(entry.itemId, entry.confirmationReceiptId);
    priorConfirmedSlots.add(item.slot);
  }

  const baseCapabilities = computeAcegCapabilities(snapshot);
  const equipped = new Map<string, AcegEquipDecision>();
  const occupiedSlots = new Set<string>();
  for (const [itemId, confirmationReceiptId] of [...priorConfirmed.entries()].sort(
    ([left], [right]) => textCompare(left, right)
  )) {
    const item = catalog.get(itemId)!;
    const eligibility = resolveAcegEquipEligibility(item, baseCapabilities);
    const effectiveness = resolveAcegOverEquipEffectiveness(
      item,
      baseCapabilities
    );
    equipped.set(
      itemId,
      Object.freeze({
        itemId,
        slot: item.slot,
        ladderPass: 0,
        retention: eligibility.eligible ? "eligible" : "over_equip_confirmed",
        effectivenessBps: effectiveness.effectivenessBps,
        ownershipReceiptId: ownershipReceiptByItem.get(itemId)!,
        confirmationReceiptId,
      })
    );
    occupiedSlots.add(item.slot);
  }
  let ladderPass = 0;

  // Bounded, cycle-safe laddering: equipment/implants may satisfy further
  // requirements step by step; each pass is monotonic (equip only, no unequip).
  for (;;) {
    const nextPass = ladderPass + 1;
    const totals = new Map<string, number>(Object.entries(baseCapabilities));
    for (const decision of [...equipped.values()].sort((left, right) =>
      textCompare(left.itemId, right.itemId)
    ))
      apply(totals, catalog.get(decision.itemId)!.modifiers);
    const effective: Record<string, number> = {};
    for (const key of [...totals.keys()].sort()) effective[key] = totals.get(key)!;

    let progressed = false;
    for (const entry of owned) {
      if (equipped.has(entry.itemId)) continue;
      const item = catalog.get(entry.itemId)!;
      if (occupiedSlots.has(item.slot)) continue;
      const eligibility = resolveAcegEquipEligibility(item, effective);
      if (!eligibility.eligible) continue;
      if (nextPass > ACEG_MAX_LADDER_PASSES)
        fail("ACEG_LADDER_BOUND_EXCEEDED");
      const effectiveness = resolveAcegOverEquipEffectiveness(item, effective);
      equipped.set(
        entry.itemId,
        Object.freeze({
          itemId: entry.itemId,
          slot: item.slot,
          ladderPass: nextPass,
          retention: "eligible",
          effectivenessBps: effectiveness.effectivenessBps,
          ownershipReceiptId: entry.ownershipReceiptId,
          confirmationReceiptId: null,
        })
      );
      occupiedSlots.add(item.slot);
      progressed = true;
    }
    if (!progressed) break;
    ladderPass = nextPass;
  }

  const finalTotals = new Map<string, number>(Object.entries(baseCapabilities));
  for (const decision of [...equipped.values()].sort((left, right) =>
    textCompare(left.itemId, right.itemId)
  ))
    apply(finalTotals, catalog.get(decision.itemId)!.modifiers);
  const capabilities: Record<string, number> = {};
  for (const key of [...finalTotals.keys()].sort())
    capabilities[key] = finalTotals.get(key)!;

  const equipDecisions = Object.freeze(
    [...equipped.values()].sort((left, right) =>
      textCompare(left.itemId, right.itemId)
    )
  );
  const sourceEvidenceHash = browserCanonicalSha256({
    domain: "aurion.capability-equipment-graph.source-evidence.v1",
    protocol: AURION_ACEG_PROTOCOL,
    entityId: snapshot.entityId,
    tickIndex: snapshot.tickIndex,
    permanentStats: sortModifiers(
      snapshot.permanentStats,
      "ACEG_PERMANENT_INVALID"
    ),
    skillRanks: sortModifiers(snapshot.skillRanks, "ACEG_SKILL_INVALID"),
    professionModifiers: sortModifiers(
      snapshot.professionModifiers,
      "ACEG_PROFESSION_INVALID"
    ),
    implants: [...snapshot.implants]
      .sort((left, right) => textCompare(left.implantId, right.implantId))
      .map(implant => ({
        implantId: implant.implantId,
        installReceiptId: implant.installReceiptId,
        modifiers: sortModifiers(
          implant.modifiers,
          "ACEG_IMPLANT_MODIFIER_INVALID"
        ),
      })),
    activeBuffs: [...snapshot.buffs]
      .filter(buff => buff.expiresAtTick > snapshot.tickIndex)
      .sort((left, right) => textCompare(left.buffId, right.buffId))
      .map(buff => ({
        buffId: buff.buffId,
        expiresAtTick: buff.expiresAtTick,
        confirmationReceiptId: buff.confirmationReceiptId,
        modifiers: sortModifiers(buff.modifiers, "ACEG_BUFF_MODIFIER_INVALID"),
      })),
    catalog: [...catalog.values()]
      .sort((left, right) => textCompare(left.itemId, right.itemId))
      .map(item => ({
        itemId: item.itemId,
        slot: item.slot,
        modifiers: sortModifiers(item.modifiers, "ACEG_ITEM_MODIFIER_INVALID"),
        requirements: canonicalRequirements(item.requirements),
        overEquipPenaltyPerPointBps: item.overEquipPenaltyPerPointBps,
      })),
    ownedItems: owned,
    priorConfirmedEquip: [...priorConfirmed.entries()]
      .sort(([left], [right]) => textCompare(left, right))
      .map(([itemId, confirmationReceiptId]) => ({
        itemId,
        confirmationReceiptId,
      })),
  });
  const unsigned = {
    protocol: AURION_ACEG_PROTOCOL,
    entityId: snapshot.entityId,
    tickIndex: snapshot.tickIndex,
    capabilities,
    equipDecisions,
    sourceEvidenceHash,
  };
  return Object.freeze({
    ...unsigned,
    resolutionHash: browserCanonicalSha256({
      domain: AURION_ACEG_PROTOCOL,
      resolution: unsigned,
    }),
  });
}

export function verifyAcegResolution(resolution: AcegResolution): boolean {
  try {
    if (resolution.protocol !== AURION_ACEG_PROTOCOL) return false;
    const { resolutionHash, ...unsigned } = resolution;
    return (
      SHA256.test(resolution.sourceEvidenceHash) &&
      SHA256.test(resolutionHash) &&
      resolutionHash ===
        browserCanonicalSha256({
          domain: AURION_ACEG_PROTOCOL,
          resolution: unsigned,
        })
    );
  } catch {
    return false;
  }
}
