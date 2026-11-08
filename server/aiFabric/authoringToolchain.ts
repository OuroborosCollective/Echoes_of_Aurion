import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { QuestTemplateVersionSchema } from "../../shared/aurionQuestContract";
import { QuestValidator } from "../questCompiler/validator";
import { fadenwerkDraft, fadenwerkInspection } from "../questCompiler/fadenwerkAuthoring";
import { BehaviorDraftInput, draftBehavior } from "./behaviorAuthoring";
import { DesignerInput, type DesignerRequest } from "./worldDesigner";

/**
 * Cookbook-inspired dispatch contract. Models and imported documents are untrusted
 * authoring input, never Aurion commands, permissions, or runtime evidence.
 */
export const AiAuthoringToolInput = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("fadenwerk.inspect"), sourceJson: z.string().min(2).max(120_000) }).strict(),
  z.object({ tool: z.literal("fadenwerk.draft"), sourceJson: z.string().min(2).max(120_000),
    questlineIndex: z.number().int().min(0).max(99), version: z.number().int().min(1).max(1_000_000) }).strict(),
  z.object({ tool: z.literal("quest.template.validate"), templateJson: z.string().min(1).max(120_000) }).strict(),
  z.object({ tool: z.literal("npc.behavior.draft"), input: BehaviorDraftInput }).strict(),
  z.object({ tool: z.literal("world.design.propose"), input: DesignerInput }).strict(),
]);
export type AiAuthoringToolRequest = z.infer<typeof AiAuthoringToolInput>;

const handoffs = Object.freeze({
  quest: ["aurionQuest.proposeDraft", "aurionQuest.publishPlan", "aurionQuest.publish", "aurionQuest.publishReceipt", "aurionQuest.authoringTemplate"],
  npc: ["aurionAuthoring.behaviorActors", "aurionAuthoring.behaviorTest"],
  world: ["aurionAuthoring.worldPlan", "aurionAuthoring.worldApply", "aurionAuthoring.worldReceipt", "/api/game/world-design"],
  godot: ["godot-client/net/api/world_authoring_api.gd"],
});

export const aiAuthoringToolCatalog = Object.freeze({
  schemaVersion: "aurion.ai-authoring-tools.v1" as const,
  mutationAuthority: "none" as const,
  authorization: "existing Aurion admin session" as const,
  tools: [
    { tool: "fadenwerk.inspect", previewOnly: true, surface: "quest", effect: "none" },
    { tool: "fadenwerk.draft", previewOnly: true, surface: "quest", effect: "none" },
    { tool: "quest.template.validate", previewOnly: true, surface: "quest", effect: "none" },
    { tool: "npc.behavior.draft", previewOnly: true, surface: "npc", effect: "none" },
    { tool: "world.design.propose", previewOnly: true, surface: "world", effect: "external model draft only" },
  ] as const,
  handoffs,
  rules: ["No model-produced commands are executed.", "No publication, NPC activation, or world apply.",
    "A world proposal requires the existing authenticated live-zone observer and independent revalidation.",
    "Canonical effects require a separate Aurion plan, explicit confirmation, receipt and readback."],
});

function validateQuestJson(text: string) {
  if (Buffer.byteLength(text, "utf8") > 120_000) throw new TRPCError({ code: "BAD_REQUEST", message: "QUEST_INPUT_TOO_LARGE" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { valid: false as const, diagnostics: [{ code: "QUEST_JSON_INVALID", message: "Invalid JSON", severity: "error" as const }] };
  }
  const template = QuestTemplateVersionSchema.safeParse(parsed);
  if (!template.success) {
    // Never echo arbitrary untrusted data or schema failure details.
    return { valid: false as const, diagnostics: [{ code: "QUEST_SCHEMA_INVALID", message: "Quest template schema mismatch", severity: "error" as const }] };
  }
  return QuestValidator.validateTemplate(template.data);
}

/**
 * Pure dispatch where possible. World models require an injected canonical,
 * admin-session-bound resolver; an absent resolver must fail closed.
 * No code path here can publish a quest, activate an NPC, or mutate the world.
 */
export async function previewAiAuthoringTool(
  raw: unknown,
  options: { proposeWorld?: (input: DesignerRequest) => Promise<unknown> } = {},
) {
  const input = AiAuthoringToolInput.parse(raw);
  switch (input.tool) {
    case "fadenwerk.inspect":
      return { tool: input.tool, previewOnly: true as const, mutationAuthority: "none" as const,
        result: fadenwerkInspection(input.sourceJson) };
    case "fadenwerk.draft":
      return { tool: input.tool, previewOnly: true as const, mutationAuthority: "none" as const,
        result: fadenwerkDraft(input.sourceJson, input.questlineIndex, input.version) };
    case "quest.template.validate":
      return { tool: input.tool, previewOnly: true as const, mutationAuthority: "none" as const,
        result: validateQuestJson(input.templateJson) };
    case "npc.behavior.draft":
      return { tool: input.tool, previewOnly: true as const, mutationAuthority: "none" as const,
        result: draftBehavior(input.input) };
    case "world.design.propose":
      if (!options.proposeWorld) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "WORLD_LIVE_VALIDATOR_REQUIRED" });
      return { tool: input.tool, previewOnly: true as const, mutationAuthority: "none" as const,
        result: await options.proposeWorld(input.input) };
  }
}
