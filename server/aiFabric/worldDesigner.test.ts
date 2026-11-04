import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGlbImportPlan } from "../glbImportPlan";
import { testGlb } from "../glbImportFixtures";
import { WorldDesigner, DesignerInput, buildPrompt, validateProposal, type DesignerContext } from "./worldDesigner";
import { FabricConfigSchema, FabricError } from "./policy";
import { OpenCodeProvider, OpenRouterProvider, type Model } from "./providers";

const dirs: string[] = [];
afterEach(async () => { for (const p of dirs.splice(0)) await rm(p, { recursive: true, force: true }); });
let context: DesignerContext;
const input = DesignerInput.parse({ request: "Place a small market using these real catalog references", mode: "auto", zoneId: "observatory_threshold", connectionId: "zone_peer_test_1234", chunkX: 0, chunkZ: 0 });
function draft() { return { schemaVersion: "aurion.world-design.v1", designKey: "market.test", version: 1, title: "Test market", expectedCatalogRevision: context.catalog.revision,
  placements: [{ placementKey: "barrel.one", assetId: context.catalog.entries[0]!.assetId, chunkX: 0, chunkZ: 0, xMm: 32000, zMm: 32000, rotationQuarterTurns: 0, scalePermille: 1000 }] }; }
beforeAll(async () => {
  const plan = await buildGlbImportPlan(testGlb("Aurion_Barrel_Prop").toString("base64"), "world-environment", "Aurion_Barrel_Prop.glb");
  context = { catalog: { version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [{ assetId: plan.assetId, sha256: plan.sha256, displayName: "Isolated synthetic geometry", assetType: plan.assetType,
    storageUrl: `/api/assets/glb/${plan.sha256}.glb`, targetKey: null, normalization: plan.normalization, purpose: "world-environment", subcategory: plan.subcategory, equipmentSlot: null }] },
    world: { schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [] }, sourceRevision: "unit-fixture", zoneId: "observatory_threshold", tick: 123 };
});
// Explicit test doubles of provider inference, NOT provider or live-world evidence.
class UnitOpenRouter extends OpenRouterProvider {
  calls = 0; fail = ""; content = ""; cost: number | null = 0;
  async models(): Promise<Model[]> { return ["unit/free:free", "unit/premium"].map(id => ({ id, context_length: 150000, architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    supported_parameters: ["response_format"], pricing: id.endsWith(":free") ? { prompt: "0", completion: "0" } : { prompt: "0.000001", completion: "0.000002" } })); }
  async account() { return { limitRemainingUsd: 9, usageDailyUsd: 0, freeTier: false, purchasedCreditsVerified: true }; }
  async generate(model: Model) { this.calls++; if (this.fail) throw new FabricError(this.fail); return { content: this.content || JSON.stringify(draft()), model: model.id, provider: "unit-double", tokens: 100, costMicros: this.cost }; }
}
class UnitLocal extends OpenCodeProvider {
  available = false; calls = 0;
  async inspect() { if (!this.available) throw new FabricError("OFFLINE"); return { status: "CONNECTED", version: "unit", model: "local-model", provider: "unit-double", inference: "loopback", contextLength: 150000 }; }
  async generate() { this.calls++; return { content: JSON.stringify(draft()), model: "local-model", provider: "unit-double", tokens: 100, costMicros: 0 }; }
}
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "aurion-designer-")); dirs.push(dir);
  const config = FabricConfigSchema.parse({ ledgerPath: join(dir, "ledger.json"), openRouterKey: "unit-only-not-a-secret", whitelist: ["unit/free:free", "unit/premium"], openCodeModel: "local-model" });
  const remote = new UnitOpenRouter("unit-only"), local = new UnitLocal(config);
  return { designer: new WorldDesigner(config, remote, local), remote, local, config };
}
describe("draft contract using real GLB parser, isolated inputs", () => {
  it("preserves canonical schema, catalog and centered integer coordinates", () => {
    expect(validateProposal(draft(), context, input).draft.placements[0]!.assetId).toBe(context.catalog.entries[0]!.assetId);
    expect(buildPrompt(context, input)).toContain("local - 32000");
    expect(validateProposal(draft(), context, input).reviewNotes[0]).toContain("UNVERIFIED");
  });
  it("rejects unknown IDs, stale revisions, unknown fields, invalid coordinates and duplicate anchors", () => {
    for (const mutate of [
      (d: ReturnType<typeof draft>) => { d.placements[0]!.assetId = "glb_unknown"; },
      (d: ReturnType<typeof draft>) => { d.expectedCatalogRevision = "c".repeat(64); },
      (d: ReturnType<typeof draft>) => { d.placements[0]!.xMm = 64000; },
      (d: ReturnType<typeof draft>) => { d.placements[0]!.chunkX = 1; },
      (d: ReturnType<typeof draft>) => { d.placements.push({ ...d.placements[0]!, placementKey: "barrel.two" }); },
    ]) { const d = draft(); mutate(d); expect(() => validateProposal(d, context, input)).toThrow(); }
    expect(() => validateProposal({ ...draft(), confirmation: "APPLY_WORLD_DESIGN" }, context, input)).toThrow();
  });
});
describe("routing unit tests; provider responses are test doubles", () => {
  it("uses suitable local first; offline local falls back only to free", async () => {
    const s = await setup(); s.local.available = true;
    const a = await s.designer.propose(input, context); expect(a.status).toBe("AI_DRAFT"); expect(s.remote.calls).toBe(0);
    s.local.available = false;
    const b = await s.designer.propose(input, context); expect(b.status).toBe("AI_DRAFT"); expect(s.remote.calls).toBe(1);
    expect(b.failures).toContainEqual({ route: "local", code: "OFFLINE" });
  });
  it("rate limiting and network failure never cause paid fallback", async () => {
    for (const code of ["FREE_RATE_LIMIT", "OFFLINE", "TIMEOUT"]) {
      const s = await setup(); s.remote.fail = code;
      const result = await s.designer.propose(input, context);
      expect(result.status).toBe("UNRESOLVED"); expect(s.remote.calls).toBe(1); expect(result.failures.at(-1)?.code).toBe(code);
    }
  });
  it("rejects invalid JSON/schema without applying or retrying", async () => {
    for (const content of ["not JSON", '{"invented":true}']) {
      const s = await setup(); s.remote.content = content;
      const result = await s.designer.propose(input, context); expect(result.status).toBe("UNRESOLVED"); expect(result.failures.at(-1)?.code).toBe("INVALID_DRAFT");
      expect(s.remote.calls).toBe(1);
    }
  });
  it("requires explicit premium approval and refuses unknown zero cost", async () => {
    const s = await setup(); await expect(s.designer.propose({ ...input, mode: "premium" }, context)).rejects.toThrow("PREMIUM_NOT_APPROVED");
    expect(s.remote.calls).toBe(0); s.remote.cost = null;
    expect((await s.designer.propose(input, context)).failures.at(-1)?.code).toBe("ZERO_COST_NOT_CONFIRMED");
  });
});
