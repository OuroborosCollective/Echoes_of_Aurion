import { createHash } from "node:crypto";

/**
 * Aurion-native contracts distilled from Wasd semantics.
 * Every function is pure: callers persist or render only its confirmed outputs.
 */
export const AURION_WASD_RULESET_VERSION = "aurion-wasd-rules-v1";
export const AURION_WASD_CONTENT_VERSION = "aurion-wasd-content-v1";

export const worldSignalKinds = ["weather", "ecology", "hazard", "resonance", "economy", "politics", "war", "player_event"] as const;
export type WorldSignalKind = (typeof worldSignalKinds)[number];

export type WorldSignal = {
  id: string;
  kind: WorldSignalKind;
  regionId: string;
  magnitude: number;
  sourceReceiptId: string;
  resolutionIndex: number;
};

export type WorldReaction = {
  id: string;
  regionId: string;
  ruleSetVersion: string;
  contentVersion: string;
  resolutionIndex: number;
  signalIds: readonly string[];
  weatherTone: "clear" | "rain" | "storm" | "ashfall";
  threatDelta: number;
  resourceDelta: number;
  npcNeedDeltas: Readonly<Record<NpcNeedKey, number>>;
  dialogueTone: "calm" | "guarded" | "urgent";
  deterministicHash: string;
};

export const npcNeedKeys = ["safety", "resources", "belonging", "status", "wealth", "power"] as const;
export type NpcNeedKey = (typeof npcNeedKeys)[number];
export type NpcNeedState = Readonly<Record<NpcNeedKey, number>>;

export type NpcNeedEvent = {
  id: string;
  need: NpcNeedKey;
  delta: number;
  sourceReceiptId: string;
  resolutionIndex: number;
};

export type NpcGoal = "seek_safety" | "gather_resources" | "socialize" | "gain_reputation" | "trade" | "expand_influence";

export type NpcDecision = {
  npcId: string;
  goal: NpcGoal;
  needs: NpcNeedState;
  observationIds: readonly string[];
  decisionHash: string;
  resolutionIndex: number;
};

export const polityGovernmentTypes = ["monarchy", "council", "theocracy", "trade_republic", "warband"] as const;
export type PolityGovernmentType = (typeof polityGovernmentTypes)[number];
export const diplomacyTypes = ["alliance", "trade", "non_aggression", "tribute", "sanction"] as const;
export type DiplomacyType = (typeof diplomacyTypes)[number];

export type PolityState = {
  polityId: string;
  governmentType: PolityGovernmentType;
  territoryIds: readonly string[];
  stability: number;
  activeDiplomacy: readonly DiplomacyType[];
  warPressure: number;
  reactionHash: string;
};

export type LanguageProfile = {
  languageProfileId: string;
  dialectId: string;
  lexiconVersion: string;
  grammarVersion: string;
  comprehensionThreshold: number;
};

export type DialogueInterpretation = {
  state: "accepted" | "quarantined" | "rejected";
  semanticIntent: "greet" | "ask_quest" | "turn_in_quest" | "trade" | "ask_world" | "unknown";
  confidence: number;
  dialectId: string;
  reason: string;
};

export type ProgressionResolution = {
  totalXp: number;
  level: number;
  weaponXp: number;
  weaponRank: number;
  receiptHash: string;
};

const needGoal: Readonly<Record<NpcNeedKey, NpcGoal>> = {
  safety: "seek_safety",
  resources: "gather_resources",
  belonging: "socialize",
  status: "gain_reputation",
  wealth: "trade",
  power: "expand_influence",
};

const needTieOrder: readonly NpcNeedKey[] = ["safety", "resources", "belonging", "status", "wealth", "power"];

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 10_000) / 10_000));
}

