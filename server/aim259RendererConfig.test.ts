import { describe, expect, it } from "vitest";
import groupConfig from "../playwright.aurion-groups.config";
import migrationConfig from "../playwright.aurion-migration.config";

describe("AIM-259 five-session browser render contract", () => {
  it("uses the repository's pinned SwiftShader path for real software WebGL", () => {
    const required = migrationConfig.use?.launchOptions?.args ?? [];
    expect(required).toEqual(expect.arrayContaining([
      "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage",
    ]));
    expect(groupConfig.use?.launchOptions?.args).toEqual(expect.arrayContaining(required));
  });

  it("retains all three real browser regressions without easing evidence gates", () => {
    expect(groupConfig.testMatch).toEqual([
      "aim259.groups.spec.ts", "ax1.ui.spec.ts", "world.nature-collision.spec.ts",
    ]);
    expect(groupConfig.workers).toBe(1);
    expect(groupConfig.retries).toBe(0);
    expect(groupConfig.maxFailures).toBe(1);
    expect(groupConfig.use?.browserName).toBe("chromium");
    expect(groupConfig.use?.headless).toBe(true);
    expect(groupConfig.use?.trace).toBe("retain-on-failure");
    expect(groupConfig.use?.screenshot).toBe("only-on-failure");
  });
});
