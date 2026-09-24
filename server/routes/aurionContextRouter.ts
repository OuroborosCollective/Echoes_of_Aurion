import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { aurionWorldContextService } from "../worldContext/service";
import {
  canonicalContextSourceSchema,
  worldContextBudgetSchema,
  worldContextPurposeSchema,
} from "../../shared/aurionWorldContextContract";

export const aurionContextRouter = router({
  listCapsules: publicProcedure
    .input(
      z.object({
        worldId: z.string().default("world_aurion_prime"),
        actorId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ input }) => {
      const capsules = await aurionWorldContextService.listCapsules(
        input.worldId,
        input.actorId,
        input.limit
      );
      return capsules;
    }),

  getCapsule: publicProcedure
    .input(z.object({ capsuleId: z.string() }))
    .query(async ({ input }) => {
      const capsule = await aurionWorldContextService.getCapsule(input.capsuleId);
      return capsule;
    }),

  createCapsule: adminProcedure
    .input(
      z.object({
        worldId: z.string().default("world_aurion_prime"),
        worldRevision: z.string().default("rev_aim299_live"),
        logicalTick: z.number().int().nonnegative().default(100),
        actorId: z.string().min(1),
        purpose: worldContextPurposeSchema,
        subjectIds: z.array(z.string()).optional(),
        budget: worldContextBudgetSchema.partial().optional(),
        additionalSources: z.array(canonicalContextSourceSchema).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return aurionWorldContextService.createCapsule(input);
    }),

  replayCapsule: publicProcedure
    .input(
      z.object({
        capsuleId: z.string(),
        sources: z.array(canonicalContextSourceSchema).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const data = await aurionWorldContextService.getCapsule(input.capsuleId);
      if (!data) {
        return {
          status: "UNPROVABLE" as const,
          reason: `Capsule ${input.capsuleId} not found`,
        };
      }
      return aurionWorldContextService.replayCapsule({
        capsule: data.capsule,
        sources: input.sources || [],
      });
    }),

  expandSources: publicProcedure
    .input(
      z.object({
        capsuleId: z.string(),
        requestedSourceIds: z.array(z.string()),
        expectedCapsuleHash: z.string(),
        availableSources: z.array(canonicalContextSourceSchema).optional(),
      })
    )
    .query(async ({ input }) => {
      return aurionWorldContextService.expandSources(input);
    }),

  createEpisode: adminProcedure
    .input(
      z.object({
        episodeId: z.string(),
        kind: z.string(),
        worldId: z.string(),
        actorIds: z.array(z.string()),
        sources: z.array(canonicalContextSourceSchema),
        outcomes: z.array(z.string()),
        relationshipEffects: z
          .array(
            z.object({
              from: z.string(),
              to: z.string(),
              relation: z.string(),
              confirmedDelta: z.number(),
            })
          )
          .optional(),
        tags: z.array(z.string()).optional(),
        canonicalSummary: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return aurionWorldContextService.createEpisode(input);
    }),

  getEpisode: publicProcedure
    .input(z.object({ episodeId: z.string() }))
    .query(async ({ input }) => {
      return aurionWorldContextService.getEpisode(input.episodeId);
    }),

  getEvaluationSummary: publicProcedure.query(async () => {
    return aurionWorldContextService.getEvaluationSummary();
  }),

  generateDialogue: publicProcedure
    .input(
      z.object({
        worldId: z.string().default("world_aurion_prime"),
        worldRevision: z.string().default("rev_aim299_live"),
        logicalTick: z.number().int().nonnegative().default(100),
        npcId: z.string().default("npc_guard_captain"),
        targetPlayerId: z.string().default("player_1"),
        promptTopic: z.string().optional(),
        additionalSources: z.array(canonicalContextSourceSchema).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return aurionWorldContextService.generateNpcDialogueWithContext(input);
    }),
});
