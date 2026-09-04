export const AURION_AX1_COMBAT_TICK_RATE = 10 as const;
export const AURION_AX1_LAG_WINDOW_TICKS = 10 as const;

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;
export type Capsule3D = Readonly<{ base: Vec3; top: Vec3; radius: number }>;
export type Segment3D = Readonly<{ p0: Vec3; p1: Vec3 }>;
export type HitResult = Readonly<{ hit: boolean; distance: number; isNearMiss: boolean; penetrationDepth: number; closestPointCapsule: Vec3; closestPointSegment: Vec3 }>;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, value: number): Vec3 => ({ x: a.x * value, y: a.y * value, z: a.z * value });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));
const lerp = (a: Vec3, b: Vec3, alpha: number): Vec3 => add(a, scale(sub(b, a), alpha));

function finiteVec3(value: Vec3): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new Error("combat vector must be finite");
}

/** Pure server port of the -ax1 segment/capsule CPA calculation. */
export function closestPointsBetweenSegments(s1: Segment3D, s2: Segment3D): { p1: Vec3; p2: Vec3; distance: number } {
  finiteVec3(s1.p0); finiteVec3(s1.p1); finiteVec3(s2.p0); finiteVec3(s2.p1);
  const u = sub(s1.p1, s1.p0);
  const v = sub(s2.p1, s2.p0);
  const w = sub(s1.p0, s2.p0);
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  const d = dot(u, w);
  const e = dot(v, w);
  const determinant = a * c - b * b;
  const epsilon = 1e-9;
  if (a < epsilon && c < epsilon) return { p1: s1.p0, p2: s2.p0, distance: distance(s1.p0, s2.p0) };
  if (a < epsilon) {
    const t = c < epsilon ? 0 : Math.max(0, Math.min(1, e / c));
    const p2 = add(s2.p0, scale(v, t));
    return { p1: s1.p0, p2, distance: distance(s1.p0, p2) };
  }
  let sN: number;
  let sD = determinant;
  let tN: number;
  let tD = determinant;
  if (determinant < epsilon) {
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0) { sN = 0; tN = e; tD = c; }
    else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
  }
  let sc: number;
  let tc: number;
  if (tN < 0) {
    tc = 0;
    sc = -d < 0 ? 0 : -d > a ? 1 : -d / a;
  } else if (tN > tD) {
    tc = 1;
    sc = -d + b < 0 ? 0 : -d + b > a ? 1 : (-d + b) / a;
  } else {
    tc = Math.abs(tD) < epsilon ? 0 : tN / tD;
    sc = Math.abs(sD) < epsilon ? 0 : sN / sD;
  }
  const p1 = add(s1.p0, scale(u, sc));
  const p2 = add(s2.p0, scale(v, tc));
  return { p1, p2, distance: distance(p1, p2) };
}

export function testCapsuleAgainstSegment(capsule: Capsule3D, segment: Segment3D, nearMissMargin = 1.35): HitResult {
  if (!Number.isFinite(capsule.radius) || capsule.radius <= 0) throw new Error("capsule radius must be positive");
  const closest = closestPointsBetweenSegments({ p0: capsule.base, p1: capsule.top }, segment);
  const hit = closest.distance <= capsule.radius;
  return Object.freeze({
    hit,
    distance: closest.distance,
    isNearMiss: !hit && closest.distance <= capsule.radius + Math.max(0, nearMissMargin),
    penetrationDepth: Math.max(0, capsule.radius - closest.distance),
    closestPointCapsule: closest.p1,
    closestPointSegment: closest.p2,
  });
}

export type CombatSnapshot = Readonly<{ tick: number; position: Vec3; capsule: Capsule3D; facingAngle: number }>;

/** Server logical-tick rewind. No client wall clock or performance.now() participates in authority. */
export class LagCompensationHistory {
  private readonly history = new Map<string, CombatSnapshot[]>();
  constructor(private readonly maxHistoryTicks = AURION_AX1_LAG_WINDOW_TICKS) {}

  record(entityId: string, snapshot: CombatSnapshot): void {
    if (!entityId || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0) throw new Error("invalid combat snapshot");
    const snapshots = this.history.get(entityId) ?? [];
    if (snapshots.length && snapshot.tick <= snapshots[snapshots.length - 1]!.tick) throw new Error("combat snapshots must have monotone ticks");
    snapshots.push(Object.freeze({ ...snapshot, position: Object.freeze({ ...snapshot.position }), capsule: Object.freeze({ base: Object.freeze({ ...snapshot.capsule.base }), top: Object.freeze({ ...snapshot.capsule.top }), radius: snapshot.capsule.radius }) }));
    const cutoff = snapshot.tick - this.maxHistoryTicks;
    while (snapshots.length && snapshots[0]!.tick < cutoff) snapshots.shift();
    this.history.set(entityId, snapshots);
  }

