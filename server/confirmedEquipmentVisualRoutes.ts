import type { Express } from "express";
import { sdk } from "./_core/sdk";
import { readConfirmedEquipmentVisuals } from "./confirmedEquipmentVisualReadback";

export const CONFIRMED_EQUIPMENT_VISUAL_V2_PATH = "/api/game/confirmed-equipment-visuals-v2" as const;

export function registerConfirmedEquipmentVisualRoutes(app: Express): void {
  app.get(CONFIRMED_EQUIPMENT_VISUAL_V2_PATH, async (request, response) => {
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try { user = await sdk.authenticateRequest(request); }
    catch { response.status(401).json({ error: "EQUIPMENT_VISUAL_AUTHENTICATION_REQUIRED" }); return; }
    if (!user) { response.status(401).json({ error: "EQUIPMENT_VISUAL_AUTHENTICATION_REQUIRED" }); return; }
    try {
      const readback = await readConfirmedEquipmentVisuals(user.id);
      response.setHeader("Cache-Control", "no-store");
      response.json(readback);
    } catch (error) {
      const code = error instanceof Error && /^EQUIPMENT_VISUAL_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : error instanceof Error && error.message === "DATABASE_UNAVAILABLE"
          ? "EQUIPMENT_VISUAL_DATABASE_UNAVAILABLE"
          : "EQUIPMENT_VISUAL_READBACK_FAILED";
      response.status(code.endsWith("UNAVAILABLE") ? 503 : 409).json({ error: code });
    }
  });
}
