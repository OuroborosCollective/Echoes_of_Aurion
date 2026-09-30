export type VisualConstructionLod = 0 | 1 | 2;

export type VisualConstructionCacheKeyInput = Readonly<{
  descriptorHash: string;
  grammarVersion: string;
  avatarProfileVersion: string;
  fitVersion: string;
  lod: VisualConstructionLod;
}>;

export type VisualConstructionCacheStats = Readonly<{
  capacity: number;
  size: number;
  hits: number;
  misses: number;
  evictions: number;
}>;

type CacheEntry<T> = Readonly<{
  key: string;
  value: T;
}>;

function requiredText(name: string, value: string): string {
  if (!value.trim()) throw new Error(`VISUAL_CONSTRUCTION_CACHE_${name}_REQUIRED`);
  return value;
}

export function visualConstructionCacheKey(input: VisualConstructionCacheKeyInput): string {
  requiredText("DESCRIPTOR_HASH", input.descriptorHash);
  requiredText("GRAMMAR_VERSION", input.grammarVersion);
  requiredText("AVATAR_PROFILE_VERSION", input.avatarProfileVersion);
  requiredText("FIT_VERSION", input.fitVersion);
  if (!Number.isInteger(input.lod) || input.lod < 0 || input.lod > 2) {
    throw new Error("VISUAL_CONSTRUCTION_CACHE_LOD_INVALID");
  }
  return [
    "aurion.visual-construction-cache.v1",
    input.descriptorHash,
    input.grammarVersion,
    input.avatarProfileVersion,
    input.fitVersion,
    String(input.lod),
  ].join("::");
}

/**
 * Runtime-only bounded LRU for immutable construction recipes.
 *
 * The cache never persists and never contributes to gameplay/loot identity.
 * A miss always reconstructs through the canonical compiler, so eviction,
 * restart and cache disablement cannot change semantic output.
 */
export class VisualConstructionRuntimeCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;

  constructor(private readonly capacity = 128) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("VISUAL_CONSTRUCTION_CACHE_CAPACITY_INVALID");
    }
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      this.missCount += 1;
      return undefined;
    }
    this.hitCount += 1;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): T {
    if (!key.trim()) throw new Error("VISUAL_CONSTRUCTION_CACHE_KEY_REQUIRED");
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, Object.freeze({ key, value }));
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
      this.evictionCount += 1;
    }
    return value;
  }

  getOrCreate(key: string, factory: () => T): T {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = factory();
    return this.set(key, value);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): VisualConstructionCacheStats {
    return Object.freeze({
      capacity: this.capacity,
      size: this.entries.size,
      hits: this.hitCount,
      misses: this.missCount,
      evictions: this.evictionCount,
    });
  }
}
