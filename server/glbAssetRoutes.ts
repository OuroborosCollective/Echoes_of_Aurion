import type { Express, Request, Response } from "express";
import { glbImportStore } from "./glbImportStore";

export const GLB_ASSET_PATH = "/api/assets/glb/:sha256.glb" as const;

type ApprovedGlbReader = (sha256: string) => Promise<Buffer | null>;

export function createApprovedGlbAssetHandler(
  readApproved: ApprovedGlbReader = sha256 => glbImportStore().approvedBytes(sha256),
) {
  return async (request: Request, response: Response) => {
    const rawSha = typeof request.params.sha256 === "string" ? request.params.sha256 : "";
    const sha256 = rawSha.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      response.status(404).end();
      return;
    }

    try {
      const bytes = await readApproved(sha256);
      if (!bytes) {
        response.status(404).end();
        return;
      }
      response.setHeader("Content-Type", "model/gltf-binary");
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.setHeader("Content-Length", String(bytes.length));
      response.status(200).send(bytes);
    } catch {
      response.status(503).json({ error: "GLB_ASSET_UNAVAILABLE" });
    }
  };
}

export function registerGlbAssetRoutes(app: Express): void {
  app.get(GLB_ASSET_PATH, createApprovedGlbAssetHandler());
}
