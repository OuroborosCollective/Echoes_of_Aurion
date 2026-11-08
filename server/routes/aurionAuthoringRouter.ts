import { BehaviorDraftInput, BehaviorTestInput, BehaviorJourneyInput, readBehaviorJourneyMemory, draftBehavior, readBehaviorActors, testBehavior } from "../aiFabric/behaviorAuthoring";
import { AiAuthoringToolInput, aiAuthoringToolCatalog, previewAiAuthoringTool } from "../aiFabric/authoringToolchain";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { DesignerInput, designerSurface, WorldDesigner, type DesignerRequest } from "../aiFabric/worldDesigner";
import { readActorWorldSlice } from "../worldSlice";
import { splitWorldChunkPositionMm } from "../../shared/worldChunkProtocol";
import { WORLD_SLICE_ZONE } from "../../shared/worldSliceProtocol";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
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
  retireAdminPlacementDesign,
} from "../aurionAuthoringPersistence";
import { placementKindOfDesign } from "../../shared/adminPlacementPlan";
import { withDomainErrors } from "../domainErrorBoundary";
import { confirmNpcPurpose, draftNpcPurpose, readNpcPurposes } from "../npcShellPurpose";
import { NpcPurposeConfirmInput, NpcPurposeDraftInput } from "../../shared/npcPurposeContract";

async function proposeWorldForSession(actorUserId: number, input: DesignerRequest) {
    const zone = globalZoneRegistry.find(zoneIdSchema.parse(input.zoneId));
    const connected = () => zone?.liveConnectionIdForUser(actorUserId) === input.connectionId;
    if (!connected()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI_LIVE_SESSION_REQUIRED" });
    const surfaceQuery = { worldId: GLOBAL_WORLD_ID, zoneId: input.zoneId, coordinate: { x: input.chunkX, z: input.chunkZ }, radius: 0, lod: "full" };
    const [catalog, world, observed] = await Promise.all([glbImportStore().catalog(), readActiveWorldDesign(), readActorWorldSlice(actorUserId, surfaceQuery)]);
    const surface = designerSurface(observed, input);
    const result = await new WorldDesigner(fabricConfig()).propose(input, {
      catalog, world, surface, zoneId: input.zoneId, tick: zone!.getTickNumber(), sourceRevision: activeProvenance.sourceRevision,
    });
    // The model runs outside the tick. Re-read both independently afterwards.
    const [currentCatalog, currentWorld] = await Promise.all([glbImportStore().catalog(), readActiveWorldDesign()]);
    let geometryCurrent = false;
    try {
      const current = designerSurface(await readActorWorldSlice(actorUserId, surfaceQuery), input);
      geometryCurrent = current.epoch === surface.epoch && current.geometryHash === surface.geometryHash;
    } catch { /* Loss of confirmed scope never creates a substitute world. */ }
    if (!connected() || !geometryCurrent || currentCatalog.revision !== catalog.revision || currentWorld.revision !== world.revision) {
      return { ...result, draftJson: "", status: "UNRESOLVED", failures: [...result.failures, { route: "context", code: "CONTEXT_CHANGED" }] };
    }
    return result;
}

export const aurionAuthoringRouter = router({
  // External models and imported Fadenwerk are untrusted authoring data.
  // No publish/apply path is reachable through this strict preview dispatcher.
  aiToolCatalog: adminProcedure.query(() => aiAuthoringToolCatalog),
  aiToolPreview: adminProcedure.input(AiAuthoringToolInput).mutation(({ ctx, input }) =>
    previewAiAuthoringTool(input, { proposeWorld: candidate => proposeWorldForSession(ctx.user.id, candidate) })),
  behaviorJourneyMemory: adminProcedure.input(BehaviorJourneyInput).mutation(({ctx,input}) => readBehaviorJourneyMemory(ctx.user.id,input)),
  behaviorActors: adminProcedure.query(({ctx}) => readBehaviorActors(ctx.user.id)),
  behaviorDraft: adminProcedure.input(BehaviorDraftInput).mutation(({input}) => draftBehavior(input)),
  behaviorTest: adminProcedure.input(BehaviorTestInput).mutation(({ctx,input}) => testBehavior(ctx.user.id,input)),
  aiStatus: adminProcedure.query(async () => {
    try { return await new WorldDesigner(fabricConfig()).status(); }
    catch { return { status: "NOT_CONFIGURED", premiumEnabled: false, models: [], local: { status: "OFFLINE" } }; }
  }),
  aiPropose: adminProcedure.input(DesignerInput).mutation(({ ctx, input }) => proposeWorldForSession(ctx.user.id, input)),

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
      assetIds: DesignerInput.shape.assetIds.optional(),
      request: z.string().trim().min(12).max(4_000),
    }).strict().refine(input => input.kind === "world" || input.assetIds === undefined, {
      message: "ASSET_SELECTION_WORLD_ONLY", path: ["assetIds"],
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.kind === "world") {
        // Compatibility for the existing web workbench: same fabric, current
        // live actor chunk, Auto (never premium). No legacy paid bypass.
        const zone = globalZoneRegistry.find(WORLD_SLICE_ZONE);
        const connectionId = zone?.liveConnectionIdForUser(ctx.user.id);
        const position = connectionId ? zone?.positionForConnection(connectionId) : undefined;
        if (!connectionId || !position) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI_LIVE_SESSION_REQUIRED" });
        const coordinate = splitWorldChunkPositionMm(position).coordinate;
        const result = await proposeWorldForSession(ctx.user.id, DesignerInput.parse({ request: input.request, assetIds: input.assetIds ?? [], mode: "auto", zoneId: WORLD_SLICE_ZONE, connectionId, chunkX: coordinate.x, chunkZ: coordinate.z }));
        if (result.status !== "AI_DRAFT" || !("title" in result)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "AI_DRAFT_UNRESOLVED" });
        return result;
      }
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
        kind: input.kind,
        request: input.request,
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
  // Removing the last admin-placed object retires its group (designs cannot be empty).
  worldRetireAdminPlacements: adminProcedure
    .input(z.object({
      designKey: z.string().max(40).refine(value => placementKindOfDesign(value) !== null, "ADMIN_PLACEMENT_GROUP_REQUIRED"),
      expectedDesignHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal("RETIRE_ADMIN_PLACEMENTS"),
    }).strict())
    .mutation(({ ctx, input }) => withDomainErrors("AUTHORING_WORLD_RETIRE", ["AUTHORING_"], () => retireAdminPlacementDesign(ctx.user.id, input.designKey, input.expectedDesignHash))),
  // NPC shell purpose: LLMs draft (preview only), the admin confirms with one tap, Aurion persists with a receipt.
  npcPurposeDraft: adminProcedure.input(NpcPurposeDraftInput)
    .mutation(({ input }) => withDomainErrors("NPC_PURPOSE_DRAFT", ["NPC_", "AUTHORING_", "LEDGER_", "PREMIUM_"], () => draftNpcPurpose(input))),
  npcPurposeConfirm: adminProcedure.input(NpcPurposeConfirmInput)
    .mutation(({ ctx, input }) => withDomainErrors("NPC_PURPOSE_CONFIRM", ["NPC_", "AUTHORING_"], () => confirmNpcPurpose(ctx.user.id, input))),
  npcPurposes: adminProcedure.query(() => withDomainErrors("NPC_PURPOSE_READBACK", ["NPC_"], () => readNpcPurposes())),
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
