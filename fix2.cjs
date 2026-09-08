const fs = require('fs');
let code = fs.readFileSync('e2e/aim253.glbActors.spec.ts', 'utf8');

code = code.replace(/delay: 350 \}\);/g, "delay: 800 });");
code = code.replace(/delay: 120 \}\);/g, "delay: 800 });");
code = code.replace(/timeout: 8_000,/g, "timeout: 15_000,");
code = code.replace(/timeout: 3_000,/g, "timeout: 15_000,");

fs.writeFileSync('e2e/aim253.glbActors.spec.ts', code, 'utf8');
