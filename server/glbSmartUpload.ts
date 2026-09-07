import { issueGlbAgentSession, verifyGlbAgentSession } from "./glbAgentSession";
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { classifyGlbBase64, type GlbAssetClassification, type GlbAssetType } from "./glbAssetClassifier";
import { authenticateAdminGlbBearer } from "./adminMcp";
import { glbImportStore } from "./glbImportStore";
import { buildGlbImportPlan } from "./glbImportPlan";
import { checkGlbStorage } from "./glbFileStore";
import { glbImportPurposes, type GlbImportPurpose, type GlbRuntimeCatalog } from "../shared/glbImportContract";
import { z } from "zod";

export const GLB_SMART_UPLOAD_PATH = "/api/admin/glb-smart-upload" as const;

type AuthenticatedUploader = Readonly<{ id: number; role: "user" | "admin" }>;
type UploadAsset = (values: { displayName: string; fileName: string; assetType: GlbAssetType; contentBase64: string; createdByUserId: number; purpose: GlbImportPurpose }) => Promise<unknown>;

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
    uploadAsset: async values => {
      if (values.purpose !== "auto") {
        const receipt = await glbImportStore().ingest(values.createdByUserId, {
          displayName: values.displayName,
          fileName: values.fileName,
          contentBase64: values.contentBase64,
          purpose: values.purpose,
        });
        return { receipt };
      }
      return db.uploadGlbAsset({
        displayName: values.displayName,
        assetType: values.assetType,
        contentBase64: values.contentBase64,
        createdByUserId: values.createdByUserId,
      });
    },
  };
}

function validDisplayName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 3 && value.trim().length <= 120 && !/[<>]/.test(value);
}

