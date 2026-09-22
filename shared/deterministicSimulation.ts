/**
 * Deterministic PRNG and simulation clock for Aurion/AX1 client-side presentation projection.
 * Guaranteed reproducible given worldSeed and epoch.
 */
function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return h === 0 ? 1 : h;
}

/**
 * Creates a deterministic PRNG function initialized with a string or number seed.
 * Returns floats in [0, 1).
 */
export function seededRandom(seed: string | number): () => number {
  let seedState = typeof seed === "number" ? (seed >>> 0) || 1 : hashString(String(seed));
  let counter = 0;

  return () => {
    counter = (counter + 1) >>> 0;
    let t = (seedState ^ (counter * 0x9e3779b9)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a deterministic index in [0, length) given a seed.
 */
export function deterministicIndex(seed: string | number, length: number): number {
  if (length <= 1) return 0;
  const rng = seededRandom(seed);
  return Math.floor(rng() * length) % length;
}

export class DeterministicSimulation {
  public elapsedMilliseconds: number = 0;
  public tick: number = 0;
  private channelCounters: Map<string, number> = new Map();
  private accumulator: number = 0;
  private readonly fixedStep: number = 0.1; // 100ms per logical tick

  constructor(public readonly worldSeed: string, public readonly epoch: number = 0) {
    if (!worldSeed || typeof worldSeed !== "string") {
      throw new Error("WORLD_SEED_REQUIRED");
    }
    if (typeof epoch !== "number" || !Number.isInteger(epoch) || epoch < 0 || !Number.isFinite(epoch)) {
      throw new Error("WORLD_EPOCH_INVALID");
    }
  }

  public get seed(): string {
    return this.worldSeed;
  }

  /**
   * Deterministic pseudo-random number generator in [0, 1).
   * Each channel has an independent stream isolated from other channels.
   */
  public random(channel: string = "default"): number {
    const count = (this.channelCounters.get(channel) ?? 0) + 1;
    this.channelCounters.set(channel, count);
    const channelSeed = hashString(`${this.worldSeed}:${this.epoch}:${channel}`);
    let t = (channelSeed ^ (count * 0x9e3779b9)) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a deterministically shuffled copy of the provided array.
   */
  public shuffled<T>(items: readonly T[], channel: string = "default"): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random(channel) * (i + 1));
      const tmp = result[i];
      result[i] = result[j];
      result[j] = tmp;
    }
    return result;
  }

  /**
   * Generates a deterministic sequential identifier.
   */
  public nextId(prefix: string = "id"): string {
    const count = (this.channelCounters.get("nextId") ?? 0) + 1;
    this.channelCounters.set("nextId", count);
    return `${prefix}_${this.epoch}_${count.toString(36)}`;
  }

  /**
   * Advances the simulation clock with fixed-timestep sub-stepping.
   */
  public advanceProjection(deltaSeconds: number, onStep: (stepSeconds: number) => void): void {
    if (typeof deltaSeconds !== "number" || deltaSeconds < 0 || !Number.isFinite(deltaSeconds) || deltaSeconds > 1) {
      throw new Error("PROJECTION_DELTA_INVALID");
    }

    this.accumulator += deltaSeconds;

    // Use floating point epsilon threshold to avoid precision issues
    while (this.accumulator >= this.fixedStep - 1e-7) {
      this.tick++;
      this.elapsedMilliseconds += Math.round(this.fixedStep * 1000);
      this.accumulator -= this.fixedStep;
      if (this.accumulator < 0) this.accumulator = 0;
      onStep(this.fixedStep);
    }
  }
}
