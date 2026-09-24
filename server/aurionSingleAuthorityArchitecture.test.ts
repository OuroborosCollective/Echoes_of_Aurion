import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");

describe("Aurion single-authority architecture", () => {
  it("makes Aurion the only current owner and truth source", () => {
    const architecture = read("ARCHITECTURE_OWNERSHIP.md");
    const agents = read("AGENTS.md");
    const contributing = read("CONTRIBUTING.md");

    for (const text of [architecture, agents, contributing]) {
      expect(text).toContain("Aurion");
      expect(text).toMatch(/single/i);
      expect(text).toContain("only");
      expect(text).toContain("truth");
      expect(text).not.toMatch(/AX1\s+(?:is|bleibt)\s+the canonical game/i);
      expect(text).not.toMatch(/WASD\s+(?:is|ist|remains|bleibt)\s+(?:the |die )?(?:normative|canonical|gameplay)/i);
      expect(text).not.toMatch(/AX1.*current authority/i);
      expect(text).not.toMatch(/WASD.*current authority/i);
    }
  });

  it("treats legacy source identities as provenance only", () => {
    const provenance = read("docs/migrations/CURRENT_SOURCE_PROVENANCE.md");
    const aim252 = read("docs/migrations/AIM252_WASD_NORMATIVE_RULESET.md");
    const aim267 = read("docs/migrations/AIM267_AX1_CONTENT_CATALOG.md");
    const aim292 = read("docs/migrations/AIM292_NPC_MULTI_MEMORY.md");

    for (const text of [provenance, aim252, aim267, aim292]) {
      expect(text).toMatch(/historisch|historical/i);
      expect(text).toMatch(/nicht normativ|not normative|superseded/i);
    }
  });

  it("removes active AX1/WASD ownership markers from migrated content", () => {
    const manifest = read("client/src/xaurion/integration/ax1SourceManifest.ts");
    const contentCatalog = JSON.parse(read("shared/aurionAx1ContentCatalog.json"));

    expect(manifest).not.toContain('"ax1-gameplay"');
    expect(manifest).toContain('authority: "presentation" | "aurion-readback";');
    expect(contentCatalog.authority).toEqual({
      definitionsOnly: true,
      liveState: false,
      progressionCap: null,
      mutation: "aurion_receipts",
    });
  });

  it("protects the project license boundary from a permissive MIT project license", () => {
    const license = read("LICENSE.md");
    const notice = read("NOTICE.md");

    expect(license).toContain("Ouroboros Collective");
    expect(license).toContain("Thomas Markgraf");
    expect(license).toContain("Keine kommerzielle Nutzung ohne Lizenz");
    expect(license).toContain("Private Nutzung und Spielen");
    expect(license).not.toMatch(/^MIT License$/m);
    expect(notice).toContain("Echoes of Aurion is not distributed under the MIT License.");
    expect(notice).toContain("only to their respective third-party components");
  });

  it("makes /play an Aurion-owned route and the homepage a game-first landing page", () => {
    const entry = read("docs/account-first-entry.md");
    const app = read("client/src/App.tsx");
    const home = read("client/src/pages/Home.tsx");

    expect(entry).toContain("`/play` | Aurion");
    expect(entry).not.toContain("`/play` | AX1");
    expect(app).toContain("one canonical game/runtime owned by Aurion");
    expect(home).toContain("Eine Welt, die");
    expect(home).toContain("SELF-ACTING NPCs");
    expect(home).toContain("EVOLUTIONÄRE ÖKOSYSTEME");
    expect(home).toContain("Kämpfe, Skills, Loot und Progression");
    expect(home).toContain("Erinnerungen werden zu Handlung");
  });
});
