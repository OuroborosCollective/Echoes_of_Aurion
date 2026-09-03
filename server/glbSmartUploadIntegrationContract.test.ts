import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("smart GLB upload integration contract", () => {
  it("registers the authenticated runtime route after the upload-sized JSON parser", () => {
    const index = read("server/_core/index.ts");
    const parserIndex = index.indexOf('app.use(express.json({ limit: "50mb" }))');
    const routeIndex = index.indexOf("registerGlbSmartUpload(app)");
    expect(parserIndex).toBeGreaterThan(-1);
    expect(routeIndex).toBeGreaterThan(parserIndex);
    expect(index).toContain('import { registerGlbSmartUpload } from "../glbSmartUpload"');
  });

  it("keeps classification server-authoritative instead of accepting a browser asset type", () => {
    const runtime = read("server/glbSmartUpload.ts");
    const page = read("client/src/pages/GlbUpload.tsx");
    expect(runtime).toContain("classification = classifyGlbBase64(contentBase64)");
    expect(runtime).toContain("assetType: classification.assetType");
    expect(page).toContain('fetch("/api/admin/glb-smart-upload"');
    expect(page).toContain("contentBase64: await readFileAsBase64(file)");
    expect(page).not.toContain("assetType:");
  });

  it("exposes the uploader only through the admin navigation surface", () => {
    const app = read("client/src/App.tsx");
    const layout = read("client/src/components/DashboardLayout.tsx");
    const page = read("client/src/pages/GlbUpload.tsx");
    expect(app).toContain('<Route path="/ops/glb-upload" component={GlbUpload} />');
    expect(layout).toContain('user?.role === "admin" ? [...menuItems, adminMenuItem] : menuItems');
    expect(page).toContain('user.role !== "admin"');
  });
});
