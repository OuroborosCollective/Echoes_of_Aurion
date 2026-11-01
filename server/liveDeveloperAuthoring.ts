import { z } from "zod";
import {
  buildGameDevAssetDesignGuardrails,
  buildLiveDeveloperGuardrails,
  validateGameDevAssetDesignWorkOrder,
  validateLiveDeveloperProposal,
} from "./liveDeveloperProtocol";

const DeveloperInput = z.object({
  changeKind: z.enum(["world", "quest", "npc_behavior", "content_model"]),
  request: z.string().trim().min(12).max(1800),
  actorRole: z.literal("admin"),
}).strict();
const AssetInput = z.object({
  request: z.string().trim().min(12).max(1800),
  actorRole: z.literal("admin"),
}).strict();
const AuthoringInput = z.object({
  kind: z.enum(["world", "quest", "dungeon"]),
  request: z.string().trim().min(12).max(4000),
  contextJson: z.string().max(24000),
  actorRole: z.literal("admin"),
}).strict();
const AuthoringOutput = z.object({
  kind: z.enum(["world", "quest", "dungeon"]),
  title: z.string().trim().min(3).max(160),
  draftJson: z.string().min(2).max(60000),
  reviewNotes: z.array(z.string().trim().min(4).max(300)).max(12),
  requiresHumanReview: z.literal(true),
}).strict();

/**
 * Optional OpenAI-only proposal provider for the legacy admin web workbench.
 * The native Godot Human/AI World Studio uses aurionAuthoring.worldPlan,
 * explicit worldApply and independent worldReceipt/GET readback, not this
 * provider. Neither path can mutate world state through model output alone.
 */
export async function generateUntrustedAuthoringJson(prompt: string): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_AUTHORING_MODEL;
  if (!key || !model) throw new Error("AURION_OPENAI_AUTHORING_NOT_CONFIGURED");
  if (prompt.length === 0 || prompt.length > 30000) throw new Error("AURION_AUTHORING_PROMPT_BOUNDS");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "Return one valid JSON object for a review-only Aurion design proposal. No tools, no publication, no game authority. Never claim any draft is live." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`AURION_OPENAI_AUTHORING_HTTP_${response.status}`);
  const payload = await response.text();
  if (payload.length > 1048576) throw new Error("AURION_OPENAI_AUTHORING_RESPONSE_TOO_LARGE");
  let envelope: unknown;
  try { envelope = JSON.parse(payload); } catch { throw new Error("AURION_OPENAI_AUTHORING_INVALID_ENVELOPE"); }
  const content = z.object({
    choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  }).parse(envelope).choices[0].message.content;
  if (content.length > 65000) throw new Error("AURION_OPENAI_AUTHORING_CONTENT_TOO_LARGE");
  try { return JSON.parse(content); }
  catch { throw new Error("AURION_OPENAI_AUTHORING_INVALID_JSON"); }
}

export async function proposeAurionDeveloperChange(raw: unknown) {
  const input = DeveloperInput.parse(raw);
  const proposal = await generateUntrustedAuthoringJson(
    `${buildLiveDeveloperGuardrails()}\nRequested change kind: ${input.changeKind}\nDeveloper request: ${input.request}`
  );
  const result = validateLiveDeveloperProposal(proposal);
  if (result.kind !== input.changeKind) throw new Error("AURION_DEVELOPER_PROPOSAL_KIND_MISMATCH");
  return result;
}

export async function proposeGameDevAssetDesign(raw: unknown) {
  const input = AssetInput.parse(raw);
  const proposal = await generateUntrustedAuthoringJson(
    `${buildGameDevAssetDesignGuardrails()}\nHuman design brief: ${input.request}`
  );
  return validateGameDevAssetDesignWorkOrder(proposal);
}

export async function proposeAurionAuthoringDraft(raw: unknown) {
  const input = AuthoringInput.parse(raw);
  const domain = input.kind === "world"
    ? "WorldDesignDraft JSON: schemaVersion aurion.world-design.v1, designKey, version, title, expectedCatalogRevision, placements. Only approved catalog assetIds and bounded integer millimeter coordinates."
    : input.kind === "dungeon"
      ? "DungeonDesignDraft JSON: schemaVersion aurion.dungeon-design.v1, dungeonId, version, label, zone, expectedCatalogRevision, 4-9 rooms, directed connections, 2-4 bosses and partyCapabilities."
      : "Complete aurion.quest.v1 QuestTemplateVersion with valid start and end nodes, bounded outcomes, valid graph edges and no unauthorized rewards.";
  const result = AuthoringOutput.parse(await generateUntrustedAuthoringJson([
    "You are a design collaborator, never gameplay or persistence authority.",
    "Never execute tools or mutate code, files, worlds, databases, licenses or credentials.",
    "A human must review; Aurion independently validates, plans, authorizes and commits each operation.",
    domain,
    `Human brief: ${input.request}`,
    `Authoritative context: ${input.contextJson}`,
    "Return draftJson as strict JSON encoded in the draftJson string field.",
  ].join("\n\n")));
  if (result.kind !== input.kind) throw new Error("AURION_AUTHORING_DRAFT_KIND_MISMATCH");
  try { JSON.parse(result.draftJson); }
  catch { throw new Error("AURION_AUTHORING_DRAFT_JSON_INVALID"); }
  return result;
}
