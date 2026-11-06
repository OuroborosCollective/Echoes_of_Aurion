import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { WorldDesignDraftSchema, WorldDesignPlanSchema, type WorldDesignDraft } from "../shared/aurionAuthoringContract";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { applyWorldDesign, authoringHash, planWorldDesign, readActiveWorldDesign, recoverWorldAuthoringReceipt, retireAdminPlacementDesign } from "./aurionAuthoringPersistence";
import { buildPlacementDraft, buildRemovalPlan, placementKindOfAsset } from "../shared/adminPlacementPlan";
import { buildGlbImportPlan } from "./glbImportPlan";
import { testAnimatedPlayerGlb, testGlb } from "./glbImportFixtures";
import { glbImportStore } from "./glbImportStore";
import { reviewPlayerGlbSubmission } from "./db";
import * as storage from "./storage";
import { aurionAuthoringRouter } from "./routes/aurionAuthoringRouter";
import { router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import { AdminQuestStudioService } from "./questCompiler/adminService";
import { QuestTemplateVersionSchema } from "../shared/aurionQuestContract";
import { computeCanonicalHash } from "../shared/aurionQuestCanonicalHash";
import { DesignerInput, validateProposal } from "./aiFabric/worldDesigner";
import { aurionQuestRouter } from "./routes/aurionQuestRouter";
import { useGlbCatalogLock } from "./testSupport/npcSharedTableLock";

// Changes or binds the shared GLB runtime catalog revision; never overlap with other such files.
useGlbCatalogLock();

vi.mock("./storage", async importOriginal => ({
  ...await importOriginal<typeof import("./storage")>(),
  storageGetSignedUrl: vi.fn(),
}));

const enabled = process.env.AURION_WORLD_AUTHORING_DB_TEST === "1";
describe.skipIf(!enabled)("world authoring against isolated MariaDB", () => {
  let pool: Pool;
  let admin = 0;
  let otherAdmin = 0;
  let assetId = "";
  let assetHash = "";
  let shellAssetId = "";
  let catalogRevision = "";
  let root = "";
  let store: ReturnType<typeof glbImportStore>;

  function draft(designKey: string, version = 1): WorldDesignDraft {
    return WorldDesignDraftSchema.parse({
      schemaVersion: "aurion.world-design.v1", designKey, version,
      title: "Isolated world design", expectedCatalogRevision: catalogRevision,
      placements: [{ placementKey: "fixture-barrel", assetId, chunkX: 0, chunkZ: 0,
        xMm: 32000, zMm: 32000, rotationQuarterTurns: 0, scalePermille: 1000 }],
    });
  }

  async function seedLegacy(designKey: string) {
    const identity = { ...draft(designKey), referencedAssetHashes: [assetHash], requiresHumanConfirmation: true as const };
    const plan = { ...identity, planHash: authoringHash(identity) };
    // Historical plans have no predecessor field and their stored hashes must remain valid.
    expect(WorldDesignPlanSchema.parse(plan)).toEqual(plan);
    const designHash = authoringHash({ schemaVersion: "aurion.world-design.v1", plan });
    await pool.execute(
      "INSERT INTO aurionWorldDesignVersions (id, designKey, version, worldId, title, expectedCatalogRevision, designJson, designHash, active, createdByUserId) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 1, ?)",
      [`${designKey}:v1`, designKey, GLOBAL_WORLD_ID, plan.title, catalogRevision, stableCatalogStringify(plan), designHash, admin],
    );
    return designHash;
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_authoring_test") throw new Error("ISOLATED_WORLD_AUTHORING_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    expect(database[0]?.name).toBe("aurion_authoring_test");
    const [user] = await pool.execute<ResultSetHeader>("INSERT INTO users (openId, role) VALUES ('isolated-world-authoring-admin', 'admin')");
    admin = user.insertId;
    const [other] = await pool.execute<ResultSetHeader>("INSERT INTO users (openId, role) VALUES ('isolated-world-authoring-other-admin', 'admin')");
    otherAdmin = other.insertId;
    root = await mkdtemp(path.join(tmpdir(), "aurion-world-authoring-"));
    process.env.AURION_GLB_STORAGE_DIR = root;
    store = glbImportStore();
    const contentBase64 = testGlb("Aurion_Barrel_Prop").toString("base64");
    const upload = await buildGlbImportPlan(contentBase64, "world-environment", "Aurion_Barrel_Prop.glb");
    const asset = await store.ingest(admin, { displayName: "Isolated barrel", fileName: "Aurion_Barrel_Prop.glb", contentBase64,
      purpose: "world-environment", expectedPlanSha256: upload.planSha256 });
    assetId = asset.assetId;
    assetHash = asset.sha256;
    // A free NPC figure for NPC shells (stage B).
    const shellBase64 = testAnimatedPlayerGlb("Shell_Character_Ranger").toString("base64");
    const shellPlan = await buildGlbImportPlan(shellBase64, "npc-fallback", "Shell_Character_Ranger.glb");
    const shellAsset = await store.ingest(admin, { displayName: "Isolated shell ranger", fileName: "Shell_Character_Ranger.glb", contentBase64: shellBase64,
      purpose: "npc-fallback", expectedPlanSha256: shellPlan.planSha256 });
    shellAssetId = shellAsset.assetId;
    catalogRevision = (await store.catalog()).revision;
  }, 45_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await pool.execute("DELETE FROM glbAssetSubmissions WHERE submittedByUserId = ?", [otherAdmin]);
    await pool.execute("DELETE FROM glbAssets WHERE createdByUserId = ?", [otherAdmin]);
    await pool.execute("DELETE FROM aurionAuthoringReceipts WHERE actorUserId IN (?, ?)", [admin, otherAdmin]);
    await pool.execute("DELETE FROM aurionQuestAdminProposals WHERE authorUserId IN (?, ?)", [admin, otherAdmin]);
    await pool.execute("DELETE FROM aurionQuestTemplateVersions WHERE templateId IN (?, ?)", ["inspector-native-quest", "fadenwerk_native_integration"]);
    await pool.execute("DELETE FROM aurionWorldDesignVersions WHERE createdByUserId IN (?, ?)", [admin, otherAdmin]);
    await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
    await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [otherAdmin]);
  });

  afterAll(async () => {
    if (pool) {
      await pool.execute("DELETE FROM glbAssignments WHERE assignedByUserId = ?", [admin]);
      await pool.execute("DELETE FROM glbAssets WHERE createdByUserId = ?", [admin]);
      await pool.execute("DELETE FROM users WHERE id IN (?, ?)", [admin, otherAdmin]);
      await pool.end();
    }
    if (store) await store.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("rejects world-only asset selections at the route boundary for quest and dungeon", async () => {
    const caller = aurionAuthoringRouter.createCaller({ user: { id: admin, role: "admin" } } as TrpcContext);
    for (const kind of ["quest", "dungeon"] as const) {
      await expect(caller.propose({ kind, request: "Create a town market proposal", assetIds: [assetId] }))
        .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("ASSET_SELECTION_WORLD_ONLY") });
    }
    // The identical asset selection is valid for world and reaches its live-session guard.
    await expect(caller.propose({ kind: "world", request: "Create a town market proposal", assetIds: [assetId] }))
      .rejects.toThrow("AI_LIVE_SESSION_REQUIRED");
  });

  it("passes a review-only AI candidate through the real canonical database contract", async () => {
    // Synthetic model output, real GLB catalog, real MariaDB transaction and readback.
    const input = DesignerInput.parse({ request: "Place the isolated catalog barrel", mode: "free", zoneId: "observatory_threshold", connectionId: "zone_peer_isolated_ai", chunkX: 0, chunkZ: 0 });
    const context = { catalog: await store.catalog(), world: await readActiveWorldDesign(), sourceRevision: "isolated-db-test", zoneId: input.zoneId, tick: 0 };
    const candidate = validateProposal(draft("ai-isolated-market"), context, input).draft;
    const caller = aurionAuthoringRouter.createCaller({ user: { id: admin, role: "admin" } } as TrpcContext);
    const stranger = aurionAuthoringRouter.createCaller({ user: { id: otherAdmin, role: "user" } } as TrpcContext);
    await expect(stranger.aiStatus()).rejects.toThrow();
    await expect(caller.aiPropose(input)).rejects.toThrow("AI_LIVE_SESSION_REQUIRED");
    await expect(caller.propose({ kind: "world", request: input.request })).rejects.toThrow("AI_LIVE_SESSION_REQUIRED");
    const operationId = "c".repeat(32);
    const plan = await planWorldDesign(candidate, undefined, operationId);
    await expect(caller.worldApply({ draft: candidate, expectedPlanHash: plan.planHash, operationId, confirmation: "" } as never)).rejects.toThrow();
    expect((await readActiveWorldDesign()).designs).toHaveLength(0);
    const applied = await caller.worldApply({ draft: candidate, expectedPlanHash: plan.planHash, operationId, confirmation: "APPLY_WORLD_DESIGN" });
    // The first apply changes the predecessor: the original plan is now stale.
    await expect(applyWorldDesign(admin, candidate, plan.planHash, operationId)).rejects.toThrow("AUTHORING_WORLD_PLAN_CHANGED");
    const [receipts] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionAuthoringReceipts WHERE planHash=?", [plan.planHash]);
    expect(Number(receipts[0]!.n)).toBe(1);
    const readback = await readActiveWorldDesign();
    expect(readback.designs.find(d => d.designKey === candidate.designKey)?.designHash).toBe(applied.receipt.resultHash);
    expect((await recoverWorldAuthoringReceipt(admin, { operationId, planHash: plan.planHash, designKey: candidate.designKey, version: candidate.version })).status).toBe("found");
  });

  it("converts Fadenwerk without writes, then uses canonical plan, publish, receipt and durable readback", async () => {
    const caller = aurionQuestRouter.createCaller({ user: { id: admin, role: "admin" } } as TrpcContext);
    const sourceJson = JSON.stringify({version:1,questlines:[{id:"native_integration",title:"Native Fadenwerk integration",entryNode:"start",
      graph:{start:{id:"start",title:"Start",choices:[{id:"go",label:"Weiter",nextNode:"end"}]},end:{id:"end",title:"Ende",choices:[]}}}]});
    const inspected = await caller.fadenwerkInspect({sourceJson});
    const converted = await caller.fadenwerkDraft({sourceJson,questlineIndex:0,version:1});
    expect(converted.sourceHash).toBe(inspected.sourceHash);
    expect(converted.template).toMatchObject({active:false,quarantined:true});
    for (const table of ["aurionQuestAdminProposals","aurionQuestTemplateVersions","aurionAuthoringReceipts"]) {
      const filter = table === "aurionAuthoringReceipts" ? {sql:"actorUserId=?",value:admin} : {sql:"templateId=?",value:"fadenwerk_native_integration"};
      const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${filter.sql}`, [filter.value]);
      expect(Number(rows[0]!.n)).toBe(0);
    }
    // Explicit isolated test activation; no production authorization is implied.
    const template = {...converted.template,active:true,quarantined:false};
    const proposal = await caller.proposeDraft({templateId:template.templateId,templateVersion:template.version,proposedDataJson:JSON.stringify(template)});
    const plan = await caller.publishPlan({proposalId:proposal.id});
    await expect(caller.publish({proposalId:proposal.id,expectedPlanHash:plan.planHash,confirmation:""} as never)).rejects.toThrow();
    const published = await caller.publish({proposalId:proposal.id,expectedPlanHash:plan.planHash,confirmation:"PUBLISH_QUEST_TEMPLATE"});
    expect(await caller.publishReceipt({proposalId:proposal.id,planHash:plan.planHash})).toMatchObject({status:"found",receipt:published.receipt});
    const readback = await caller.authoringTemplate({templateId:template.templateId,version:1});
    expect(readback.durable).toBe(true);
    expect(readback.templates).toEqual([QuestTemplateVersionSchema.parse(template)]);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionAuthoringReceipts WHERE actorUserId=? AND planHash=?", [admin,plan.planHash]);
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("recovers only the current admin's exact committed quest publication and rejects corrupt evidence", async () => {
    const recovery = Reflect.get(await import("./aurionAuthoringPersistence"), "recoverQuestAuthoringReceipt");
    expect(typeof recovery).toBe("function");
    const service = new AdminQuestStudioService();
    const template = { ...(await service.getTemplates())[0]!, templateId: "inspector-native-quest", version: 1, active: true, quarantined: false };
    // Use the same canonical router registry for proposal, plan and publish.
    // A fresh service has a different template set after earlier publications.
    const caller = aurionQuestRouter.createCaller({ user: { id: admin, role: "admin" } } as TrpcContext);
    const proposal = await caller.proposeDraft({ templateId: template.templateId, templateVersion: template.version, proposedDataJson: JSON.stringify(template) });
    const plan = await caller.publishPlan({ proposalId: proposal.id });
    expect(await caller.publishPlan({ proposalId: proposal.id })).toEqual(plan);
    const lookup = { proposalId: proposal.id, planHash: plan.planHash };
    expect(await recovery(admin, lookup)).toEqual({ status: "unresolved" });
    const published = await caller.publish({ proposalId: proposal.id, expectedPlanHash: plan.planHash, confirmation: "PUBLISH_QUEST_TEMPLATE" });
    const recovered = await recovery(admin, lookup);
    expect(recovered).toEqual({ status: "found", plan, receipt: published.receipt });
    expect(await recovery(admin, lookup)).toEqual(recovered);
    expect(await recovery(otherAdmin, lookup)).toEqual({ status: "unresolved" });
    expect(await recovery(admin, { ...lookup, planHash: "0".repeat(64) })).toEqual({ status: "unresolved" });
    const [rows] = await pool.query<RowDataPacket[]>("SELECT receiptHash,resultHash,payloadJson FROM aurionAuthoringReceipts WHERE id=?", [published.receipt.receiptId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.receiptHash).toBe(published.receipt.receiptHash);
    expect(rows[0]!.resultHash).toBe(plan.templateHash);
    await pool.execute("UPDATE aurionAuthoringReceipts SET payloadJson=? WHERE id=?", [JSON.stringify({ ...plan, template: { ...plan.template, title: "Tampered" } }), published.receipt.receiptId]);
    await expect(recovery(admin, lookup)).rejects.toThrow("AUTHORING_RECEIPT_PLAN_INVALID");
    await pool.execute("UPDATE aurionAuthoringReceipts SET payloadJson=?,receiptHash=? WHERE id=?", [rows[0]!.payloadJson, "0".repeat(64), published.receipt.receiptId]);
    await expect(recovery(admin, lookup)).rejects.toThrow("AUTHORING_RECEIPT_HASH_INVALID");
    await pool.execute("UPDATE users SET role='user' WHERE id=?", [admin]);
    await expect(recovery(admin, lookup)).rejects.toThrow("AUTHORING_ADMIN_REQUIRED");
    const [count] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionAuthoringReceipts WHERE kind='quest' AND actorUserId=?", [admin]);
    expect(Number(count[0]!.n)).toBe(1);
  });

  it("exposes canonical target binding so world placements exclude assigned family assets", async () => {
    const caller = aurionAuthoringRouter.createCaller({ user: { id: admin, role: "admin" } } as TrpcContext);
    expect((await caller.catalog()).assets.find(asset => asset.assetId === assetId)).toHaveProperty("targetKey", null);
    const assignmentId = "isolated-world-authoring-family";
    await pool.execute("INSERT INTO glbAssignments (id,assetId,targetType,targetKey,active,assignedByUserId) VALUES (?,?,'arena','starter_lod0',1,?)", [assignmentId, assetId, admin]);
    try {
      const catalog = await caller.catalog();
      expect(catalog.assets.find(asset => asset.assetId === assetId)).toHaveProperty("targetKey", "starter_lod0");
      await expect(planWorldDesign({ ...draft("fixture-bound-family"), expectedCatalogRevision: catalog.glbCatalogRevision }))
        .rejects.toThrow("AUTHORING_WORLD_ASSET_NOT_APPROVED");
    } finally {
      await pool.execute("DELETE FROM glbAssignments WHERE id=?", [assignmentId]);
    }
  });

  it.each(["title", "unsafe-number"])("rejects unpersistable quest %s before saving a proposal", async kind => {
    const service = new AdminQuestStudioService();
    const template = { ...(await service.getTemplates())[0]!, templateId: "inspector-native-quest", version: 1 };
    if (kind === "title") template.title = "t".repeat(256);
    else template.nodes = template.nodes.map(node => node.objective ? { ...node, objective: { ...node.objective, targetValue: 9007199254740992 } } : node);
    expect(QuestTemplateVersionSchema.safeParse(template).success).toBe(false);
    await expect(service.createDraftProposal({ authorUserId: admin, templateId: template.templateId, templateVersion: 1, proposedDataJson: JSON.stringify(template) })).rejects.toThrow();
    const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionQuestAdminProposals WHERE authorUserId=?", [admin]);
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it("pages the canonical version history and reads one publication beyond an 8 MiB active history", async () => {
    const initial = new AdminQuestStudioService();
    const seed = (await initial.getTemplates())[0]!;
    expect((await initial.getAuthoringTemplateVersion(seed)).durable).toBe(false);
    const base = { ...seed, templateId: "inspector-native-quest", description: "x".repeat(55_000) };
    const persist = async (version: number, active: boolean) => {
      const template = QuestTemplateVersionSchema.parse({ ...base, version, active, quarantined: !active });
      await pool.execute("INSERT INTO aurionQuestTemplateVersions (templateId,version,title,description,templateJson,templateHash,active,quarantined) VALUES (?,?,?,?,?,?,?,?)", [template.templateId, version, template.title, template.description, JSON.stringify(template), computeCanonicalHash("aurion.quest.template.v1", template), active, !active]);
      return template;
    };
    for (let version = 1; version <= 160; version++) await persist(version, version < 160);
    const service = new AdminQuestStudioService();
    expect(Buffer.byteLength(JSON.stringify(await service.getTemplates()), "utf8")).toBeGreaterThan(8 * 1024 * 1024);
    const page = Reflect.get(service, "getAuthoringTemplatesPage");
    const target = Reflect.get(service, "getAuthoringTemplateVersion");
    expect(typeof page).toBe("function");
    expect(typeof target).toBe("function");
    const seen: number[] = [];
    let after: unknown = undefined;
    do {
      const result = await page.call(service, { after, limit: 20 });
      expect(result.schemaVersion).toBe("aurion.quest-template-page.v1");
      expect(result.items.length).toBeLessThanOrEqual(20);
      expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThan(32_768);
      for (const item of result.items) if (item.templateId === base.templateId) seen.push(item.version);
      after = result.nextCursor;
    } while (after);
    expect([...new Set(seen)]).toHaveLength(160);
    expect(seen).toContain(160); // Includes the inactive, quarantined version.
    await persist(200, false); // A fresh DB maximum must supersede the hydrated catalog.
    const copied = await target.call(service, { templateId: base.templateId, version: 1 });
    expect(copied.nextVersion).toBe(201);
    expect(copied.templates).toHaveLength(1);
    const conflicting = { ...copied.templates[0], version: 160, title: "Changed occupied version", active: true, quarantined: false };
    await expect(service.createDraftProposal({ authorUserId: admin, templateId: base.templateId, templateVersion: 160, proposedDataJson: JSON.stringify(conflicting) })).rejects.toThrow("QUEST_TEMPLATE_VERSION_CONFLICT");
    const draft = { ...copied.templates[0], version: copied.nextVersion, active: true, quarantined: false };
    const proposal = await service.createDraftProposal({ authorUserId: admin, templateId: base.templateId, templateVersion: draft.version, proposedDataJson: JSON.stringify(draft) });
    const plan = await service.planPublishProposal(proposal.id);
    const published = await service.publishProposal(admin, proposal.id, plan.planHash);
    const readback = await target.call(service, { templateId: base.templateId, version: 201 });
    expect(readback.durable).toBe(true);
    expect(readback.templates).toEqual([published.template]);
    expect(Buffer.byteLength(JSON.stringify(readback), "utf8")).toBeLessThan(128_000);
    const caller = aurionQuestRouter.createCaller({ user: { id: admin, role: "admin" } } as TrpcContext);
    expect((await caller.authoringTemplates({ limit: 20 })).items.length).toBeLessThanOrEqual(20);
    expect((await caller.authoringTemplate({ templateId: base.templateId, version: 201 })).templates).toEqual([published.template]);
    await expect(caller.authoringTemplates({ limit: 21 })).rejects.toThrow();
    const unauthorized = aurionQuestRouter.createCaller({ user: null } as TrpcContext);
    await expect(unauthorized.authoringTemplate({ templateId: base.templateId, version: 201 })).rejects.toThrow();
    // A cold targeted read must not hydrate or trust unrelated graph history.
    await pool.execute("INSERT INTO aurionQuestTemplateVersions (templateId,version,title,description,templateJson,templateHash,active,quarantined) VALUES (?,300,'Corrupt unrelated fixture','','{}',?,0,1)", [base.templateId, "0".repeat(64)]);
    const cold = new AdminQuestStudioService();
    expect((await cold.getAuthoringTemplateVersion({ templateId: base.templateId, version: 201 })).templates).toEqual([published.template]);
    await pool.execute("DELETE FROM aurionQuestTemplateVersions WHERE templateId=? AND version=300", [base.templateId]);
    await pool.execute("DELETE FROM aurionQuestTemplateVersions WHERE templateId=? AND version=201", [base.templateId]);
    expect((await target.call(service, { templateId: base.templateId, version: 201 })).templates).toEqual([]);
  }, 60_000);

  it("reads historical plans and binds new plans and receipts to the actual predecessor", async () => {
    const previous = await seedLegacy("fixture-legacy");
    expect((await readActiveWorldDesign()).designs[0]?.designHash).toBe(previous);
    const next = draft("fixture-legacy", 2);
    const plan = await planWorldDesign(next);
    expect(plan.expectedPreviousHash).toBe(previous);
    const result = await applyWorldDesign(admin, next, plan.planHash);
    expect(result.receipt.previousHash).toBe(previous);
    expect(result.readback.designs[0]).toMatchObject({ designKey: next.designKey, version: 2, designHash: result.receipt.resultHash });
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT planHash, resultHash FROM aurionAuthoringReceipts WHERE id = ?", [result.receipt.receiptId]);
    expect(rows).toEqual([expect.objectContaining({ planHash: plan.planHash, resultHash: result.receipt.resultHash })]);

    // Reactivating the identical old version keeps its original stored hash,
    // while the new operation is still bound to the latest predecessor.
    const oldDraft = draft("fixture-legacy");
    const restorePlan = await planWorldDesign(oldDraft);
    expect(restorePlan.expectedPreviousHash).toBe(result.receipt.resultHash);
    const restored = await applyWorldDesign(admin, oldDraft, restorePlan.planHash);
    expect(restored.receipt.previousHash).toBe(result.receipt.resultHash);
    expect(restored.receipt.resultHash).toBe(previous);
    expect(restored.readback.designs[0]).toMatchObject({ version: 1, designHash: previous });
    const changedSameVersion = { ...oldDraft, title: "Different immutable version" };
    await expect(planWorldDesign(changedSameVersion)).rejects.toThrow("AUTHORING_WORLD_VERSION_CONFLICT");
  });

  it("allows only one of two independently confirmed plans for the same predecessor", async () => {
    const first = draft("fixture-race", 1), second = draft("fixture-race", 2);
    const [a, b] = await Promise.all([planWorldDesign(first), planWorldDesign(second)]);
    expect(a.expectedPreviousHash).toBeNull();
    expect(b.expectedPreviousHash).toBeNull();
    const results = await Promise.allSettled([applyWorldDesign(admin, first, a.planHash), applyWorldDesign(otherAdmin, second, b.planHash)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain("AUTHORING_WORLD_PLAN_CHANGED");
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT COUNT(*) AS count FROM aurionWorldDesignVersions WHERE active = 1 AND designKey = ?", [first.designKey]);
    expect(Number(rows[0]?.count)).toBe(1);
  }, 30_000);

  it("recovers only the same actor's intact receipt and treats absence as unresolved", async () => {
    const candidate = draft("fixture-recovery");
    const operationId = "a".repeat(32);
    const plan = await planWorldDesign(candidate, undefined, operationId);
    const lookup = { designKey: candidate.designKey, version: candidate.version, planHash: plan.planHash, operationId };
    expect(await recoverWorldAuthoringReceipt(admin, lookup)).toEqual({ status: "unresolved" });
    const applied = await applyWorldDesign(admin, candidate, plan.planHash, operationId);
    expect(await recoverWorldAuthoringReceipt(otherAdmin, lookup)).toEqual({ status: "unresolved" });
    expect(await recoverWorldAuthoringReceipt(admin, { ...lookup, planHash: "f".repeat(64) })).toEqual({ status: "unresolved" });
    await expect(recoverWorldAuthoringReceipt(admin, { ...lookup, operationId: "b".repeat(32) })).rejects.toThrow("AUTHORING_RECEIPT_PLAN_INVALID");
    const recovered = await recoverWorldAuthoringReceipt(admin, lookup);
    expect(recovered.status).toBe("found");
    if (recovered.status !== "found") throw new Error("EXPECTED_RECEIPT");
    expect(recovered.receipt).toEqual(applied.receipt);
    expect(recovered.plan).toEqual(plan);
    expect((await readActiveWorldDesign()).designs[0]?.designHash).toBe(applied.receipt.resultHash);
    await pool.execute("UPDATE aurionAuthoringReceipts SET receiptHash = ? WHERE id = ?", ["0".repeat(64), applied.receipt.receiptId]);
    await expect(recoverWorldAuthoringReceipt(admin, lookup)).rejects.toThrow("AUTHORING_RECEIPT_HASH_INVALID");
  });

  it("does not confuse a previous identical no-op with a later apply attempt", async () => {
    const candidate = draft("fixture-attempt");
    const initial = await planWorldDesign(candidate);
    await applyWorldDesign(admin, candidate, initial.planHash);
    const firstId = "1".repeat(32), secondId = "2".repeat(32);
    const first = await planWorldDesign(candidate, undefined, firstId);
    await applyWorldDesign(admin, candidate, first.planHash, firstId);
    const second = await planWorldDesign(candidate, undefined, secondId);
    expect(second.planHash).not.toBe(first.planHash);
    const lookup = { designKey: candidate.designKey, version: candidate.version, planHash: second.planHash, operationId: secondId };
    expect(await recoverWorldAuthoringReceipt(admin, lookup)).toEqual({ status: "unresolved" });
    await applyWorldDesign(admin, candidate, second.planHash, secondId);
    expect((await recoverWorldAuthoringReceipt(admin, lookup)).status).toBe("found");
    await expect(applyWorldDesign(admin, candidate, second.planHash, secondId)).rejects.toThrow("AUTHORING_OPERATION_ALREADY_USED");
  });

  it("serves attempt-bound plan, apply and receipt through the actual tRPC HTTP router", async () => {
    const app = express();
    const testRouter = router({ aurionAuthoring: aurionAuthoringRouter });
    app.use("/api/trpc", createExpressMiddleware({
      router: testRouter,
      createContext: ({ req, res }) => ({ req, res,
        user: req.header("authorization") === "Bearer isolated-admin" ? { id: admin, role: "admin" } : null,
      } as TrpcContext),
    }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("ISOLATED_HTTP_ADDRESS_REQUIRED");
      const endpoint = `http://127.0.0.1:${address.port}/api/trpc/aurionAuthoring.`;
      const post = (method: string, json: unknown, authorized = true) => fetch(endpoint + method, {
        method: "POST", headers: { "content-type": "application/json", ...(authorized ? { authorization: "Bearer isolated-admin" } : {}) },
        body: JSON.stringify({ json }),
      });
      const candidate = draft("fixture-http");
      const operationId = "e".repeat(32);
      expect((await post("worldPlan", { draft: candidate, operationId }, false)).status).toBe(403);
      const planResponse = await post("worldPlan", { draft: candidate, operationId });
      expect(planResponse.status).toBe(200);
      const plan = (await planResponse.json() as any).result.data.json;
      expect(plan.operationId).toBe(operationId);
      const applyResponse = await post("worldApply", { draft: candidate, operationId, expectedPlanHash: plan.planHash, confirmation: "APPLY_WORLD_DESIGN" });
      expect(applyResponse.status).toBe(200);
      const applied = (await applyResponse.json() as any).result.data.json;
      const recovery = await post("worldReceipt", { designKey: candidate.designKey, version: candidate.version, planHash: plan.planHash, operationId });
      expect(recovery.status).toBe(200);
      expect((await recovery.json() as any).result.data.json).toMatchObject({ status: "found", receipt: { receiptId: applied.receipt.receiptId, actorUserId: admin } });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 30_000);

  it("reads the catalog on the lock holder even when the other pool slots wait", async () => {
    const candidate = draft("fixture-pool");
    let entered!: () => void;
    let proceed!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { proceed = resolve; });
    const holder = store.withCatalogFence(async connection => {
      entered();
      await gate;
      return planWorldDesign(candidate, connection);
    });
    await started;
    const waiters = [0, 1].map(() => store.withCatalogFence(async () => true));
    await new Promise(resolve => setTimeout(resolve, 100));
    proceed();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        holder,
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("CATALOG_POOL_STARVATION")), 4_000); }),
      ]);
      expect(result.expectedPreviousHash).toBeNull();
    } finally {
      if (timeout) clearTimeout(timeout);
      await Promise.allSettled([holder, ...waiters]);
    }
  }, 20_000);

  it("keeps the active-world readback usable when two admins compete for the last slot", async () => {
    for (let i = 0; i < 63; i++) await seedLegacy(`fixture-seed-${String(i).padStart(2, "0")}`);
    const first = draft("fixture-slot-one"), second = draft("fixture-slot-two");
    const [a, b] = await Promise.all([planWorldDesign(first), planWorldDesign(second)]);
    const results = await Promise.allSettled([applyWorldDesign(admin, first, a.planHash), applyWorldDesign(otherAdmin, second, b.planHash)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain("AUTHORING_WORLD_ACTIVE_LIMIT");
    expect((await readActiveWorldDesign()).designs).toHaveLength(64);
    await expect(planWorldDesign(draft("fixture-slot-three"))).rejects.toThrow("AUTHORING_WORLD_ACTIVE_LIMIT");
    expect((await planWorldDesign(draft("fixture-seed-00", 2))).expectedPreviousHash).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  // Placement stage A: free admin placement, removal and group retirement through the
  // real planner, fence and receipts.
  it("places, removes and retires admin placements, and never revives a retired group", async () => {
    const random = (() => { let n = 0; return () => ((n++ * 7) % 16) / 16; })();
    const place = async (x: number) => {
      const readback = await readActiveWorldDesign();
      const draft = buildPlacementDraft(readback, catalogRevision, { assetId, worldXMm: x, worldZMm: -2_000, rotationQuarterTurns: 2, scalePermille: 1_250 }, random);
      const plan = await planWorldDesign(draft, undefined, String(x).padStart(32, "0"));
      return { draft, applied: await applyWorldDesign(admin, draft, plan.planHash, plan.operationId) };
    };
    const first = await place(1_000);
    const second = await place(3_000);
    expect(second.draft.designKey).toBe(first.draft.designKey);
    const group = second.applied.readback.designs.find(design => design.designKey === first.draft.designKey)!;
    expect(group).toMatchObject({ version: 2 });
    expect(group.placements).toHaveLength(2);

    const removal = buildRemovalPlan(await readActiveWorldDesign(), catalogRevision, group.designKey, group.placements[0]!.placementKey);
    if (removal.kind !== "draft") throw new Error("expected a version without the object");
    const removalPlan = await planWorldDesign(removal.draft);
    const removed = await applyWorldDesign(admin, removal.draft, removalPlan.planHash);
    const remaining = removed.readback.designs.find(design => design.designKey === group.designKey)!;
    expect(remaining.placements.map(p => p.placementKey)).toEqual([group.placements[1]!.placementKey]);

    const last = buildRemovalPlan(removed.readback, catalogRevision, group.designKey, remaining.placements[0]!.placementKey);
    expect(last).toEqual({ kind: "retire", designKey: group.designKey, expectedDesignHash: remaining.designHash, droppedUnavailable: 0 });
    if (last.kind !== "retire") throw new Error("expected retirement");
    await expect(retireAdminPlacementDesign(admin, last.designKey, "f".repeat(64))).rejects.toThrow("AUTHORING_WORLD_PREDECESSOR_CHANGED");
    const retired = await retireAdminPlacementDesign(admin, last.designKey, last.expectedDesignHash);
    expect(retired.readback.designs.some(design => design.designKey === group.designKey)).toBe(false);
    expect(retired.receipt).toMatchObject({ kind: "world", action: "retire", previousHash: remaining.designHash, actorUserId: admin });
    const [receipts] = await pool.execute<RowDataPacket[]>("SELECT action, targetId FROM aurionAuthoringReceipts WHERE id = ?", [retired.receipt.receiptId]);
    expect(receipts).toEqual([expect.objectContaining({ action: "retire", targetId: `${group.designKey}:v${remaining.version}` })]);
    // History stays; nothing is active any more.
    const [history] = await pool.execute<RowDataPacket[]>("SELECT COUNT(*) AS total, SUM(active) AS active FROM aurionWorldDesignVersions WHERE designKey = ?", [group.designKey]);
    expect(Number(history[0]?.total)).toBe(3); // v1, v2 (placed), v3 (removed); retirement adds no version
    expect(Number(history[0]?.active ?? 0)).toBe(0);

    // A stale tab still showing the group tries to add to it: the server refuses to revive it.
    const stale = buildPlacementDraft(removed.readback, catalogRevision, { assetId, worldXMm: 5_000, worldZMm: 0, rotationQuarterTurns: 0, scalePermille: 1_000 }, random);
    expect(stale.designKey).toBe(group.designKey);
    await expect(planWorldDesign(stale)).rejects.toThrow("AUTHORING_WORLD_ADMIN_GROUP_RETIRED");
    // A fresh placement opens a new group.
    const fresh = await place(7_000);
    expect(fresh.draft.designKey).not.toBe(group.designKey);
    expect(fresh.draft.version).toBe(1);
    await expect(retireAdminPlacementDesign(admin, "fixture-not-admin", "a".repeat(64))).rejects.toThrow("AUTHORING_WORLD_RETIRE_NOT_ADMIN_PLACEMENTS");
    await pool.execute("UPDATE users SET role = 'user' WHERE id = ?", [admin]);
    const freshHead = (await readActiveWorldDesign()).designs.find(design => design.designKey === fresh.draft.designKey)!;
    await expect(retireAdminPlacementDesign(admin, freshHead.designKey, freshHead.designHash)).rejects.toThrow("AUTHORING_ADMIN_REQUIRED");
    expect((await readActiveWorldDesign()).designs.some(design => design.designKey === fresh.draft.designKey)).toBe(true);
  }, 30_000);

  // Stage B: NPC shells are World Designs `npc.shells.*` holding only free NPC figures.
  it("stores NPC shells only in shell groups, only with free NPC figures, and retires them like objects", async () => {
    const shellInput = { assetId: shellAssetId, worldXMm: 4_000, worldZMm: -1_000, rotationQuarterTurns: 1 as const, scalePermille: 1_000 };
    const shellDraft = buildPlacementDraft(null, catalogRevision, shellInput, () => 0.4, "npc-shell");
    expect(shellDraft.designKey).toMatch(/^npc\.shells\./);
    const applied = await applyWorldDesign(admin, shellDraft, (await planWorldDesign(shellDraft)).planHash);
    const group = applied.readback.designs.find(design => design.designKey === shellDraft.designKey)!;
    expect(group.placements).toEqual([expect.objectContaining({ assetId: shellAssetId, rotationQuarterTurns: 1 })]);
    // A prop in a shell group, a figure in an object group or in a regular World Design: refused.
    await expect(planWorldDesign(buildPlacementDraft(null, catalogRevision, { ...shellInput, assetId }, () => 0.6, "npc-shell"))).rejects.toThrow("AUTHORING_WORLD_ASSET_NOT_APPROVED");
    await expect(planWorldDesign(buildPlacementDraft(null, catalogRevision, shellInput, () => 0.7, "object"))).rejects.toThrow("AUTHORING_WORLD_ASSET_NOT_APPROVED");
    const regular = draft("fixture-figure");
    regular.placements = [{ ...regular.placements[0]!, assetId: shellAssetId }];
    await expect(planWorldDesign(regular)).rejects.toThrow("AUTHORING_WORLD_ASSET_NOT_APPROVED");
    // Retire the shell group; a stale tab cannot revive it.
    const retired = await retireAdminPlacementDesign(admin, group.designKey, group.designHash);
    expect(retired.readback.designs.some(design => design.designKey === group.designKey)).toBe(false);
    const stale = buildPlacementDraft(applied.readback, catalogRevision, { ...shellInput, worldXMm: 6_000 }, () => 0.8, "npc-shell");
    expect(stale.designKey).toBe(group.designKey);
    await expect(planWorldDesign(stale)).rejects.toThrow("AUTHORING_WORLD_ADMIN_GROUP_RETIRED");
  }, 30_000);

  // Derived (stage B review): a model withdrawn from the catalog made the server reject
  // every new version of its group, and placing always targeted that group.
  it("keeps placing and removing possible after a placed model is withdrawn from the catalog", async () => {
    const crateBase64 = testGlb("Aurion_Crate_Prop").toString("base64");
    const cratePlan = await buildGlbImportPlan(crateBase64, "world-environment", "Aurion_Crate_Prop.glb");
    const crate = await store.ingest(admin, { displayName: "Isolated crate", fileName: "Aurion_Crate_Prop.glb", contentBase64: crateBase64, purpose: "world-environment", expectedPlanSha256: cratePlan.planSha256 });
    try {
      catalogRevision = (await store.catalog()).revision;
      const place = async (readback: Awaited<ReturnType<typeof readActiveWorldDesign>> | null, asset: string, x: number, available?: (id: string) => boolean) => {
        const next = buildPlacementDraft(readback, catalogRevision, { assetId: asset, worldXMm: x, worldZMm: 0, rotationQuarterTurns: 0, scalePermille: 1_000 }, undefined, "object", available);
        return { next, applied: await applyWorldDesign(admin, next, (await planWorldDesign(next)).planHash) };
      };
      const first = await place(null, assetId, 1_000);
      const second = await place(first.applied.readback, crate.assetId, 2_000);
      expect(second.next.designKey).toBe(first.next.designKey);
      await store.review(admin, { assetId: crate.assetId, status: "archived" });
      const catalog = await store.catalog();
      catalogRevision = catalog.revision;
      const available = (id: string) => catalog.entries.some(entry => entry.assetId === id && placementKindOfAsset(entry) !== null);
      const readback = await readActiveWorldDesign();
      // Without availability the draft targets the blocked group, and the server refuses it.
      const blocked = buildPlacementDraft(readback, catalogRevision, { assetId, worldXMm: 3_000, worldZMm: 0, rotationQuarterTurns: 0, scalePermille: 1_000 });
      expect(blocked.designKey).toBe(first.next.designKey);
      await expect(planWorldDesign(blocked)).rejects.toThrow("AUTHORING_WORLD_ASSET_NOT_APPROVED");
      // With availability it opens a fresh group and succeeds.
      const third = await place(readback, assetId, 3_000, available);
      expect(third.next.designKey).not.toBe(first.next.designKey);
      // Removing the barrel from the blocked group also clears the invisible crate: the group retires.
      const removal = buildRemovalPlan(third.applied.readback, catalogRevision, first.next.designKey, first.next.placements[0]!.placementKey, available);
      expect(removal).toMatchObject({ kind: "retire", droppedUnavailable: 1 });
      if (removal.kind !== "retire") throw new Error("expected retirement");
      const retired = await retireAdminPlacementDesign(admin, removal.designKey, removal.expectedDesignHash);
      expect(retired.readback.designs.map(design => design.designKey)).toEqual([third.next.designKey]);
    } finally {
      await store.review(admin, { assetId: crate.assetId, status: "approved" }).catch(() => undefined);
      catalogRevision = (await store.catalog()).revision;
    }
  }, 30_000);

  it("serializes a retirement with a concurrent addition to the same group", async () => {
    const draft1 = buildPlacementDraft(null, catalogRevision, { assetId, worldXMm: 0, worldZMm: 0, rotationQuarterTurns: 0, scalePermille: 1_000 }, () => 0.3);
    const plan1 = await planWorldDesign(draft1);
    const head = (await applyWorldDesign(admin, draft1, plan1.planHash)).readback.designs.find(design => design.designKey === draft1.designKey)!;
    const addition = buildPlacementDraft({ schemaVersion: "aurion.world-design.v1", revision: "0".repeat(64), designs: [head] }, catalogRevision,
      { assetId, worldXMm: 2_000, worldZMm: 0, rotationQuarterTurns: 0, scalePermille: 1_000 }, () => 0.6);
    const additionPlan = await planWorldDesign(addition);
    const results = await Promise.allSettled([
      applyWorldDesign(otherAdmin, addition, additionPlan.planHash),
      retireAdminPlacementDesign(admin, head.designKey, head.designHash),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/AUTHORING_WORLD_(PREDECESSOR_CHANGED|PLAN_CHANGED|ADMIN_GROUP_RETIRED)/); // retire first: the addition may not revive the group
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT COUNT(*) AS count FROM aurionWorldDesignVersions WHERE active = 1 AND designKey = ?", [head.designKey]);
    expect(Number(rows[0]?.count)).toBeLessThanOrEqual(1);
  }, 30_000);

  it("serves the group retirement only to admins and only with explicit confirmation", async () => {
    const app = express();
    app.use("/api/trpc", createExpressMiddleware({
      router: router({ aurionAuthoring: aurionAuthoringRouter }),
      createContext: ({ req, res }) => ({ req, res, user: req.header("authorization") === "Bearer isolated-admin" ? { id: admin, role: "admin" } : null } as TrpcContext),
    }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("ISOLATED_HTTP_ADDRESS_REQUIRED");
      const post = (json: unknown, authorized = true) => fetch(`http://127.0.0.1:${address.port}/api/trpc/aurionAuthoring.worldRetireAdminPlacements`, {
        method: "POST", headers: { "content-type": "application/json", ...(authorized ? { authorization: "Bearer isolated-admin" } : {}) }, body: JSON.stringify({ json }) });
      const draft1 = buildPlacementDraft(null, catalogRevision, { assetId, worldXMm: 0, worldZMm: 0, rotationQuarterTurns: 0, scalePermille: 1_000 }, () => 0.9);
      const head = (await applyWorldDesign(admin, draft1, (await planWorldDesign(draft1)).planHash)).readback.designs.find(design => design.designKey === draft1.designKey)!;
      const input = { designKey: head.designKey, expectedDesignHash: head.designHash, confirmation: "RETIRE_ADMIN_PLACEMENTS" };
      expect((await post(input, false)).status).toBe(403);
      expect((await post({ ...input, confirmation: "YES" })).status).toBe(400);
      expect((await post({ ...input, designKey: "fixture-world" })).status).toBe(400);
      const response = await post(input);
      expect(response.status).toBe(200);
      expect((await response.json() as any).result.data.json.receipt).toMatchObject({ action: "retire", actorUserId: admin });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 30_000);

  it("rejects plans that exceed the persisted TEXT byte limit before confirmation", async () => {
    const large = draft("fixture-large");
    large.placements = Array.from({ length: 256 }, (_, i) => ({
      ...large.placements[0]!, placementKey: `a${String(i).padStart(3, "0")}${"x".repeat(92)}`,
      chunkX: -100000, chunkZ: -100000, xMm: 63999, zMm: 63999, rotationQuarterTurns: 3 as const, scalePermille: 4000,
    }));
    expect(WorldDesignDraftSchema.safeParse(large).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(large), "utf8")).toBeGreaterThan(65_535);
    await expect(planWorldDesign(large)).rejects.toThrow("AUTHORING_WORLD_PLAN_TOO_LARGE");
  });

  it("rechecks the actor role inside the committing transaction", async () => {
    const candidate = draft("fixture-role");
    const plan = await planWorldDesign(candidate);
    await pool.execute("UPDATE users SET role = 'user' WHERE id = ?", [admin]);
    await expect(applyWorldDesign(admin, candidate, plan.planHash)).rejects.toThrow("AUTHORING_ADMIN_REQUIRED");
    expect((await readActiveWorldDesign()).designs).toHaveLength(0);
  });

  it("waits for a concurrent role revocation before deciding whether to commit", async () => {
    const candidate = draft("fixture-role-race");
    const plan = await planWorldDesign(candidate);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE users SET role = 'user' WHERE id = ?", [admin]);
      let completed = false;
      const applying = applyWorldDesign(admin, candidate, plan.planHash).then(
        value => { completed = true; return { value }; },
        error => { completed = true; return { error }; },
      );
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(completed).toBe(false);
      await connection.commit();
      const outcome = await applying;
      expect(String(outcome.error)).toContain("AUTHORING_ADMIN_REQUIRED");
      expect((await readActiveWorldDesign()).designs).toHaveLength(0);
    } finally {
      await connection.rollback();
      connection.release();
    }
  }, 30_000);

  it("rejects a confirmed plan after its catalog asset is archived", async () => {
    const candidate = draft("fixture-catalog");
    const plan = await planWorldDesign(candidate);
    try {
      await store.review(admin, { assetId, status: "archived" });
      await expect(applyWorldDesign(admin, candidate, plan.planHash)).rejects.toThrow("AUTHORING_GLB_CATALOG_CHANGED");
      expect((await readActiveWorldDesign()).designs).toHaveLength(0);
    } finally {
      await store.review(admin, { assetId, status: "approved" });
      catalogRevision = (await store.catalog()).revision;
    }
  }, 30_000);

  it("does not apply against an asset archived behind the shared catalog fence", async () => {
    const candidate = draft("fixture-catalog-race");
    const plan = await planWorldDesign(candidate);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const archive = store.withCatalogFence(async connection => {
      await connection.beginTransaction();
      try {
        await connection.execute("UPDATE glbAssets SET status = 'archived' WHERE id = ?", [assetId]);
        entered();
        await gate;
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
    await started;
    try {
      let completed = false;
      const applying = applyWorldDesign(admin, candidate, plan.planHash).then(
        value => { completed = true; return { value }; },
        error => { completed = true; return { error }; },
      );
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(completed).toBe(false);
      release();
      await archive;
      const outcome = await applying;
      expect(String(outcome.error)).toContain("AUTHORING_GLB_CATALOG_CHANGED");
      expect((await readActiveWorldDesign()).designs).toHaveLength(0);
    } finally {
      release();
      await archive;
      await store.review(admin, { assetId, status: "approved" });
      catalogRevision = (await store.catalog()).revision;
    }
  }, 30_000);

  async function seedSubmission(id: string) {
    const bytes = testGlb("Aurion_Statue_Prop");
    const planned = await buildGlbImportPlan(bytes.toString("base64"), "auto", "Aurion_Statue_Prop.glb");
    await pool.execute(
      "INSERT INTO glbAssetSubmissions (id, submittedByUserId, assetType, subcategory, displayName, description, visibility, storageKey, storageUrl, sha256, bytes) VALUES (?, ?, ?, ?, ?, ?, 'public', ?, ?, ?, ?)",
      [id, otherAdmin, planned.assetType, planned.subcategory, "Aurion_Statue_Prop.glb", "Isolated test asset", `fixture/${id}`, `/fixture/${id}`, planned.sha256, bytes.length],
    );
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://fixture.invalid/asset.glb");
    return { bytes, sha256: planned.sha256 };
  }

  it("commits a validated player submission and its file through the catalog fence", async () => {
    const fixture = await seedSubmission("fixture-submit-good");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(fixture.bytes));
    const result = await reviewPlayerGlbSubmission({ submissionId: "fixture-submit-good", reviewedByUserId: admin, decision: "approved" });
    expect(result.approved).toBe(true);
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT status, sha256 FROM glbAssets WHERE id = ?", [result.assetId]);
    expect(rows).toEqual([expect.objectContaining({ status: "approved", sha256: fixture.sha256 })]);
    expect((await store.catalog()).entries.some(entry => entry.assetId === result.assetId)).toBe(true);
  }, 30_000);

  it("does not hold the catalog fence during download and refuses a revoked reviewer", async () => {
    const fixture = await seedSubmission("fixture-submit-role");
    let started!: () => void;
    let complete!: () => void;
    const downloading = new Promise<void>(resolve => { started = resolve; });
    const response = new Promise<Response>(resolve => { complete = () => resolve(new Response(fixture.bytes)); });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => { started(); return response; });
    const operation = reviewPlayerGlbSubmission({ submissionId: "fixture-submit-role", reviewedByUserId: admin, decision: "approved" });
    await downloading;
    try {
      await pool.execute("UPDATE users SET role = 'user' WHERE id = ?", [admin]);
      expect(await store.withCatalogFence(async () => "available")).toBe("available");
    } finally {
      complete();
    }
    await expect(operation).rejects.toThrow("GLB_ADMIN_REQUIRED");
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT status, approvedAssetId FROM glbAssetSubmissions WHERE id = ?", ["fixture-submit-role"]);
    expect(rows).toEqual([expect.objectContaining({ status: "pending", approvedAssetId: null })]);
  }, 30_000);

  it("does not approve a player asset beyond the shared 500-GLB capacity", async () => {
    const fixture = await seedSubmission("fixture-submit-capacity");
    const values: unknown[] = [];
    const tuples = Array.from({ length: 499 }, (_, index) => {
      const hash = (index + 1).toString(16).padStart(64, "0");
      values.push(`glb_capacity_${index}`, `Capacity ${index}`, `local-glb/${hash}.glb`, `/api/assets/glb/${hash}.glb`, hash, otherAdmin);
      return "(?, ?, 'arena', ?, ?, ?, 12, 'approved', ?)";
    });
    await pool.execute(`INSERT INTO glbAssets (id, displayName, assetType, storageKey, storageUrl, sha256, bytes, status, createdByUserId) VALUES ${tuples.join(",")}`, values);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(fixture.bytes));
    await expect(reviewPlayerGlbSubmission({ submissionId: "fixture-submit-capacity", reviewedByUserId: admin, decision: "approved" })).rejects.toThrow("GLB_CATALOG_LIMIT");
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT status, approvedAssetId FROM glbAssetSubmissions WHERE id = ?", ["fixture-submit-capacity"]);
    expect(rows).toEqual([expect.objectContaining({ status: "pending", approvedAssetId: null })]);
  }, 30_000);
});
