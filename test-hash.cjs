const fs = require('fs');
const crypto = require('crypto');

const files = [
  'client/src/xaurion/entities/OpenWorldPlayer.ts',
  'client/src/xaurion/world/OpenWorldLandscape.ts',
  'client/src/xaurion/world/WorldChunkManager.ts'
];

const det = JSON.parse(fs.readFileSync('docs/migrations/aim239-determinism-adaptations.json', 'utf8'));
const tree = JSON.parse(fs.readFileSync('docs/migrations/fantasy-tree-visual-adaptations.json', 'utf8'));
const atlas = JSON.parse(fs.readFileSync('docs/migrations/ax1-surface-atlas-adaptations.json', 'utf8'));

for (const path of files) {
  let source = fs.readFileSync(path, 'utf8');
  
  // surface atlas
  let entry = atlas.files.find(f => f.path === path);
  if (entry) {
    for (const change of [...entry.adaptations].reverse()) {
      source = source.replaceAll(change.after, change.before);
    }
  }

  // tree visual
  entry = tree.files.find(f => f.path === path);
  if (entry) {
    for (const change of [...entry.adaptations].reverse()) {
      source = source.replaceAll(change.after, change.before);
    }
  }

  // determinism
  entry = det.files.find(f => f.path === path);
  let expectedSource = null;
  if (entry) {
    expectedSource = entry.sourceSha256;
    for (const change of [...entry.adaptations].reverse()) {
      source = source.replaceAll(change.after, change.before);
    }
  }

  const hash = crypto.createHash('sha256').update(source).digest('hex');
  console.log(path, 'restored hash:', hash, 'expected:', expectedSource);
}
