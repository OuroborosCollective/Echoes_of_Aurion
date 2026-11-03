import { AX1_CRAFTING_CONTENT_VERSION, AX1_CRAFTING_RECIPES } from "../shared/ax1CraftingCatalog";
import { AX1_INITIAL_RESOURCE_NODES } from "../shared/ax1ResourceEcologyProtocol";
import { ZONE_RESOURCE_CONTRACT_VERSION } from "../shared/zoneResourceContract";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { buildDiscoveryGraph, discoveryEdgeId, discoveryNodeId, type DiscoveryNode, type DiscoveryEdge } from "../shared/discoveryGraphProtocol";
import { ax1CraftingRecipeDigest, AX1_CRAFTING_RULESET_VERSION } from "./ax1CraftingProtocol";

/** Server-only index. Do not send the full catalog to an undiscovered actor. */
export function createCanonicalDiscoveryCatalog() {
  const resourceVersion = `aurion.zone-resource.v${ZONE_RESOURCE_CONTRACT_VERSION}`;
  const nodes = new Map<string, DiscoveryNode>();
  const edges: DiscoveryEdge[] = [];
  const addNode = (kind: DiscoveryNode["kind"], canonicalId: string, catalogVersion: string, definition: unknown) => {
    const id = discoveryNodeId(kind, canonicalId);
    const node = { id, kind, canonicalId, catalogVersion, definitionHash: canonicalSha256(definition) };
    const previous = nodes.get(id);
    if (previous && previous.definitionHash !== node.definitionHash) throw new Error("DISCOVERY_CATALOG_CONFLICT");
    nodes.set(id, node);
    return id;
  };
  const addEdge = (edge: Omit<DiscoveryEdge, "id">) => edges.push({ ...edge, id: discoveryEdgeId(edge) });
  // Material identity references only. Names/quantities remain in their owners.
  for (const recipe of AX1_CRAFTING_RECIPES) {
    const recipeId = addNode("recipe", recipe.id, AX1_CRAFTING_CONTENT_VERSION, { recipeDigest: ax1CraftingRecipeDigest(recipe.id) });
    addNode("material", recipe.outputItemId, "aurion.item-reference.v1", { itemId: recipe.outputItemId });
    const professionId = addNode("profession", recipe.professionId, AX1_CRAFTING_CONTENT_VERSION, { professionId: recipe.professionId });
    const preconditions: DiscoveryEdge["preconditions"] = recipe.ingredients.map(ingredient => ({
      nodeId: addNode("material", ingredient.itemId, "aurion.item-reference.v1", { itemId: ingredient.itemId }),
      predicate: "consumed", quantityExact: String(ingredient.quantity), unit: "item",
    }));
    preconditions.push({ nodeId: professionId, predicate: "level_at_least", quantityExact: String(recipe.requiredLevel), unit: "level" });
    for (const ingredient of recipe.ingredients) {
      const materialId = addNode("material", ingredient.itemId, "aurion.item-reference.v1", { itemId: ingredient.itemId });
      addEdge({ from: materialId, to: recipeId, relation: "USED_IN", ruleId: `${recipe.id}:${ingredient.itemId}`,
        ruleVersion: AX1_CRAFTING_RULESET_VERSION, ruleHash: canonicalSha256({ recipeDigest: ax1CraftingRecipeDigest(recipe.id), ingredient }),
        preconditions });
    }
  }
  for (const resource of AX1_INITIAL_RESOURCE_NODES) {
    const resourceId = addNode("resource_node", resource.id, resourceVersion, resource);
    const materialId = addNode("material", resource.resourceItemId, "aurion.item-reference.v1", { itemId: resource.resourceItemId });
    addEdge({ from: materialId, to: resourceId, relation: "HARVESTED_FROM", ruleId: `${resource.id}:yield`,
      ruleVersion: resourceVersion, ruleHash: canonicalSha256(resource),
      preconditions: [] });
  }
  const definitions = { nodes: [...nodes.values()], edges };
  return buildDiscoveryGraph(definitions, definitions);
}
