import { describe, expect, it } from "vitest";
import { AX1_CRAFTING_RECIPES } from "../shared/ax1CraftingCatalog";
import { AX1_INITIAL_RESOURCE_NODES } from "../shared/ax1ResourceEcologyProtocol";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { discoveryRegionProjectionSchema } from "../shared/discoveryCodexProtocol";
import { createCanonicalDiscoveryCatalog } from "./discoveryCatalog";
import { discoveryResponseMeta } from "./_core/discoveryResponseMeta";

// These tests pin semantic links to existing owner definitions, rather than
// asserting a made-up rain/fungus catalog as if it were already live content.
describe("Aurion canonical discovery catalog", () => {
  it("indexes every existing recipe ingredient with exact canonical quantities", () => {
    const graph = createCanonicalDiscoveryCatalog();
    expect(createCanonicalDiscoveryCatalog()).toEqual(graph);
    for (const recipe of AX1_CRAFTING_RECIPES) for (const ingredient of recipe.ingredients) {
      const edge = graph.edges.find(e => e.from === `material:${ingredient.itemId}` && e.to === `recipe:${recipe.id}`);
      expect(edge?.relation).toBe("USED_IN");
      expect(edge?.preconditions).toContainEqual({ nodeId: `material:${ingredient.itemId}`, predicate: "consumed", quantityExact: String(ingredient.quantity), unit: "item" });
      expect(edge?.preconditions).toContainEqual({ nodeId: `profession:${recipe.professionId}`, predicate: "level_at_least", quantityExact: String(recipe.requiredLevel), unit: "level" });
      expect(edge?.preconditions).toHaveLength(recipe.ingredients.length + 1);
    }
    expect(graph.nodes.some(n => /rain|fungus/.test(n.canonicalId))).toBe(false);
    expect(graph.mutationAuthority).toBe("none");
  });
  it("uses resource content references without claiming availability or converting raw materials", () => {
    const graph = createCanonicalDiscoveryCatalog();
    for (const resource of AX1_INITIAL_RESOURCE_NODES) {
      const edge = graph.edges.find(e => e.from === `material:${resource.resourceItemId}` && e.to === `resource_node:${resource.id}`);
      expect(edge?.relation).toBe("HARVESTED_FROM");
      expect(edge?.ruleHash).toBe(canonicalSha256(resource));
    }
    expect(graph.edges.some(e => e.from === "material:res_copper_tin_ore" && e.to.includes("recipe"))).toBe(false);
  });
  it("applies personal cache policy to mixed HTTP batches without changing unrelated routes", () => {
    const expected = { headers: { "cache-control": "private, no-store", vary: "trpc-accept, accept, Authorization, Cookie" } };
    expect(discoveryResponseMeta({ paths: ["gameplay.discoveryRegion"] })).toEqual(expected);
    expect(discoveryResponseMeta({ paths: ["gameplay.openWorld", "gameplay.discoveryRegion"] })).toEqual(expected);
    expect(discoveryResponseMeta({ paths: ["gameplay.openWorld"] })).toEqual({});
    expect(discoveryResponseMeta({})).toEqual({});
  });
  it("locked projection cannot carry hidden identifiers, names or graph relations", () => {
    const base = { schema: "aurion.discovery-codex.v1", worldId: "world", worldEpoch: 1,
      catalogFingerprint: canonicalSha256("catalog"), scopeFingerprint: canonicalSha256("scope"),
      entry: { state: "locked" }, currentWorldState: "not_projected", mutationAuthority: "none", fingerprint: canonicalSha256("projection") };
    expect(discoveryRegionProjectionSchema.parse(base).entry).toEqual({ state: "locked" });
    for (const extra of [{ canonicalId: "secret" }, { name: "secret" }, { connections: ["secret"] }])
      expect(discoveryRegionProjectionSchema.safeParse({ ...base, entry: { state: "locked", ...extra } }).success).toBe(false);
  });
});
