import { wasdGlbCatalog, wasdGlbCatalogSummary, wasdGlbSourceRevision } from "./wasdGlbCatalog";

const staticDistribution = import.meta.env.VITE_AURION_STATIC_DISTRIBUTION === "true";

export function hasAurionApi(): boolean {
  if (!staticDistribution) return true;
  return typeof window !== "undefined" && window.location.hostname === "arelogic.space";
}

function resolveAurionAsset(filename: string, manuscriptPath: string): string {
  if (!staticDistribution) return manuscriptPath;
  if (typeof window !== "undefined" && window.location.hostname === "arelogic.space") return `/aurion-assets/${filename}`;
  return `${import.meta.env.BASE_URL}aurion-assets/${filename}`;
}

export const aurionAssets = {
  wayfinder: resolveAurionAsset("aurion-wayfinder-animated_6bf370ef.glb", "/manus-storage/aurion-wayfinder-animated_6bf370ef.glb"),
  veilguard: resolveAurionAsset("aurion-veilguard-animated_d6b28a5b.glb", "/manus-storage/aurion-veilguard-animated_d6b28a5b.glb"),
  floorKit: resolveAurionAsset("env_asterion_floor_kit_a01.glb", "/manus-storage/env_asterion_floor_kit_a01_ec94e853.glb"),
  archway: resolveAurionAsset("env_asterion_archway_a01.glb", "/manus-storage/env_asterion_archway_a01_fe233f19.glb"),
  expeditionTheme: resolveAurionAsset("aurion-expedition-theme_a8401a12.mp3", "/manus-storage/aurion-expedition-theme_a8401a12.mp3"),
  trailer: resolveAurionAsset("aurion-hero-trailer-en-de_c44ee2e1.mp4", "/manus-storage/aurion-hero-trailer-en-de_c44ee2e1.mp4"),
  trailerPoster: resolveAurionAsset("aurion-social-keyframe_5edc4882.png", "/manus-storage/aurion-social-keyframe_5edc4882.png"),
  expanseReference: "/manus-storage/aurion-expanse-windhollow-reference_fed3662e.jpg",
  terrain: {
    grass: "/manus-storage/aurion-terrain-grass_811245e1.png",
    flowerMeadow: "/manus-storage/aurion-terrain-flower-meadow_c5078eb0.png",
    earth: "/manus-storage/aurion-terrain-earth_f53862cb.png",
    farmland: "/manus-storage/aurion-terrain-farmland_2c4edf2e.png",
    gardenParcels: "/manus-storage/aurion-terrain-garden-parcels_8810616b.png",
    starpath: "/manus-storage/aurion-terrain-starpath_37c69d4b.png",
    starpathCrossing: "/manus-storage/aurion-terrain-starpath-crossing_ead3a305.png",
  },
  glbCandidates: {
    astralwisp: "/manus-storage/aurion-astralwisp-mobile_8898dcae.glb",
    returnStone: "/manus-storage/aurion-return-stone-mobile_7d892a40.glb",
    starpathArchway: "/manus-storage/aurion-starpath-archway-mobile_bb96597a.glb",
    tripoFlowerShrub: "/manus-storage/aurion-tripo-flower-shrub_e4191cad.glb",
    tripoStarpathMarker: "/manus-storage/aurion-tripo-starpath-marker_da5fe3a7.glb",
    tripoGardenBorder: "/manus-storage/aurion-tripo-garden-border_8032d87a.glb",
  },
  wasdGlb: {
    sourceRevision: wasdGlbSourceRevision,
    summary: wasdGlbCatalogSummary,
    catalog: wasdGlbCatalog,
    streamable: wasdGlbCatalog.filter(asset => asset.budgetStatus === "streamable"),
  },
} as const;
