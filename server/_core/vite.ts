import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

export async function setupVite(app: Express, server: Server) {
  // Development tooling is deliberately loaded only in the development branch.
  // The production runtime ships static assets and therefore needs only production dependencies.
  // Keep the development-only config outside the production module graph.
  // A computed file URL prevents the runtime artifact builder from pulling
  // Vite plugins into the production container merely by compiling this file.
  const viteConfigUrl = new URL("../../vite.config.ts", import.meta.url).href;
  const [{ createServer: createViteServer }, { default: viteConfig }] = await Promise.all([
    import("vite"),
    import(/* @vite-ignore */ viteConfigUrl),
  ]);

  // `vite.config.ts` exports a factory. Spreading it directly silently loses its
  // `client` root, aliases and proxy; then unknown modules fall through to this
  // file's HTML handler. Resolve it exactly as a development server would.
  const resolvedViteConfig = typeof viteConfig === "function"
    ? await viteConfig({ command: "serve", mode: "development", isSsrBuild: false, isPreview: false })
    : viteConfig;
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
