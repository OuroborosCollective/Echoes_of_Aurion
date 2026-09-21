import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  WorldDesignDraftSchema,
  DungeonDesignDraftSchema,
} from "../../shared/aurionAuthoringContract";
import {
  readActiveWorldDesign,
  planWorldDesign,
  applyWorldDesign,
  readActiveDungeonDesigns,
  planDungeonDesign,
  applyDungeonDesign,
  getGlbCatalogSafe,
} from "../aurionAuthoringPersistence";
import { glbImportStore } from "../glbImportStore";
import { createHash } from "node:crypto";

export const aurionAuthoringRouter = router({
  catalog: protectedProcedure.query(async () => {
    const world = await readActiveWorldDesign();
    const dungeonReadback = await readActiveDungeonDesigns();
    const glbCatalog = await getGlbCatalogSafe();

    return {
      world,
      dungeons: dungeonReadback.dungeons,
      assets: glbCatalog.entries,
      glbCatalogRevision: glbCatalog.revision,
    };
  }),

  propose: adminProcedure
    .input(
      z.object({
        kind: z.enum(["world", "quest", "dungeon"]),
        request: z.string().trim().min(3).max(1800),
      })
    )
    .mutation(async ({ input }) => {
      const glbCatalog = await getGlbCatalogSafe();
      const assets = glbCatalog.entries;
      const title = input.request.slice(0, 48).trim();

      if (input.kind === "world") {
        const matching = assets.filter(a => a.purpose === "world-environment" || a.purpose === "world-nature");
        const chosenAssetId = matching[0]?.assetId ?? assets[0]?.assetId ?? "asset_fallback";
        const draft = {
          designKey: `world_${input.request.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}`,
          worldId: "aurion-main",
          title: `World: ${title}`,
          expectedCatalogRevision: glbCatalog.revision,
          placements: [
            {
              placementKey: "landmark_primary",
              assetId: chosenAssetId,
              chunkX: 0,
              chunkZ: 0,
              xMm: 32_000,
              zMm: 32_000,
              rotationQuarterTurns: 0,
              scalePermille: 1000,
            },
          ],
        };
        return {
          title: draft.title,
          draftJson: JSON.stringify(draft, null, 2),
        };
      }

      if (input.kind === "dungeon") {
        const matching = assets.filter(a => a.assetType === "arena");
        const chosenAssetId = matching[0]?.assetId ?? assets[0]?.assetId ?? "asset_fallback";
        const draft = {
          dungeonId: `dungeon_${input.request.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}`,
          label: `Dungeon: ${title}`,
          zone: "observatory_threshold",
          expectedCatalogRevision: glbCatalog.revision,
          rooms: [
            {
              roomId: "entrance",
              label: "Entrance Hall",
              connectedRoomIds: ["sanctum"],
              assetIds: [chosenAssetId],
              boss: false,
            },
            {
              roomId: "sanctum",
              label: "Inner Sanctum",
              connectedRoomIds: ["entrance"],
              assetIds: [chosenAssetId],
              boss: true,
              encounterKey: "dungeon_boss_encounter",
            },
          ],
          objectives: [
            "Infiltrate the threshold",
            "Defeat the guardian in the Inner Sanctum",
          ],
        };
        return {
          title: draft.label,
          draftJson: JSON.stringify(draft, null, 2),
        };
      }

      // quest proposal
      const questDraft = {
        templateId: `quest_${input.request.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24)}`,
        version: 1,
        title,
        summary: input.request,
        steps: [
          { order: 1, description: "Speak with the Observatory Vanguard", kind: "dialogue" },
          { order: 2, description: "Investigate the disturbance", kind: "exploration" },
        ],
      };
      return {
        title: questDraft.title,
        draftJson: JSON.stringify(questDraft, null, 2),
      };
    }),

  worldPlan: adminProcedure.input(WorldDesignDraftSchema).mutation(async ({ input }) => {
    const plan = await planWorldDesign(input);
    const catalog = await getGlbCatalogSafe();
    const referencedAssetHashes = input.placements
      .map(p => {
        const found = catalog.entries.find(e => e.assetId === p.assetId);
        return found ? found.sha256 : null;
      })
      .filter((h): h is string => Boolean(h));

    return {
      planHash: plan.planHash,
      placements: plan.draft.placements,
      referencedAssetHashes,
      status: plan.status,
    };
  }),

  worldApply: adminProcedure
    .input(
      z.object({
        draft: WorldDesignDraftSchema,
        expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
        confirmation: z.literal("APPLY_WORLD_DESIGN"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const applied = await applyWorldDesign(ctx.user.id, input.draft, input.expectedPlanHash);
      const readback = await readActiveWorldDesign();
      return {
        receipt: {
          receiptId: applied.receipt.id,
          receiptHash: applied.receipt.receiptHash,
        },
        readback,
      };
    }),

  dungeonPlan: adminProcedure.input(DungeonDesignDraftSchema).mutation(async ({ input }) => {
    const plan = await planDungeonDesign(input);
    const bosses = input.rooms.filter(r => r.boss);
    const graphHash = createHash("sha256")
      .update(JSON.stringify(input.rooms.map(r => ({ id: r.roomId, to: r.connectedRoomIds }))))
      .digest("hex");

    return {
      planHash: plan.planHash,
      rooms: input.rooms,
      bosses,
      graphHash,
      status: plan.status,
    };
  }),

  dungeonApply: adminProcedure
    .input(
      z.object({
        draft: DungeonDesignDraftSchema,
        expectedPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
        confirmation: z.literal("PUBLISH_DUNGEON"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const applied = await applyDungeonDesign(ctx.user.id, input.draft, input.expectedPlanHash);
      return {
        receipt: {
          receiptId: applied.receipt.id,
          receiptHash: applied.receipt.receiptHash,
        },
        dungeon: {
          id: applied.version.id,
          dungeonId: applied.version.dungeonId,
          version: applied.version.version,
          designHash: applied.version.designHash,
        },
      };
    }),
});
