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

/**
 * Static HTML5 distribution for itch.io.
 * Relative asset paths are mandatory because itch.io hosts HTML games below a CDN subdirectory.
 * The MCP/API service is intentionally external and is not packaged into this archive.
 */
export default defineConfig({
  base: "./",
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
  },
});
