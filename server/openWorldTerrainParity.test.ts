import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildOpenWorldTerrain, type OpenWorldZoneKey } from "./openWorldProtocol";

// Baseline: main 76afd81bac8432c3a6e7a18177cac0cbf24c94c4.
// The digest covers the complete actual terrain snapshot, including all 64 tiles.
const baseline: Record<OpenWorldZoneKey, string> = {
  observatory_threshold: "0432ff30d07469f1df74e3640d55a86d67c53dcae1d5671345e17c912a6d8eb2",
  windhollow: "740e2da71ca07753de3fac105f0f670f54a361d4f63301e09b38dbe50947d02a",
  emberfall: "018d757d95276bc0b1844a788c6b164cf7908c5ed60386647f81d580ff354d1d",
  cinder_vault: "0c30802570ab50a8f6b0d595e71d60959398ff97ee86b4b3e920153ea6855e71",
  starfall_crater: "0c30802570ab50a8f6b0d595e71d60959398ff97ee86b4b3e920153ea6855e71",
  clockwork_woods: "0c30802570ab50a8f6b0d595e71d60959398ff97ee86b4b3e920153ea6855e71",
  sunwatch_bastion: "0c30802570ab50a8f6b0d595e71d60959398ff97ee86b4b3e920153ea6855e71",
};
describe("terrain snapshot baseline", () => {
  for (const [zone, expected] of Object.entries(baseline) as Array<[OpenWorldZoneKey, string]>) {
    it(`preserves all terrain data in ${zone}`, () => {
      const terrain = buildOpenWorldTerrain(zone);
      expect(terrain.tiles).toHaveLength(64);
      expect(createHash("sha256").update(JSON.stringify(terrain)).digest("hex")).toBe(expected);
    });
  }
});
