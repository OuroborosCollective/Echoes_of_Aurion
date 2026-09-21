import { z } from "zod";

export const MAX_MOBILE_VRAM_BYTES = 250 * 1024 * 1024; // 250 MB WebGL2 VRAM ceiling

export const RING_THRESHOLDS_MM = Object.freeze({
  RING_0_NEAR_MM: 30_000,   // 0 - 30m
  RING_1_MID_MM: 90_000,    // 30m - 90m
  RING_2_FAR_MM: 180_000,   // 90m - 180m
});

export type InterestRing = "ring_0_near" | "ring_1_mid" | "ring_2_far" | "ring_3_evicted";
export type LodLevel = "lod0" | "lod1" | "lod2" | "evicted";

export type MobileAssetCategory =
  | "player_equipment"
  | "player_character"
  | "boss_npc"
  | "standard_npc"
  | "world_nature"
  | "world_environment"
  | "decorative_prop";

export const CATEGORY_PRIORITY: Readonly<Record<MobileAssetCategory, number>> = Object.freeze({
  player_equipment: 100,
  player_character: 90,
  boss_npc: 80,
  standard_npc: 60,
  world_nature: 40,
  world_environment: 30,
  decorative_prop: 10,
});

export interface MobileAssetDescriptor {
  assetId: string;
  category: MobileAssetCategory;
  estimatedVramBytes: number;
  posMm: { x: number; z: number };
}

export interface LodAssignment {
  assetId: string;
  ring: InterestRing;
  lod: LodLevel;
  allocatedVramBytes: number;
}

export interface MobileResourceGovernorResult {
  totalRequestedVramBytes: number;
  totalAllocatedVramBytes: number;
  vramCeilingBytes: number;
  activeCount: number;
  evictedCount: number;
  lodAssignments: LodAssignment[];
  evictedAssetIds: string[];
  budgetCompliant: boolean;
}

/**
 * Deterministic integer distance approximation using integer arithmetic to prevent floating-point drift.
 */
export function integerDistanceMm(x1: number, z1: number, x2: number, z2: number): number {
  const dx = Math.abs(Math.trunc(x1) - Math.trunc(x2));
  const dz = Math.abs(Math.trunc(z1) - Math.trunc(z2));
  // Fast and accurate integer hyp approximation: max + 3/8 min
  const max = Math.max(dx, dz);
  const min = Math.min(dx, dz);
  return Math.trunc(max + (min * 3) / 8);
}

export function classifyInterestRing(distanceMm: number): { ring: InterestRing; lod: LodLevel } {
  if (distanceMm <= RING_THRESHOLDS_MM.RING_0_NEAR_MM) {
    return { ring: "ring_0_near", lod: "lod0" };
  }
  if (distanceMm <= RING_THRESHOLDS_MM.RING_1_MID_MM) {
    return { ring: "ring_1_mid", lod: "lod1" };
  }
  if (distanceMm <= RING_THRESHOLDS_MM.RING_2_FAR_MM) {
    return { ring: "ring_2_far", lod: "lod2" };
  }
  return { ring: "ring_3_evicted", lod: "evicted" };
}

/**
 * Calculates VRAM multiplier by LOD:
 * lod0 = 100%
 * lod1 = 40% (mipmaps + simplified mesh)
 * lod2 = 10% (billboard / low proxy)
 * evicted = 0%
 */
export function calculateVramForLod(baseBytes: number, lod: LodLevel): number {
  const safeBase = Math.max(0, Math.trunc(baseBytes));
  switch (lod) {
    case "lod0":
      return safeBase;
    case "lod1":
      return Math.trunc((safeBase * 40) / 100);
    case "lod2":
      return Math.trunc((safeBase * 10) / 100);
    case "evicted":
      return 0;
  }
}

/**
 * Evaluates mobile resource budget deterministically without Date.now() or Math.random().
 */
