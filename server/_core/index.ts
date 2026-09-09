import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
import { registerConfirmedEquipmentVisualRoutes } from "../confirmedEquipmentVisualRoutes";
import { registerStarterGlbRuntimeAssets } from "../starterGlbRuntimeAssets";
import { registerZoneGateway } from "../zoneGateway";
import { registerGuildGovernanceRoutes } from "../guildGovernanceRoutes";
import { registerGuildBankRoutes } from "../guildBankRoutes";
import { recordWorldPresenceLease, releaseWorldPresenceLease } from "../db";
import { consumeZoneTicketWithCombatProfile } from "../zoneCombatPersistence";
import { initialWolframCagRuntimeReadback, resolveWolframCagRuntimeReadback } from "../wolframCagRuntimeReadback";
import { createAutonomousNpcLifeRuntime } from "../autonomousNpcLifeRuntime";

function isPortAvailable(port:number):Promise<boolean>{return new Promise(resolve=>{const server=net.createServer();server.listen(port,()=>server.close(()=>resolve(true)));server.on("error",()=>resolve(false));});}
async function findAvailablePort(startPort:number=3000):Promise<number>{for(let port=startPort;port<startPort+20;port++)if(await isPortAvailable(port))return port;throw new Error(`No available port found starting from ${startPort}`);}
// Cache allowed origins to avoid repeating string split/map/filter operations on every HTTP request
const CONFIGURED_ORIGINS = (process.env.AURION_ALLOWED_ORIGINS??"https://arelogic.space").split(",").map(value=>value.trim()).filter(Boolean);
function allowedCorsOrigin(origin:string|undefined):string|null{if(!origin)return null;if(CONFIGURED_ORIGINS.includes(origin))return origin;try{const parsed=new URL(origin);if(parsed.protocol==="https:"&&(parsed.hostname.endsWith(".itch.io")||parsed.hostname.endsWith(".itch.zone")))return origin;}catch{return null;}return null;}

async function startServer(){
  const releaseRevision=process.env.AURION_RELEASE_SHA?.trim().toLowerCase();if(releaseRevision&&!/^[a-f0-9]{40}$/.test(releaseRevision))throw new Error("AURION_RELEASE_SHA must be a 40-character Git revision when it is set");
  let wolframCag=initialWolframCagRuntimeReadback();if(wolframCag.configured)void resolveWolframCagRuntimeReadback().then(readback=>{wolframCag=readback;});
  const autonomousNpcLife=createAutonomousNpcLifeRuntime();
  const app=express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  if(process.env.NODE_ENV==="production")app.set("trust proxy",parseInt(process.env.TRUST_PROXY_HOPS||"1",10));const server=createServer(app);
  app.use((req,res,next)=>{const origin=allowedCorsOrigin(req.headers.origin);if(origin){res.setHeader("Access-Control-Allow-Origin",origin);res.setHeader("Access-Control-Allow-Credentials","true");res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization, X-Requested-With");res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");res.setHeader("Vary","Origin");}if(req.method==="OPTIONS"){if(!origin)return res.status(403).end();return res.status(204).end();}next();});
  app.use(express.json({limit:"50mb"}));app.use(express.urlencoded({limit:"50mb",extended:true}));
  app.get("/healthz",(_req,res)=>res.status(200).json({status:"ok",service:"echoes-of-aurion",...(releaseRevision?{revision:releaseRevision}:{}),wolframCag,npcLife:autonomousNpcLife.readback()}));

  // Rate limit for local login and registration to prevent brute force attacks
  const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 20, // Limit each IP to 20 requests per `window` (here, per 15 minutes)
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: "Too many login attempts, please try again later." } }
  });
  app.use("/api/trpc/auth.loginLocal", authRateLimiter);
  app.use("/api/trpc/auth.registerLocal", authRateLimiter);

  registerGlbSmartUpload(app);registerConfirmedEquipmentVisualRoutes(app);registerStarterGlbRuntimeAssets(app);registerStorageProxy(app);registerOAuthRoutes(app);registerMcpGateway(app);registerAdminMcp(app);registerGuildGovernanceRoutes(app);registerGuildBankRoutes(app);
  registerZoneGateway(server,undefined,consumeZoneTicketWithCombatProfile,{upsert:recordWorldPresenceLease,release:releaseWorldPresenceLease},autonomousNpcLife.enabled?autonomousNpcLife:undefined);
  app.use("/api/trpc",createExpressMiddleware({router:appRouter,createContext}));if(process.env.NODE_ENV==="development")await setupVite(app,server);else serveStatic(app);
  const preferredPort=parseInt(process.env.PORT||"3000",10),strictPort=process.env.STRICT_PORT==="true",port=strictPort?preferredPort:await findAvailablePort(preferredPort),host=process.env.HOST||"0.0.0.0";if(port!==preferredPort)console.log(`Port ${preferredPort} is busy, using port ${port} instead`);server.listen(port,host,()=>console.log(`Server running on http://${host}:${port}/`));
}
startServer().catch(error=>{console.error(error);process.exitCode=1;});
