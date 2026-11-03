import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AURION_STARTER_CITY_WALL_LODS, AURION_STARTER_CITY_WALL_LEGACY_NORMALIZATIONS } from "../shared/aurionStarterCityWallContract";
import fixtures from "./fixtures/starterCityWallNormalization.json";

// Unit coverage of the transaction/fence, using measured metadata fixtures.
// Database and durable-file effects below are doubles, never production proof.
const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn() }));
const io = vi.hoisted(() => ({ buildGlbImportPlan: vi.fn(), readStoredGlb: vi.fn() }));
vi.mock("mysql2/promise", () => ({ createPool: () => ({ getConnection: async () => db, end: async () => undefined }) }));
vi.mock("./glbImportPlan", () => ({ buildGlbImportPlan: io.buildGlbImportPlan }));
vi.mock("./glbFileStore", () => ({ readStoredGlb: io.readStoredGlb, persistGlbBytes: vi.fn(), glbStorageRoot: () => "/fixture" }));
import { GlbImportStore } from "./glbImportStore";

let row: Record<string, unknown> | null;
let admin: boolean;
const store = () => new GlbImportStore("mysql://fixture@127.0.0.1/fixture");
const input = (level: number) => ({ contentBase64: "fixture", fileName: AURION_STARTER_CITY_WALL_LODS[level]!.fileName,
  expectedPlanSha256: fixtures.entries[level]!.next.planSha256,
  expectedPreviousNormalizationSha256: AURION_STARTER_CITY_WALL_LEGACY_NORMALIZATIONS[level]! });
function setup(level = 0) {
  const fixture = fixtures.entries[level]!, plan = fixture.next;
  io.buildGlbImportPlan.mockResolvedValue(plan);
  io.readStoredGlb.mockResolvedValue(Buffer.alloc(plan.bytes));
  row = { id: plan.assetId, sha256: plan.sha256, bytes: plan.bytes, assetType: "arena", status: "approved",
    displayName: "World Environment · structure · Aurion CityWall", storageKey: `local-glb/${plan.sha256}.glb`,
    storageUrl: `/api/assets/glb/${plan.sha256}.glb`, normalizationRevision: fixture.previous.revision,
    normalizationSha256: fixture.previous.manifestSha256, normalizationManifest: JSON.stringify(fixture.previous) };
  return fixture;
}
beforeEach(() => {
  vi.clearAllMocks(); admin = true; setup();
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
    if (sql.includes("FROM users")) return [[{ id: 7, role: admin ? "admin" : "user" }]];
    if (sql.includes("FROM glbAssets")) return [row ? [row] : []];
    throw Error("UNEXPECTED_TEST_QUERY");
  });
  db.execute.mockImplementation(async (_sql: string, values: unknown[]) => {
    if (row && row.id === values[3] && row.sha256 === values[4] && row.normalizationSha256 === values[5]) {
      Object.assign(row, { normalizationRevision: values[0], normalizationSha256: values[1], normalizationManifest: values[2] });
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  });
});

describe("pinned wall normalization upgrade fence", () => {
  it.each([0, 1, 2])("migrates verified old LOD %i metadata with CAS and readback, then becomes idempotent", async level => {
    const { previous, next } = setup(level);
    const result = await store().migrateStarterCityWallNormalization(7, input(level));
    expect(result).toMatchObject({ status: "migrated", previousNormalizationSha256: previous.manifestSha256, normalizationSha256: next.normalization.manifestSha256 });
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("AND normalizationSha256 = ?"), expect.arrayContaining([previous.manifestSha256]));
    expect(io.readStoredGlb).toHaveBeenCalledWith(next.sha256, undefined);
    expect(db.commit).toHaveBeenCalledTimes(1);
    expect((await store().migrateStarterCityWallNormalization(7, input(level))).status).toBe("unchanged");
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
  it("does not create an absent asset or fill a null manifest through migration", async () => {
    row = null;
    expect((await store().migrateStarterCityWallNormalization(7, input(0))).status).toBe("absent");
    setup(); Object.assign(row!, { normalizationRevision: null, normalizationSha256: null, normalizationManifest: null });
    expect((await store().migrateStarterCityWallNormalization(7, input(0))).status).toBe("unnormalized");
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("requires the locked current admin role", async () => {
    admin = false;
    await expect(store().migrateStarterCityWallNormalization(7, input(0))).rejects.toThrow("GLB_ADMIN_REQUIRED");
    expect(db.execute).not.toHaveBeenCalled(); expect(db.rollback).toHaveBeenCalledTimes(1);
  });
  it.each(["expectedPlanSha256", "expectedPreviousNormalizationSha256"] as const)("rejects changed %s before mutation", async key => {
    await expect(store().migrateStarterCityWallNormalization(7, { ...input(0), [key]: "f".repeat(64) })).rejects.toThrow("MIGRATION_SCOPE");
    expect(db.execute).not.toHaveBeenCalled();
  });
  it.each([{ status: "archived" }, { bytes: 1 }, { storageKey: "foreign/path" }, { displayName: "NPC Fallback · wall" }])("rejects asset identity drift %j", async change => {
    Object.assign(row!, change);
    await expect(store().migrateStarterCityWallNormalization(7, input(0))).rejects.toThrow("MIGRATION_IDENTITY");
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("rejects a different valid predecessor instead of silently rewriting it", async () => {
    const { manifestSha256: _, ...other } = structuredClone(fixtures.entries[0]!.previous);
    other.lod.triangleCount -= 1;
    other.collision.triangleCount -= 1;
    const manifestSha256 = createHash("sha256").update(JSON.stringify(other)).digest("hex");
    Object.assign(row!, { normalizationSha256: manifestSha256, normalizationManifest: JSON.stringify({ ...other, manifestSha256 }) });
    await expect(store().migrateStarterCityWallNormalization(7, input(0))).rejects.toThrow("MIGRATION_PREDECESSOR");
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("rolls back when durable source bytes fail verification", async () => {
    io.readStoredGlb.mockRejectedValue(Error("GLB_STORED_DIGEST_MISMATCH"));
    await expect(store().migrateStarterCityWallNormalization(7, input(0))).rejects.toThrow("GLB_STORED_DIGEST_MISMATCH");
    expect(db.execute).not.toHaveBeenCalled(); expect(db.rollback).toHaveBeenCalledTimes(1);
  });
  it("rejects a failed CAS readback and never commits it", async () => {
    db.execute.mockResolvedValue([{ affectedRows: 0 }]);
    await expect(store().migrateStarterCityWallNormalization(7, input(0))).rejects.toThrow("MIGRATION_READBACK");
    expect(db.commit).not.toHaveBeenCalled(); expect(db.rollback).toHaveBeenCalledTimes(1);
  });
});
