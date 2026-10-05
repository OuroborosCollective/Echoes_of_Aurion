import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const cssPath = path.join(
  repoRoot,
  "client/src/xaurion/integration/ax1AuthorityHud.css"
);
const css = readFileSync(cssPath, "utf8");
const HARDENING_MARKER = "Issue #686 mobile playability hardening";
const MIN_TOUCH_TARGET_PX = 44;

function listSources(dir: string): readonly string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listSources(full));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

describe("Issue #686 mobile playability contract", () => {
  it("keeps the authority shell a non-interactive layer (no fullscreen touch overlay over the HUD)", () => {
    expect(css).toContain(
      ".ax1-authority-shell{position:absolute;inset:0;pointer-events:none"
    );
    expect(css).toContain(
      ".xaurion-game-hud::before{\n  content:\"\";\n  position:absolute;\n  inset:0;\n  pointer-events:none;"
    );
  });

  it("ships the hardening block as the final cascade after all legacy mobile rules", () => {
    const markerIndex = css.indexOf(HARDENING_MARKER);
    expect(markerIndex).toBeGreaterThan(-1);
    expect(markerIndex).toBeGreaterThan(css.lastIndexOf("2026-09-28"));
    expect(markerIndex).toBeGreaterThan(css.lastIndexOf("AIM-584"));
  });

  it("enforces >=44 CSS px on every interactive control in the final phone/tablet cascade", () => {
    const tail = css.slice(css.indexOf(HARDENING_MARKER));
    const ruleBlocks = tail.matchAll(/([^{}]+)\{([^{}]+)\}/g);
    const undersized: string[] = [];
    let interactiveRules = 0;
    for (const match of ruleBlocks) {
      const selector = match[1]!;
      const body = match[2]!;
      if (!/button|nav/.test(selector)) continue;
      interactiveRules += 1;
      for (const size of body.matchAll(
        /(?:min-width|min-height|width|height|flex-basis):(\d+)px/g
      )) {
        if (Number(size[1]) < MIN_TOUCH_TARGET_PX)
          undersized.push(`${selector.trim()} -> ${size[0]}`);
      }
    }
    expect(interactiveRules).toBeGreaterThan(0);
    expect(undersized).toEqual([]);
    expect(tail).toContain("min-width:44px");
    expect(tail).toContain("min-height:44px");
  });

  it("tracks the dynamic mobile viewport height instead of static vh only", () => {
    const tail = css.slice(css.indexOf(HARDENING_MARKER));
    expect(tail).toContain("dvh");
    expect(tail).toContain("max-height:58dvh");
    expect(tail).toContain("max-height:78dvh");
  });

  it("honours safe-area insets on left, right and bottom HUD edges", () => {
    expect(css).toContain("env(safe-area-inset-left)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    const tail = css.slice(css.indexOf(HARDENING_MARKER));
    expect(tail).toContain("env(safe-area-inset-right)");
  });

  it("keeps exactly one movement owner bound to the render canvas", () => {
    const controller = readFileSync(
      path.join(
        repoRoot,
        "client/src/xaurion/components/MobileMovementController.tsx"
      ),
      "utf8"
    );
    // Touch-to-move listens on the render canvas itself, never on an overlay layer.
    expect(controller).toContain('getElementById("threejs-canvas")');
    expect(controller).toContain("sr-only");
    expect(controller).not.toContain("position:fixed");
    expect(controller).not.toContain("inset:0");
    const clientSources = listSources(path.join(repoRoot, "client/src"));
    const joystickOwners = clientSources.filter(file =>
      readFileSync(file, "utf8").includes('data-testid="ax1-movement-control"')
    );
    expect(
      joystickOwners.map(file => path.relative(repoRoot, file)).sort()
    ).toEqual(["client/src/xaurion/components/VirtualJoystick.tsx"]);
    const controllerMounts = clientSources.filter(
      file =>
        !file.endsWith("MobileMovementController.tsx") &&
        !file.endsWith("MobileMovementController.test.tsx") &&
        /<MobileMovementController[\s>]/.test(readFileSync(file, "utf8"))
    );
    expect(
      controllerMounts.map(file => path.relative(repoRoot, file)).sort()
    ).toEqual(["client/src/xaurion/integration/AurionAuthorityHud.tsx"]);
  });
});
