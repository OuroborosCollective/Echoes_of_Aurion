import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import path from "path";
import { createServer as createViteServer } from "vite";

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR === "true" ? false : { server },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    if (url.startsWith("/api") || url.startsWith("/healthz") || url.startsWith("/manus-storage")) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(process.cwd(), "client", "index.html");
      if (!fs.existsSync(clientTemplate)) {
        return next();
      }
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use("*", (req, res, next) => {
      if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/healthz")) {
        return next();
      }
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    const fallbackDist = path.resolve(process.cwd(), "dist");
    app.use(express.static(fallbackDist));
    app.use("*", (req, res, next) => {
      if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/healthz")) {
        return next();
      }
      res.sendFile(path.resolve(fallbackDist, "index.html"));
    });
  }
}
