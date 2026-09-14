import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { authenticateAdminGlbBearer } from "./adminMcp";
import { verifyGlbAgentSession } from "./glbAgentSession";
import { glbImportStore } from "./glbImportStore";

const execFileAsync = promisify(execFile);

export const GAME_DEVELOPMENT_STUDIO_VERSION = "1.0.2" as const;
export const GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION = "96a0b4f34b979279ab983e9547af43133e85f310" as const;
export const GAME_DEVELOPMENT_STUDIO_STATUS_PATH = "/api/game/studio/game-dev/status" as const;
export const GAME_DEVELOPMENT_STUDIO_INSPECT_PATH = "/api/game/studio/game-dev/asset/inspect" as const;
export const GAME_DEVELOPMENT_STUDIO_VALIDATE_PATH = "/api/game/studio/game-dev/asset/validate" as const;

type GameDevJson = Record<string, unknown>;

export type GameDevelopmentStudioRuntimeReadback = Readonly<{
  available: boolean;
  required: boolean;
  version: string | null;
  sourceRevision: string;
  capabilitiesSchema: string | null;
  doctorSchema: string | null;
  providerCalls: false;
  boundary: "approved-live-glb-catalog-only";
  error: string | null;
}>;

function gameDevBinary(): string {
  return process.env.AURION_GAME_DEV_BIN?.trim() || "game-dev";
}

function workspaceRoot(): string {
  return process.env.AURION_GAME_DEV_WORKSPACE?.trim() || (process.env.NODE_ENV === "production" ? "/var/lib/aurion/game-dev-workspace" : path.join(tmpdir(), "aurion-game-dev-workspace"));
}

function safeRuntimeEnvironment(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "NODE_ENV"] as const;
  const env: NodeJS.ProcessEnv = {};
  for (const key of allowed) if (process.env[key] !== undefined) env[key] = process.env[key];
  return env;
}

