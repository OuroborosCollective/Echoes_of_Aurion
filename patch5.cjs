const fs = require('fs');
let code = fs.readFileSync('server/wasdSemanticGraphPersistence.ts', 'utf8');
code = code.replace(/await tx\.insert\(aurionSemanticProvenance\)\.values\(provRow\)\.onConflictDoNothing\(\);/g, `await tx.insert(aurionSemanticProvenance).ignore().values(provRow);`);
fs.writeFileSync('server/wasdSemanticGraphPersistence.ts', code);
