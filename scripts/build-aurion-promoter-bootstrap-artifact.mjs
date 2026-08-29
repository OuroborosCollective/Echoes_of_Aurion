import { createHash } from "node:crypto";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const revision = process.env.AURION_RELEASE_SHA?.trim().toLowerCase() ?? "";
const bootstrapRevision = createHash("sha256")
  .update(`aurion-legacy-promoter-bootstrap:${revision}`)
  .digest("hex")
  .slice(0, 40);
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
const runtimeArchiveRelative = "aurion-traefik-runtime-release.tgz";
const runtimeChecksumRelative = `${runtimeArchiveRelative}.sha256`;
const legacyUnsafePatch = "patches/wouter@3.7.1.patch";
const legacySafePatch = "patches/wouter-3.7.1.patch";
const canonicalRuntimePath = /^[A-Za-z0-9@._/:-]+$/;
const legacyRuntimePath = /^[A-Za-z0-9._/:-]+$/;
const bootstrapIdentityRelative = "bootstrap-identity.json";
const bootstrapIdentityChecksumRelative = `${bootstrapIdentityRelative}.sha256`;

if (!/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error(
    "AURION_RELEASE_SHA must be the exact 40-character source revision"
  );
}
if (bootstrapRevision === revision) {
  throw new Error(
    "bootstrap revision must differ from the canonical source revision"
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

const sha256 = async filePath =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

async function listRegularFiles(directory, relative = "") {
  const files = [];
  for (const entry of await readdir(path.join(directory, relative), {
    withFileTypes: true,
  })) {
    const entryRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRegularFiles(directory, entryRelative)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `bootstrap runtime artifact has a non-file entry: ${entryRelative}`
      );
    }
    files.push(entryRelative);
  }
  return files;
}

async function validateRuntimeMetadata(
  directory,
  pathPattern,
  expectedRevision
) {
  const manifestPath = path.join(directory, "manifest.json");
  const checksumPath = path.join(directory, "checksums.sha256");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.recordType !== "aurion_traefik_runtime_artifact" ||
    manifest.revision !== expectedRevision ||
    !manifest.files ||
    typeof manifest.files !== "object"
  ) {
    throw new Error("bootstrap source runtime artifact is not revision-bound");
  }

  const files = (await listRegularFiles(directory))
    .filter(
      relative => !["manifest.json", "checksums.sha256"].includes(relative)
    )
    .sort();
  const manifestFiles = Object.keys(manifest.files).sort();
  if (JSON.stringify(files) !== JSON.stringify(manifestFiles)) {
    throw new Error(
      "bootstrap source runtime manifest does not describe a closed file set"
    );
  }
  for (const relative of files) {
    if (
      !pathPattern.test(relative) ||
      relative.split("/").includes("..") ||
      !/^[a-f0-9]{64}$/.test(manifest.files[relative]) ||
      (await sha256(path.join(directory, relative))) !==
        manifest.files[relative]
    ) {
      throw new Error(`bootstrap runtime metadata rejected: ${relative}`);
    }
  }

  const expectedChecksums = await Promise.all(
    [...files, "manifest.json"]
      .sort()
      .map(
        async relative =>
          `${await sha256(path.join(directory, relative))}  ${relative}`
      )
  );
  if (
    (await readFile(checksumPath, "utf8")) !==
    `${expectedChecksums.join("\n")}\n`
  ) {
    throw new Error("bootstrap source runtime checksums are not closed");
  }
  return { files, manifest };
}

