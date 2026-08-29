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
import { registerZoneGateway } from "../zoneGateway";
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

function runtimeRevision(): string | null {
  const revision = process.env.AURION_RUNTIME_REVISION?.trim() ?? "";
  if (!revision) return null;
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("AURION_RUNTIME_REVISION must be a 40-character lowercase Git SHA");
  }
  return revision;
}

async function startServer() {
  const app = express();
  const revision = runtimeRevision();
  if (process.env.NODE_ENV === "production" && !revision) {
    throw new Error("AURION_RUNTIME_REVISION is required in production");
  }
  // The production container is reachable only through Traefik. Trust precisely
  // one proxy hop so HTTPS and host information survive TLS termination.
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", parseInt(process.env.TRUST_PROXY_HOPS || "1", 10));
  }
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/healthz", (_req, res) => res.status(200).json({
    ok: true,
    status: "ok",
    service: "echoes-of-aurion",
    revision,
  }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerMcpGateway(app);
  registerAdminMcp(app);
  registerZoneGateway(server, undefined, consumeZoneConnectionTicket, {
    upsert: recordWorldPresenceLease,
    release: releaseWorldPresenceLease,
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
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
