import { createHash } from "node:crypto";

export const AURION_AX1_COMBAT_RULESET_VERSION = "aurion-ax1-combat.v1" as const;
export const AURION_AX1_COMBAT_TICK_RATE = 10 as const;

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;
export type FixedVec3 = Readonly<{ xMm: number; yMm: number; zMm: number }>;
export type AurionCombatCommand = "attack" | "skill_1" | "skill_2" | "skill_3" | "skill_4" | "skill_5" | "skill_6" | "skill_7" | "skill_8" | "skill_9";

export type UntrustedCombatRequest = Readonly<{
  sessionId: string;
  sequence: number;
  command: AurionCombatCommand;
  aim?: Vec3;
}>;

export type CanonicalCombatIntent = Readonly<{
  actorUserId: number;
  sessionId: string;
  sequence: number;
  logicalTick: number;
  command: AurionCombatCommand;
  aim: Vec3 | null;
  ruleSetVersion: typeof AURION_AX1_COMBAT_RULESET_VERSION;
  intentHash: string;
}>;

const commandDamage: Readonly<Record<AurionCombatCommand, number>> = Object.freeze({
  attack: 17,
  skill_1: 15,
  skill_2: 0,
  skill_3: 0,
  skill_4: 0,
  skill_5: 22,
  skill_6: 0,
  skill_7: 10,
  skill_8: 29,
  skill_9: 43,
});

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return Object.is(value, -0) ? 0 : Math.round(value * 1_000_000) / 1_000_000;
};
const vector = (value: Vec3 | undefined): Vec3 | null => value
  ? Object.freeze({ x: finite(value.x, "aim.x"), y: finite(value.y, "aim.y"), z: finite(value.z, "aim.z") })
  : null;

/**
 * Canonicalizes only an action request. Actor, tick and hash are supplied by
 * Aurion server context and can never be selected by the browser packet.
 */
export function canonicalizeCombatIntent(input: Readonly<{
  actorUserId: number;
  logicalTick: number;
  previousSequence: number;
  request: UntrustedCombatRequest & Record<string, unknown>;
}>): CanonicalCombatIntent {
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) throw new Error("actorUserId must come from an authenticated server session");
  if (!Number.isSafeInteger(input.logicalTick) || input.logicalTick < 0) throw new Error("logicalTick must be a non-negative server tick");
  if (!input.request.sessionId.trim()) throw new Error("combat session is required");
  if (!Number.isSafeInteger(input.request.sequence) || input.request.sequence !== input.previousSequence + 1) throw new Error("combat sequence must be monotonic");
  for (const forbidden of ["actorUserId", "logicalTick", "intentHash", "damage", "crit", "targetHp", "level", "equipment"] as const) {
    if (Object.prototype.hasOwnProperty.call(input.request, forbidden)) throw new Error(`client authority field rejected: ${forbidden}`);
  }
  if (!Object.prototype.hasOwnProperty.call(commandDamage, input.request.command)) throw new Error("unsupported combat command");
  const aim = vector(input.request.aim);
  const canonical = JSON.stringify({
    actorUserId: input.actorUserId,
    sessionId: input.request.sessionId,
    sequence: input.request.sequence,
    logicalTick: input.logicalTick,
    command: input.request.command,
    aim,
    ruleSetVersion: AURION_AX1_COMBAT_RULESET_VERSION,
  });
  return Object.freeze({
    actorUserId: input.actorUserId,
    sessionId: input.request.sessionId,
    sequence: input.request.sequence,
    logicalTick: input.logicalTick,
    command: input.request.command,
    aim,
    ruleSetVersion: AURION_AX1_COMBAT_RULESET_VERSION,
    intentHash: sha256(canonical),
  });
}

/** Damage is a server ruleset projection; packets never carry the outcome. */
export function authoritativeDamageForCommand(command: AurionCombatCommand): number {
  const damage = commandDamage[command];
  if (damage === undefined) throw new Error("unsupported combat command");
  return damage;
}

