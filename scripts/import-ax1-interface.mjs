import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

// Authoring only: no upstream execution, no engine replacement, no main writes.
const REVISION = '286c575d3d0050ffa77b794d5b7a7e24858acee8';
const sourceRoot = resolve(process.argv[2] ?? '');
const hostRoot = resolve(process.argv[3] ?? '.');
const destination = resolve(hostRoot, 'client/src/xaurion/ax1Interface');
const hostEngineRoot = resolve(hostRoot, 'client/src/xaurion');
assert.notEqual(sourceRoot, hostRoot, 'Separate source and host worktrees required');
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
assert.equal(git('rev-parse', 'HEAD'), REVISION, 'AX1_SOURCE_REVISION_MISMATCH');
assert.equal(git('status', '--porcelain'), '', 'AX1_SOURCE_DIRTY');
const tracked = git('ls-tree', '-r', '--name-only', REVISION, 'src').split('\n');
const components = tracked.filter(p => p.startsWith('src/components/') && p.endsWith('.tsx')).sort();
assert.equal(components.length, 19, 'AX1_COMPONENT_SET_CHANGED');
const referenceOnly = new Map([
  ['src/components/DeterminismDebugOverlay.tsx', 'Synthetic server mirror, fallback entities and invented benchmark measurements must not execute in the product. Preserve source for a future real-readback adapter.'],
  ['src/components/MariaDbAndGlbConsole.tsx', 'Operator connection/credential surface is not a player menu; retain original as non-executable reference until the host capability boundary is adapted.'],
]);
const files = new Map();
const boundaryImports = new Map();
const metadata = [];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const blob = value => createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0`).update(value).digest('hex');
function replaceExactly(text, old, replacement) {
  assert.equal(text.split(old).length - 1, 1, `AMBIGUOUS_SOURCE_ANCHOR: ${old.slice(0, 80)}`);
  return text.replace(old, replacement);
}
function replaceInitializer(text, variable, initializer) {
  const tree = ts.createSourceFile('view.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variable && node.initializer) found.push(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(found.length, 1, `AX1_HANDLER_NOT_UNIQUE: ${variable}`);
  const node = found[0];
  return text.slice(0, node.getStart(tree)) + initializer + text.slice(node.end);
}
function sanitize(path, input) {
  let text = input;
  const adaptations = [];
  if (path === 'src/components/CraftingModal.tsx') {
    text = replaceExactly(text, '  isOpen: boolean;', '  isOpen: boolean;\n  onCraftRequest?: (recipeId: string) => Promise<{ confirmed: boolean; message: string }>;\n  onGatherRequest?: (professionId: GatheringProfessionId) => Promise<{ confirmed: boolean; message: string }>;');
    text = replaceExactly(text, '  isOpen,', '  isOpen,\n  onCraftRequest,\n  onGatherRequest,');
    text = replaceInitializer(text, 'handleStartCraft', `async () => {
    if (!canCraft || isCrafting || !onCraftRequest) return;
    setIsCrafting(true); setCraftProgress(0); setFeedbackNotice(null);
    try {
      const result = await onCraftRequest(selectedRecipe.id);
      setCraftProgress(result.confirmed ? 100 : 0);
      setFeedbackNotice(result.message);
    } catch { setFeedbackNotice('Herstellung nicht bestätigt.'); }
    finally { setIsCrafting(false); }
  }`);
    text = replaceInitializer(text, 'handleStartGathering', `async (professionId: GatheringProfessionId) => {
    if (activeGatheringId || !onGatherRequest) return;
    setActiveGatheringId(professionId); setGatherProgress(0); setFeedbackNotice(null);
    try {
      const result = await onGatherRequest(professionId);
      setGatherProgress(result.confirmed ? 100 : 0);
      setFeedbackNotice(result.message);
    } catch { setFeedbackNotice('Sammeln nicht bestätigt.'); }
    finally { setActiveGatheringId(null); }
  }`);
    adaptations.push('Only handler bodies and request props changed: no client XP/reward/depletion/clock/RNG. JSX is unchanged.');
  }
  if (path === 'src/components/CharacterModal.tsx') {
    text = replaceExactly(text, '  onEquipSkill?: (slotIndex: number, skill: ClassSkill) => void;', '  onEquipSkill?: (slotIndex: number, skill: ClassSkill) => Promise<{ success: boolean; message: string }>;');
    text = replaceInitializer(text, 'handleEquipToHotbar', `async (skill: ClassSkill) => {
    if (!onEquipSkill) return;
    try {
      const result = await onEquipSkill(0, skill);
      setFeedbackMessage({ text: result.message, isError: !result.success });
    } catch { setFeedbackMessage({ text: 'Skill-Zuweisung nicht bestätigt.', isError: true }); }
  }`);
    for (const attr of ['strength', 'agility', 'intelligence', 'defense']) {
      text = replaceExactly(text, `stats.attributes?.${attr} || 10`, `stats.attributes?.${attr} ?? '—'`);
    }
    adaptations.push('Await actual hotbar result; replace fabricated attribute=10 fallbacks. Structure/styles unchanged.');
  }
  assert(!/\bMath\s*\.\s*random\s*\(|\bDate\s*\.\s*now\s*\(/.test(text), `AMBIENT_RANDOM_OR_CLOCK: ${path}`);
  return { text, adaptations };
}
function findFile(root, stem) {
  for (const suffix of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']) {
    const p = resolve(root, stem + suffix);
    if (existsSync(p)) {
      try { readFileSync(p); return p; } catch {}
    }
  }
  return null;
}
function stage(sourcePath) {
  if (files.has(sourcePath)) return;
  assert(tracked.includes(sourcePath), `UNTRACKED_SOURCE: ${sourcePath}`);
  assert(!referenceOnly.has(sourcePath), `PLAYER_IMPORTS_UNADAPTED_OPS_VIEW: ${sourcePath}`);
  const input = readFileSync(resolve(sourceRoot, sourcePath), 'utf8');
  assert.equal(blob(input), git('rev-parse', `${REVISION}:${sourcePath}`), 'AX1_BLOB_MISMATCH');
  const { text, adaptations } = sanitize(sourcePath, input);
  files.set(sourcePath, text);
  metadata.push({ sourcePath, sourceBlob: blob(input), sourceSha256: sha256(input), importedSha256: sha256(text), adaptations });
  const info = ts.preProcessFile(text, true, true);
  for (const { fileName } of info.importedFiles) {
    if (!fileName.startsWith('.')) continue;
    const upstreamFile = findFile(dirname(resolve(sourceRoot, sourcePath)), fileName);
    assert(upstreamFile, `UPSTREAM_IMPORT_MISSING: ${sourcePath} -> ${fileName}`);
    const repoPath = relative(sourceRoot, upstreamFile).split(sep).join('/');
    assert(!repoPath.startsWith('..'), 'SOURCE_PATH_ESCAPE');
    if (repoPath.startsWith('src/components/') || repoPath.startsWith('src/data/') || repoPath.startsWith('src/types/') || repoPath === 'src/types.ts') {
      stage(repoPath);
    } else {
      const hostPath = resolve(hostEngineRoot, repoPath.slice(4));
      assert(existsSync(hostPath), `HOST_BOUNDARY_MODULE_MISSING: ${repoPath}`);
      const shimPath = resolve(destination, repoPath.slice(4));
      let specifier = relative(dirname(shimPath), hostPath).split(sep).join('/').replace(/\.(tsx?|mjs|js)$/, '');
      if (!specifier.startsWith('.')) specifier = './' + specifier;
      boundaryImports.set(repoPath, `// Existing integrated host module; not a copied AX1 runtime.\nexport * from ${JSON.stringify(specifier)};\n`);
    }
  }
}
for (const component of components) if (!referenceOnly.has(component)) stage(component);
for (const [path, text] of [...files, ...boundaryImports]) {
  const output = resolve(destination, path.slice(4));
  assert(output.startsWith(destination + sep), 'DESTINATION_PATH_ESCAPE');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, text);
}
const opsReferences = [];
for (const [path, reason] of referenceOnly) {
  const input = readFileSync(resolve(sourceRoot, path), 'utf8');
  assert.equal(blob(input), git('rev-parse', `${REVISION}:${path}`));
  const output = resolve(destination, 'reference-only', path.slice(4) + '.txt');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, input);
  opsReferences.push({ sourcePath: path, sourceBlob: blob(input), sourceSha256: sha256(input), reason, executable: false });
}
metadata.sort((a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0);
writeFileSync(resolve(destination, 'SOURCE_MANIFEST.json'), JSON.stringify({ schemaVersion: 1, repository: 'OuroborosCollective/-ax1', sourceRevision: REVISION, sourceComponents: components, files: metadata, hostBoundaryReexports: [...boundaryImports.keys()].sort(), opsReferences, productParityProven: false }, null, 2) + '\n');
console.log(JSON.stringify({ originalPlayerComponents: components.length - referenceOnly.size, quarantinedOpsReferences: referenceOnly.size, importedSourceFiles: files.size, hostBoundaryReexports: [...boundaryImports.keys()], manifestSha256: sha256(readFileSync(resolve(destination, 'SOURCE_MANIFEST.json'))), productParityProven: false }, null, 2));
