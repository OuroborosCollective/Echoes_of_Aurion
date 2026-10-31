import { describe, expect, it } from "vitest";
import { parseAurionProposal, geminiStructuredJson } from "./liveDeveloperGemini";
import { LiveDeveloperProposalSchema, GameDevAssetDesignWorkOrderSchema } from "./liveDeveloperProtocol";

describe("Aurion direct Gemini proposal boundary (no Genkit runtime)", () => {
  it("fails closed before issuing a provider request without an API key", async () => {
    await expect(geminiStructuredJson("A bounded draft", undefined)).rejects.toThrow("AURION_GEMINI_KEY_UNCONFIGURED");
  });

  it("rejects empty, malformed and untrusted provider outputs", () => {
    expect(() => parseAurionProposal("", LiveDeveloperProposalSchema)).toThrow();
    expect(() => parseAurionProposal("not-json", LiveDeveloperProposalSchema)).toThrow();
    expect(() => parseAurionProposal(JSON.stringify({ requiresHumanReview: false }), LiveDeveloperProposalSchema)).toThrow();
  });

  it("only admits complete independently validated review-only work orders", () => {
    const valid = {
      title: "Verified world-nature fallback",
      suggestedDisplayName: "Canonical forest prop",
      suggestedPurpose: "world-nature",
      designIntent: "Presentation-only GLB placeholder; no gameplay state or asset admission.",
      acceptanceCriteria: ["Must pass the independent asset validation gate"],
      riskNotes: [],
      requiresHumanReview: true,
    };
    expect(parseAurionProposal(JSON.stringify(valid), GameDevAssetDesignWorkOrderSchema)).toEqual(valid);
    expect(() => parseAurionProposal(JSON.stringify({ ...valid, requiresHumanReview: false }), GameDevAssetDesignWorkOrderSchema)).toThrow();
    expect(() => parseAurionProposal(JSON.stringify({ ...valid, publishNow: true }), GameDevAssetDesignWorkOrderSchema)).toThrow();
  });
});
