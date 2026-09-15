const fs = require('fs');

const files = [
  'client/src/xaurion/entities/OpenWorldPlayer.ts',
  'client/src/xaurion/world/OpenWorldLandscape.ts',
  'client/src/xaurion/world/WorldChunkManager.ts'
];

const jsons = [
  'docs/migrations/aim239-determinism-adaptations.json',
  'docs/migrations/fantasy-tree-visual-adaptations.json',
  'docs/migrations/ax1-surface-atlas-adaptations.json'
];

for (const jf of jsons) {
  const data = JSON.parse(fs.readFileSync(jf, 'utf8'));
  for (const entry of data.files) {
    if (!files.includes(entry.path)) continue;
    const source = fs.readFileSync(entry.path, 'utf8');
    for (const change of entry.adaptations) {
      if (source.split(change.after).length - 1 !== change.occurrences) {
        console.log(`Mismatch in ${jf} for ${entry.path}:`);
        console.log("Expected text:", change.after);
        // Find best match? Let's just output the first 50 chars and see if we can find it
        const prefix = change.after.substring(0, 50);
        console.log("Searching prefix:", prefix);
        const idx = source.indexOf(prefix);
        if (idx !== -1) {
          console.log("Found prefix at", idx);
          console.log("Actual text around there:\n", source.substring(idx, idx + 300));
        } else {
          console.log("Prefix not found");
        }
      }
    }
  }
}
