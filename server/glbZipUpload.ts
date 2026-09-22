import express, { type Express, type Request, type Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { authenticateAdminGlbBearer } from "./adminMcp";
import { verifyGlbAgentSession } from "./glbAgentSession";
import { glbImportStore } from "./glbImportStore";
import { extractGlbZipEntry, MAX_GLB_ZIP_BYTES, prepareGlbZipBatch } from "./glbZipBatch";
import { glbImportPurposes, type GlbImportPurpose, type GlbImportReceipt, type GlbRuntimeCatalog } from "../shared/glbImportContract";

export const GLB_ZIP_UPLOAD_PATH = "/api/admin/glb-zip-upload" as const;

type AuthenticatedUploader = Readonly<{ id: number; role: "user" | "admin" }>;
type ZipIngestInput = Readonly<{
  displayName: string;
  fileName: string;
  contentBase64: string;
  purpose: GlbImportPurpose;
  expectedPlanSha256: string;
}>;
export type GlbZipUploadDependencies = Readonly<{
  authenticate: (request: Request) => Promise<AuthenticatedUploader | null>;
  ingest: (actorUserId: number, input: ZipIngestInput) => Promise<GlbImportReceipt>;
  catalog: () => Promise<GlbRuntimeCatalog>;
}>;

async function authenticateGlbZipUploader(request: Request): Promise<AuthenticatedUploader | null> {
  if (request.header("authorization")) {
    const token = request.header("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (token) {
      try {
        const id = await verifyGlbAgentSession(token, process.env.JWT_SECRET ?? "");
        const user = await db.getUserById(id);
        if (user?.role === "admin") return { id: user.id, role: "admin" };
        throw new Error("GLB_ADMIN_REQUIRED");
      } catch { /* A distinct OAuth credential must pass its own issuer/scope validation below. */ }
    }
    return authenticateAdminGlbBearer(request);
  }
  const user = await sdk.authenticateRequest(request);
  return user ? { id: user.id, role: user.role === "admin" ? "admin" : "user" } : null;
}

function defaultDependencies(): GlbZipUploadDependencies {
  return {
    authenticate: authenticateGlbZipUploader,
    ingest: async (actorUserId, input) => glbImportStore().ingest(actorUserId, input),
    catalog: async () => glbImportStore().catalog(),
  };
}

function purpose(value: unknown): GlbImportPurpose | null {
  if (value === undefined) return "auto";
  return typeof value === "string" && (glbImportPurposes as readonly string[]).includes(value) ? value as GlbImportPurpose : null;
}
function knownCode(error: unknown, fallback: string): string {
  return error instanceof Error && /^GLB_[A-Z0-9_]+$/.test(error.message) ? error.message : fallback;
}

export function createGlbZipUploadHandler(dependencies: GlbZipUploadDependencies = defaultDependencies()) {
  return async (request: Request, response: Response) => {
    let user: AuthenticatedUploader | null = null;
    try { user = await dependencies.authenticate(request); }
    catch { response.status(401).json({ error: "GLB_AUTHENTICATION_REQUIRED" }); return; }
    if (!user) { response.status(401).json({ error: "GLB_AUTHENTICATION_REQUIRED" }); return; }
    if (user.role !== "admin") { response.status(403).json({ error: "GLB_ADMIN_REQUIRED" }); return; }

    const fallbackPurpose = purpose(request.query.purpose);
    if (!fallbackPurpose) { response.status(400).json({ error: "GLB_ZIP_PURPOSE_INVALID" }); return; }
    if (!Buffer.isBuffer(request.body)) { response.status(400).json({ error: "GLB_ZIP_BINARY_BODY_REQUIRED" }); return; }

    let batch: ReturnType<typeof prepareGlbZipBatch>;
    try { batch = prepareGlbZipBatch(request.body, fallbackPurpose); }
    catch (error) { response.status(422).json({ error: knownCode(error, "GLB_ZIP_PREFLIGHT_FAILED") }); return; }

    const accepted: Array<Readonly<{
      archivePath: string;
      fileName: string;
      displayName: string;
      purpose: GlbImportPurpose;
      familyName: string;
      lodLevel: number | null;
      classification: ReturnType<typeof prepareGlbZipBatch>["entries"][number]["plan"]["classification"];
      receipt: GlbImportReceipt;
    }>> = [];

    try {
      for (const prepared of batch.entries) {
        const bytes = extractGlbZipEntry(request.body, prepared.entry);
        const receipt = await dependencies.ingest(user.id, {
          displayName: prepared.displayName,
          fileName: prepared.entry.fileName,
          contentBase64: bytes.toString("base64"),
          purpose: prepared.purpose,
          expectedPlanSha256: prepared.plan.planSha256,
        });
        if (receipt.planSha256 !== prepared.plan.planSha256 || receipt.sha256 !== prepared.plan.sha256 || receipt.bytes !== prepared.plan.bytes) {
          throw new Error("GLB_ZIP_APPLY_READBACK_MISMATCH");
        }
        accepted.push(Object.freeze({
          archivePath: prepared.entry.archivePath,
          fileName: prepared.entry.fileName,
          displayName: prepared.displayName,
          purpose: prepared.purpose,
          familyName: prepared.familyName,
          lodLevel: prepared.lodLevel,
          classification: prepared.plan.classification,
          receipt,
        }));
      }
      const catalog = await dependencies.catalog();
      response.setHeader("Cache-Control", "no-store");
      response.status(201).json({
        accepted: true,
        archiveSha256: batch.archiveSha256,
        fileCount: batch.entries.length,
        familyCount: batch.familyCount,
        compressedBytes: batch.compressedBytes,
        uncompressedBytes: batch.uncompressedBytes,
        fallbackPurpose,
        entries: accepted,
        catalogRevision: catalog.revision,
        catalogCount: catalog.entries.length,
      });
    } catch (error) {
      console.error("[GLB ZIP Upload] apply failed:", error);
      const code = knownCode(error, "GLB_ZIP_APPLY_FAILED");
      response.status(code.includes("BUSY") || code.includes("CHANGED") ? 409 : 502).json({
        accepted: false,
        error: code,
        archiveSha256: batch.archiveSha256,
        preflighted: batch.entries.length,
        applied: accepted.map(entry => ({ archivePath: entry.archivePath, assetId: entry.receipt.assetId, sha256: entry.receipt.sha256 })),
      });
    }
  };
}

export function registerGlbZipUpload(app: Express): void {
  app.use(GLB_ZIP_UPLOAD_PATH, (request, response, next) => {
    const origin = request.header("origin");
    const allowed = (process.env.AURION_ALLOWED_ORIGINS ?? "https://arelogic.space").split(",").map(value => value.trim());
    if (origin && !allowed.includes(origin)) { response.status(403).json({ error: "GLB_ORIGIN_REJECTED" }); return; }
    next();
  });
  app.post(
    GLB_ZIP_UPLOAD_PATH,
    express.raw({
      type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
      limit: MAX_GLB_ZIP_BYTES,
    }),
    createGlbZipUploadHandler(),
  );
}