function clampSigned(value: number): number {
  return Math.max(-1, Math.min(1, Math.round(value * 10_000) / 10_000));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalHash(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

function canonicalSignalOrder(left: WorldSignal, right: WorldSignal): number {
  return left.resolutionIndex - right.resolutionIndex
    || compareText(left.regionId, right.regionId)
    || compareText(left.kind, right.kind)
    || compareText(left.id, right.id);
}

function defaultNeeds(): NpcNeedState {
  return { safety: 0.8, resources: 0.5, belonging: 0.4, status: 0.3, wealth: 0.3, power: 0.2 };
}

export function buildWorldSeedDigest(input: { worldSeed: string; regionId: string; resolutionIndex: number }): string {
  if (!input.worldSeed || !input.regionId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) {
    throw new Error("World seed inputs must be explicit and non-negative");
  }
  return canonicalHash([AURION_WASD_RULESET_VERSION, AURION_WASD_CONTENT_VERSION, input.worldSeed, input.regionId, String(input.resolutionIndex)]);
}

/** Resolves bounded visual and gameplay read-model effects from already-confirmed signals. */
export function resolveWorldReaction(input: {
  worldSeed: string;
  regionId: string;
  resolutionIndex: number;
  signals: readonly WorldSignal[];
}): WorldReaction {
  const ordered = input.signals
    .filter(signal => signal.regionId === input.regionId && signal.resolutionIndex <= input.resolutionIndex)
    .slice()
    .sort(canonicalSignalOrder);
  const totals: Record<WorldSignalKind, number> = {
    weather: 0,
    ecology: 0,
    hazard: 0,
    resonance: 0,
    economy: 0,
    politics: 0,
    war: 0,
    player_event: 0,
  };
  ordered.forEach(signal => {
    totals[signal.kind] += clampSigned(signal.magnitude);
  });
  const weatherTone: WorldReaction["weatherTone"] = totals.war > 0.6 || totals.hazard > 0.8
    ? "ashfall"
    : totals.weather > 0.55
      ? "storm"
      : totals.weather > 0.15
        ? "rain"
        : "clear";
  const threatDelta = clampSigned(totals.hazard * 0.65 + totals.war * 0.55 - totals.resonance * 0.15);
  const resourceDelta = clampSigned(totals.ecology * 0.55 + totals.economy * 0.3 - totals.hazard * 0.25 - totals.war * 0.2);
  const npcNeedDeltas: Record<NpcNeedKey, number> = {
    safety: clampSigned(-threatDelta * 0.4),
    resources: clampSigned(resourceDelta * 0.3),
    belonging: clampSigned(-(totals.war * 0.16) + totals.player_event * 0.08),
    status: clampSigned(totals.politics * 0.15 + totals.resonance * 0.08),
    wealth: clampSigned(resourceDelta * 0.25 + totals.economy * 0.2),
    power: clampSigned(totals.politics * 0.2 + totals.war * 0.1),
  };
  const dialogueTone: WorldReaction["dialogueTone"] = threatDelta > 0.55 ? "urgent" : threatDelta > 0.2 || totals.politics > 0.3 ? "guarded" : "calm";
  const seedDigest = buildWorldSeedDigest(input);
  const signalIds = ordered.map(signal => signal.id);
  const deterministicHash = canonicalHash([
    seedDigest,
    ...signalIds,
    weatherTone,
    String(threatDelta),
    String(resourceDelta),
    dialogueTone,
  ]);
  return {
    id: `wr_${deterministicHash.slice(0, 24)}`,
    regionId: input.regionId,
    ruleSetVersion: AURION_WASD_RULESET_VERSION,
    contentVersion: AURION_WASD_CONTENT_VERSION,
    resolutionIndex: input.resolutionIndex,
    signalIds,
    weatherTone,
    threatDelta,
    resourceDelta,
    npcNeedDeltas,
    dialogueTone,
    deterministicHash,
  };
}

export function resolveNpcNeeds(input: { current?: Partial<NpcNeedState>; events: readonly NpcNeedEvent[] }): NpcNeedState {
  const next: Record<NpcNeedKey, number> = { ...defaultNeeds(), ...input.current };
  input.events.slice().sort((left, right) => left.resolutionIndex - right.resolutionIndex || compareText(left.sourceReceiptId, right.sourceReceiptId) || compareText(left.id, right.id)).forEach(event => {
    next[event.need] = clampUnit(next[event.need] + clampSigned(event.delta));
  });
  return next;
}

export function decideNpcGoal(input: { npcId: string; needs: NpcNeedState; observationIds: readonly string[]; resolutionIndex: number }): NpcDecision {
  const selectedNeed = needTieOrder.reduce((selected, candidate) => input.needs[candidate] < input.needs[selected] ? candidate : selected, needTieOrder[0]!);
  const observations = input.observationIds.slice().sort(compareText);
  const decisionHash = canonicalHash([input.npcId, String(input.resolutionIndex), selectedNeed, ...observations, ...needTieOrder.map(need => `${need}:${input.needs[need]}`)]);
  return { npcId: input.npcId, goal: needGoal[selectedNeed], needs: input.needs, observationIds: observations, decisionHash, resolutionIndex: input.resolutionIndex };
}

export function resolvePolityState(input: {
  polityId: string;
  governmentType: PolityGovernmentType;
  territoryIds: readonly string[];
  stability: number;
  activeDiplomacy: readonly DiplomacyType[];
  warSignals: readonly WorldSignal[];
}): PolityState {
  const territoryIds = input.territoryIds.slice().sort(compareText);
  const activeDiplomacy = input.activeDiplomacy.slice().sort(compareText);
  const warPressure = clampUnit(input.warSignals.filter(signal => signal.kind === "war" || signal.kind === "politics").reduce((total, signal) => total + Math.max(0, signal.magnitude), 0) / 4);
  const stability = clampUnit(input.stability - warPressure * 0.2 + (activeDiplomacy.includes("alliance") ? 0.05 : 0) - (activeDiplomacy.includes("sanction") ? 0.05 : 0));
  const reactionHash = canonicalHash([input.polityId, input.governmentType, ...territoryIds, ...activeDiplomacy, String(stability), String(warPressure)]);
  return { polityId: input.polityId, governmentType: input.governmentType, territoryIds, stability, activeDiplomacy, warPressure, reactionHash };
}

/** This parser is display/context-only. Commands remain protected Aurion routes. */
export function interpretDialogue(input: { text: string; profile: LanguageProfile; trust: number; threat: number }): DialogueInterpretation {
  const normalized = input.text.trim().toLocaleLowerCase("de-DE");
  if (!normalized || normalized.length > 280) {
    return { state: "rejected", semanticIntent: "unknown", confidence: 0, dialectId: input.profile.dialectId, reason: "empty_or_oversized" };
  }
  const prohibited = /(?:passwort|token|secret|kreditkarte|private.?key)/i.test(normalized);
  if (prohibited) {
    return { state: "quarantined", semanticIntent: "unknown", confidence: 0, dialectId: input.profile.dialectId, reason: "sensitive_or_disallowed_content" };
  }
  const semanticIntent: DialogueInterpretation["semanticIntent"] = /quest|auftrag|hilfe/.test(normalized)
    ? "ask_quest"
    : /abschlie|übergebe|fertig/.test(normalized)
      ? "turn_in_quest"
      : /handel|kauf|verkauf/.test(normalized)
        ? "trade"
        : /wetter|gebiet|welt|pfad/.test(normalized)
          ? "ask_world"
          : /hallo|grüß|seid gegrüßt/.test(normalized)
            ? "greet"
            : "unknown";
  const confidence = clampUnit((semanticIntent === "unknown" ? 0.25 : 0.75) + clampUnit(input.trust) * 0.15 - clampUnit(input.threat) * 0.1);
  const state = confidence >= input.profile.comprehensionThreshold ? "accepted" : "quarantined";
  return { state, semanticIntent, confidence, dialectId: input.profile.dialectId, reason: state === "accepted" ? "recognized_intent" : "insufficient_comprehension" };
}

export function resolveProgression(input: { totalXp: number; weaponXp: number; xpDelta: number; weaponXpDelta: number; receiptId: string }): ProgressionResolution {
  if (![input.totalXp, input.weaponXp, input.xpDelta, input.weaponXpDelta].every(value => Number.isInteger(value) && value >= 0) || !input.receiptId) {
    throw new Error("Progression values must be non-negative integers with a receipt");
  }
  const totalXp = input.totalXp + input.xpDelta;
  const weaponXp = input.weaponXp + input.weaponXpDelta;
  const rankFromXp = (xp: number) => Math.min(50, 1 + Math.floor(Math.sqrt(xp / 100)));
  const receiptHash = canonicalHash([AURION_WASD_RULESET_VERSION, input.receiptId, String(totalXp), String(weaponXp)]);
  return { totalXp, level: rankFromXp(totalXp), weaponXp, weaponRank: rankFromXp(weaponXp), receiptHash };
}
