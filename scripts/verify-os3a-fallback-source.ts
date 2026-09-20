import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import catalogJson from "../shared/os3aFallbackCatalog.json";

type JsonObject = Record<string, unknown>;
type CatalogAsset = {
  id: string;
  projectId: string;
  name: string;
  fileSize: number;
  sourcePath: string;
  attributes: Record<string, string>;
  discoveryOnly: boolean;
  discoveryNote: string | null;
};
type Catalog = {
  registryRepository: string;
  registryRevision: string;
  modelRepository: string;
  modelRevision: string;
  license: string;
  licensePath: string;
  projectIds: string[];
  sourceAssetCount: number;
  assets: CatalogAsset[];
};

const catalog = catalogJson as unknown as Catalog;
const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const rawUrl = (repository: string, revision: string, sourcePath: string) =>
  `https://raw.githubusercontent.com/${repository}/${revision}/${sourcePath.split("/").map(encodeURIComponent).join("/")}`;

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/json,text/plain;q=0.9,*/*;q=0.1" } });
  if (!response.ok) throw new Error(`OS3A_SOURCE_HTTP_${response.status}`);
  return response.text();
}
async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`OS3A_SOURCE_API_HTTP_${response.status}`);
  return response.json();
}
function object(value: unknown, code: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as JsonObject;
}
function attributes(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.map(entry => {
    const item = object(entry, "OS3A_ATTRIBUTE_INVALID");
    if (typeof item.trait_type !== "string" || typeof item.value !== "string") throw new Error("OS3A_ATTRIBUTE_INVALID");
    return [item.trait_type, item.value] as const;
  }).sort(([left], [right]) => left.localeCompare(right)));
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonical(nested)]));
}

const projectsText = await fetchText(rawUrl(catalog.registryRepository, catalog.registryRevision, "data/projects.json"));
const projects = JSON.parse(projectsText) as unknown[];
const projectById = new Map(projects.map(value => {
  const project = object(value, "OS3A_PROJECT_INVALID");
  if (typeof project.id !== "string") throw new Error("OS3A_PROJECT_INVALID");
  return [project.id, project] as const;
}));
const registryFileHashes: Record<string, string> = { "data/projects.json": sha256(projectsText) };
const expectedById = new Map(catalog.assets.map(asset => [asset.id, asset]));
const observedIds = new Set<string>();
let observedCount = 0;

for (const projectId of catalog.projectIds) {
  const project = projectById.get(projectId);
  if (!project || project.is_public !== true || project.license !== "CC0" || typeof project.asset_data_file !== "string") throw new Error("OS3A_PROJECT_LICENSE_OR_VISIBILITY_DRIFT");
  const assetPath = `data/${project.asset_data_file}`;
  const assetText = await fetchText(rawUrl(catalog.registryRepository, catalog.registryRevision, assetPath));
  registryFileHashes[assetPath] = sha256(assetText);
  const sourceAssets = JSON.parse(assetText) as unknown[];
  for (const raw of sourceAssets) {
    const asset = object(raw, "OS3A_ASSET_INVALID");
    const metadata = object(asset.metadata, "OS3A_ASSET_METADATA_INVALID");
    if (
      typeof asset.id !== "string" ||
      typeof asset.name !== "string" ||
      asset.project_id !== projectId ||
      asset.format !== "GLB" ||
      asset.is_public !== true ||
      asset.is_draft !== false ||
      typeof metadata.github_path !== "string" ||
      !Number.isSafeInteger(metadata.file_size)
    ) throw new Error("OS3A_ASSET_CONTRACT_DRIFT");
    const expected = expectedById.get(asset.id);
    if (!expected) throw new Error("OS3A_SNAPSHOT_MISSING_SOURCE_ASSET");
    const normalized: CatalogAsset = {
      id: asset.id,
      projectId,
      name: asset.name,
      fileSize: Number(metadata.file_size),
      sourcePath: metadata.github_path,
      attributes: attributes(metadata.attributes),
      discoveryOnly: projectId === "pm-xyz",
      discoveryNote: projectId === "pm-xyz" ? "RIGGED_CREATURE_REQUIRES_DEDICATED_ENEMY_FALLBACK_LANE" : null,
    };
    if (JSON.stringify(canonical(normalized)) !== JSON.stringify(canonical(expected))) throw new Error("OS3A_SNAPSHOT_METADATA_DRIFT");
    if (observedIds.has(asset.id)) throw new Error("OS3A_SOURCE_ID_DUPLICATE");
    observedIds.add(asset.id);
    observedCount++;
  }
}
if (observedCount !== catalog.sourceAssetCount || observedIds.size !== expectedById.size) throw new Error("OS3A_SOURCE_COUNT_DRIFT");

const treeUrl = `https://api.github.com/repos/${catalog.modelRepository}/git/trees/${catalog.modelRevision}?recursive=1`;
const treeRaw = object(await fetchJson(treeUrl), "OS3A_MODEL_TREE_INVALID");
if (treeRaw.truncated === true || !Array.isArray(treeRaw.tree)) throw new Error("OS3A_MODEL_TREE_TRUNCATED");
const modelEntries = new Map((treeRaw.tree as unknown[]).map(raw => {
  const entry = object(raw, "OS3A_MODEL_TREE_ENTRY_INVALID");
  if (typeof entry.path !== "string") throw new Error("OS3A_MODEL_TREE_ENTRY_INVALID");
  return [entry.path, entry] as const;
}));
for (const asset of catalog.assets) {
  const entry = modelEntries.get(asset.sourcePath);
  if (!entry || entry.type !== "blob" || Number(entry.size) !== asset.fileSize || typeof entry.sha !== "string") throw new Error("OS3A_MODEL_TREE_DRIFT");
}

const licenseText = await fetchText(rawUrl(catalog.modelRepository, catalog.modelRevision, catalog.licensePath));
if (!licenseText.includes("CC0 1.0 Universal")) throw new Error("OS3A_LICENSE_TEXT_DRIFT");

const receipt = Object.freeze({
  schemaVersion: "aurion.os3a-source-inventory.v1",
  sourceRevision: process.env.AURION_RELEASE_SHA ?? null,
  registryRepository: catalog.registryRepository,
  registryRevision: catalog.registryRevision,
  modelRepository: catalog.modelRepository,
  modelRevision: catalog.modelRevision,
  license: catalog.license,
  licensePath: catalog.licensePath,
  licenseSha256: sha256(licenseText),
  registryFileHashes: Object.freeze(Object.fromEntries(Object.entries(registryFileHashes).sort(([a], [b]) => a.localeCompare(b)))),
  modelTreeSha: typeof treeRaw.sha === "string" ? treeRaw.sha : null,
  modelTreeResponseSha256: sha256(JSON.stringify(canonical(treeRaw))),
  projectCount: catalog.projectIds.length,
  assetCount: observedCount,
  missingModelPaths: 0,
  sizeMismatches: 0,
  metadataMismatches: 0,
  status: "VERIFIED" as const,
  mutation: "none" as const,
});
const output = JSON.stringify(receipt, null, 2) + "\n";
if (process.env.OS3A_SOURCE_EVIDENCE_PATH) {
  await mkdir(path.dirname(process.env.OS3A_SOURCE_EVIDENCE_PATH), { recursive: true });
  await writeFile(process.env.OS3A_SOURCE_EVIDENCE_PATH, output, "utf8");
}
process.stdout.write(output);
