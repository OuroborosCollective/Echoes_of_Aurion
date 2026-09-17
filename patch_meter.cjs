const fs = require("fs");
const file = "client/src/xaurion/components/GameHUD.tsx";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  /<div className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out" style=\{\{ width: \`\$\{objective\.progress \* 100\}%\` \}\} \/>/,
  \`<div className={\\\`h-full rounded-full bg-amber-500 transition-all duration-500 ease-out \${activeEffects.get(objective.id) === 'pulse' ? 'flash-meter' : ''}\\\`} style={{ width: \\\`\${objective.progress * 100}%\\\` }} />\`
);
fs.writeFileSync(file, content);
