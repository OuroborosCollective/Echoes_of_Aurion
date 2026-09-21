import type { Express } from "express";
import * as db from "./db";

export const STARTER_GLB_RUNTIME_PATH = "/api/game/starter-glb-assets" as const;

export const STARTER_GLB_TARGET_KEYS = Object.freeze({
  player: "starter_player",
  spider: "starter_spider",
  beastLods: Object.freeze(["starter_beast_lod0", "starter_beast_lod1", "starter_beast_lod2", "starter_beast_lod3"] as const),
});

type StarterAssignment = Readonly<{ assetId: string; storageUrl: string }> | null;
type AssignmentReader = (targetType: "character" | "enemy", targetKey: string) => Promise<StarterAssignment>;

async function defaultAssignmentReader(targetType: "character" | "enemy", targetKey: string): Promise<StarterAssignment> {
  const assignment = await db.getActiveGlbAssignment(targetType, targetKey);
  return assignment ? { assetId: assignment.assetId, storageUrl: assignment.storageUrl } : null;
}

function runtimeSource(assignment: StarterAssignment) {
  if (!assignment) return null;
  return Object.freeze({ assetId: assignment.assetId, storageUrl: assignment.storageUrl });
}

export async function resolveStarterGlbRuntimeAssets(
  readAssignment: AssignmentReader = defaultAssignmentReader,
) {
  const [player, spider, lod0, lod1, lod2, lod3] = await Promise.all([
    readAssignment("character", STARTER_GLB_TARGET_KEYS.player),
    readAssignment("enemy", STARTER_GLB_TARGET_KEYS.spider),
    readAssignment("enemy", STARTER_GLB_TARGET_KEYS.beastLods[0]),
    readAssignment("enemy", STARTER_GLB_TARGET_KEYS.beastLods[1]),
    readAssignment("enemy", STARTER_GLB_TARGET_KEYS.beastLods[2]),
    readAssignment("enemy", STARTER_GLB_TARGET_KEYS.beastLods[3]),
  ]);

  return Object.freeze({
    schemaVersion: "aurion.starter-glb-runtime.v1" as const,
    player: runtimeSource(player),
    spider: runtimeSource(spider),
    beastLods: Object.freeze([
      runtimeSource(lod0),
      runtimeSource(lod1),
      runtimeSource(lod2),
      runtimeSource(lod3),
    ]),
  });
}

export function registerStarterGlbRuntimeAssets(app: Express): void {
  app.get(STARTER_GLB_RUNTIME_PATH, async (_request, response) => {
    try {
      response.status(200).json(await resolveStarterGlbRuntimeAssets());
    } catch (error) {
      console.error("[Starter GLB Runtime] assignment readback failed:", error);
      response.status(503).json({ error: "Starter asset assignments unavailable" });
    }
  });
}