function validGlbFileName(value: unknown): value is string {
  return typeof value === "string" && value.length >= 5 && value.length <= 180 && /^[^/\\<>:"|?*]+\.glb$/i.test(value);
}

function parsePurpose(value: unknown): GlbImportPurpose | null {
  if (value === undefined) return "auto";
  return typeof value === "string" && (glbImportPurposes as readonly string[]).includes(value) ? value as GlbImportPurpose : null;
}

export function publicPlayerCharacterEntries(catalog: GlbRuntimeCatalog) {
  return Object.freeze(catalog.entries
    .filter(entry => entry.purpose === "player-public" && entry.assetType === "character" && entry.targetKey === null)
    .slice()
    .sort((left, right) => left.assetId.localeCompare(right.assetId) || left.sha256.localeCompare(right.sha256)));
}

export function parseRequestedPresenceUserIds(value: unknown): readonly number[] {
  if (typeof value !== "string" || value.length < 1 || value.length > 1400) return Object.freeze([]);
  const ids = Array.from(new Set(value.split(",").map(part => Number(part)).filter(id => Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647))).sort((a, b) => a - b);
  if (ids.length > 128) throw new Error("GLB_PRESENCE_QUERY_LIMIT");
  return Object.freeze(ids);
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
    const purpose = parsePurpose(body.purpose);
    if (!displayName || !fileName || !contentBase64 || !purpose) {
      response.status(400).json({ error: "A valid displayName, .glb fileName, import purpose and binary payload are required" });
      return;
    }

    let classification: GlbAssetClassification;
    try {
      classification = classifyGlbBase64(contentBase64, fileName);
      buildGlbImportPlan(contentBase64, purpose, fileName);
    } catch (error) {
      response.status(422).json({ error: error instanceof Error ? error.message : "GLB classification failed" });
      return;
    }

    try {
      const asset = await dependencies.uploadAsset({
        displayName,
        fileName,
        assetType: classification.assetType,
        contentBase64,
        createdByUserId: user.id,
        purpose,
      });
      response.status(201).json({
        accepted: true,
        fileName,
        purpose,
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
  const playerRoute = (operation: (request: Request, user: AuthenticatedUploader) => Promise<unknown>) => async (request: Request, response: Response) => {
    let rawUser: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
    try { rawUser = await sdk.authenticateRequest(request); }
    catch { response.status(401).json({ error: "GLB_PLAYER_AUTHENTICATION_REQUIRED" }); return; }
    if (!rawUser) { response.status(401).json({ error: "GLB_PLAYER_AUTHENTICATION_REQUIRED" }); return; }
    const user: AuthenticatedUploader = { id: rawUser.id, role: rawUser.role };
    try {
      response.setHeader("Cache-Control", "no-store");
      response.json(await operation(request, user));
    } catch (error) {
      const message = error instanceof Error ? error.message : "GLB_PLAYER_OPERATION_FAILED";
      const code = /^GLB_[A-Z_]+$/.test(message) || message === "CHARACTER_BINDING_IMMUTABLE" ? message : "GLB_PLAYER_OPERATION_FAILED";
      response.status(code === "CHARACTER_BINDING_IMMUTABLE" ? 409 : 422).json({ error: code });
    }
  };

  app.post("/api/admin/glb-import/agent-session", adminRoute(async (request, user) => {
    if (request.header("authorization")) throw new Error("GLB_BROWSER_LOGIN_REQUIRED");
    if ((await db.getUserById(user.id))?.role !== "admin") throw new Error("GLB_ADMIN_REQUIRED");
    return issueGlbAgentSession(user.id, process.env.JWT_SECRET ?? "");
  }));
  app.get("/api/admin/glb-import/status", adminRoute(async () => ({ ...(await checkGlbStorage()), catalog: await glbImportStore().catalog() })));
  app.post("/api/admin/glb-import/plan", adminRoute(async request => {
    const input = z.object({ contentBase64: z.string().max(34 * 1024 * 1024), fileName: z.string().min(5).max(180).optional(), purpose: z.enum(glbImportPurposes).optional() }).strict().parse(request.body);
    return buildGlbImportPlan(input.contentBase64, input.purpose ?? "auto", input.fileName ?? "");
  }));
  app.post("/api/admin/glb-import/apply", adminRoute(async (request, user) => {
    const input = z.object({ displayName: z.string().min(3).max(120), fileName: z.string().min(5).max(180).optional(), contentBase64: z.string().max(34 * 1024 * 1024), purpose: z.enum(glbImportPurposes).optional(), expectedPlanSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(request.body);
    return glbImportStore().ingest(user.id, { ...input, purpose: input.purpose ?? "auto" });
  }));
  app.post("/api/admin/glb-import/assign", adminRoute(async (request, user) => glbImportStore().assign(user.id, z.object({ assetId: z.string().min(8).max(64), targetType: z.enum(["character", "enemy", "weapon", "armor", "arena"]), targetKey: z.string().min(2).max(120), expectedActiveAssetId: z.string().min(8).max(64).nullable() }).strict().parse(request.body))));

  app.get("/api/game/public-player-characters", playerRoute(async (_request, user) => {
    const catalog = await glbImportStore().catalog();
    const selected = await db.getPlayerCharacterAppearance(user.id);
    return {
      version: catalog.version,
      revision: catalog.revision,
      entries: publicPlayerCharacterEntries(catalog),
      selected: selected ? { assetId: selected.assetId, displayName: selected.displayName, storageUrl: selected.storageUrl, visibility: selected.visibility } : null,
      immutable: Boolean(selected),
    };
  }));
  app.post("/api/game/public-player-characters/select", playerRoute(async (request, user) => {
    const input = z.object({ assetId: z.string().min(8).max(64) }).strict().parse(request.body);
    const catalog = await glbImportStore().catalog();
    const allowed = publicPlayerCharacterEntries(catalog).find(entry => entry.assetId === input.assetId);
    if (!allowed) throw new Error("GLB_PUBLIC_PLAYER_CHARACTER_REQUIRED");
    const selected = await db.equipPlayerCharacterAppearance({ userId: user.id, assetId: allowed.assetId });
    return { assetId: selected.assetId, displayName: selected.displayName, storageUrl: selected.storageUrl, visibility: selected.visibility, immutable: true };
  }));
  app.get("/api/game/public-player-appearances", playerRoute(async request => {
    const requested = parseRequestedPresenceUserIds(request.query.userIds);
    if (!requested.length) return { appearances: [] };
    const active = new Set((await db.listActiveWorldPresence()).map(presence => presence.userId));
    const appearances = (await Promise.all(requested.filter(userId => active.has(userId)).map(async userId => {
      const appearance = await db.getPlayerCharacterAppearance(userId);
      if (!appearance || appearance.visibility !== "public") return null;
      return { userId, assetId: appearance.assetId, displayName: appearance.displayName, storageUrl: appearance.storageUrl };
    }))).filter((value): value is NonNullable<typeof value> => value !== null);
    return { appearances };
  }));

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
