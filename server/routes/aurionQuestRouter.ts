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
        proposedDataJson: z.string(),
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
    .input(z.object({ proposalId: z.string() }))
    .mutation(async ({ input }) => {
      return adminQuestService.createPublishPlan(input.proposalId);
    }),
  publish: adminProcedure
    .input(
      z.object({
        proposalId: z.string(),
        expectedPlanHash: z.string(),
        confirmation: z.literal("PUBLISH_QUEST_TEMPLATE"),
      })
    )
    .mutation(async ({ input }) => {
      return adminQuestService.publishProposal({
        proposalId: input.proposalId,
        expectedPlanHash: input.expectedPlanHash,
      });
    }),
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
  available: publicProcedure.query(async () => {
    return adminQuestService.getTemplates();
  }),
  myInstances: protectedProcedure.query(async ({ ctx }) => {
    const list = await adminQuestService.listInstances();
    return list.filter(i => i.playerUserId === ctx.user.id);
  }),
  details: protectedProcedure
    .input(z.object({ instanceId: z.string() }))
    .query(async ({ input }) => {
      return adminQuestService.getInstanceDetails(input.instanceId);
    }),
  offer: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return adminQuestService.offerQuestForPlayer(ctx.user.id, input.templateId);
    }),
  accept: protectedProcedure
    .input(z.object({ instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return adminQuestService.acceptQuestForPlayer(ctx.user.id, input.instanceId);
    }),
  choose: protectedProcedure
    .input(z.object({ instanceId: z.string(), edgeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return adminQuestService.chooseBranchForPlayer(ctx.user.id, input.instanceId, input.edgeId);
    }),
  complete: protectedProcedure
    .input(z.object({ instanceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return adminQuestService.completeQuestForPlayer(ctx.user.id, input.instanceId);
    }),
});
