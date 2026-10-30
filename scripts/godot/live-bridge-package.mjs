import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (revision !== process.env.AURION_EXPECTED_REVISION) throw new Error('BRIDGE_BUILD_HEAD_MISMATCH');
const output = resolve(process.env.AURION_BRIDGE_EVIDENCE || '.aurion-godot/live-bridge-evidence');
mkdirSync(output, { recursive: true });
const entry = resolve(output, 'aurion-godot-bridge.mjs');
execFileSync('pnpm', ['exec', 'esbuild', 'server/godotBridge/bridge/index.ts', '--bundle', '--platform=node', '--format=esm', '--target=node22', '--external:bufferutil', '--external:utf-8-validate', '--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);', '--outfile=' + entry], { stdio: 'inherit' });
const addonFiles = execFileSync('git', ['ls-files', 'godot-client/addons/aurion_bridge'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = {
  schema: 'aurion.godot.bridge.build.v1', sourceRevision: revision,
  suppliedArchiveSha256: 'd76b6bdea095e17c9d34e36654ff2e968aeaae49950f82009248433263010607',
  bridge: { file: 'aurion-godot-bridge.mjs', sha256: sha256(entry) },
  addon: addonFiles.map(path => ({ path, sha256: sha256(path) })),
  productionDeployment: false,
};
execFileSync('tar', ['-czf', resolve(output, 'aurion-godot-addon.tar.gz'), ...addonFiles]);
writeFileSync(resolve(output, 'build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('BRIDGE_BUILD_REVISION', revision);
