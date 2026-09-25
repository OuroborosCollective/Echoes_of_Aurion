import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const outputPath = process.env.AURION_SBOM_OUTPUT || "aurion-runtime.spdx.json";
const sourceRevision = process.env.GITHUB_SHA || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[a-f0-9]{40}$/.test(sourceRevision)) throw new Error("SBOM_SOURCE_REVISION_INVALID");

const tree = JSON.parse(execFileSync("pnpm", ["list", "--prod", "--json", "--depth", "Infinity"], { encoding: "utf8" }));
const roots = Array.isArray(tree) ? tree : [tree];

function packageId(name, version) {
  return `SPDXRef-Package-${createHash("sha256").update(`${name}@${version}`).digest("hex").slice(0, 24)}`;
}
function purl(name, version) {
  return `pkg:npm/${name.replace("/", "%2F")}@${version}`;
}
const packages = new Map();
const relationships = new Map();

function visit(node, parentId = null) {
  if (!node || typeof node !== "object" || typeof node.name !== "string" || typeof node.version !== "string") return;
  const id = packageId(node.name, node.version);
  if (!packages.has(id)) {
    packages.set(id, {
      SPDXID: id,
      name: node.name,
      versionInfo: node.version,
      downloadLocation: "NOASSERTION",
      filesAnalyzed: false,
      licenseConcluded: "NOASSERTION",
      licenseDeclared: "NOASSERTION",
      supplier: "NOASSERTION",
      externalRefs: [{ referenceCategory: "PACKAGE-MANAGER", referenceType: "purl", referenceLocator: purl(node.name, node.version) }],
    });
  }
  if (parentId && parentId !== id) relationships.set(`${parentId}|${id}`, { spdxElementId: parentId, relationshipType: "DEPENDS_ON", relatedSpdxElement: id });
  for (const dep of Object.values(node.dependencies || {})) visit(dep, id);
  for (const dep of Object.values(node.optionalDependencies || {})) visit(dep, id);
}

const root = roots.find(node => node?.name && node?.version) || roots[0];
visit(root);

const sortedPackages = [...packages.values()].sort((a,b) => a.name.localeCompare(b.name) || a.versionInfo.localeCompare(b.versionInfo));
const rootId = sortedPackages.length ? sortedPackages.find(pkg => pkg.name === root.name && pkg.versionInfo === root.version)?.SPDXID : null;
const sortedRelationships = [...relationships.values()].sort((a,b) => `${a.spdxElementId}|${a.relatedSpdxElement}`.localeCompare(`${b.spdxElementId}|${b.relatedSpdxElement}`));
const packageDigest = createHash("sha256").update(sortedPackages.map(pkg => `${pkg.name}@${pkg.versionInfo}`).join("\n")).digest("hex");
const commitDate = execFileSync("git", ["show", "-s", "--format=%cI", sourceRevision], { encoding: "utf8" }).trim();

const sbom = {
  spdxVersion: "SPDX-2.3",
  dataLicense: "CC0-1.0",
  SPDXID: "SPDXRef-DOCUMENT",
  name: "Echoes of Aurion runtime dependency SBOM",
  documentNamespace: `https://arelogic.space/spdx/aurion-runtime/${packageDigest}`,
  creationInfo: { created: commitDate, creators: ["Tool: aurion-build-aurion-sbom-v1"] },
  packages: sortedPackages,
  relationships: rootId ? [{ spdxElementId: "SPDXRef-DOCUMENT", relationshipType: "DESCRIBES", relatedSpdxElement: rootId }, ...sortedRelationships] : [],
  annotations: [{ annotationType: "OTHER", annotator: "Tool: aurion-build-aurion-sbom-v1", comment: `sourceRevision=${sourceRevision}; packageSetSha256=${packageDigest}` }],
};

fs.writeFileSync(outputPath, JSON.stringify(sbom, null, 2) + "\n");
console.log(JSON.stringify({ outputPath, sourceRevision, packageCount: sortedPackages.length, packageSetSha256: packageDigest }));