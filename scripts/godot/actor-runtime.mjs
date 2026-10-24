import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execute } from './check-runtime.mjs';
import { executable, repo, root, run, digest, lock } from './toolchain.mjs';

const render = process.argv.includes('--render');
const directory = join(root, 'actor-evidence');
await mkdir(directory, { recursive: true });
const revision = run('git', ['-C', repo, 'rev-parse', 'HEAD']);
if (process.env.AURION_EXPECTED_REVISION) assert.equal(revision, process.env.AURION_EXPECTED_REVISION);
assert.equal(run(executable, ['--headless', '--version']), lock.engine.version);
run('git', ['-C', repo, 'diff', '--exit-code', 'HEAD']);
const project = join(repo, 'godot-client');
const manifestPath = join(project, 'assets/generated/manifest.json');
assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).sourceRevision, revision);
if (!render) {
  const imported = execute(executable, ['--headless', '--path', project, '--editor', '--import'], { timeout: 120000 });
  await writeFile(join(directory, 'import.log'), imported.output);
  assert.ok(imported.passed, imported.output);
}
process.env.AURION_ACTOR_RENDER_DIR = render ? directory : '';
const result = execute(executable, [
  ...(render ? [] : ['--headless']), '--path', project, '--rendering-method', 'gl_compatibility',
  '--audio-driver', 'Dummy', '--script', 'tests/test_actor_projection.gd',
], { marker: 'G16 real model actor projection verified', timeout: 60000 });
await writeFile(join(directory, render ? 'render.log' : 'headless.log'), result.output);
assert.ok(result.passed, result.output);
const adapter = render ? result.output.match(/G16_RENDER_ADAPTER=(.+)/)?.[1]?.trim() : null;
if (render) assert.match(adapter ?? '', /llvmpipe|softpipe|software/i);
const receipt = { sourceRevision: revision, editorHash: await digest(executable),
  preparedManifestHash: await digest(manifestPath), layer: render ? 'software-render' : 'headless-imported-models',
  stateSource: 'explicit-protocol-fixtures', liveAssignment: 'unverified', device: 'unverified',
  videoAdapter: adapter, imageSha256: render ? await digest(join(directory, 'actors.png')) : null, result: 'passed' };
await writeFile(join(directory, render ? 'render.json' : 'headless.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
