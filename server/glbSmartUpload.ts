import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { classifyGlbBase64, type GlbAssetClassification, type GlbAssetType } from "./glbAssetClassifier";

export const GLB_SMART_UPLOAD_PATH = "/api/admin/glb-smart-upload" as const;

type AuthenticatedUploader = Readonly<{ id: number; role: "user" | "admin" }>;
type UploadAsset = (values: { displayName: string; assetType: GlbAssetType; contentBase64: string; createdByUserId: number }) => Promise<unknown>;

type GlbSmartUploadDependencies = Readonly<{
  authenticate: (request: Request) => Promise<AuthenticatedUploader | null>;
  uploadAsset: UploadAsset;
}>;

function defaultDependencies(): GlbSmartUploadDependencies {
  return {
    authenticate: async request => {
      const user = await sdk.authenticateRequest(request);
      return user ? { id: user.id, role: user.role } : null;
    },
    uploadAsset: values => db.uploadGlbAsset(values),
  };
}

function validDisplayName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 120 && !/[<>]/.test(value);
}

function validGlbFileName(value: unknown): value is string {
  return typeof value === "string" && value.length >= 5 && value.length <= 180 && /^[^/\\<>:"|?*]+\.glb$/i.test(value);
}

export function createGlbSmartUploadHandler(dependencies: GlbSmartUploadDependencies = defaultDependencies()) {
  return async (request: Request, response: Response) => {
    let user: AuthenticatedUploader | null = null;
    try {
      user = await dependencies.authenticate(request);
    } catch {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!user) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (user.role !== "admin") {
      response.status(403).json({ error: "Admin permission required" });
      return;
    }

    const body = request.body && typeof request.body === "object" ? request.body as Record<string, unknown> : {};
    const displayName = validDisplayName(body.displayName) ? body.displayName.trim() : null;
    const fileName = validGlbFileName(body.fileName) ? body.fileName : null;
    const contentBase64 = typeof body.contentBase64 === "string" ? body.contentBase64 : null;
    if (!displayName || !fileName || !contentBase64) {
      response.status(400).json({ error: "A valid displayName, .glb fileName and binary payload are required" });
      return;
    }

    let classification: GlbAssetClassification;
    try {
      classification = classifyGlbBase64(contentBase64);
    } catch (error) {
      response.status(422).json({ error: error instanceof Error ? error.message : "GLB classification failed" });
      return;
    }

    try {
      const asset = await dependencies.uploadAsset({
        displayName,
        assetType: classification.assetType,
        contentBase64,
        createdByUserId: user.id,
      });
      response.status(201).json({
        accepted: true,
        fileName,
        classification,
        asset,
      });
    } catch (error) {
      console.error("[GLB Smart Upload] persistence failed:", error);
      response.status(502).json({ error: "GLB storage or metadata persistence failed" });
    }
  };
}

export function registerGlbSmartUpload(app: Express): void {
  app.post(GLB_SMART_UPLOAD_PATH, createGlbSmartUploadHandler());
}
