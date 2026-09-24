import { describe, expect, it } from "vitest";
import { buildGlobalWorldPlan } from "../server/globalWorldProtocol";
import {
  buildWorldPressureField,
  deriveWorldDirectorCandidates,
  decideWorldDirectors,
} from "./worldPressureProtocol";

function fixture() {
  const worldPlan = buildGlobalWorldPlan({
    worldSeed: "aurion-director-test-seed",
    epoch: 7,
    activePlayerCount: 120,
    highWaterPlayerCount: 120,
  });
  const field = buildWorldPressureField({
    worldPlan,
    worldRevision: "a".repeat(40),
    logicalTick: 700,
  });
  const candidates = deriveWorldDirectorCandidates(field, worldPlan);
  return { worldPlan, field, candidates };
}

describe("AIM-484 deterministic world pressure/director contracts", () => {
  it("produces the same field and intent decision from identical inputs", () => {
    const { field, candidates } = fixture();
    const input = {
      field,
      candidates,
      causalReceiptHash: `sha256:${"1".repeat(64)}`,
      seedDigest: `sha256:${"2".repeat(64)}`,
      previousReceiptHash: null,
    };
    const a = decideWorldDirectors(input);
    const b = decideWorldDirectors({ ...input, candidates: [...candidates].reverse() });
    expect(a).toEqual(b);
    expect(a.decisionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(a.intents.every(intent => intent.decisionHash === a.decisionHash)).toBe(true);
  });

  it("uses stable tie-breaking independent of candidate input order", () => {
    const { field, candidates } = fixture();
    const reversed = [...candidates].reverse();
    const a = decideWorldDirectors({
      field,
      candidates,
      causalReceiptHash: `sha256:${"3".repeat(64)}`,
      seedDigest: `sha256:${"4".repeat(64)}`,
      previousReceiptHash: null,
    });
    const b = decideWorldDirectors({
      field,
      candidates: reversed,
      causalReceiptHash: `sha256:${"3".repeat(64)}`,
      seedDigest: `sha256:${"4".repeat(64)}`,
      previousReceiptHash: null,
    });
    expect(a).toEqual(b);
  });

  it("fails closed on invalid causal provenance and duplicate candidate IDs", () => {
    const { field, candidates } = fixture();
    expect(() => decideWorldDirectors({
      field,
      candidates,
      causalReceiptHash: "sha256:invalid",
      seedDigest: `sha256:${"5".repeat(64)}`,
      previousReceiptHash: null,
    })).toThrow("WORLD_DIRECTOR_CAUSAL_RECEIPT_INVALID");
    expect(() => decideWorldDirectors({
      field,
      candidates: [candidates[0]!, candidates[0]!],
      causalReceiptHash: `sha256:${"6".repeat(64)}`,
      seedDigest: `sha256:${"7".repeat(64)}`,
      previousReceiptHash: null,
    })).toThrow("WORLD_DIRECTOR_CANDIDATE_ID_CONFLICT");
  });

  it("keeps the canonical contract free of wall-clock and random APIs", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("./worldPressureProtocol.ts", import.meta.url), "utf8");
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("Math.random(");
  });
});
