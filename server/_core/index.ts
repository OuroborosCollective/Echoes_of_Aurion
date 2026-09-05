import "dotenv/config";
import express from "express";
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
import { registerStarterGlbRuntimeAssets } from "../starterGlbRuntimeAssets";
import { registerZoneGateway } from "../zoneGateway";
import { registerGuildGovernanceRoutes } from "../guildGovernanceRoutes";
import { registerGuildBankRoutes } from "../guildBankRoutes";
import { consumeZoneConnectionTicket, recordWorldPresenceLease, releaseWorldPresenceLease } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function allowedCorsOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  const configured = (process.env.AURION_ALLOWED_ORIGINS ?? "https://arelogic.space")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (configured.includes(origin)) return origin;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "https:" && (parsed.hostname.endsWith(".itch.io") || parsed.hostname.endsWith(".itch.zone"))) return origin;
  } catch {
    return null;
  }
  return null;
}

async function startServer() {
  const releaseRevision = process.env.AURION_RELEASE_SHA?.trim().toLowerCase();
  if (releaseRevision && !/^[a-f0-9]{40}$/.test(releaseRevision)) {
    throw new Error("AURION_RELEASE_SHA must be a 40-character Git revision when it is set");
  }

  const app = express();
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", parseInt(process.env.TRUST_PROXY_HOPS || "1", 10));
  }
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
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/healthz", (_req, res) => res.status(200).json({
    status: "ok",
    service: "echoes-of-aurion",
    ...(releaseRevision ? { revision: releaseRevision } : {}),
  }));
  registerGlbSmartUpload(app);
  registerStarterGlbRuntimeAssets(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerMcpGateway(app);
  registerAdminMcp(app);
  registerGuildGovernanceRoutes(app);
  registerGuildBankRoutes(app);
  registerZoneGateway(server, undefined, consumeZoneConnectionTicket, {
    upsert: recordWorldPresenceLease,
    release: releaseWorldPresenceLease,
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const strictPort = process.env.STRICT_PORT === "true";
  const port = strictPort ? preferredPort : await findAvailablePort(preferredPort);
  const host = process.env.HOST || "0.0.0.0";

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });
}

startServer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