export function evaluateMobileResourcePlan(params: {
  assets: readonly MobileAssetDescriptor[];
  playerPosMm: { x: number; z: number };
  vramCeilingBytes?: number;
}): MobileResourceGovernorResult {
  const ceiling = params.vramCeilingBytes ?? MAX_MOBILE_VRAM_BYTES;
  const assignments: LodAssignment[] = [];
  const evictedIds: string[] = [];

  let requestedTotal = 0;

  // Step 1: Initial ring and LOD classification by distance
  const candidates = params.assets.map(asset => {
    const dist = integerDistanceMm(
      params.playerPosMm.x,
      params.playerPosMm.z,
      asset.posMm.x,
      asset.posMm.z
    );
    const { ring, lod } = classifyInterestRing(dist);
    const neededBytes = calculateVramForLod(asset.estimatedVramBytes, lod);
    requestedTotal += neededBytes;

    return {
      asset,
      dist,
      ring,
      lod,
      neededBytes,
      priority: CATEGORY_PRIORITY[asset.category] ?? 0,
    };
  });

  // Step 2: Deterministic sorting
  // Priors: ring asc (near first), priority desc (player/boss first), assetId asc (deterministic tie-breaker)
  const ringOrder: Record<InterestRing, number> = {
    ring_0_near: 0,
    ring_1_mid: 1,
    ring_2_far: 2,
    ring_3_evicted: 3,
  };

  candidates.sort((a, b) => {
    const ringDiff = ringOrder[a.ring] - ringOrder[b.ring];
    if (ringDiff !== 0) return ringDiff;
    const prioDiff = b.priority - a.priority;
    if (prioDiff !== 0) return prioDiff;
    return a.asset.assetId.localeCompare(b.asset.assetId);
  });

  // Step 3: Packing under the VRAM ceiling
  let currentAllocated = 0;

  for (const candidate of candidates) {
    if (candidate.ring === "ring_3_evicted") {
      assignments.push({
        assetId: candidate.asset.assetId,
        ring: candidate.ring,
        lod: "evicted",
        allocatedVramBytes: 0,
      });
      evictedIds.push(candidate.asset.assetId);
      continue;
    }

    if (currentAllocated + candidate.neededBytes <= ceiling) {
      currentAllocated += candidate.neededBytes;
      assignments.push({
        assetId: candidate.asset.assetId,
        ring: candidate.ring,
        lod: candidate.lod,
        allocatedVramBytes: candidate.neededBytes,
      });
    } else {
      // Over budget: try stepping down LOD or evicting
      let degradedLod: LodLevel = "evicted";
      let degradedBytes = 0;

      if (candidate.lod === "lod0") {
        const tryLod1 = calculateVramForLod(candidate.asset.estimatedVramBytes, "lod1");
        if (currentAllocated + tryLod1 <= ceiling) {
          degradedLod = "lod1";
          degradedBytes = tryLod1;
        } else {
          const tryLod2 = calculateVramForLod(candidate.asset.estimatedVramBytes, "lod2");
          if (currentAllocated + tryLod2 <= ceiling) {
            degradedLod = "lod2";
            degradedBytes = tryLod2;
          }
        }
      } else if (candidate.lod === "lod1") {
        const tryLod2 = calculateVramForLod(candidate.asset.estimatedVramBytes, "lod2");
        if (currentAllocated + tryLod2 <= ceiling) {
          degradedLod = "lod2";
          degradedBytes = tryLod2;
        }
      }

      if (degradedLod !== "evicted") {
        currentAllocated += degradedBytes;
        assignments.push({
          assetId: candidate.asset.assetId,
          ring: candidate.ring,
          lod: degradedLod,
          allocatedVramBytes: degradedBytes,
        });
      } else {
        assignments.push({
          assetId: candidate.asset.assetId,
          ring: candidate.ring,
          lod: "evicted",
          allocatedVramBytes: 0,
        });
        evictedIds.push(candidate.asset.assetId);
      }
    }
  }

  // Sort assignments back by assetId for stable output
  assignments.sort((a, b) => a.assetId.localeCompare(b.assetId));
  evictedIds.sort((a, b) => a.localeCompare(b));

  return {
    totalRequestedVramBytes: requestedTotal,
    totalAllocatedVramBytes: currentAllocated,
    vramCeilingBytes: ceiling,
    activeCount: assignments.length - evictedIds.length,
    evictedCount: evictedIds.length,
    lodAssignments: assignments,
    evictedAssetIds: evictedIds,
    budgetCompliant: currentAllocated <= ceiling,
  };
}

export const MobileResourceGovernorInputSchema = z.object({
  playerPosMm: z.object({
    x: z.number().int(),
    z: z.number().int(),
  }),
  assets: z.array(
    z.object({
      assetId: z.string().trim().min(3).max(64),
      category: z.enum([
        "player_equipment",
        "player_character",
        "boss_npc",
        "standard_npc",
        "world_nature",
        "world_environment",
        "decorative_prop",
      ]),
      estimatedVramBytes: z.number().int().min(0).max(100_000_000),
      posMm: z.object({
        x: z.number().int(),
        z: z.number().int(),
      }),
    })
  ).max(256),
  vramCeilingBytes: z.number().int().positive().optional(),
});
