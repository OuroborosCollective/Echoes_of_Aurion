import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { createAim540EvidenceSummary } from "./aim540EvidenceSummary";

const hash=canonicalSha256({fixture:"aim540"});

describe("AIM-540 evidence summary",()=>{
  it("creates a canonical MATCH summary with a stable evidence hash",()=>{
    const summary=createAim540EvidenceSummary({
      worldId:"echoes-of-aurion-global",
      status:"MATCH",
      steps:[
        {kind:"encounter",receiptId:"encounter-1",evidenceHash:hash},
        {kind:"loot",receiptId:"loot-1",evidenceHash:hash},
        {kind:"inventory",receiptId:"inventory-1",evidenceHash:hash},
        {kind:"trade",receiptId:"trade-1",evidenceHash:hash},
        {kind:"ledger",receiptId:"ledger-1",evidenceHash:hash},
      ],
    });
    expect(summary.schema).toBe("aurion.loot-crafting-economy-evidence.v1");
    expect(summary.gameplayMutationAuthority).toBe("none");
    expect(summary.evidenceHash).toBe(canonicalSha256({
      schema:summary.schema,
      worldId:summary.worldId,
      status:summary.status,
      gameplayMutationAuthority:summary.gameplayMutationAuthority,
      steps:summary.steps,
      unprovable:summary.unprovable,
      contradictions:summary.contradictions,
    }));
  });

  it("preserves UNPROVABLE and CONTRADICTED rather than repairing them",()=>{
    expect(createAim540EvidenceSummary({
      worldId:"echoes-of-aurion-global",
      status:"UNPROVABLE",
      steps:[{kind:"loot",receiptId:"loot-1",evidenceHash:hash}],
      unprovable:["missing causal anchor"],
    }).unprovable).toEqual(["missing causal anchor"]);
    expect(createAim540EvidenceSummary({
      worldId:"echoes-of-aurion-global",
      status:"CONTRADICTED",
      steps:[{kind:"loot",receiptId:"loot-1",evidenceHash:hash}],
      contradictions:["stored deterministic hash disagrees"],
    }).contradictions).toEqual(["stored deterministic hash disagrees"]);
    expect(()=>createAim540EvidenceSummary({
      worldId:"echoes-of-aurion-global",
      status:"MATCH",
      steps:[{kind:"loot",receiptId:"loot-1",evidenceHash:hash}],
      unprovable:["missing"],
    })).toThrow("AIM540_MATCH_WITH_FAILURES");
  });
});
