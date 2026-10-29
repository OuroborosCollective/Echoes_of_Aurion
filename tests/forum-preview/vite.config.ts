import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  resolve: { alias: [
    { find: "@/lib/trpc", replacement: path.join(import.meta.dirname, "trpc-fixture.ts") },
    { find: "@", replacement: path.join(root, "client/src") },
    { find: "@shared", replacement: path.join(root, "shared") },
  ] },
  server: { fs: { allow: [root] } },
});
