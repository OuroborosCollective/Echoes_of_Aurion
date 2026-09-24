import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

test("shipping decoder is pinned to the installed Three.js runtime", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const shipping = JSON.parse(await readFile(new URL("../shared/worldAssetShipping.json", import.meta.url), "utf8"));

  const threeVersion = packageJson.dependencies.three;
  const typesVersion = packageJson.devDependencies["@types/three"];

  expect(threeVersion).toMatch(/^0\.186\.0$/);
  expect(typesVersion).toBe(threeVersion);
  expect(shipping.decoder.threeVersion).toBe(threeVersion);
});
