import { googleAI } from "@genkit-ai/google-genai";
import { genkit, z } from "genkit";
import { buildGameDevAssetDesignGuardrails, buildLiveDeveloperGuardrails, validateGameDevAssetDesignWorkOrder, validateLiveDeveloperProposal } from "./liveDeveloperProtocol";

const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
});

const inputSchema = z.object({
  changeKind: z.enum(["world", "quest", "npc_behavior", "content_model"]),
  request: z.string().trim().min(12).max(1_800),
  actorRole: z.literal("admin"),
});

// Genkit carries its own Zod peer dependency. Keep the flow boundary on that
// instance, then validate the resulting unknown with Aurion's application Zod.
const outputSchema = z.object({
  kind: z.enum(["world", "quest", "npc_behavior", "content_model"]),
  title: z.string(),
  summary: z.string(),
  operations: z.array(
    z.object({
      action: z.enum(["add", "adjust"]),
      target: z.string(),
      summary: z.string(),
      constraints: z.array(z.string()),
    })
  ),
  gameplayImpact: z.string(),
  reviewNotes: z.array(z.string()),
  requiresHumanReview: z.literal(true),
});

/**
 * This flow intentionally returns a typed proposal only. It has no tools and
 * no write path; an independent reviewed application layer must consume it.
 */
export const proposeAurionDeveloperChange = ai.defineFlow(
  {
    name: "proposeAurionDeveloperChange",
    inputSchema,
    outputSchema,
  },
  async input => {
    const response = await ai.generate({
      model: googleAI.model("gemini-2.5-flash"),
      prompt: `${buildLiveDeveloperGuardrails()}\n\nRequested change kind: ${input.changeKind}\nDeveloper request: ${input.request}`,
      output: { schema: outputSchema },
    });

    if (!response.output) {
      throw new Error("Genkit returned no structured Aurion developer proposal");
    }

    return validateLiveDeveloperProposal(response.output);
  }
);


const gameDevDesignInputSchema = z.object({
  request: z.string().trim().min(12).max(1_800),
  actorRole: z.literal("admin"),
});

const gameDevDesignOutputSchema = z.object({
  title: z.string(),
  suggestedDisplayName: z.string(),
  suggestedPurpose: z.enum(["npc-fallback", "world-environment", "world-nature", "player-public", "equipment"]),
  designIntent: z.string(),
  acceptanceCriteria: z.array(z.string()),
  riskNotes: z.array(z.string()),
  requiresHumanReview: z.literal(true),
});

/**
 * Genkit participates as the design collaborator only. It produces a bounded,
 * typed work order. The separate Game Development Studio production lane owns
 * validation/package/vendoring, and only an explicit admin Apply call may
 * admit verified bytes into the live Aurion asset catalog.
 */
export const proposeGameDevAssetDesign = ai.defineFlow(
  {
    name: "proposeGameDevAssetDesign",
    inputSchema: gameDevDesignInputSchema,
    outputSchema: gameDevDesignOutputSchema,
  },
  async input => {
    const response = await ai.generate({
      model: googleAI.model("gemini-2.5-flash"),
      prompt: `${buildGameDevAssetDesignGuardrails()}\n\nHuman design brief: ${input.request}`,
      output: { schema: gameDevDesignOutputSchema },
    });
    if (!response.output) throw new Error("Genkit returned no structured game asset design work order");
    return validateGameDevAssetDesignWorkOrder(response.output);
  },
);


const authoringDraftInputSchema = z.object({
  kind: z.enum(["world", "quest", "dungeon"]),
  request: z.string().trim().min(12).max(4_000),
  actorRole: z.literal("admin"),
  contextJson: z.string().max(24_000),
});

const authoringDraftOutputSchema = z.object({
  kind: z.enum(["world", "quest", "dungeon"]),
  title: z.string(),
  draftJson: z.string(),
  reviewNotes: z.array(z.string()),
  requiresHumanReview: z.literal(true),
});

/**
 * Authoring AI is a proposal generator only. It has no tools and cannot publish.
 * The returned JSON is untrusted until Aurion's domain plan endpoint parses,
 * validates, hashes and previews it.
 */
export const proposeAurionAuthoringDraft = ai.defineFlow(
  {
    name: "proposeAurionAuthoringDraft",
    inputSchema: authoringDraftInputSchema,
    outputSchema: authoringDraftOutputSchema,
  },
  async input => {
    const domainContract = input.kind === "world"
      ? "Return a WorldDesignDraft JSON with schemaVersion aurion.world-design.v1, designKey, version, title, expectedCatalogRevision, placements. Every placement uses only listed approved assetId values and integer chunk/local millimeter coordinates."
      : input.kind === "dungeon"
        ? "Return a DungeonDesignDraft JSON with schemaVersion aurion.dungeon-design.v1, dungeonId starting dungeon_, version, label, zone, expectedCatalogRevision, 4-9 rooms, directed connections, 2-4 bosses and [1,1,3] partyCapabilities. Use listed approved assetId values only."
        : "Return a complete aurion.quest.v1 QuestTemplateVersion JSON with templateId, version, title, description, prerequisiteFacts, roles, nodes, edges, outcomes, maxCompositionDepth, active=true and quarantined=false. Use exactly one start node, at least one end node, valid graph references and bounded rewards.";

    const response = await ai.generate({
      model: googleAI.model("gemini-2.5-flash"),
      prompt: [
        "You are an Aurion content-design collaborator, never gameplay authority.",
        "Do not execute tools, write files, publish content, claim that anything is live, invent licenses, expose credentials, or grant rewards outside the requested draft.",
        "The draft is reviewed by a human and then independently validated by Aurion. Any changed draft requires a new plan.",
        domainContract,
        `Human brief: ${input.request}`,
        `Authoritative context: ${input.contextJson}`,
        "Return draftJson as strict JSON only inside the structured draftJson field.",
      ].join("\n\n"),
      output: { schema: authoringDraftOutputSchema },
    });
    if (!response.output) throw new Error("Genkit returned no structured Aurion authoring draft");
    if (response.output.kind !== input.kind || response.output.requiresHumanReview !== true) throw new Error("Genkit authoring draft authority mismatch");
    return response.output;
  },
);
