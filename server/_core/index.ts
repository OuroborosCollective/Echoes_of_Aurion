import "dotenv/config";
import { authBodyLimit } from "./authBodyLimit";
import { defensiveGatewayObserver } from "../defensiveGatewayObserver";
import { closeHttpServerForShutdown } from "./httpServerClose";
import { registerProductionProbeRoutes } from "../aurionProductionProbeHttp";
import { createCorsMiddleware } from "./corsMiddleware";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { writeSync } from "node:fs";
import { createServer } from "http";
import { configureHttpTimeouts } from "./httpTimeouts";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerNativeAuthHttpRoutes } from "../nativeAuthHttp";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { discoveryResponseMeta } from "./discoveryResponseMeta";
import { serveStatic, setupVite } from "./vite";
import { registerMcpGateway } from "../gateway";
import { registerAdminMcp } from "../adminMcp";
import { registerGlbSmartUpload } from "../glbSmartUpload";
import { registerGlbZipUpload } from "../glbZipUpload";
import { registerGlbAssetRoutes } from "../glbAssetRoutes";
import { registerConfirmedEquipmentVisualRoutes } from "../confirmedEquipmentVisualRoutes";
import { registerStarterGlbRuntimeAssets } from "../starterGlbRuntimeAssets";
import { registerZoneGateway } from "../zoneGateway";
import { startAurionGodotFeed } from "../godotBridge/aurionAdapter";
import { registerGuildGovernanceRoutes } from "../guildGovernanceRoutes";
import { registerGuildBankRoutes } from "../guildBankRoutes";
import { registerGameDevelopmentStudioRuntime, resolveGameDevelopmentStudioRuntimeReadback } from "../gameDevelopmentStudioRuntime";
import { canConnectToDatabase, isConfiguredDatabaseUrl, recordWorldPresenceLease, releaseOrphanedWorldPresenceLeases, releaseWorldPresenceLease } from "../db";
import { globalZoneJoinHealth } from "../zoneJoinHealth";
import { consumeZoneTicketWithCombatProfile } from "../zoneCombatPersistence";
import { initialWolframCagRuntimeReadback, resolveWolframCagRuntimeReadback } from "../wolframCagRuntimeReadback";
import { createAutonomousNpcLifeRuntime } from "../autonomousNpcLifeRuntime";
import { activeProvenance } from "../aurionProvenance";
import { AURION_BINARY_AUTHORITY } from "../../shared/aurionZoneRulesetContract.mjs";
import { globalReadbackService } from "../causality/readbackService";
import { globalSnapshotReconciliationService } from "../causality/snapshotReconciliationService";
import { globalCausalArchivingService } from "../causality/archivingService";
import { globalStateReconciliationService } from "../causality/globalStateReconciliationService";
import { globalAssuranceService } from "../causality/assuranceService";
import { globalTickRecorder } from "../causality/tickRecorder";
import { createOtelHttpMiddleware } from "../observability/otelBoundary";
import { drainAurionRuntimeForShutdown, withShutdownDeadline } from "./gracefulCausalShutdown";
import { assertProductionDatabaseConfigured, assertProductionDatabaseConnected } from "./productionDatabaseGate";
import { ensureShippedPlacementOverridesLoaded } from "../worldAssetRegionReadback";

function isPortAvailable(port:number):Promise<boolean>{return new Promise(resolve=>{const server=net.createServer();server.listen(port,()=>server.close(()=>resolve(true)));server.on("error",()=>resolve(false));});}
async function findAvailablePort(startPort:number=3000):Promise<number>{for(let port=startPort;port<startPort+20;port++)if(await isPortAvailable(port))return port;throw new Error(`No available port found starting from ${startPort}`);}