async function refreshRuntimeMetadata(directory, manifest) {
  const files = (await listRegularFiles(directory))
    .filter(
      relative => !["manifest.json", "checksums.sha256"].includes(relative)
    )
    .sort();
  manifest.files = Object.fromEntries(
    await Promise.all(
      files.map(async relative => [
        relative,
        await sha256(path.join(directory, relative)),
      ])
    )
  );
  await writeFile(
    path.join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  const checksums = await Promise.all(
    [...files, "manifest.json"]
      .sort()
      .map(
        async relative =>
          `${await sha256(path.join(directory, relative))}  ${relative}`
      )
  );
  await writeFile(
    path.join(directory, "checksums.sha256"),
    `${checksums.join("\n")}\n`,
    "utf8"
  );
}

async function listArchiveEntries(archive) {
  const { stdout } = await execFileAsync("tar", ["-tzf", archive]);
  const entries = stdout.split("\n").filter(Boolean);
  for (const entry of entries) {
    if (!entry.startsWith("./") || entry.includes("../")) {
      throw new Error(
        `bootstrap runtime archive has an unsafe entry: ${entry}`
      );
    }
  }
  return entries;
}

async function buildLegacyCompatibleRuntimeArchive() {
  const archive = path.join(output, runtimeArchiveRelative);
  const checksum = path.join(output, runtimeChecksumRelative);
  if (!(await stat(archive)).isFile() || !(await stat(checksum)).isFile()) {
    throw new Error(
      "bootstrap source is missing the verified Traefik runtime archive"
    );
  }
  const expectedArchiveChecksum = `${await sha256(archive)}  ${runtimeArchiveRelative}\n`;
  if ((await readFile(checksum, "utf8")) !== expectedArchiveChecksum) {
    throw new Error(
      "bootstrap source Traefik runtime archive checksum is invalid"
    );
  }

  const temporary = await mkdtemp(
    path.join(os.tmpdir(), "aurion-bootstrap-runtime-")
  );
  try {
    await listArchiveEntries(archive);
    await execFileAsync("tar", ["-xzf", archive, "-C", temporary]);
    const { manifest } = await validateRuntimeMetadata(
      temporary,
      canonicalRuntimePath,
      revision
    );
    const unsafePatch = path.join(temporary, legacyUnsafePatch);
    const safePatch = path.join(temporary, legacySafePatch);
    if (
      !(await stat(unsafePatch)).isFile() ||
      manifest.files[legacyUnsafePatch] === undefined ||
      manifest.files[legacySafePatch] !== undefined
    ) {
      throw new Error(
        "bootstrap source is missing the exact legacy-incompatible patch path"
      );
    }
    await rename(unsafePatch, safePatch);

    const packagePath = path.join(temporary, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
    if (
      packageJson?.pnpm?.patchedDependencies?.["wouter@3.7.1"] !==
      legacyUnsafePatch
    ) {
      throw new Error(
        "bootstrap source package does not bind the expected Wouter patch"
      );
    }
    packageJson.pnpm.patchedDependencies["wouter@3.7.1"] = legacySafePatch;
    await writeFile(
      packagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8"
    );

    const lockPath = path.join(temporary, "pnpm-lock.yaml");
    const lockfile = await readFile(lockPath, "utf8");
    const oldLockPath = `path: ${legacyUnsafePatch}`;
    if (lockfile.split(oldLockPath).length !== 2) {
      throw new Error(
        "bootstrap source lockfile does not bind the expected Wouter patch once"
      );
    }
    await writeFile(
      lockPath,
      lockfile.replace(oldLockPath, `path: ${legacySafePatch}`),
      "utf8"
    );

    const runtimeBuildPath = path.join(
      temporary,
      "dist/.aurion-runtime-build.json"
    );
    const runtimeBuild = JSON.parse(await readFile(runtimeBuildPath, "utf8"));
    if (
      runtimeBuild.revision !== revision ||
      runtimeBuild.artifact !== "aurion-runtime"
    ) {
      throw new Error("bootstrap source runtime build identity is invalid");
    }
    runtimeBuild.revision = bootstrapRevision;
    await writeFile(
      runtimeBuildPath,
      `${JSON.stringify(runtimeBuild, null, 2)}\n`,
      "utf8"
    );

    manifest.revision = bootstrapRevision;
    await refreshRuntimeMetadata(temporary, manifest);
    await validateRuntimeMetadata(
      temporary,
      legacyRuntimePath,
      bootstrapRevision
    );
    await execFileAsync("tar", ["-C", temporary, "-czf", archive, "."]);
    await listArchiveEntries(archive);
    await writeFile(
      checksum,
      `${await sha256(archive)}  ${runtimeArchiveRelative}\n`,
      "utf8"
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
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
await buildLegacyCompatibleRuntimeArchive();

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
manifest.revision = bootstrapRevision;
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
  bootstrapRevision,
]);

const bootstrapIdentity = {
  schemaVersion: 1,
  recordType: "aurion_legacy_promoter_bootstrap_identity",
  sourceRevision: revision,
  bootstrapRevision,
  mode: "bootstrap_only",
};
const bootstrapIdentityPath = path.join(output, bootstrapIdentityRelative);
await writeFile(
  bootstrapIdentityPath,
  `${JSON.stringify(bootstrapIdentity, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(output, bootstrapIdentityChecksumRelative),
  `${await sha256(bootstrapIdentityPath)}  ${bootstrapIdentityRelative}\n`,
  "utf8"
);

console.log(
  JSON.stringify({
    revision,
    bootstrapRevision,
    artifact: path.relative(root, output),
    bootstrapImageDigest: linuxAmd64ManifestDigest,
    bootstrapRuntimePatch: legacySafePatch,
    mode: "bootstrap-only",
  })
);
