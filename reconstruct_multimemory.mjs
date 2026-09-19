import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const TARGET_HASH = "2e4c05121d89f31f465eafc3a4281537fd13176fd0bc8c503684a2fb9d2655f8";

// Let's create a temporary directory to compile multiMemory.ts
mkdirSync("/tmp/wasd_npc_build", { recursive: true });

// Copy all other .ts files or .d.ts files so TS can resolve imports
for (const f of ["authority.d.ts", "canonical.d.ts", "npcNeeds.d.ts", "npcLifeProtocol.d.ts", "npcPersistenceProtocol.d.ts", "ax1LivingWorldProtocol.d.ts", "merchantRules.d.ts"]) {
  writeFileSync(`/tmp/wasd_npc_build/${f}`, readFileSync(`vendor/wasd-npc/${f}`));
}

const compilerOptions = {
  declaration: true,
  emitDeclarationOnly: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  outDir: "/tmp/wasd_npc_build/out",
};

export function compileSource(sourceCode) {
  writeFileSync("/tmp/wasd_npc_build/multiMemory.ts", sourceCode);
  const program = ts.createProgram(["/tmp/wasd_npc_build/multiMemory.ts"], compilerOptions);
  const emitResult = program.emit();
  if (emitResult.diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(emitResult.diagnostics, {
      getCurrentDirectory: () => "/tmp/wasd_npc_build",
      getCanonicalFileName: f => f,
      getNewLine: () => "\n",
    });
    return { error: formatted };
  }
  const dts = readFileSync("/tmp/wasd_npc_build/out/multiMemory.d.ts", "utf8");
  const hash = createHash("sha256").update(dts).digest("hex");
  return { dts, hash, match: hash === TARGET_HASH };
}

console.log("Compiler ready");
