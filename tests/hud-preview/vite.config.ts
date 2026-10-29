import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
const root = path.resolve(import.meta.dirname, "../..");
export default defineConfig({
  root: import.meta.dirname, base: "./", plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.join(root, "client/src"), "@shared": path.join(root, "shared") } },
  build: { outDir: "/tmp/preview-dist", emptyOutDir: true, chunkSizeWarningLimit: 3000 },
  server: { fs: { allow: [root] } },
});
