const staticDistribution = import.meta.env.VITE_AURION_STATIC_DISTRIBUTION === "true";

export function hasAurionApi(): boolean {
  if (!staticDistribution) return true;
  return typeof window !== "undefined" && window.location.hostname === "arelogic.space";
}

function resolveAurionAsset(filename: string, manuscriptPath: string): string {
  return staticDistribution ? `${import.meta.env.BASE_URL}aurion-assets/${filename}` : manuscriptPath;
}

export const aurionAssets = {
  wayfinder: resolveAurionAsset("aurion-wayfinder-animated_6bf370ef.glb", "/manus-storage/aurion-wayfinder-animated_6bf370ef.glb"),
  veilguard: resolveAurionAsset("aurion-veilguard-animated_d6b28a5b.glb", "/manus-storage/aurion-veilguard-animated_d6b28a5b.glb"),
  floorKit: resolveAurionAsset("env_asterion_floor_kit_a01.glb", "/manus-storage/env_asterion_floor_kit_a01_ec94e853.glb"),
  archway: resolveAurionAsset("env_asterion_archway_a01.glb", "/manus-storage/env_asterion_archway_a01_fe233f19.glb"),
  expeditionTheme: resolveAurionAsset("aurion-expedition-theme_a8401a12.mp3", "/manus-storage/aurion-expedition-theme_a8401a12.mp3"),
  trailer: resolveAurionAsset("aurion-hero-trailer-en-de_c44ee2e1.mp4", "/manus-storage/aurion-hero-trailer-en-de_c44ee2e1.mp4"),
  trailerPoster: resolveAurionAsset("aurion-social-keyframe_5edc4882.png", "/manus-storage/aurion-social-keyframe_5edc4882.png"),
} as const;
