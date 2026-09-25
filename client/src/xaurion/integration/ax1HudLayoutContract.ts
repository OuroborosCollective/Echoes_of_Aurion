export const AX1_HUD_LAYOUT_CONTRACT = "ax1-hud-layout.v1" as const;

export type Ax1HudLayoutBand = "compact" | "medium" | "large";
export type Ax1HudOrientation = "portrait" | "landscape";
export type Ax1HudMenuKey =
  | "character" | "inventory" | "crafting" | "quests" | "party" | "map"
  | "controls" | "disciplines" | "dungeons" | "companion" | "chat"
  | "guild" | "economy" | "npc" | "territory" | "homestead"
  | "evidence" | "research";

export const AX1_HUD_BREAKPOINTS = Object.freeze({
  compactMaxWidth: 719,
  mediumMaxWidth: 1000,
} as const);

export const AX1_HUD_GESTURE_OWNERSHIP = Object.freeze({
  root: "presentation",
  interactiveControls: "hud",
  worldSurface: "world",
} as const);

export const AX1_HUD_MENU_PATH: readonly Ax1HudMenuKey[] = Object.freeze([
  "character", "inventory", "crafting", "quests", "party", "map",
  "controls", "disciplines", "dungeons", "companion", "chat",
  "guild", "economy", "npc", "territory", "homestead", "evidence", "research",
]);

export type Ax1HudLayout = Readonly<{
  contract: typeof AX1_HUD_LAYOUT_CONTRACT;
  band: Ax1HudLayoutBand;
  orientation: Ax1HudOrientation;
  safeArea: true;
  menuPath: typeof AX1_HUD_MENU_PATH;
}>;

export function resolveAx1HudLayout(input: Readonly<{
  width: number;
  height: number;
  orientation?: Ax1HudOrientation;
}>): Ax1HudLayout {
  if (!Number.isFinite(input.width) || !Number.isFinite(input.height) || input.width <= 0 || input.height <= 0) {
    throw new Error("AX1_HUD_VIEWPORT_INVALID");
  }

  const orientation = input.orientation ?? (input.width >= input.height ? "landscape" : "portrait");
  const band: Ax1HudLayoutBand =
    input.width <= AX1_HUD_BREAKPOINTS.compactMaxWidth
      ? "compact"
      : input.width <= AX1_HUD_BREAKPOINTS.mediumMaxWidth
        ? "medium"
        : "large";

  return Object.freeze({
    contract: AX1_HUD_LAYOUT_CONTRACT,
    band,
    orientation,
    safeArea: true,
    menuPath: AX1_HUD_MENU_PATH,
  });
}
