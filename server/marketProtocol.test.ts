import { describe, expect, it } from "vitest";
import { assertMarketPrice, assertNotOwnListing, systemSaleValue } from "./marketProtocol";

describe("market protocol", () => {
  it("berechnet nachvollziehbare Systemverkaufswerte nach Gegenstandsstufe und Qualität", () => {
    expect(systemSaleValue(12, "normal")).toBe(36);
    expect(systemSaleValue(12, "rare")).toBe(144);
    expect(systemSaleValue(12, "unique")).toBe(432);
  });

  it("lässt nur begrenzte ganzzahlige Angebotspreise zu", () => {
    expect(assertMarketPrice(250)).toBe(250);
    expect(() => assertMarketPrice(0)).toThrow("Der Angebotspreis muss zwischen 1 und 1.000.000 Aurion liegen.");
    expect(() => assertMarketPrice(1_000_001)).toThrow("Der Angebotspreis muss zwischen 1 und 1.000.000 Aurion liegen.");
  });

  it("unterbindet den Kauf eines eigenen Angebots", () => {
    expect(() => assertNotOwnListing(8, 8)).toThrow("Eigene Angebote können nicht gekauft werden.");
    expect(() => assertNotOwnListing(8, 9)).not.toThrow();
  });
});
