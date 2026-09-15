const fs = require('fs');
const crypto = require('crypto');

const adaptations = JSON.parse(fs.readFileSync('docs/migrations/aim239-determinism-adaptations.json', 'utf-8'));
const entry = adaptations.files.find(f => f.path === 'client/src/xaurion/entities/OpenWorldPlayer.ts');

let current = fs.readFileSync('client/src/xaurion/entities/OpenWorldPlayer.ts', 'utf-8');
let restored = current;
for (const change of [...entry.adaptations].reverse()) {
  restored = restored.replaceAll(change.after, change.before);
}

const restoredHash = crypto.createHash("sha256").update(restored).digest("hex");
console.log("Restored Hash:", restoredHash);
console.log("Expected Source Hash:", entry.sourceSha256);

