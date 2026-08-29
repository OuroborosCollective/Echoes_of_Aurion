import { createHash } from "node:crypto";
import { cp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const revision = process.env.AURION_RELEASE_SHA?.trim().toLowerCase() ?? "";
const source = path.resolve(root, process.argv[2] ?? "runtime-artifact");
const output = path.resolve(
  root,
  process.argv[3] ?? "runtime-bootstrap-artifact"
);
const canonicalIndexDigest =
  "sha256:f5a0871ab03b035c58bdb3007c3d177b001c2145c18e81817b71624dcf7d8bff";
const linuxAmd64ManifestDigest =
  "sha256:87608ec5109795be954baa2f5b0b6da1911423d8b44b58fecda31f81d28bfc0f";
const schemaRelative = "dist-production-reconcile";
const imageContractRelative = "deploy/aurion-reconcile-runtime-image.conf";

if (!/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error(
    "AURION_RELEASE_SHA must be the exact 40-character source revision"
  );
}
if (source === output) {
  throw new Error(
    "bootstrap artifact output must differ from its verified source artifact"
  );
}
if (!(await stat(source)).isDirectory()) {
  throw new Error("bootstrap artifact source directory is missing");
}

const sourceSchema = path.join(source, schemaRelative);
const verifier = path.join(
  sourceSchema,
  "deploy",
  "verify-aurion-production-schema-reconcile-artifact.mjs"
);
await execFileAsync(process.execPath, [verifier, sourceSchema, revision]);

const sourceImageContract = JSON.parse(
  await readFile(path.join(sourceSchema, imageContractRelative), "utf8")
);
if (
  sourceImageContract.schemaVersion !== 1 ||
  sourceImageContract.recordType !==
    "aurion_reconcile_runtime_image_contract" ||
  sourceImageContract.nodeMajorVersion !== 22 ||
  sourceImageContract.imageTag !== "node:22.13.0-bookworm-slim" ||
  sourceImageContract.imageDigest !== canonicalIndexDigest
) {
  throw new Error(
    "bootstrap may only derive from the canonical Node 22 runtime image contract"
  );
}

await rm(output, { recursive: true, force: true });
await cp(source, output, { recursive: true, force: true });

const bootstrapSchema = path.join(output, schemaRelative);
const bootstrapContractPath = path.join(bootstrapSchema, imageContractRelative);
const bootstrapContract = {
  ...sourceImageContract,
  imageDigest: linuxAmd64ManifestDigest,
};
await writeFile(
  bootstrapContractPath,
  `${JSON.stringify(bootstrapContract, null, 2)}\n`,
  "utf8"
);

const sha256 = async filePath =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
const manifestPath = path.join(bootstrapSchema, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (
  manifest.schemaVersion !== 1 ||
  manifest.recordType !== "aurion_production_schema_reconcile_artifact" ||
  manifest.revision !== revision ||
  manifest.mode !== "read_only" ||
  manifest.moduleFormat !== "commonjs" ||
  !manifest.files?.[imageContractRelative]
) {
  throw new Error(
    "bootstrap source reconciliation manifest is not revision-bound and read-only"
  );
}

const contractStats = await stat(bootstrapContractPath);
manifest.files[imageContractRelative] = {
  bytes: contractStats.size,
  sha256: await sha256(bootstrapContractPath),
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const files = Object.keys(manifest.files).sort();
for (const relative of files) {
  if (
    !/^[A-Za-z0-9@._/-]+$/.test(relative) ||
    relative.split("/").includes("..")
  ) {
    throw new Error(`bootstrap manifest has an unsafe path: ${relative}`);
  }
  const file = path.resolve(bootstrapSchema, relative);
  if (
    !file.startsWith(`${bootstrapSchema}${path.sep}`) ||
    !(await stat(file)).isFile()
  ) {
    throw new Error(`bootstrap manifest file is missing: ${relative}`);
  }
}

const checksums = await Promise.all(
  ["manifest.json", ...files].map(
    async relative =>
      `${await sha256(path.join(bootstrapSchema, relative))}  ${relative}`
  )
);
await writeFile(
  path.join(bootstrapSchema, "checksums.sha256"),
  `${checksums.join("\n")}\n`,
  "utf8"
);

await execFileAsync(process.execPath, [
  path.join(
    bootstrapSchema,
    "deploy",
    "verify-aurion-production-schema-reconcile-artifact.mjs"
  ),
  bootstrapSchema,
  revision,
]);

console.log(
  JSON.stringify({
    revision,
    artifact: path.relative(root, output),
    bootstrapImageDigest: linuxAmd64ManifestDigest,
    mode: "bootstrap-only",
  })
);
