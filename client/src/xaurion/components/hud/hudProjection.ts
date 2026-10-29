import type { Ax1HudObjective } from "./hudTypes";

export type ProjectionLabel = "Confirmed" | "Stale" | "Unavailable" | "Waiting";

/** Maps a runtime projection state to its explicit, never colour-only label. */
export function projectionLabel(state: string): ProjectionLabel {
  switch (state) {
    case "live":
      return "Confirmed";
    case "stale":
      return "Stale";
    case "error":
      return "Unavailable";
    default:
      return "Waiting";
  }
}

export function splitObjectives(objectives: readonly Ax1HudObjective[]) {
  return {
    primary: objectives.find((objective) => objective.kind === "primary"),
    nearby: objectives.filter((objective) => objective.kind !== "primary"),
  };
}

/** XP fraction (0..1) from the server projection; undefined when nothing is confirmed. */
export function confirmedXpFraction(xp: number | undefined): number | undefined {
  return typeof xp === "number" && Number.isFinite(xp) ? Math.max(0, Math.min(1, xp)) : undefined;
}

export function hpTone(hp: number, maxHp: number): "ok" | "warn" | "danger" {
  const pct = maxHp > 0 ? (hp / maxHp) * 100 : 0;
  return pct < 25 ? "danger" : pct < 50 ? "warn" : "ok";
}

/** Short viewports (phone landscape) and narrow ones (phone portrait) start with compact panels. */
export const COMPACT_VIEWPORT_QUERY = "(max-width: 720px), (max-height: 520px)";

export function prefersCompactPanels(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(COMPACT_VIEWPORT_QUERY).matches;
}

/** Phone held sideways: no room for an inline party list, so the party head opens the party window instead. */
export function isShortLandscape(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-height: 520px) and (orientation: landscape)").matches;
}
