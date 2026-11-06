import { describe, expect, it } from "vitest";
import { NPC_PURPOSE_ROUTINE_RADIUS_MM, NpcPurposeConfirmInput, NpcPurposeDraftSchema } from "./npcPurposeContract";

const valid = {
  schemaVersion: "aurion.npc-purpose.v1", shellRef: "authored:npc.shells.1a2b3c4d:p.000000000001", displayName: "Mira Kräuterhand", role: "Kräuterhändlerin",
  persona: "Ruhig, neugierig, kennt jede Pflanze.", greeting: "Willkommen, Wanderer!",
  topics: [{ topic: "Kräuter", line: "Silberblatt wächst im Nebel." }], routine: [{ label: "Beet", offsetXMm: 2_000, offsetZMm: -1_000, dwellSeconds: 120 }],
  questIdeas: [{ title: "Silberblatt", summary: "Drei Silberblätter für einen Trank.", objective: "Sammle drei Silberblätter." }],
};

// LLM output is untrusted: only plain, bounded text around the shell's place is accepted.
describe("NPC purpose contract", () => {
  it("accepts a well-formed draft", () => {
    expect(NpcPurposeDraftSchema.parse(valid)).toMatchObject({ displayName: "Mira Kräuterhand" });
  });
  it("rejects markup, links, control characters, extra fields and duplicate topics", () => {
    const bad = [
      { ...valid, greeting: "<script>alert(1)</script>" },
      { ...valid, persona: "Besuche www.example.invalid für Gold und Ruhm." },
      { ...valid, greeting: "Hallo\u0007" },
      { ...valid, power: "admin" },
      { ...valid, topics: [{ topic: "Kräuter", line: "a1" }, { topic: "kräuter", line: "b2" }] },
      { ...valid, topics: [{ topic: "Kräuter", line: "Silberblatt", extra: true }] },
      { ...valid, shellRef: "authored:admin.placements.1:p.000000000001" },
    ];
    for (const value of bad) expect(NpcPurposeDraftSchema.safeParse(value).success).toBe(false);
  });
  it("keeps the routine around the NPC's place and bounds every list", () => {
    expect(NpcPurposeDraftSchema.safeParse({ ...valid, routine: [{ label: "Fern", offsetXMm: NPC_PURPOSE_ROUTINE_RADIUS_MM + 1, offsetZMm: 0, dwellSeconds: 60 }] }).success).toBe(false);
    expect(NpcPurposeDraftSchema.safeParse({ ...valid, routine: [] }).success).toBe(false);
    expect(NpcPurposeDraftSchema.safeParse({ ...valid, topics: Array.from({ length: 9 }, (_, i) => ({ topic: `Thema ${i}`, line: "Zeile" })) }).success).toBe(false);
    expect(NpcPurposeDraftSchema.safeParse({ ...valid, questIdeas: Array.from({ length: 4 }, (_, i) => ({ title: `Quest ${i}`, summary: "Eine längere Beschreibung.", objective: "Ziel" })) }).success).toBe(false);
  });
  it("requires the explicit one-tap confirmation and the previewed hash", () => {
    expect(NpcPurposeConfirmInput.safeParse({ draft: valid, expectedDraftHash: "a".repeat(64), expectedPreviousPurposeHash: null, confirmation: "CONFIRM_NPC_PURPOSE" }).success).toBe(true);
    expect(NpcPurposeConfirmInput.safeParse({ draft: valid, expectedDraftHash: "a".repeat(64), expectedPreviousPurposeHash: null, confirmation: "YES" }).success).toBe(false);
  });
});
