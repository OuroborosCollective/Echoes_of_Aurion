import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const canonicalVisualWorkflow = fs.readFileSync(
  path.join(root, "docs/game-development-studio-visual-production-and-worldbuilding/README.md"),
  "utf8",
);

describe("Aurion authority documentation", () => {
  it("keeps gameplay and world truth Aurion-owned", () => {
    expect(canonicalVisualWorkflow).toContain(
      "**Aurion** ist die einzige Gameplay-/Simulations-Authority.",
    );
    expect(canonicalVisualWorkflow).toContain(
      "**WASD** ist ausschließlich historische Migrations-/Provenienzquelle",
    );
    expect(canonicalVisualWorkflow).toContain(
      "GDS darf keine Quest-, Dungeon- oder World-Truth setzen.",
    );
    expect(canonicalVisualWorkflow).toContain(
      "Genkit hat in der Authoring-Lane keine Publish-, Tool- oder Gameplay-Authority.",
    );
  });

  it("does not reintroduce active WASD gameplay authority", () => {
    expect(canonicalVisualWorkflow).not.toContain("**WASD** besitzt Gameplay-/Simulationsregeln");
    expect(canonicalVisualWorkflow).not.toContain("AX1/WASD definieren");
    expect(canonicalVisualWorkflow).not.toContain("Questlogik und Belohnungen bleiben WASD-owned");
  });
});
