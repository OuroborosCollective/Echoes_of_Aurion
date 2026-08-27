import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.resolve(import.meta.dirname, ".."),
  test: {
    environment: "node",
    include: ["server/craftingReceipt.e2e.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
