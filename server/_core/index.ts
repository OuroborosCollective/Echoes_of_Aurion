import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerMcpGateway } from "../gateway";
import { registerAdminMcp } from "../adminMcp";
import { registerGlbSmartUpload } from "../glbSmartUpload";
import { registerGlbZipUpload } from "../glbZipUpload";
import { registerGlbAssetRoutes } from "../glbAssetRoutes";
import { registerConfirmedEquipmentVisualRoutes } from "../confirmedEquipmentVisualRoutes";
import { registerStarterGlbRuntimeAssets } from "../starterGlbRuntimeAssets";
import { registerZoneGateway } from "../zoneGateway";
import { registerGuildGovernanceRoutes } from "../guildGovernanceRoutes";
import { registerGuildBankRoutes } from "../guildBankRoutes";
import { registerGameDevelopmentStudioRuntime, resolveGameDevelopmentStudioRuntimeReadback } from "../gameDevelopmentStudioRuntime";
import { canConnectToDatabase, isConfiguredDatabaseUrl, recordWorldPresenceLease, releaseWorldPresenceLease } from "../db";
import { consumeZoneTicketWithCombatProfile } from "../zoneCombatPersistence";
import { initialWolframCagRuntimeReadback, resolveWolframCagRuntimeReadback } from "../wolframCagRuntimeReadback";
import { createAutonomousNpcLifeRuntime } from "../autonomousNpcLifeRuntime";
import { activeProvenance } from "../aurionProvenance";
import { globalReadbackService } from "../causality/readbackService";
import { globalSnapshotReconciliationService } from "../causality/snapshotReconciliationService";
import { globalCausalArchivingService } from "../causality/archivingService";
import { globalStateReconciliationService } from "../causality/globalStateReconciliationService";
import { globalTickRecorder } from "../causality/tickRecorder";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.listen(port, () => probe.close(() => resolve(true)));
    probe.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port += 1) if (await isPortAvailable(port)) return port;
  throw new Error(`No available port found starting from ${startPort}`);
}

const CONFIGURED_ORIGINS = (process.env.AURION_ALLOWED_ORIGINS ?? "https://arelogic.space").split(",").map(value => value.trim()).filter(Boolean);
function allowedCorsOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  if (CONFIGURED_ORIGINS.includes(origin)) return origin;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "https:" && (parsed.hostname.endsWith(".itch.io") || parsed.hostname.endsWith(".itch.zone"))) return origin;
  } catch {
    return null;
  }
  return null;
}

async function startServer() {
  if (process.env.DATABASE_URL && !isConfiguredDatabaseUrl(process.env.DATABASE_URL)) {
    console.warn(`[Database] Ignored invalid DATABASE_URL "${process.env.DATABASE_URL}". Protocol must be "mysql:" or "mariadb:".`);
    delete process.env.DATABASE_URL;
  }
  const releaseRevision = process.env.AURION_RELEASE_SHA?.trim().toLowerCase();
  if (releaseRevision && !/^[a-f0-9]{40}$/.test(releaseRevision)) throw new Error("AURION_RELEASE_SHA must be a 40-character Git revision when it is set");

  let wolframCag = initialWolframCagRuntimeReadback();
  if (wolframCag.configured) void resolveWolframCagRuntimeReadback().then(readback => { wolframCag = readback; });
  const gameDevelopmentStudio = await resolveGameDevelopmentStudioRuntimeReadback();
  if (gameDevelopmentStudio.required && !gameDevelopmentStudio.available) throw new Error(gameDevelopmentStudio.error ?? "GAME_DEV_REQUIRED_UNAVAILABLE");

  const databaseConnected = await canConnectToDatabase(1000);
  if (databaseConnected) {
    globalReadbackService.start();
    globalSnapshotReconciliationService.start();
    globalCausalArchivingService.start();
    // Observation-only until a real epoch -> zone tick binding exists.
    globalStateReconciliationService.start();
  }
  const autonomousNpcLife = createAutonomousNpcLifeRuntime({ enabled: databaseConnected });

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  if (process.env.NODE_ENV === "production") app.set("trust proxy", parseInt(process.env.TRUST_PROXY_HOPS || "1", 10));
  const server = createServer(app);

  app.use((req, res, next) => {
    const origin = allowedCorsOrigin(req.headers.origin);
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      if (!origin) return res.status(403).end();
      return res.status(204).end();
    }
    next();
  });

  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 3000, standardHeaders: "draft-7", legacyHeaders: false }));
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const healthPayload = () => {
    const readback = globalReadbackService.getStatus();
    return {
      status: "ok",
      service: "echoes-of-aurion",
      revision: activeProvenance.sourceRevision,
      buildInputDigest: activeProvenance.buildInputDigest,
      artifactDigest: activeProvenance.artifactDigest,
      runtimeImageDigest: activeProvenance.runtimeImageDigest,
      provenanceObservation: activeProvenance.observation,
      runtimeHash: activeProvenance.runtimeHash,
      authority: activeProvenance.authority,
      causality: {
        persistence: globalTickRecorder.getPersistenceStatus(),
        readback: {
          observedTicks: readback.observedTicks,
          verifiedTicks: readback.verifiedTicks,
          divergences: readback.divergences,
          unprovable: readback.unprovable,
        },
        globalReconciliation: globalStateReconciliationService.getStatus(),
      },
      gameDevelopmentStudio,
      wolframCag,
      npcLife: autonomousNpcLife.readback(),
    };
  };
  app.get("/healthz", (_req, res) => res.status(200).json(healthPayload()));
  app.get("/api/health", (_req, res) => res.status(200).json(healthPayload()));

  registerGameDevelopmentStudioRuntime(app, gameDevelopmentStudio);
  registerGlbSmartUpload(app);
  registerGlbZipUpload(app);
  registerGlbAssetRoutes(app);
  registerConfirmedEquipmentVisualRoutes(app);
  registerStarterGlbRuntimeAssets(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerMcpGateway(app);
  registerAdminMcp(app);
  registerGuildGovernanceRoutes(app);
  registerGuildBankRoutes(app);
  registerZoneGateway(server, undefined, consumeZoneTicketWithCombatProfile, { upsert: recordWorldPresenceLease, release: releaseWorldPresenceLease }, autonomousNpcLife.enabled ? autonomousNpcLife : undefined);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server); else serveStatic(app);

  const rawPort = process.env.PORT;
  const preferredPort = rawPort && rawPort !== "8080" ? parseInt(rawPort, 10) : 3000;
  const strictPort = process.env.STRICT_PORT === "true" || rawPort === "8080";
  const port = strictPort ? preferredPort : await findAvailablePort(preferredPort);
  const host = process.env.HOST || "0.0.0.0";
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, host, () => console.log(`Server running on http://${host}:${port}/`));
}

startServer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
