/** Versioned, non-cryptographic projection randomness. Never use for credentials. */
export function seededRandom(seed: string): () => number {
  if (!seed.trim()) throw new Error("DETERMINISTIC_SEED_REQUIRED");
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function deterministicIndex(seed: string, count: number): number {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("DETERMINISTIC_COUNT_INVALID");
  return Math.floor(seededRandom(seed)() * count);
}

/**
 * A scene-owned projection clock and independent named random streams.
 * Inputs are the server's world identity and explicit logical ticks, never wall time.
 * This projects visuals; server receipts remain the authority for gameplay outcomes.
 */
export class DeterministicSimulation {
  static readonly version = "aurion-projection-v1";
  static readonly tickMilliseconds = 100;
  private currentTick = 0;
  private accumulator = 0;
  private readonly streams = new Map<string, () => number>();
  private readonly counters = new Map<string, number>();
  readonly seed: string;

  constructor(worldSeed: string, epoch: number) {
    if (typeof worldSeed !== "string" || !worldSeed.trim()) throw new Error("WORLD_SEED_REQUIRED");
    if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error("WORLD_EPOCH_INVALID");
    this.seed = JSON.stringify([DeterministicSimulation.version, worldSeed, epoch]);
  }

  get tick() { return this.currentTick; }
  get elapsedMilliseconds() { return this.currentTick * DeterministicSimulation.tickMilliseconds; }

  advanceTick() {
    if (this.currentTick >= Math.floor(Number.MAX_SAFE_INTEGER / DeterministicSimulation.tickMilliseconds)) throw new Error("PROJECTION_TICK_OVERFLOW");
    this.currentTick++;
  }

  /** Rendering may schedule ticks; only complete fixed steps advance the projection. */
  advanceProjection(deltaSeconds: number, onTick: (fixedDelta: number) => void) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 1) throw new Error("PROJECTION_DELTA_INVALID");
    const step = DeterministicSimulation.tickMilliseconds / 1000;
    this.accumulator += deltaSeconds;
    while (this.accumulator + Number.EPSILON >= step) {
      this.advanceTick();
      this.accumulator = Math.max(0, this.accumulator - step);
      onTick(step);
    }
  }

  random(scope: string): number {
    if (!scope) throw new Error("RANDOM_SCOPE_REQUIRED");
    let stream = this.streams.get(scope);
    if (!stream) {
      stream = seededRandom(JSON.stringify([this.seed, scope]));
      this.streams.set(scope, stream);
    }
    return stream();
  }

  nextId(scope: string): string {
    const sequence = (this.counters.get(scope) ?? 0) + 1;
    if (!scope || !Number.isSafeInteger(sequence)) throw new Error("PROJECTION_SEQUENCE_INVALID");
    this.counters.set(scope, sequence);
    return `${scope}:${this.currentTick}:${sequence}`;
  }

  shuffled<T>(scope: string, values: readonly T[]): T[] {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random(scope) * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
