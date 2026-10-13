import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { register, enterAx1 } from "./helpers/aurionAuthenticated";
import manifest from "../client/src/xaurion/world/assets/owner-art-atlas.v1.json";

test.skip(process.env.AURION_E2E_ISOLATED !== "1", "Requires isolated, authenticated MariaDB and real built browser runtime");

const evidence = async (page: Page) => {
  const data = await page.getByTestId("aurion-owner-paving-preview-evidence").getAttribute("data-readback");
  return data ? JSON.parse(data) : null;
};

for (const viewport of [
  { name: "phone", width: 412, height: 915 },
  { name: "tablet", width: 800, height: 1280 },
  { name: "desktop", width: 1440, height: 1000 },
]) {
  test(`owner atlas preview is opt-in, bound and byte-identical on ${viewport.name}`, async ({ page, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    expect(baseURL).toBe("http://127.0.0.1:3000");
    expect(new URL(process.env.DATABASE_URL!).pathname).toBe("/aurion_browser_test");
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && /shader|WebGLProgram|render.*failed/i.test(message.text())) errors.push(message.text());
    });

    await register(page, `owner_atlas_${viewport.name}`);
    const existing = await enterAx1(page);
    const originalWorldHash = existing.snapshot?.globalWorld?.deterministicHash;
    expect(originalWorldHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    await expect.poll(async () => (await evidence(page))?.state, { timeout: 45_000 }).toBe("disabled");
    expect(await evidence(page)).toMatchObject({
      protocol: "aurion.owner-art-paving-preview.v1",
      state: "disabled", boundMaterials: 0, gameplayAuthority: false,
    });
    const previewRequestsBefore = await page.evaluate(() => performance.getEntriesByType("resource")
      .filter(entry => entry.name.includes("owner-art-atlas-preview-") && entry.name.endsWith(".webp")).length);
    expect(previewRequestsBefore).toBe(0);

    await page.goto("/play?aurionAtlasPreview=owner-20261013");
    const runtime = page.getByTestId("xaurion-open-world-runtime");
    await expect(runtime.getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => (await evidence(page))?.state, { timeout: 45_000 }).toBe("ready");
    const readback = await evidence(page);
    expect(readback).toMatchObject({
      protocol: "aurion.owner-art-paving-preview.v1", state: "ready",
      tileId: "city.paving.grey", tileSize: 64, sourceSha256: manifest.sha256,
      failureCode: null, gameplayAuthority: false,
    });
    expect(readback.boundMaterials).toBeGreaterThan(0);
    expect(await page.getByTestId("glb-model-status").textContent()).not.toBe("error");
    const urls = await page.evaluate(() => performance.getEntriesByType("resource")
      .map(entry => entry.name)
      .filter(url => /\\/assets\\/owner-art-atlas-preview-[^/?]+\\.webp(?:\\?|$)/.test(url)));
    expect(urls).toHaveLength(1);
    const servedUrl = new URL(urls[0]!);
    expect(servedUrl.origin).toBe(new URL(baseURL!).origin);
    const response = await page.request.get(servedUrl.pathname);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/webp");
    const expected = await readFile("client/src/xaurion/world/assets/owner-art-atlas-preview.webp");
    const actual = await response.body();
    expect(actual).toEqual(expected);
    expect(createHash("sha256").update(actual).digest("hex")).toBe(manifest.sha256);
    await page.screenshot({ path: testInfo.outputPath(`owner-paving-opt-in-${viewport.name}.png`) });

    await page.goto("/play");
    await expect(page.getByTestId("xaurion-open-world-runtime")
      .getByText("BEWEGUNG VERBUNDEN", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => (await evidence(page))?.state, { timeout: 45_000 }).toBe("disabled");
    expect((await evidence(page)).boundMaterials).toBe(0);
    const previewRequestsAfter = await page.evaluate(() => performance.getEntriesByType("resource")
      .filter(entry => entry.name.includes("owner-art-atlas-preview-") && entry.name.endsWith(".webp")).length);
    expect(previewRequestsAfter).toBe(0);
    expect(errors).toEqual([]);
  });
}
