import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { glbImportStore } from "../glbImportStore";
import { proposeAurionAuthoringDraft } from "../liveDeveloperGenkit";
import {
  DungeonDesignDraftSchema,
  WorldDesignDraftSchema,
} from "../../shared/aurionAuthoringContract";
import {
  applyDungeonDesign,
  applyWorldDesign,
  planDungeonDesign,
  planWorldDesign,
  readActiveDungeonDesigns,
  readActiveWorldDesign,
} from "../aurionAuthoringPersistence";

export const aurionAuthoringRouter = router({
  catalog: adminProcedure.query(async () => {
    const [catalog, world, dungeons] = await Promise.all([
      glbImportStore().catalog(),
      readActiveWorldDesign(),
      readActiveDungeonDesigns(),
    ]);
    return {
      glbCatalogRevision: catalog.revision,
      assets: catalog.entries.map(entry => ({
        assetId: entry.assetId,
        sha256: entry.sha256,
        displayName: entry.displayName,
        purpose: entry.purpose,
        assetType: entry.assetType,
        subcategory: entry.subcategory,
      })),
      world,
      dungeons,
    };
  }),

  propose: adminProcedure
    .input(z.object({
      kind: z.enum(["world", "quest", "dungeon"]),
      request: z.string().trim().min(12).max(4_000),
    }).strict())
    .mutation(async ({ input }) => {
      const catalog = await glbImportStore().catalog();
      const context = {
        glbCatalogRevision: catalog.revision,
        assets: catalog.entries
          .filter(entry => entry.targetKey === null)
          .slice(0, 160)
          .map(entry => ({
            assetId: entry.assetId,
            displayName: entry.displayName,
            purpose: entry.purpose,
            assetType: entry.assetType,
            subcategory: entry.subcategory,
          })),
      };
      return proposeAurionAuthoringDraft({
        ...input,
        actorRole: "admin",
        contextJson: JSON.stringify(context),
      });
    }),

  worldPlan: adminProcedure
    .input(WorldDesignDraftSchema)
    .mutation(({ input }) => planWorldDesign(input)),
  worldApply: adminProcedure
    .input(z.object({
      draft: WorldDesignDraftSchema,
      expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("APPLY_WORLD_DESIGN"),
    }).strict())
    .mutation(({ ctx, input }) => applyWorldDesign(ctx.user.id, input.draft, input.expectedPlanHash)),

  dungeonPlan: adminProcedure
    .input(DungeonDesignDraftSchema)
    .mutation(({ input }) => planDungeonDesign(input)),
  dungeonApply: adminProcedure
    .input(z.object({
      draft: DungeonDesignDraftSchema,
      expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("PUBLISH_DUNGEON"),
    }).strict())
    .mutation(({ ctx, input }) => applyDungeonDesign(ctx.user.id, input.draft, input.expectedPlanHash)),
});
