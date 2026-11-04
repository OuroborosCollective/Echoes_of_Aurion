import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { DesignerInput, WorldDesigner } from "../aiFabric/worldDesigner";
import { fabricConfig } from "../aiFabric/policy";
import { globalZoneRegistry } from "../zoneRuntime";
import { zoneIdSchema } from "../zoneProtocol";
import { activeProvenance } from "../aurionProvenance";
import { adminProcedure, router } from "../_core/trpc";
import { glbImportStore } from "../glbImportStore";
import { proposeAurionAuthoringDraft } from "../liveDeveloperAuthoring";
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
  recoverWorldAuthoringReceipt,
} from "../aurionAuthoringPersistence";

export const aurionAuthoringRouter = router({
  aiStatus: adminProcedure.query(async () => {
    try { return await new WorldDesigner(fabricConfig()).status(); }
    catch { return { status: "NOT_CONFIGURED", premiumEnabled: false, models: [], local: { status: "OFFLINE" } }; }
  }),
  aiPropose: adminProcedure.input(DesignerInput).mutation(async ({ ctx, input }) => {
    const zone = globalZoneRegistry.find(zoneIdSchema.parse(input.zoneId));
    const connected = () => zone?.liveConnectionIdForUser(ctx.user.id) === input.connectionId;
    if (!connected()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI_LIVE_SESSION_REQUIRED" });
    const [catalog, world] = await Promise.all([glbImportStore().catalog(), readActiveWorldDesign()]);
    const result = await new WorldDesigner(fabricConfig()).propose(input, {
      catalog, world, zoneId: input.zoneId, tick: zone!.getTickNumber(), sourceRevision: activeProvenance.sourceRevision,
    });
    // The model runs outside the tick. Re-read both independently afterwards.
    const [currentCatalog, currentWorld] = await Promise.all([glbImportStore().catalog(), readActiveWorldDesign()]);
    if (!connected() || currentCatalog.revision !== catalog.revision || currentWorld.revision !== world.revision) {
      return { ...result, draftJson: "", status: "UNRESOLVED", failures: [...result.failures, { route: "context", code: "CONTEXT_CHANGED" }] };
    }
    return result;
  }),
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
        targetKey: entry.targetKey,
        subcategory: entry.subcategory,
        normalization: entry.normalization, storageUrl: entry.storageUrl, lods: entry.lods,
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
      if (input.kind === "world") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "USE_AI_PROPOSE_WITH_LIVE_SESSION" });
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
    .input(z.union([
      WorldDesignDraftSchema,
      z.object({ draft: WorldDesignDraftSchema, operationId: z.string().regex(/^[a-f0-9]{32}$/) }).strict(),
    ]))
    .mutation(({ input }) => "draft" in input
      ? planWorldDesign(input.draft, undefined, input.operationId)
      : planWorldDesign(input)),
  worldApply: adminProcedure
    .input(z.object({
      draft: WorldDesignDraftSchema,
      expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
      operationId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
      confirmation: z.literal("APPLY_WORLD_DESIGN"),
    }).strict())
    .mutation(({ ctx, input }) => applyWorldDesign(ctx.user.id, input.draft, input.expectedPlanHash, input.operationId)),
  // Read-only lookup; a missing row never proves that an in-flight apply failed.
  worldReceipt: adminProcedure
    .input(z.object({
      designKey: z.string().regex(/^[a-z][a-z0-9._:-]{2,95}$/),
      version: z.number().int().min(1).max(1_000_000),
      planHash: z.string().regex(/^[a-f0-9]{64}$/),
      operationId: z.string().regex(/^[a-f0-9]{32}$/),
    }).strict())
    .mutation(({ ctx, input }) => recoverWorldAuthoringReceipt(ctx.user.id, input)),

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