function parseJsonOutput(label: string, output: string): GameDevJson {
  let parsed: unknown;
  try { parsed = JSON.parse(output); }
  catch { throw new Error(`GAME_DEV_${label}_INVALID_JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`GAME_DEV_${label}_INVALID_JSON`);
  return parsed as GameDevJson;
}

function schemaName(value: GameDevJson): string | null {
  const candidate = value.schema ?? value.recordType;
  return typeof candidate === "string" && candidate.length <= 160 ? candidate : null;
}

async function runGameDev(args: readonly string[], timeout = 20_000): Promise<string> {
  const result = await execFileAsync(gameDevBinary(), [...args], {
    env: safeRuntimeEnvironment(),
    timeout,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return String(result.stdout ?? "").trim();
}

export function buildGameDevAssetArgs(operation: "inspect" | "validate", filePath: string, outputDir: string): readonly string[] {
  if (!path.isAbsolute(filePath) || !path.isAbsolute(outputDir)) throw new Error("GAME_DEV_ABSOLUTE_PATH_REQUIRED");
  return Object.freeze(["asset", operation, filePath, "--output-dir", outputDir, "--json"]);
}

export async function resolveGameDevelopmentStudioRuntimeReadback(): Promise<GameDevelopmentStudioRuntimeReadback> {
  const required = process.env.AURION_GAME_DEV_REQUIRED === "true";
  const sourceRevision = process.env.AURION_GAME_DEV_SOURCE_REVISION?.trim().toLowerCase() || GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION;
  if (sourceRevision !== GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION) {
    return Object.freeze({ available: false, required, version: null, sourceRevision, capabilitiesSchema: null, doctorSchema: null, providerCalls: false, boundary: "approved-live-glb-catalog-only", error: "GAME_DEV_SOURCE_REVISION_MISMATCH" });
  }
  try {
    await mkdir(workspaceRoot(), { recursive: true });
    const versionOutput = await runGameDev(["--version"]);
    if (!versionOutput.includes(GAME_DEVELOPMENT_STUDIO_VERSION)) throw new Error("GAME_DEV_VERSION_MISMATCH");
    const capabilities = parseJsonOutput("CAPABILITIES", await runGameDev(["capabilities", "--output-dir", workspaceRoot(), "--json"]));
    const doctor = parseJsonOutput("DOCTOR", await runGameDev(["doctor", "--output-dir", workspaceRoot(), "--json"]));
    return Object.freeze({
      available: true,
      required,
      version: GAME_DEVELOPMENT_STUDIO_VERSION,
      sourceRevision,
      capabilitiesSchema: schemaName(capabilities),
      doctorSchema: schemaName(doctor),
      providerCalls: false,
      boundary: "approved-live-glb-catalog-only",
      error: null,
    });
  } catch (error) {
    return Object.freeze({
      available: false,
      required,
      version: null,
      sourceRevision,
      capabilitiesSchema: null,
      doctorSchema: null,
      providerCalls: false,
      boundary: "approved-live-glb-catalog-only",
      error: error instanceof Error && /^GAME_DEV_[A-Z0-9_]+$/.test(error.message) ? error.message : "GAME_DEV_UNAVAILABLE",
    });
  }
}

export async function authenticateGameDevelopmentStudioBearer(request: Request): Promise<Readonly<{ id: number }> | null> {
  const authorization = request.header("authorization");
  const token = authorization?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  try {
    const id = await verifyGlbAgentSession(token, process.env.JWT_SECRET ?? "");
    const user = await db.getUserById(id);
    if (user?.role === "admin") return Object.freeze({ id: user.id });
    return null;
  } catch {
    try {
      const user = await authenticateAdminGlbBearer(request);
      return Object.freeze({ id: user.id });
    } catch {
      return null;
    }
  }
}

async function requireAdmin(request: Request, response: Response): Promise<Readonly<{ id: number }> | null> {
  if (request.header("authorization")) {
    const bearer = await authenticateGameDevelopmentStudioBearer(request);
    if (!bearer) { response.status(401).json({ error: "GAME_DEV_AUTHENTICATION_REQUIRED" }); return null; }
    return bearer;
  }

  let user: Awaited<ReturnType<typeof sdk.authenticateRequest>>;
  try { user = await sdk.authenticateRequest(request); }
  catch { response.status(401).json({ error: "GAME_DEV_AUTHENTICATION_REQUIRED" }); return null; }
  if (!user) { response.status(401).json({ error: "GAME_DEV_AUTHENTICATION_REQUIRED" }); return null; }
  if (user.role !== "admin") { response.status(403).json({ error: "GAME_DEV_ADMIN_REQUIRED" }); return null; }
  return Object.freeze({ id: user.id });
}

async function inspectApprovedAsset(operation: "inspect" | "validate", assetId: string): Promise<Readonly<Record<string, unknown>>> {
  const catalog = await glbImportStore().catalog();
  const asset = catalog.entries.find(entry => entry.assetId === assetId);
  if (!asset) throw new Error("GAME_DEV_APPROVED_ASSET_REQUIRED");
  const bytes = await glbImportStore().approvedBytes(asset.sha256);
  if (!bytes) throw new Error("GAME_DEV_APPROVED_ASSET_REQUIRED");

  const root = workspaceRoot();
  await mkdir(root, { recursive: true });
  const runDir = await mkdtemp(path.join(root, `${operation}-`));
  const filePath = path.join(runDir, `${asset.sha256}.glb`);
  const outputDir = path.join(runDir, "output");
  try {
    await mkdir(outputDir, { recursive: true });
    await writeFile(filePath, bytes, { flag: "wx" });
    const result = parseJsonOutput(operation.toUpperCase(), await runGameDev(buildGameDevAssetArgs(operation, filePath, outputDir), 30_000));
    const resultSha256 = createHash("sha256").update(JSON.stringify(result)).digest("hex");
    return Object.freeze({
      operation,
      source: "approved-live-glb-catalog",
      asset: Object.freeze({ assetId: asset.assetId, sha256: asset.sha256, displayName: asset.displayName, purpose: asset.purpose, assetType: asset.assetType }),
      gameDevelopmentStudio: Object.freeze({ version: GAME_DEVELOPMENT_STUDIO_VERSION, sourceRevision: GAME_DEVELOPMENT_STUDIO_SOURCE_REVISION }),
      result,
      resultSha256,
      providerCalls: false,
    });
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
}

export function registerGameDevelopmentStudioRuntime(app: Express, readback: GameDevelopmentStudioRuntimeReadback): void {
  const admin = (operation: (request: Request) => Promise<unknown>) => async (request: Request, response: Response) => {
    if (!await requireAdmin(request, response)) return;
    if (!readback.available) { response.status(503).json({ error: readback.error ?? "GAME_DEV_UNAVAILABLE", gameDevelopmentStudio: readback }); return; }
    try {
      response.setHeader("Cache-Control", "no-store");
      response.json(await operation(request));
    } catch (error) {
      const code = error instanceof Error && /^GAME_DEV_[A-Z0-9_]+$/.test(error.message) ? error.message : "GAME_DEV_OPERATION_FAILED";
      response.status(code === "GAME_DEV_APPROVED_ASSET_REQUIRED" ? 404 : 422).json({ error: code });
    }
  };

  app.get(GAME_DEVELOPMENT_STUDIO_STATUS_PATH, admin(async () => readback));
  const schema = z.object({ assetId: z.string().min(8).max(64) }).strict();
  app.post(GAME_DEVELOPMENT_STUDIO_INSPECT_PATH, admin(async request => inspectApprovedAsset("inspect", schema.parse(request.body).assetId)));
  app.post(GAME_DEVELOPMENT_STUDIO_VALIDATE_PATH, admin(async request => inspectApprovedAsset("validate", schema.parse(request.body).assetId)));
}