  rewind(entityId: string, targetTick: number): CombatSnapshot | null {
    if (!Number.isSafeInteger(targetTick) || targetTick < 0) return null;
    const snapshots = this.history.get(entityId);
    if (!snapshots?.length) return null;
    if (targetTick <= snapshots[0]!.tick) return snapshots[0]!;
    if (targetTick >= snapshots[snapshots.length - 1]!.tick) return snapshots[snapshots.length - 1]!;
    for (let index = 0; index < snapshots.length - 1; index += 1) {
      const left = snapshots[index]!;
      const right = snapshots[index + 1]!;
      if (targetTick < left.tick || targetTick > right.tick) continue;
      const alpha = (targetTick - left.tick) / Math.max(1, right.tick - left.tick);
      const position = lerp(left.position, right.position, alpha);
      const capsule = Object.freeze({ base: lerp(left.capsule.base, right.capsule.base, alpha), top: lerp(left.capsule.top, right.capsule.top, alpha), radius: left.capsule.radius });
      return Object.freeze({ tick: targetTick, position, capsule, facingAngle: left.facingAngle + (right.facingAngle - left.facingAngle) * alpha });
    }
    return snapshots[snapshots.length - 1]!;
  }

  validateSegmentHit(input: Readonly<{ targetId: string; targetTick: number; attackSegment: Segment3D; maxRange: number; attackerPosition: Vec3 }>): HitResult & { rewoundTick: number } {
    const state = this.rewind(input.targetId, input.targetTick);
    if (!state || !Number.isFinite(input.maxRange) || input.maxRange <= 0 || distance(input.attackerPosition, state.position) > input.maxRange) {
      return { hit: false, distance: Number.POSITIVE_INFINITY, isNearMiss: false, penetrationDepth: 0, closestPointCapsule: input.attackerPosition, closestPointSegment: input.attackSegment.p0, rewoundTick: input.targetTick };
    }
    return { ...testCapsuleAgainstSegment(state.capsule, input.attackSegment), rewoundTick: state.tick };
  }
}

export type PredictionSample = Readonly<{ sequence: number; position: Readonly<{ x: number; z: number }> }>;
export type ReconciliationResult = Readonly<{ acknowledgedSequence: number; errorDistance: number; corrected: boolean; replay: readonly PredictionSample[] }>;

/** Client prediction is latency masking only; server position always wins beyond threshold. */
export class PredictionReconciler {
  private pending: PredictionSample[] = [];
  constructor(private readonly correctionThreshold = 0.075) {}
  push(sample: PredictionSample): void {
    if (!Number.isSafeInteger(sample.sequence) || sample.sequence <= 0) throw new Error("prediction sequence must be positive");
    if (this.pending.length && sample.sequence <= this.pending[this.pending.length - 1]!.sequence) throw new Error("prediction sequence must be monotone");
    this.pending.push(Object.freeze({ sequence: sample.sequence, position: Object.freeze({ ...sample.position }) }));
  }
  reconcile(acknowledgedSequence: number, authoritative: Readonly<{ x: number; z: number }>, predicted: Readonly<{ x: number; z: number }>): ReconciliationResult {
    if (!Number.isSafeInteger(acknowledgedSequence) || acknowledgedSequence < 0) throw new Error("invalid server acknowledgement");
    this.pending = this.pending.filter(sample => sample.sequence > acknowledgedSequence);
    const errorDistance = Math.hypot(authoritative.x - predicted.x, authoritative.z - predicted.z);
    return Object.freeze({ acknowledgedSequence, errorDistance, corrected: errorDistance > this.correctionThreshold, replay: Object.freeze(this.pending.slice()) });
  }
}

export class ThreatMatrix {
  private readonly byMob = new Map<string, Map<string, number>>();
  add(mobId: string, actorId: string, amount: number): void {
    if (!mobId || !actorId || !Number.isFinite(amount) || amount < 0) throw new Error("invalid threat update");
    const actors = this.byMob.get(mobId) ?? new Map<string, number>();
    actors.set(actorId, (actors.get(actorId) ?? 0) + amount);
    this.byMob.set(mobId, actors);
  }
  target(mobId: string): string | null {
    const actors = this.byMob.get(mobId);
    if (!actors?.size) return null;
    return Array.from(actors.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]![0];
  }
}

export type EntityState = "idle" | "patrol" | "chase" | "attack" | "retreat" | "dead";
export class EntityStateMachine {
  private state: EntityState = "idle";
  get current(): EntityState { return this.state; }
  transition(next: EntityState): EntityState {
    if (this.state === "dead") return this.state;
    if (next === "dead") { this.state = next; return next; }
    const allowed: Record<EntityState, readonly EntityState[]> = {
      idle: ["patrol", "chase"], patrol: ["idle", "chase"], chase: ["attack", "retreat", "idle"], attack: ["chase", "retreat"], retreat: ["idle", "chase"], dead: [],
    };
    if (!allowed[this.state].includes(next)) throw new Error(`invalid FSM transition ${this.state}->${next}`);
    this.state = next;
    return next;
  }
}

export type GridPoint = Readonly<{ x: number; z: number }>;
const gridKey = (point: GridPoint): string => `${point.x}:${point.z}`;

