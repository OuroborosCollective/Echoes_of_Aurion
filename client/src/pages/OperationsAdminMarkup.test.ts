import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Capture the literal, user-visible \\n escape regression in Operations' JSX. */
describe("Aurion Admin operations markup", () => {
  it("does not render literal backslash-n text between admin tab panels", () => {
    const source = readFileSync(new URL("./Operations.tsx", import.meta.url), "utf8");
    const adminTabs = source.slice(source.indexOf('value="game-dev"'));
    expect(adminTabs).toContain('value="causality"');
    expect(adminTabs).not.toContain(String.fromCharCode(125, 92, 110));
  });
});
