import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const itchDocumentPlugin = {
  name: "itch-document-sanitizer",
  transformIndexHtml(html: string) {
    const dataIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23061820'/%3E%3Cpath d='M12 32c12-19 28-19 40 0-12 19-28 19-40 0Z' fill='none' stroke='%232de2cf' stroke-width='5'/%3E%3Ccircle cx='32' cy='32' r='7' fill='%23e5c07b'/%3E%3C/svg%3E";
    return html
      .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${dataIcon}" />`)
      .replace(/<script\s+defer[\s\S]*?<\/script>/, "");
  },
};

function babylonCdnPath(id: string): string {
  if (id.startsWith("@babylonjs/core/")) {
    const modulePath = id.slice("@babylonjs/core/".length);
    return `https://cdn.jsdelivr.net/npm/@babylonjs/core@9.20.1/${modulePath.endsWith(".js") ? modulePath : `${modulePath}.js`}`;
  }
  if (id === "@babylonjs/loaders/glTF") return "https://cdn.jsdelivr.net/npm/@babylonjs/loaders@9.20.1/glTF/index.js";
  return id;
}

/**
 * Static HTML5 distribution for itch.io.
 * Relative asset paths are mandatory because itch.io hosts HTML games below a CDN subdirectory.
 * The MCP/API service is intentionally external and is not packaged into this archive.
 */
export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_AURION_STATIC_DISTRIBUTION": JSON.stringify("true"),
  },
  plugins: [react(), tailwindcss(), itchDocumentPlugin],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: false,
  build: {
    outDir: path.resolve(import.meta.dirname, "dist", "itch"),
    emptyOutDir: true,
    reportCompressedSize: false,
    rollupOptions: {
      external: id => id.startsWith("@babylonjs/core/") || id === "@babylonjs/loaders/glTF",
      output: {
        paths: babylonCdnPath,
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor-runtime";
        },
      },
    },
  },
});
