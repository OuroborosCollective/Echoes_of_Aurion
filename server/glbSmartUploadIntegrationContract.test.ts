import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("smart GLB upload integration contract", () => {
  it("registers the authenticated runtime route after the upload-sized JSON parser", () => {
    const index = read("server/_core/index.ts");
    const parserMatch = /app\.use\(express\.json\(\{\s*limit\s*:\s*["']50mb["']\s*\}\)\)/.exec(index);
    const parserIndex = parserMatch?.index ?? -1;
    const routeIndex = index.indexOf("registerGlbSmartUpload(app)");
    expect(parserIndex).toBeGreaterThan(-1);
    expect(routeIndex).toBeGreaterThan(parserIndex);
    expect(index).toContain('import { registerGlbSmartUpload } from "../glbSmartUpload"');
  });

  it("keeps classification server-authoritative while binding safe normal and LOD filename evidence", () => {
    const runtime = read("server/glbSmartUpload.ts");
    const page = read("client/src/pages/GlbUpload.tsx");
    expect(runtime).toContain("classification = classifyGlbBase64(contentBase64, fileName)");
    expect(runtime).toContain("buildGlbImportPlan(contentBase64, purpose, fileName)");
    expect(runtime).toContain("assetType: classification.assetType");
    expect(page).toContain('fetch("/api/admin/glb-smart-upload"');

    // Ordinary uploads retain the browser-selected basename by default. LOD
    // family uploads may replace only that filename evidence with the locally
    // constructed LOD0…LOD3 classifier name; neither client path supplies
    // assetType or other classification authority.
    expect(page).toContain("fileName = file.name");
    expect(page).toContain("lodClassifyingFileName(file.name, level)");
    expect(page).toContain('return `${base || "aurion_model"}_LOD${level}.glb`');

    const bodyStart = page.indexOf("body: JSON.stringify({");
    expect(bodyStart).toBeGreaterThan(-1);
    const bodyEnd = page.indexOf("}),", bodyStart);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const requestBodySource = page.slice(bodyStart, bodyEnd);
    expect(requestBodySource).toContain("displayName: chosenName");
    expect(requestBodySource).toContain("fileName");
    expect(requestBodySource).toContain("contentBase64: contentBase64 ?? await readFileAsBase64(file)");
    expect(requestBodySource).not.toContain("assetType");
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
