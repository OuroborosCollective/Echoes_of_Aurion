export const chunkPerformanceTiers = ["phone", "tablet", "desktop"] as const;
export type ChunkPerformanceTier = (typeof chunkPerformanceTiers)[number];
export type ChunkSimulationBudget = Readonly<{
  tier: ChunkPerformanceTier;
  activeMobs: number;
  activeNpcs: number;
  activeProps: number;
  particles: number;
  remotePlayers: number;
  aoiRadiusMeters: number;
  highLodObjects: number;
  mediumLodObjects: number;
  lowLodObjects: number;
  serverTickDivisor: 1 | 2 | 4;
}>;

export function resolveChunkSimulationBudget(input: Readonly<{ tier: ChunkPerformanceTier; dangerBps: number; partySize: number }>): ChunkSimulationBudget {
  if (!chunkPerformanceTiers.includes(input.tier)) throw new Error("unknown chunk performance tier");
  if (!Number.isSafeInteger(input.dangerBps) || input.dangerBps < 0 || input.dangerBps > 60_000) throw new Error("dangerBps is outside the bounded range");
  if (!Number.isSafeInteger(input.partySize) || input.partySize < 1 || input.partySize > 8) throw new Error("partySize must be from 1 through 8");
  const base = {
    phone: { activeMobs: 12, activeNpcs: 14, activeProps: 700, particles: 96, remotePlayers: 12, aoiRadiusMeters: 90, highLodObjects: 80, mediumLodObjects: 220, lowLodObjects: 500, serverTickDivisor: 4 as const },
    tablet: { activeMobs: 18, activeNpcs: 22, activeProps: 1_200, particles: 180, remotePlayers: 24, aoiRadiusMeters: 120, highLodObjects: 140, mediumLodObjects: 420, lowLodObjects: 900, serverTickDivisor: 2 as const },
    desktop: { activeMobs: 28, activeNpcs: 36, activeProps: 2_000, particles: 320, remotePlayers: 48, aoiRadiusMeters: 160, highLodObjects: 240, mediumLodObjects: 780, lowLodObjects: 1_600, serverTickDivisor: 1 as const },
  }[input.tier];
  const dangerBonus = Math.max(0, Math.min(8, Math.floor((input.dangerBps - 10_000) / 2_500)));
  return Object.freeze({
    tier: input.tier,
    ...base,
    activeMobs: base.activeMobs + Math.min(dangerBonus, 4),
    activeNpcs: base.activeNpcs + Math.min(input.partySize - 1, 4),
    remotePlayers: base.remotePlayers + input.partySize - 1,
  });
}
