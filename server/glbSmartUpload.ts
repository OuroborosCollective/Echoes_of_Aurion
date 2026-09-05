import { issueGlbAgentSession, verifyGlbAgentSession } from "./glbAgentSession";
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { classifyGlbBase64, type GlbAssetClassification, type GlbAssetType } from "./glbAssetClassifier";
import { authenticateAdminGlbBearer } from "./adminMcp";
import { glbImportStore } from "./glbImportStore";
import { buildGlbImportPlan } from "./glbImportPlan";
import { checkGlbStorage } from "./glbFileStore";
import { z } from "zod";

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
      if (request.header("authorization")) {
        const token = request.header("authorization")?.match(/^Bearer (\S+)$/)?.[1];
        if (token) {
          try {
            const id = await verifyGlbAgentSession(token, process.env.JWT_SECRET ?? "");
            const user = await db.getUserById(id);
            if (user?.role === "admin") return { id: user.id, role: "admin" };
            throw new Error("GLB_ADMIN_REQUIRED");
          } catch { /* A distinct OAuth credential must pass its own issuer and scope checks. */ }
        }
        return authenticateAdminGlbBearer(request);
      }
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
        ...((asset as { receipt?: unknown })?.receipt ? { receipt: (asset as { receipt: unknown }).receipt } : {}),
      });
    } catch (error) {
      console.error("[GLB Smart Upload] persistence failed:", error);
      response.status(502).json({ error: "GLB storage or metadata persistence failed" });
    }
  };
}

export function registerGlbSmartUpload(app: Express): void {
  app.use([GLB_SMART_UPLOAD_PATH, "/api/admin/glb-import"], (request, response, next) => {
    const origin = request.header("origin");
    const allowed = (process.env.AURION_ALLOWED_ORIGINS ?? "https://arelogic.space").split(",").map(value => value.trim());
    if (origin && !allowed.includes(origin)) { response.status(403).json({ error: "GLB_ORIGIN_REJECTED" }); return; }
    next();
  });
  app.post(GLB_SMART_UPLOAD_PATH, createGlbSmartUploadHandler());
  const adminRoute = (operation: (request: Request, user: AuthenticatedUploader) => Promise<unknown>) => async (request: Request, response: Response) => {
    let user: AuthenticatedUploader | null;
    try { user = await defaultDependencies().authenticate(request); }
    catch { response.status(401).json({ error: "GLB_AUTHENTICATION_REQUIRED" }); return; }
    if (!user || user.role !== "admin") { response.status(user ? 403 : 401).json({ error: "GLB_ADMIN_REQUIRED" }); return; }
    try { response.setHeader("Cache-Control", "no-store"); response.json(await operation(request, user)); }
    catch (error) { const code = error instanceof Error && /^GLB_[A-Z_]+$/.test(error.message) ? error.message : "GLB_OPERATION_FAILED"; response.status(code.includes("CHANGED") || code.includes("BUSY") ? 409 : 422).json({ error: code }); }
  };
  app.post("/api/admin/glb-import/agent-session", adminRoute(async (request, user) => {
    if (request.header("authorization")) throw new Error("GLB_BROWSER_LOGIN_REQUIRED");
    // A session cannot issue or extend another session; only the normal admin login may mint it.
    if ((await db.getUserById(user.id))?.role !== "admin") throw new Error("GLB_ADMIN_REQUIRED");
    return issueGlbAgentSession(user.id, process.env.JWT_SECRET ?? "");
  }));
  app.get("/api/admin/glb-import/status", adminRoute(async () => ({ ...(await checkGlbStorage()), catalog: await glbImportStore().catalog() })));
  app.post("/api/admin/glb-import/plan", adminRoute(async request => buildGlbImportPlan(z.object({ contentBase64: z.string().max(34 * 1024 * 1024) }).parse(request.body).contentBase64)));
  app.post("/api/admin/glb-import/apply", adminRoute(async (request, user) => glbImportStore().ingest(user.id, z.object({ displayName: z.string().min(3).max(120), contentBase64: z.string().max(34 * 1024 * 1024), expectedPlanSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(request.body))));
  app.post("/api/admin/glb-import/assign", adminRoute(async (request, user) => glbImportStore().assign(user.id, z.object({ assetId: z.string().min(8).max(64), targetType: z.enum(["character", "enemy", "weapon", "armor", "arena"]), targetKey: z.string().min(2).max(120), expectedActiveAssetId: z.string().min(8).max(64).nullable() }).strict().parse(request.body))));
  app.get("/api/game/glb-catalog", async (_request, response) => {
    try { response.setHeader("Cache-Control", "no-store"); response.json(await glbImportStore().catalog()); }
    catch { response.status(503).json({ error: "GLB_CATALOG_UNAVAILABLE" }); }
  });
  app.get("/api/assets/glb/:file", async (request, response) => {
    const match = /^([a-f0-9]{64})\.glb$/.exec(String(request.params.file));
    if (!match) { response.status(404).end(); return; }
    try {
      const bytes = await glbImportStore().approvedBytes(match[1]!);
      if (!bytes) { response.status(404).end(); return; }
      response.set({ "Content-Type": "model/gltf-binary", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-cache", ETag: `"${match[1]}"` });
      response.send(bytes);
    } catch { response.status(503).json({ error: "GLB_BYTES_UNAVAILABLE" }); }
  });
}
