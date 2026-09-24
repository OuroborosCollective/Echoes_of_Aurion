import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("internal ANN exposure boundary", () => {
  it("does not register semantic ANN retrieval on the public context router", () => {
    const routePath = path.resolve(process.cwd(), "server/routes/aurionContextRouter.ts");
    const source = fs.readFileSync(routePath, "utf8");
    expect(source).not.toContain("semanticSearch:");
    expect(source).not.toContain("internalSemanticSearch(");
  });

  it("keeps the Wolfram bridge structural-only and local", () => {
    const analyzerPath = path.resolve(process.cwd(), "server/worldContext/internalGraphAnalysis.ts");
    const source = fs.readFileSync(analyzerPath, "utf8");
    expect(source).not.toContain("CanonicalContextSource");
    expect(source).toContain("toWolframLanguageGraph");
  });
});
