import { expect, test } from "@playwright/test";

test.describe("AIM-239 xaurion open-world bridge", () => {
  test("mounts the ZIP-reference Three.js world and tears it down without taking over Aurion authority", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("aurion:load-open-world", {
        detail: {
          displayName: "Aethelgard Sanctum",
          entryNarrative: "AIM-239 browser smoke",
          zoneTier: 1,
          globalWorld: { epoch: 1, worldSeed: "echoes-of-aurion-v1" },
        },
      }));
    });

    const runtime = page.getByTestId("xaurion-open-world-runtime");
    await expect(runtime).toBeVisible({ timeout: 15_000 });
    const canvas = page.locator("#three-viewport canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".xaurion-runtime__error")).toHaveCount(0);

    const viewport = await canvas.boundingBox();
    expect(viewport).not.toBeNull();
    expect(viewport!.width).toBeGreaterThan(600);
    expect(viewport!.height).toBeGreaterThan(400);

    const hasWebGl = await canvas.evaluate((element) => {
      const canvasElement = element as HTMLCanvasElement;
      return Boolean(canvasElement.getContext("webgl2") || canvasElement.getContext("webgl"));
    });
    expect(hasWebGl).toBe(true);

    await page.evaluate(() => window.dispatchEvent(new Event("aurion:return-to-tower")));
    await expect(runtime).toHaveCount(0);
    await expect(page.locator("body")).toBeVisible();
  });
});
