import { googleAI } from "@genkit-ai/google-genai";
import { genkit, z } from "genkit";
import { buildLiveDeveloperGuardrails, validateLiveDeveloperProposal } from "./liveDeveloperProtocol";

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
