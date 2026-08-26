import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const revision = process.env.AURION_RELEASE_SHA;
if (!/^[0-9a-f]{40}$/i.test(revision ?? "")) {
  throw new Error("AURION_RELEASE_SHA must be a 40-character Git revision");
}

const distDirectory = join(process.cwd(), "dist");
const manifestPath = join(distDirectory, ".aurion-runtime-build.json");
const manifest = {
  revision: revision.toLowerCase(),
  artifact: "aurion-runtime",
};

await mkdir(distDirectory, { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
