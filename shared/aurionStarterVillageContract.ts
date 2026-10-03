import catalog from "./worldAssetCatalog.json" with { type: "json" };
import { AURION_RETURN_STONE_POSITION } from "./aurionReturnStoneContract";

export const AURION_STARTER_VILLAGE_CONTRACT_VERSION =
  "aurion.starter-village.v1" as const;

export type StarterVillageDirection = "north" | "east" | "south" | "west";
export type StarterVillagePointMm = Readonly<{ x: number; z: number }>;

const point = (x: number, z: number): StarterVillagePointMm =>
  Object.freeze({ x, z });
const catalogIds = new Set(catalog.assets.map(asset => asset.id));
function catalogAssetId<const T extends string>(id: T): T {
  if (!catalogIds.has(id))
    throw new Error(`STARTER_VILLAGE_ASSET_NOT_IN_CATALOG:${id}`);
  return id;
}

/**
 * Aurion-owned fixed-point geometry. The spawn is deliberately the established
 * return-stone position by reference, not a copied or newly calculated value.
 */
export const AURION_STARTER_VILLAGE_CENTER_MM = point(0, 0);
export const AURION_STARTER_VILLAGE_SPAWN_MM = AURION_RETURN_STONE_POSITION;
/** Reserved layout corridor; road surface rendering is not part of this pilot. */
export const AURION_STARTER_VILLAGE_RING_ROAD = Object.freeze({
  center: AURION_STARTER_VILLAGE_CENTER_MM,
  radiusMm: 18_000,
  widthMm: 4_000,
});

export const AURION_STARTER_VILLAGE_GATES = Object.freeze([
  Object.freeze({
    id: "starter-village-gate-north",
    direction: "north" as const,
    position: point(0, -30_000),
    pilot: true,
  }),
  Object.freeze({
    id: "starter-village-gate-east",
    direction: "east" as const,
    position: point(30_000, 0),
    pilot: false,
  }),
  Object.freeze({
    id: "starter-village-gate-south",
    direction: "south" as const,
    position: point(0, 30_000),
    pilot: false,
  }),
  Object.freeze({
    id: "starter-village-gate-west",
    direction: "west" as const,
    position: point(-30_000, 0),
    pilot: false,
  }),
] as const);

/** Four unobstructed main axes join the centre to their matching gate anchor. */
export const AURION_STARTER_VILLAGE_MAIN_AXES = Object.freeze(
  AURION_STARTER_VILLAGE_GATES.map(gate =>
    Object.freeze({
      id: `starter-village-axis-${gate.direction}`,
      direction: gate.direction,
      from: AURION_STARTER_VILLAGE_CENTER_MM,
      to: gate.position,
      widthMm: 6_000,
    })
  )
);

export type StarterVillageWallPlan = Readonly<{
  presentation: "partial-set" | "closed";
  geometricallyOpenGateIds: readonly string[];
}>;

/**
 * IDs are declarations, not geometric evidence. The admitted pilot assets have
 * no wall/gate colliders, so this version cannot certify any closed-wall plan.
 * Keep that unsupported mode fail-closed until a geometry-backed contract exists.
 */
export function assertStarterVillageWallPlan(
  plan: StarterVillageWallPlan
): StarterVillageWallPlan {
  if (plan.presentation === "closed") {
    throw new Error("STARTER_VILLAGE_CLOSED_WALL_REQUIRES_GEOMETRIC_EVIDENCE");
  }
  return plan;
}

/**
 * The pilot is intentionally only a partial set: four gate markers, a small
 * north-gate wall fragment and village landmarks. It is not a closed wall.
 */
export const AURION_STARTER_VILLAGE_WALL_PLAN = Object.freeze(
  assertStarterVillageWallPlan({
    presentation: "partial-set",
    geometricallyOpenGateIds: AURION_STARTER_VILLAGE_GATES.map(gate => gate.id),
  })
);

export const AURION_STARTER_VILLAGE_ASSET_PLACEMENTS = Object.freeze([
  ...AURION_STARTER_VILLAGE_GATES.map((gate, index) =>
    Object.freeze({
      id: gate.id,
      assetId: catalogAssetId("city-fencewooddoor-gate"),
      xMm: gate.position.x,
      zMm: gate.position.z,
      rotation: (index % 2) as 0 | 1,
    })
  ),
  Object.freeze({
    id: "starter-village-pilot-wall-nw",
    assetId: catalogAssetId("city-wall-stone01"),
    xMm: -9_000,
    zMm: -30_000,
    rotation: 1 as const,
  }),
  Object.freeze({
    id: "starter-village-pilot-wall-ne",
    assetId: catalogAssetId("city-wall-stone02"),
    xMm: 9_000,
    zMm: -30_000,
    rotation: 1 as const,
  }),
  Object.freeze({
    id: "starter-village-market-nw",
    assetId: catalogAssetId("city-market03"),
    xMm: -22_000,
    zMm: -22_000,
    rotation: 0 as const,
  }),
  Object.freeze({
    id: "starter-village-hut-ne",
    assetId: catalogAssetId("city-stylized-hut01"),
    xMm: 22_000,
    zMm: -22_000,
    rotation: 3 as const,
  }),
  Object.freeze({
    id: "starter-village-hut-se",
    assetId: catalogAssetId("city-stylized-hut02"),
    xMm: 22_000,
    zMm: 22_000,
    rotation: 2 as const,
  }),
  Object.freeze({
    id: "starter-village-hut-sw",
    assetId: catalogAssetId("city-stylized-hut01"),
    xMm: -22_000,
    zMm: 22_000,
    rotation: 1 as const,
  }),
] as const);