/** Deterministic 4-neighbour A* compatible with -ax1 NavGrid/HierarchicalPathfinding semantics. */
export class NavGrid {
  private readonly blocked = new Set<string>();
  constructor(readonly width: number, readonly height: number) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) throw new Error("invalid nav grid");
  }
  setBlocked(point: GridPoint, blocked = true): void { blocked ? this.blocked.add(gridKey(point)) : this.blocked.delete(gridKey(point)); }
  private valid(point: GridPoint): boolean { return point.x >= 0 && point.z >= 0 && point.x < this.width && point.z < this.height && !this.blocked.has(gridKey(point)); }
  findPath(start: GridPoint, goal: GridPoint): readonly GridPoint[] {
    if (!this.valid(start) || !this.valid(goal)) return [];
    const open = new Map<string, { point: GridPoint; g: number; f: number }>([[gridKey(start), { point: start, g: 0, f: Math.abs(goal.x - start.x) + Math.abs(goal.z - start.z) }]]);
    const cameFrom = new Map<string, string>();
    const points = new Map<string, GridPoint>([[gridKey(start), start]]);
    const closed = new Set<string>();
    while (open.size) {
      const current = Array.from(open.values()).sort((a, b) => a.f - b.f || a.g - b.g || gridKey(a.point).localeCompare(gridKey(b.point)))[0]!;
      const currentKey = gridKey(current.point);
      open.delete(currentKey);
      if (currentKey === gridKey(goal)) {
        const path: GridPoint[] = [goal];
        let cursor = currentKey;
        while (cameFrom.has(cursor)) { cursor = cameFrom.get(cursor)!; path.push(points.get(cursor)!); }
        return Object.freeze(path.reverse().map(point => Object.freeze({ ...point })));
      }
      closed.add(currentKey);
      const neighbours = [{ x: current.point.x - 1, z: current.point.z }, { x: current.point.x, z: current.point.z - 1 }, { x: current.point.x, z: current.point.z + 1 }, { x: current.point.x + 1, z: current.point.z }];
      for (const neighbour of neighbours) {
        if (!this.valid(neighbour)) continue;
        const key = gridKey(neighbour);
        if (closed.has(key)) continue;
        const g = current.g + 1;
        const existing = open.get(key);
        if (existing && existing.g <= g) continue;
        cameFrom.set(key, currentKey); points.set(key, Object.freeze({ ...neighbour }));
        open.set(key, { point: neighbour, g, f: g + Math.abs(goal.x - neighbour.x) + Math.abs(goal.z - neighbour.z) });
      }
    }
    return [];
  }
}

export type Buff = Readonly<{ id: string; stat: "attack" | "defense" | "speed" | "regen"; magnitudeBps: number; expiresAtTick: number }>;
export class BuffDebuffSystem {
  private readonly buffs = new Map<string, Buff>();
  apply(buff: Buff, currentTick: number): void {
    if (!buff.id || !Number.isSafeInteger(buff.magnitudeBps) || !Number.isSafeInteger(buff.expiresAtTick) || buff.expiresAtTick <= currentTick) throw new Error("invalid buff");
    this.buffs.set(buff.id, Object.freeze({ ...buff }));
  }
  multiplier(stat: Buff["stat"], tick: number): number {
    for (const [id, buff] of this.buffs) if (buff.expiresAtTick <= tick) this.buffs.delete(id);
    const totalBps = Array.from(this.buffs.values()).filter(buff => buff.stat === stat).reduce((sum, buff) => sum + buff.magnitudeBps, 0);
    return Math.max(0.1, Math.min(3, 1 + totalBps / 10_000));
  }
}

export type BallisticState = Readonly<{ position: Vec3; velocity: Vec3 }>;
export function advanceBallistic(state: BallisticState, fixedDelta: number, gravity = -9.81): BallisticState {
  if (!Number.isFinite(fixedDelta) || fixedDelta <= 0 || fixedDelta > 0.25) throw new Error("ballistic delta must be a bounded fixed step");
  const velocity = Object.freeze({ x: state.velocity.x, y: state.velocity.y + gravity * fixedDelta, z: state.velocity.z });
  const position = Object.freeze({ x: state.position.x + velocity.x * fixedDelta, y: state.position.y + velocity.y * fixedDelta, z: state.position.z + velocity.z * fixedDelta });
  return Object.freeze({ position, velocity });
}

export function hasLineOfSight(blockedSegments: readonly Segment3D[], ray: Segment3D, clearance = 0.05): boolean {
  return !blockedSegments.some(blocker => closestPointsBetweenSegments(blocker, ray).distance <= clearance);
}

const commandDamage: Readonly<Record<string, number>> = Object.freeze({ run: 0, interact: 0, attack: 17, skill_1: 15, skill_2: 0, skill_3: 0, skill_4: 0, skill_5: 22, skill_6: 0, skill_7: 10, skill_8: 29, skill_9: 43 });
export function ax1DamageForAction(action: string): number {
  const damage = commandDamage[action];
  if (damage === undefined) throw new Error("unsupported server combat action");
  return damage;
}
