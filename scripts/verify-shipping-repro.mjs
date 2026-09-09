import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
const [first, second] = process.argv.slice(2);
if (!first || !second || path.resolve(first) === path.resolve(second)) throw Error("TWO_INDEPENDENT_OUTPUTS_REQUIRED");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const a = await readFile(path.join(first, "manifest.json")), b = await readFile(path.join(second, "manifest.json"));
if (!a.equals(b)) throw Error("SHIPPING_MANIFEST_NOT_REPRODUCIBLE");
const manifest = JSON.parse(a), committed = JSON.parse(await readFile("shared/worldAssetShipping.json"));
const files = source => new Map(source.assets.flatMap(asset => [...asset.lods.flatMap(lod => [lod, lod.fallback]), ...(asset.collider ? [asset.collider] : [])]).map(file => [file.file, file]));
const expected = files(committed.manifest), produced = files(manifest);
if (expected.size !== produced.size) throw Error("SHIPPING_OUTPUT_SET_CHANGED");
for (const [name, spec] of produced) {
  if (!/^[a-z0-9-]+\/(LOD[012]\.(ktx2|fallback)|collider)\.glb$/.test(name)) throw Error("SHIPPING_PATH");
  const left = await readFile(path.join(first, name)), right = await readFile(path.join(second, name));
  if (!left.equals(right) || hash(left) !== spec.sha256 || hash(left) !== expected.get(name)?.sha256) throw Error(`SHIPPING_BYTES_DRIFT:${name}`);
}
if (JSON.stringify(manifest.sourceBinding) !== JSON.stringify(committed.manifest.sourceBinding)) throw Error("SHIPPING_SOURCE_DRIFT");
console.log(JSON.stringify({status: "VERIFIED", files: produced.size, manifestSha256: manifest.manifestSha256, committedManifestSha256: committed.manifest.manifestSha256, toolchain: manifest.toolchain, interpretation: "Both independent runs match byte for byte; GLB outputs also match the committed shipping bundle. Environment versions remain explicit in each manifest."}));