async function startServer(){
  assertProductionDatabaseConfigured(process.env.NODE_ENV, process.env.DATABASE_URL);
  if (process.env.DATABASE_URL && !isConfiguredDatabaseUrl(process.env.DATABASE_URL)) {
    console.warn("[Database] Ignored invalid DATABASE_URL (allowed protocols: mysql:, mariadb:). Connection values are withheld.");
    delete process.env.DATABASE_URL;
  }
  const releaseRevision=process.env.AURION_RELEASE_SHA?.trim().toLowerCase();if(releaseRevision&&!/^[a-f0-9]{40}$/.test(releaseRevision))throw new Error("AURION_RELEASE_SHA must be a 40-character Git revision when it is set");
  const releaseArchiveDigest=process.env.AURION_RELEASE_ARCHIVE_DIGEST?.trim().toLowerCase();if(releaseArchiveDigest&&!/^sha256:[a-f0-9]{64}$/.test(releaseArchiveDigest))throw new Error("AURION_RELEASE_ARCHIVE_DIGEST must be a sha256 digest when it is set");
  let wolframCag=initialWolframCagRuntimeReadback();if(wolframCag.configured)void resolveWolframCagRuntimeReadback().then(readback=>{wolframCag=readback;});
  const gameDevelopmentStudio=await resolveGameDevelopmentStudioRuntimeReadback();
  if(gameDevelopmentStudio.required&&!gameDevelopmentStudio.available)throw new Error(gameDevelopmentStudio.error??"GAME_DEV_REQUIRED_UNAVAILABLE");
  const databaseConnected = await canConnectToDatabase(1000);
  assertProductionDatabaseConnected(process.env.NODE_ENV, databaseConnected);
  if (databaseConnected) {
    // Admin-removed/replaced procedural placements must not block movement after a restart.
    void ensureShippedPlacementOverridesLoaded().catch(error => console.error("[WorldVisual] shipped placement overrides not loaded at boot; retried on the next region read", error instanceof Error ? error.message : error));
    globalReadbackService.start();
    globalSnapshotReconciliationService.start();
    globalCausalArchivingService.start();
    globalStateReconciliationService.start();
    globalAssuranceService.start();
  }
  const autonomousNpcLife = createAutonomousNpcLifeRuntime({ enabled: databaseConnected });
  const app=express();
  // OTLP/HTTP is a fail-open observer. It never participates in request authorization,
  // gameplay mutation, persistence decisions or response generation.
  app.use(createOtelHttpMiddleware());
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  if(process.env.NODE_ENV==="production")app.set("trust proxy",parseInt(process.env.TRUST_PROXY_HOPS||"1",10));const server=configureHttpTimeouts(createServer(app));
  defensiveGatewayObserver.start();
  app.use(defensiveGatewayObserver.httpMiddleware);
  app.use(createCorsMiddleware(defensiveGatewayObserver, process.env.AURION_ALLOWED_ORIGINS));

  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3000,
    standardHeaders: "draft-7",
    legacyHeaders: false
  }));

  app.use(authBodyLimit());
  app.use(express.json({limit:"50mb"}));app.use(express.urlencoded({limit:"50mb",extended:true}));
  const healthPayload = () => ({
    status: "ok",
    service: "echoes-of-aurion",
    revision: releaseRevision || activeProvenance.sourceRevision || activeProvenance.commit,
    buildInputDigest: activeProvenance.buildInputDigest || `sha256:${process.env.AURION_BUILD_INPUT_DIGEST || "unknown"}`,
    artifactDigest: activeProvenance.artifactDigest || `sha256:${process.env.AURION_ARTIFACT_DIGEST || "unknown"}`,
    runtimeImageDigest: activeProvenance.runtimeImageDigest || `sha256:${process.env.AURION_RUNTIME_IMAGE_DIGEST || "unknown"}`,
    releaseArchiveDigest: releaseArchiveDigest || "UNVERIFIED",
    authority: AURION_BINARY_AUTHORITY,
    // Retaining operational diagnostics
    gameDevelopmentStudio,
    wolframCag,
    npcLife: autonomousNpcLife.readback(),
    zoneJoin: globalZoneJoinHealth.readback(),
    alwaysOnWorld: zoneGateway.readbackAlwaysOn(),
    causalAssurance: globalAssuranceService.latest()
  });
  registerProductionProbeRoutes(app, healthPayload);
  app.get("/healthz", (_req, res) => res.status(200).json(healthPayload()));
  app.get("/api/health", (_req, res) => res.status(200).json(healthPayload()));
  registerGameDevelopmentStudioRuntime(app,gameDevelopmentStudio);registerGlbSmartUpload(app);registerGlbZipUpload(app);registerGlbAssetRoutes(app);registerConfirmedEquipmentVisualRoutes(app);registerStarterGlbRuntimeAssets(app);registerStorageProxy(app);registerOAuthRoutes(app);registerNativeAuthHttpRoutes(app);registerMcpGateway(app);registerAdminMcp(app);registerGuildGovernanceRoutes(app);registerGuildBankRoutes(app);
  const zoneGateway=registerZoneGateway(server,undefined,consumeZoneTicketWithCombatProfile,{upsert:recordWorldPresenceLease,release:releaseWorldPresenceLease,releaseOrphaned:releaseOrphanedWorldPresenceLeases},autonomousNpcLife.enabled?autonomousNpcLife:undefined);
  const godotFeed = await startAurionGodotFeed().catch(error => {
    console.error("[Aurion Godot] Read-only observer unavailable", error);
    return undefined;
  });
  app.use("/api/trpc",createExpressMiddleware({router:appRouter,createContext,responseMeta:discoveryResponseMeta}));if(process.env.NODE_ENV==="development")await setupVite(app,server);else serveStatic(app);
  const rawPort=process.env.PORT,preferredPort=(rawPort&&rawPort!=="8080")?parseInt(rawPort,10):3000,strictPort=process.env.STRICT_PORT==="true"||rawPort==="8080",port=strictPort?preferredPort:await findAvailablePort(preferredPort),host=process.env.HOST||"0.0.0.0";if(port!==preferredPort)console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  let shuttingDown=false;
  const shutdown=async(signal:"SIGTERM"|"SIGINT")=>{
    if(shuttingDown)return;
    shuttingDown=true;
    console.info(`[Aurion] graceful shutdown requested: ${signal}`);
    try{
      // The deadline covers the whole sequence: a stalled feed close must not outlive it either.
      await withShutdownDeadline((async()=>{
      defensiveGatewayObserver.stop();
      await godotFeed?.close();
      await drainAurionRuntimeForShutdown({
        closeZoneGateway:()=>zoneGateway.close(),
        stopObservers:[
          ()=>globalAssuranceService.stop(),
          ()=>globalReadbackService.stop(),
          ()=>globalSnapshotReconciliationService.stop(),
          ()=>globalCausalArchivingService.stop(),
          ()=>globalStateReconciliationService.stop(),
        ],
        flushCausalPersistence:async()=>{
          // Operational-only readback: never feeds time or queue depth into a simulation tick.
          const logPending=()=>console.info("[Aurion] shutdown persistence status",JSON.stringify(globalTickRecorder.getPersistenceStatus()));
          logPending();
          // Keep a referenced operational handle alive until the causal flush settles.
          // An unresolved Promise alone cannot keep Node alive during shutdown.
          const progress=setInterval(logPending,1000);
          try{await globalTickRecorder.flushPersistence();logPending();}
          finally{clearInterval(progress);}
        },
        closeHttpServer:()=>closeHttpServerForShutdown(server),
        persistenceStatus:()=>globalTickRecorder.getPersistenceStatus(),
      });
      })());
      // Emit the actual post-drain receipt synchronously before process.exit(0).
      // Buffered console output may be lost during an immediate process exit.
      writeSync(1, "[Aurion] graceful causal shutdown complete\n");
      process.exit(0);
    }catch(error){
      console.error("[Aurion] graceful causal shutdown failed",error);
      process.exit(1);
    }
  };
  // A second signal during the asynchronous durable drain must not restore Node's
  // default termination handler before persistence and HTTP closure finish.
  // The shutdown guard above makes repeated signals idempotent.
  process.on("SIGTERM",()=>{void shutdown("SIGTERM");});
  process.on("SIGINT",()=>{void shutdown("SIGINT");});
  // Boot lease release precedes admission; settlement never blocks listen.
  // Production can subsequently activate the verified head with zero players.
  // The existing 100 ms authoritative zone timer then produces real receipts.
  await zoneGateway.releaseOrphanedLeasesAtBoot();
  // A shutdown that began while leases were released owns the drain: start nothing
  // (activation would throw on the closing gateway and exit before the drain finishes).
  if (shuttingDown) return;
  if (databaseConnected && process.env.NODE_ENV === "production" && process.env.AURION_ALWAYS_ON_WORLD_ENABLED === "1") {
    void zoneGateway.activatePersistentZonesAtBoot(["observatory_threshold"]);
  } else {
    void zoneGateway.settleZonesAtBoot(["observatory_threshold"]);
  }
  server.listen(port,host,()=>console.log(`Server running on http://${host}:${port}/`));
}
startServer().catch(error=>{console.error(error);process.exit(1);});

