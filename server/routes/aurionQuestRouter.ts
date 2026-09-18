import { z } from 'zod';
import { adminProcedure, protectedProcedure, publicProcedure, router } from '../_core/trpc';
import { AdminQuestStudioService } from '../questCompiler/adminService';
import { GameDevelopmentStudioQuestSupport } from '../gameDevelopmentStudioQuestSupport';

export const adminQuestService = new AdminQuestStudioService();

export const aurionQuestRouter = router({
  status: publicProcedure.query(async () => {
    return adminQuestService.getStatus();
  }),
  facts: protectedProcedure.query(async () => {
    return adminQuestService.getWorldFacts();
  }),
  templates: publicProcedure.query(async () => {
    return adminQuestService.getTemplates();
  }),
  instances: protectedProcedure.query(async () => {
    return adminQuestService.listInstances();
  }),
  replay: adminProcedure
    .input(z.object({ instanceId: z.string() }))
    .mutation(async ({ input }) => {
      return adminQuestService.replayInstance(input.instanceId);
    }),
  proposeDraft: adminProcedure
    .input(
      z.object({
        templateId: z.string(),
        templateVersion: z.number().int().positive(),
        proposedDataJson: z.string().min(2).max(120_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return adminQuestService.createDraftProposal({
        authorUserId: ctx.user.id,
        templateId: input.templateId,
        templateVersion: input.templateVersion,
        proposedDataJson: input.proposedDataJson,
      });
    }),
  publishPlan: adminProcedure
    .input(z.object({ proposalId: z.string().min(8).max(128) }).strict())
    .mutation(({ input }) => adminQuestService.planPublishProposal(input.proposalId)),
  publish: adminProcedure
    .input(z.object({
      proposalId: z.string().min(8).max(128),
      expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("PUBLISH_QUEST_TEMPLATE"),
    }).strict())
    .mutation(({ ctx, input }) => adminQuestService.publishProposal(ctx.user.id, input.proposalId, input.expectedPlanHash)),
  available: protectedProcedure.query(() => adminQuestService.availableQuests()),
  myInstances: protectedProcedure.query(({ ctx }) => adminQuestService.listInstances({ playerUserId: ctx.user.id })),
  details: protectedProcedure
    .input(z.object({ instanceId: z.string().min(8).max(128) }).strict())
    .query(({ ctx, input }) => adminQuestService.playerQuestDetails(ctx.user.id, input.instanceId)),
  offer: protectedProcedure
    .input(z.object({ templateId: z.string().trim().min(3).max(96) }).strict())
    .mutation(({ ctx, input }) => adminQuestService.offerQuest({ playerUserId: ctx.user.id, templateId: input.templateId })),
  accept: protectedProcedure
    .input(z.object({ instanceId: z.string().min(8).max(128) }).strict())
    .mutation(({ ctx, input }) => adminQuestService.acceptQuest(ctx.user.id, input.instanceId)),
  progress: protectedProcedure
    .input(z.object({
      instanceId: z.string().min(8).max(128),
      objectiveKey: z.string().trim().min(2).max(96),
      amount: z.number().int().min(1).max(10_000),
    }).strict())
    .mutation(({ ctx, input }) => adminQuestService.progressQuest(ctx.user.id, input.instanceId, input.objectiveKey, input.amount)),
  choose: protectedProcedure
    .input(z.object({
      instanceId: z.string().min(8).max(128),
      edgeId: z.string().trim().min(2).max(96),
    }).strict())
    .mutation(({ ctx, input }) => adminQuestService.chooseQuestBranch(ctx.user.id, input.instanceId, input.edgeId)),
  complete: protectedProcedure
    .input(z.object({ instanceId: z.string().min(8).max(128) }).strict())
    .mutation(({ ctx, input }) => adminQuestService.completeQuest(ctx.user.id, input.instanceId)),
  visualSupport: adminProcedure
    .input(
      z.object({
        templateVersionId: z.string(),
        assets: z.array(
          z.object({
            assetId: z.string(),
            purpose: z.enum(['giver_npc', 'victim_npc', 'antagonist_npc', 'prop_item', 'location_landmark']),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      return GameDevelopmentStudioQuestSupport.generateVisualSupportReceipt(
        input.templateVersionId,
        input.assets
      );
    }),
});
