import { assertRuntimeIntegerInRange } from "../shared/runtimeContracts";

export type MarketQuality = "normal" | "magic" | "rare" | "set" | "unique";

const qualityMultiplier: Record<MarketQuality, number> = {
  normal: 1,
  magic: 2,
  rare: 4,
  set: 8,
  unique: 12,
};

export function systemSaleValue(itemLevel: number, quality: MarketQuality): number {
  assertRuntimeIntegerInRange(itemLevel, 1, 99, "Die Gegenstandsstufe ist ungültig.");
  return Math.max(1, itemLevel * qualityMultiplier[quality] * 3);
}

export function assertMarketPrice(value: number): number {
  return assertRuntimeIntegerInRange(value, 1, 1_000_000, "Der Angebotspreis muss zwischen 1 und 1.000.000 Aurion liegen.");
}

export function assertNotOwnListing(sellerUserId: number, buyerUserId: number): void {
  if (sellerUserId === buyerUserId) throw new Error("Eigene Angebote können nicht gekauft werden.");
}
