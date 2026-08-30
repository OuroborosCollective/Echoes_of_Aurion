import { describe, expect, it } from "vitest";
import { wasdGlbCatalog, wasdGlbSourceRevision } from "@/lib/wasdGlbCatalog";
import { buildDeterministicGlbUsagePlan, essentialTowerGlbPlan } from "./glbUsagePlan";

describe("glbUsagePlan", () => {
  it("covers every revision-locked WASD GLB exactly once in deterministic order", () => {
    const first = buildDeterministicGlbUsagePlan();
    const replay = buildDeterministicGlbUsagePlan();
    const wasdEntries = first.entries.filter(entry => entry.sourceRevision === wasdGlbSourceRevision);

    expect(first).toEqual(replay);
    expect(first.sourceRevision).toBe(wasdGlbSourceRevision);
    expect(wasdEntries).toHaveLength(wasdGlbCatalog.length);
    expect(new Set(wasdEntries.map(entry => entry.id)).size).toBe(wasdGlbCatalog.length);
    expect(first.entries.map(entry => entry.id)).toEqual(first.entries.map(entry => entry.id).slice().sort());
    expect(first.deterministicHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it("does not schedule confirmed-broken native Aurion GLBs", () => {
    expect(essentialTowerGlbPlan).toEqual([]);
  });

  it("preserves safety gates for assets requiring LOD or parser review", () => {
    const plan = buildDeterministicGlbUsagePlan();
    expect(plan.entries.filter(entry => entry.runtimeDisposition === "runtime_load")).toHaveLength(38);
    expect(plan.entries.filter(entry => entry.runtimeDisposition === "prepare_lod")).toHaveLength(28);
    expect(plan.entries.filter(entry => entry.runtimeDisposition === "parser_review")).toHaveLength(6);
  });
});