export type Segment3 = Readonly<{ p0: Vec3; p1: Vec3 }>;
export type Capsule3 = Readonly<{ base: Vec3; top: Vec3; radius: number }>;

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const addScaled = (a: Vec3, b: Vec3, scale: number): Vec3 => ({ x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Robust closest-point calculation used for real trajectory-vs-capsule hits. */
export function closestPointsBetweenSegments(first: Segment3, second: Segment3): Readonly<{ first: Vec3; second: Vec3; distance: number }> {
  const u = sub(first.p1, first.p0);
  const v = sub(second.p1, second.p0);
  const w = sub(first.p0, second.p0);
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  const d = dot(u, w);
  const e = dot(v, w);
  const denominator = a * c - b * b;
  const epsilon = 1e-9;

  let sNumerator = denominator;
  let sDenominator = denominator;
  let tNumerator = denominator;
  let tDenominator = denominator;

  if (denominator < epsilon) {
    sNumerator = 0;
    sDenominator = 1;
    tNumerator = e;
    tDenominator = c || 1;
  } else {
    sNumerator = b * e - c * d;
    tNumerator = a * e - b * d;
    if (sNumerator < 0) {
      sNumerator = 0;
      tNumerator = e;
      tDenominator = c || 1;
    } else if (sNumerator > sDenominator) {
      sNumerator = sDenominator;
      tNumerator = e + b;
      tDenominator = c || 1;
    }
  }

  let s: number;
  let t: number;
  if (tNumerator < 0) {
    t = 0;
    s = clamp01(a > epsilon ? -d / a : 0);
  } else if (tNumerator > tDenominator) {
    t = 1;
    s = clamp01(a > epsilon ? (-d + b) / a : 0);
  } else {
    t = Math.abs(tNumerator) < epsilon ? 0 : tNumerator / (tDenominator || 1);
    s = Math.abs(sNumerator) < epsilon ? 0 : sNumerator / (sDenominator || 1);
  }

  const firstPoint = addScaled(first.p0, u, s);
  const secondPoint = addScaled(second.p0, v, t);
  return Object.freeze({ first: firstPoint, second: secondPoint, distance: distance(firstPoint, secondPoint) });
}

export function testTrajectoryAgainstCapsule(trajectory: Segment3, capsule: Capsule3): Readonly<{ hit: boolean; distance: number; penetration: number }> {
  if (!Number.isFinite(capsule.radius) || capsule.radius <= 0) throw new Error("capsule radius must be positive");
  const result = closestPointsBetweenSegments(trajectory, { p0: capsule.base, p1: capsule.top });
  return Object.freeze({
    hit: result.distance <= capsule.radius,
    distance: result.distance,
    penetration: Math.max(0, capsule.radius - result.distance),
  });
}

export type HitboxSnapshot = Readonly<{
  logicalTick: number;
  position: Vec3;
  radius: number;
  height: number;
}>;

export function rewindCapsule(history: readonly HitboxSnapshot[], targetTick: number): Capsule3 | null {
  const ordered = history.slice().sort((left, right) => left.logicalTick - right.logicalTick);
  if (ordered.length === 0 || !Number.isFinite(targetTick)) return null;
  const lowerBound = ordered[0]!;
  const upperBound = ordered[ordered.length - 1]!;
  let left = targetTick <= lowerBound.logicalTick ? lowerBound : upperBound;
  let right = left;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (targetTick >= ordered[index]!.logicalTick && targetTick <= ordered[index + 1]!.logicalTick) {
      left = ordered[index]!;
      right = ordered[index + 1]!;
      break;
    }
  }
  const span = right.logicalTick - left.logicalTick;
  const alpha = span > 0 ? clamp01((targetTick - left.logicalTick) / span) : 0;
  const position = {
    x: left.position.x + (right.position.x - left.position.x) * alpha,
    y: left.position.y + (right.position.y - left.position.y) * alpha,
    z: left.position.z + (right.position.z - left.position.z) * alpha,
  };
  const radius = left.radius + (right.radius - left.radius) * alpha;
  const height = left.height + (right.height - left.height) * alpha;
  return Object.freeze({
    base: Object.freeze({ x: position.x, y: position.y + radius, z: position.z }),
    top: Object.freeze({ x: position.x, y: position.y + Math.max(radius, height - radius), z: position.z }),
    radius,
  });
}

/** Unlike the -ax1 source distance placeholder, this tests the attack segment against the rewound capsule. */
export function validateRewoundCapsuleHit(input: Readonly<{
  trajectory: Segment3;
  targetHistory: readonly HitboxSnapshot[];
  targetTick: number;
  maxRange: number;
}>): Readonly<{ valid: boolean; distance: number; reason: "hit" | "out_of_range" | "miss" | "missing_history" }> {
  const trajectoryLength = distance(input.trajectory.p0, input.trajectory.p1);
  if (!Number.isFinite(input.maxRange) || input.maxRange <= 0 || trajectoryLength > input.maxRange) return Object.freeze({ valid: false, distance: trajectoryLength, reason: "out_of_range" });
  const capsule = rewindCapsule(input.targetHistory, input.targetTick);
  if (!capsule) return Object.freeze({ valid: false, distance: Number.POSITIVE_INFINITY, reason: "missing_history" });
  const hit = testTrajectoryAgainstCapsule(input.trajectory, capsule);
  return Object.freeze({ valid: hit.hit, distance: hit.distance, reason: hit.hit ? "hit" : "miss" });
}

export type FixedProjectileState = Readonly<{
  tick: number;
  position: FixedVec3;
  velocityPerTick: FixedVec3;
}>;

/** Integer fixed-tick ballistics; render interpolation never changes this state. */
export function advanceFixedProjectile(state: FixedProjectileState, input: Readonly<{ gravityMmPerTick2: number; dragBps: number }>): FixedProjectileState {
  if (![state.tick, state.position.xMm, state.position.yMm, state.position.zMm, state.velocityPerTick.xMm, state.velocityPerTick.yMm, state.velocityPerTick.zMm, input.gravityMmPerTick2, input.dragBps].every(Number.isSafeInteger)) throw new Error("fixed projectile values must be safe integers");
  const drag = Math.max(0, Math.min(10_000, input.dragBps));
  const retain = 10_000 - drag;
  const velocity = Object.freeze({
    xMm: Math.trunc(state.velocityPerTick.xMm * retain / 10_000),
    yMm: Math.trunc(state.velocityPerTick.yMm * retain / 10_000) + input.gravityMmPerTick2,
    zMm: Math.trunc(state.velocityPerTick.zMm * retain / 10_000),
  });
  return Object.freeze({
    tick: state.tick + 1,
    velocityPerTick: velocity,
    position: Object.freeze({
      xMm: state.position.xMm + velocity.xMm,
      yMm: state.position.yMm + velocity.yMm,
      zMm: state.position.zMm + velocity.zMm,
    }),
  });
}

export type PendingMovementInput = Readonly<{ sequence: number; x: -1 | 0 | 1; z: -1 | 0 | 1 }>;

/** Measures real deviation and replays only monotonically newer pending direction intents. */
export function reconcileAuthoritativeMovement(input: Readonly<{
  predicted: FixedVec3;
  authoritative: FixedVec3;
  acknowledgedSequence: number;
  pending: readonly PendingMovementInput[];
  stepMm: number;
  correctionThresholdMm: number;
}>): Readonly<{ position: FixedVec3; deviationMm: number; corrected: boolean; replayedSequences: readonly number[] }> {
  if (![input.acknowledgedSequence, input.stepMm, input.correctionThresholdMm].every(Number.isSafeInteger) || input.stepMm < 0 || input.correctionThresholdMm < 0) throw new Error("reconciliation values must be non-negative safe integers");
  const deviationMm = Math.hypot(
    input.predicted.xMm - input.authoritative.xMm,
    input.predicted.yMm - input.authoritative.yMm,
    input.predicted.zMm - input.authoritative.zMm,
  );
  const corrected = deviationMm > input.correctionThresholdMm;
  if (!corrected) return Object.freeze({ position: input.predicted, deviationMm, corrected: false, replayedSequences: Object.freeze([]) });
  const position = { ...input.authoritative };
  const replayedSequences: number[] = [];
  for (const movement of input.pending.slice().sort((left, right) => left.sequence - right.sequence)) {
    if (!Number.isSafeInteger(movement.sequence) || movement.sequence <= input.acknowledgedSequence) continue;
    position.xMm += movement.x * input.stepMm;
    position.zMm += movement.z * input.stepMm;
    replayedSequences.push(movement.sequence);
  }
  return Object.freeze({ position: Object.freeze(position), deviationMm, corrected: true, replayedSequences: Object.freeze(replayedSequences) });
}

export type ThreatEntry = Readonly<{ entityId: string; threatMilli: number }>;
export function stableThreatOrder(entries: readonly ThreatEntry[]): readonly ThreatEntry[] {
  return Object.freeze(entries
    .filter(entry => entry.entityId && Number.isSafeInteger(entry.threatMilli) && entry.threatMilli >= 0)
    .slice()
    .sort((left, right) => right.threatMilli - left.threatMilli || left.entityId.localeCompare(right.entityId)));
}

export type GridPoint = Readonly<{ x: number; z: number }>;
const gridKey = (point: GridPoint): string => `${point.x}:${point.z}`;

/** Deterministic breadth-first NavGrid path with a fixed neighbour order. */
export function deterministicGridPath(start: GridPoint, goal: GridPoint, blockedKeys: ReadonlySet<string>, maximumVisited = 4_096): readonly GridPoint[] {
  for (const point of [start, goal]) if (!Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.z)) throw new Error("grid coordinates must be safe integers");
  if (blockedKeys.has(gridKey(start)) || blockedKeys.has(gridKey(goal))) return Object.freeze([]);
  const queue: GridPoint[] = [Object.freeze({ ...start })];
  const previous = new Map<string, string | null>([[gridKey(start), null]]);
  const points = new Map<string, GridPoint>([[gridKey(start), start]]);
  const neighbours = Object.freeze([{ x: 0, z: -1 }, { x: -1, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }]);
  while (queue.length && previous.size <= maximumVisited) {
    const current = queue.shift()!;
    if (gridKey(current) === gridKey(goal)) break;
    for (const delta of neighbours) {
      const next = Object.freeze({ x: current.x + delta.x, z: current.z + delta.z });
      const key = gridKey(next);
      if (blockedKeys.has(key) || previous.has(key)) continue;
      previous.set(key, gridKey(current));
      points.set(key, next);
      queue.push(next);
    }
  }
  const goalKey = gridKey(goal);
  if (!previous.has(goalKey)) return Object.freeze([]);
  const path: GridPoint[] = [];
  let cursor: string | null = goalKey;
  while (cursor) {
    path.push(points.get(cursor)!);
    cursor = previous.get(cursor) ?? null;
  }
  path.reverse();
  return Object.freeze(path);
}

/** AOI projection is stable and cannot accept client-selected visibility. */
export function interestSet(origin: FixedVec3, entities: readonly Readonly<{ entityId: string; position: FixedVec3 }>[], radiusMm: number): readonly string[] {
  if (!Number.isSafeInteger(radiusMm) || radiusMm < 0) throw new Error("AOI radius must be a non-negative safe integer");
  const radiusSquared = radiusMm * radiusMm;
  return Object.freeze(entities
    .filter(entity => {
      const dx = entity.position.xMm - origin.xMm;
      const dy = entity.position.yMm - origin.yMm;
      const dz = entity.position.zMm - origin.zMm;
      return dx * dx + dy * dy + dz * dz <= radiusSquared;
    })
    .map(entity => entity.entityId)
    .filter(Boolean)
    .sort());
}
