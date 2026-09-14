const fs = require('fs');
let content = fs.readFileSync('server/aurionCivilizationHistoryPersistence.ts', 'utf8');
content = content.replace('import { hash } from "../shared/deterministicSimulation";', 'import { createHash } from "node:crypto";\nconst hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\\u001f"), "utf8").digest("hex");');
fs.writeFileSync('server/aurionCivilizationHistoryPersistence.ts', content);
