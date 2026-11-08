import { describe, expect, it } from "vitest";
import { aurionAuthoringRouter } from "../routes/aurionAuthoringRouter";
import type { TrpcContext } from "../_core/context";
import { aiAuthoringToolCatalog, previewAiAuthoringTool } from "./authoringToolchain";

const caller = (role = "admin") => aurionAuthoringRouter.createCaller({ user: { id: 42, role } } as TrpcContext);
const sourceJson = JSON.stringify({
  version: 1, questlines: [{ id: "test_strand", title: "Test Strand", entryNode: "start",
    graph: { start: { id: "start", title: "Start", choices: [{ id: "go", label: "Next", nextNode: "end" }] },
      end: { id: "end", title: "End", choices: [] } } }],
});

describe("Aurion AI authoring toolchain", () => {
  it("advertises only preview tools and explicit canonical handoffs", async () => {
    const catalog = await caller().aiToolCatalog();
    expect(catalog).toEqual(aiAuthoringToolCatalog);
    expect(catalog.mutationAuthority).toBe("none");
    expect(catalog.tools.map(t => t.tool)).toEqual([
      "fadenwerk.inspect", "fadenwerk.draft", "quest.template.validate",
      "npc.behavior.draft", "world.design.propose",
    ]);
    expect(catalog.tools.every(t => t.previewOnly)).toBe(true);
    expect(catalog.handoffs.quest).toContain("aurionQuest.publishReceipt");
    expect(catalog.handoffs.world).toContain("aurionAuthoring.worldReceipt");
    expect(catalog.handoffs.npc).toContain("aurionAuthoring.behaviorTest");
  });

  it("routes Fadenwerk inspection, canonical draft and quest validation without writing", async () => {
    const inspected = await caller().aiToolPreview({ tool: "fadenwerk.inspect", sourceJson });
    expect(inspected).toMatchObject({ tool: "fadenwerk.inspect", mutationAuthority: "none", previewOnly: true,
      result: { previewOnly: true, questlines: [{ id: "test_strand", issues: [] }] } });
    const converted = await caller().aiToolPreview({ tool: "fadenwerk.draft", sourceJson, questlineIndex: 0, version: 4 });
    expect(converted).toMatchObject({ tool: "fadenwerk.draft", mutationAuthority: "none", previewOnly: true,
      result: { previewOnly: true, template: { active: false, quarantined: true, version: 4 } } });
    if (converted.tool !== "fadenwerk.draft") throw new Error("wrong tool");
    const checked = await caller().aiToolPreview({ tool: "quest.template.validate", templateJson: JSON.stringify(converted.result.template) });
    expect(checked).toMatchObject({ tool: "quest.template.validate", mutationAuthority: "none", previewOnly: true,
      result: { valid: true, diagnostics: [] } });
    expect(JSON.stringify(checked)).not.toContain("receipt");
  });

  it("keeps invalid graph and malformed JSON rejected, never published", async () => {
    const converted = await caller().aiToolPreview({ tool: "fadenwerk.draft", sourceJson, questlineIndex: 0, version: 4 });
    if (converted.tool !== "fadenwerk.draft") throw new Error("wrong tool");
    const broken = { ...converted.result.template, edges: [] };
    const checked = await caller().aiToolPreview({ tool: "quest.template.validate", templateJson: JSON.stringify(broken) });
    expect(checked).toMatchObject({ tool: "quest.template.validate", result: { valid: false } });
    const malformed = await caller().aiToolPreview({ tool: "quest.template.validate", templateJson: "{" });
    expect(malformed).toMatchObject({ result: { valid: false, diagnostics: [{ code: "QUEST_JSON_INVALID" }] } });
    const invalid = await caller().aiToolPreview({ tool: "quest.template.validate", templateJson: "{}" });
    expect(invalid).toMatchObject({ result: { valid: false, diagnostics: [{ code: "QUEST_SCHEMA_INVALID" }] } });
  });

  it("uses existing NPC forge in shadow-only mode", async () => {
    const input = { role: "guard" as const, mode: "tree" as const, brief: "Protect the village entrance without inventing actions." };
    const draft = await caller().aiToolPreview({ tool: "npc.behavior.draft", input });
    expect(draft).toMatchObject({ tool: "npc.behavior.draft", mutationAuthority: "none", previewOnly: true,
      result: { status: "DRAFT", activation: "BLOCKED", generation: "EXPLICIT_TEMPLATE_NOT_AI" } });
    expect(JSON.stringify(draft)).not.toContain('"receipt":');
  });

  it("enforces existing admin permissions, strict input and live-zone world precondition", async () => {
    await expect(caller("user").aiToolCatalog()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("user").aiToolPreview({ tool: "fadenwerk.inspect", sourceJson })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().aiToolPreview({ tool: "fadenwerk.inspect", sourceJson, apply: true } as never)).rejects.toThrow();
    await expect(caller().aiToolPreview({ tool: "world.design.apply" } as never)).rejects.toThrow();
    await expect(caller().aiToolPreview({ tool: "fadenwerk.inspect", sourceJson: "界".repeat(50000) })).rejects.toThrow("FADENWERK_SOURCE_TOO_LARGE");
    const world = { tool: "world.design.propose" as const, input: {
      request: "Place only approved models in the selected live chunk.", zoneId: "windhollow",
      connectionId: "zone_peer_not_connected", chunkX: 0, chunkZ: 0, assetIds: [],
    } };
    await expect(caller().aiToolPreview(world)).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "AI_LIVE_SESSION_REQUIRED" });
    await expect(previewAiAuthoringTool(world)).rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "WORLD_LIVE_VALIDATOR_REQUIRED" });
  });
});
