import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execute } from './check-runtime.mjs';

export async function negativeControls(repo, executable) {
  const temp = await mkdtemp(join(tmpdir(), 'aurion-godot-negative-'));
  const results = [];
  try {
    const project = join(temp, 'godot-client');
    await cp(join(repo, 'godot-client'), project, { recursive: true, filter: path => !path.split('/').includes('.godot') });
    // A fresh editor import is mandatory for real GLB PackedScene dependencies.
    // No source .godot cache is carried across, and negative scene/asset
    // injections below still run on this independently imported copy.
    const cleanImport = execute(executable, ['--headless', '--path', project, '--editor', '--import'], { timeout: 90000 });
    assert.ok(cleanImport.passed, 'NEGATIVE_HARNESS_FRESH_GODOT_IMPORT: ' + cleanImport.output);
    const scenePath = join(project, 'app/main.tscn');
    const original = await readFile(scenePath, 'utf8');
    const boot = () => execute(executable, ['--headless', '--path', project, '--script', 'tests/test_project_boot.gd'], { marker: 'Aurion project boot verified' });
    // Establish the isolated copy can really run before injecting faults.
    const baseline = boot();
    assert.ok(baseline.passed, baseline.output);
    for (const [id, text, causal] of [
      ['broken-scene', '[gd_scene format=3]\n[node name=', /Parse Error|parse error|Unexpected|Unexpected end/i],
      ['missing-asset', original.replace('res://app/main.gd', 'res://assets/missing.gd'), /missing\.gd/],
    ]) {
      await writeFile(scenePath, text);
      const result = boot();
      assert.equal(result.passed, false, `${id} incorrectly passed`);
      assert.equal(result.error, null, `${id} timed out or failed to execute`);
      assert.equal(result.signal, null);
      assert.match(result.output, causal, `${id} did not reach the intended failure`);
      results.push({ id, ...result });
    }
    await writeFile(scenePath, original);
    // Copy only the parity verifier's actual dependencies; never modify the checkout.
    const verifier = await readFile(join(repo, 'scripts/godot/verify-contract-parity.mjs'), 'utf8');
    const dependencies = [...verifier.matchAll(/read\("([^"]+)"\)/g)].map(match => match[1]);
    for (const path of ['scripts/godot/verify-contract-parity.mjs', ...dependencies]) {
      await mkdir(dirname(join(temp, path)), { recursive: true });
      await cp(join(repo, path), join(temp, path));
    }
    const parity = () => execute(process.execPath, [join(temp, 'scripts/godot/verify-contract-parity.mjs')], { marker: 'zone-v5 contract parity verified' });
    const parityBaseline = parity();
    assert.ok(parityBaseline.passed, parityBaseline.output);
    const schemaPath = join(temp, 'godot-client/net/contracts/zone_v5.schema.json');
    const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
    schema['x-aurion-wire-limits'].protocol_version = 4;
    await writeFile(schemaPath, JSON.stringify(schema));
    const result = parity();
    assert.equal(result.passed, false, 'wrong-contract incorrectly passed');
    assert.match(result.output, /AssertionError/);
    results.push({ id: 'wrong-contract', ...result });
    return results;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
