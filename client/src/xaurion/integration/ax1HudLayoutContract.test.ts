import { describe, expect, it } from "vitest";
import {
  AX1_HUD_BREAKPOINTS,
  AX1_HUD_GESTURE_OWNERSHIP,
  AX1_HUD_LAYOUT_CONTRACT,
  AX1_HUD_MENU_PATH,
  resolveAx1HudLayout,
} from "./ax1HudLayoutContract";

describe("AX1 HUD layout contract", () => {
  it.each([
    [375, 812, "compact", "portrait"],
    [768, 1024, "medium", "portrait"],
    [1366, 768, "large", "landscape"],
    [812, 375, "medium", "landscape"],
  ] as const)("resolves representative viewport %sx%s", (width, height, expectedBand, expectedOrientation) => {
    const layout = resolveAx1HudLayout({ width, height });
    expect(layout.contract).toBe(AX1_HUD_LAYOUT_CONTRACT);
    expect(layout.band).toBe(expectedBand);
    expect(layout.orientation).toBe(expectedOrientation);
    expect(layout.safeArea).toBe(true);
    expect(layout.menuPath).toEqual(AX1_HUD_MENU_PATH);
  });

  it("keeps the compact/medium/large breakpoint boundaries deterministic", () => {
    expect(resolveAx1HudLayout({ width: AX1_HUD_BREAKPOINTS.compactMaxWidth, height: 900 }).band).toBe("compact");
    expect(resolveAx1HudLayout({ width: AX1_HUD_BREAKPOINTS.compactMaxWidth + 1, height: 900 }).band).toBe("medium");
    expect(resolveAx1HudLayout({ width: AX1_HUD_BREAKPOINTS.mediumMaxWidth, height: 900 }).band).toBe("medium");
    expect(resolveAx1HudLayout({ width: AX1_HUD_BREAKPOINTS.mediumMaxWidth + 1, height: 900 }).band).toBe("large");
  });

  it("does not fork the semantic menu path between portrait and landscape", () => {
    const portrait = resolveAx1HudLayout({ width: 390, height: 844 });
    const landscape = resolveAx1HudLayout({ width: 844, height: 390 });
    expect(portrait.menuPath).toEqual(landscape.menuPath);
  });

  it("declares separate world and HUD gesture ownership", () => {
    expect(AX1_HUD_GESTURE_OWNERSHIP.root).toBe("presentation");
    expect(AX1_HUD_GESTURE_OWNERSHIP.interactiveControls).toBe("hud");
    expect(AX1_HUD_GESTURE_OWNERSHIP.worldSurface).toBe("world");
    expect(resolveAx1HudLayout({ width: 320, height: 568 })).toBeTruthy();
  });

  it("fails closed on invalid viewports", () => {
    expect(() => resolveAx1HudLayout({ width: 0, height: 568 })).toThrow("AX1_HUD_VIEWPORT_INVALID");
    expect(() => resolveAx1HudLayout({ width: 320, height: Number.NaN })).toThrow("AX1_HUD_VIEWPORT_INVALID");
  });
});
