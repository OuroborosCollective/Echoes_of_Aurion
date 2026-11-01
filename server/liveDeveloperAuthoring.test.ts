import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateUntrustedAuthoringJson,
  proposeAurionDeveloperChange,
  proposeAurionAuthoringDraft,
  proposeGameDevAssetDesign,
} from "./liveDeveloperAuthoring";
import { hashGameDevAssetDesignWorkOrder } from "./liveDeveloperProtocol";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Aurion Genkit-free optional OpenAI proposal boundary", () => {
  it("fails closed with no provider and never calls an external service", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_AUTHORING_MODEL", "");
    const fetchDouble = vi.fn();
    vi.stubGlobal("fetch", fetchDouble);
    await expect(generateUntrustedAuthoringJson("draft")).rejects.toThrow("AURION_OPENAI_AUTHORING_NOT_CONFIGURED");
    expect(fetchDouble).not.toHaveBeenCalled();
  });

  it("preserves a human review-only asset work order, independently validated and hashed", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-double-only");
    vi.stubEnv("OPENAI_AUTHORING_MODEL", "test-double-only");
    const order = {
      title: "Canonical world nature design",
      suggestedDisplayName: "Mossy stone asset",
      suggestedPurpose: "world-nature",
      designIntent: "A purely visual presentation asset, not a simulation or world authority.",
      acceptanceCriteria: ["Independent asset catalog review must pass"],
      riskNotes: [],
      requiresHumanReview: true,
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(order) } }] }),
    })));
    const result = await proposeGameDevAssetDesign({request:"Suggest a mossy stone prop",actorRole:"admin"});
    expect(result).toEqual(order);
    expect(hashGameDevAssetDesignWorkOrder(result)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects an unreviewed provider result even when the HTTP request succeeded", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-double-only");
    vi.stubEnv("OPENAI_AUTHORING_MODEL", "test-double-only");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ requiresHumanReview: false }) } }] }),
    })));
    await expect(proposeAurionDeveloperChange({
      changeKind: "quest", request: "Please design a bounded quest", actorRole: "admin",
    })).rejects.toThrow();
  });

  it("rejects a proposal with the wrong domain identity", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-double-only");
    vi.stubEnv("OPENAI_AUTHORING_MODEL", "test-double-only");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        kind: "quest", title: "Draft world proposal", draftJson: "{}", reviewNotes: [], requiresHumanReview: true,
      }) } }] }),
    })));
    await expect(proposeAurionAuthoringDraft({
      kind:"world", request:"Design a bounded world proposal", actorRole:"admin", contextJson:"{}",
    })).rejects.toThrow("AURION_AUTHORING_DRAFT_KIND_MISMATCH");
  });
});
