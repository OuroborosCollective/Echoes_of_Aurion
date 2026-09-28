// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import {
  createPool,
  type Pool,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import type { Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { issueGlbAgentSession } from "./glbAgentSession";
import { registerGlbSmartUpload } from "./glbSmartUpload";
import { registerGlbAssetRoutes } from "./glbAssetRoutes";
import { GlbImportStore, glbImportStore } from "./glbImportStore";
import { testAnimatedPlayerGlb } from "./glbImportFixtures";
import { glbManager } from "../client/src/xaurion/core/GLBModelManager";
import { releaseGlbTree } from "../client/src/xaurion/core/GlbModelLease";
import * as THREE from "three";

const enabled = process.env.AURION_GLB_DB_TEST === "1";
const ADMIN_OPEN_ID = "issue-9-glb-governance-admin";
const MEMBER_OPEN_ID = "issue-9-glb-governance-member";
const JWT_SECRET = "issue-9-isolated-integration-secret-0123456789";
const originalFetch = globalThis.fetch.bind(globalThis);
const originalJwtSecret = process.env.JWT_SECRET;
const originalStorageRoot = process.env.AURION_GLB_STORAGE_DIR;
const originalDatabaseUrl = process.env.DATABASE_URL;

describe.skipIf(!enabled)(
  "GLB review, assignment and active runtime E2E",
  () => {
    let pool: Pool;
    let store: GlbImportStore;
    let storageRoot: string;
    let server: Server;
    let baseUrl: string;
    let adminId: number;
    let memberId: number;
    let adminToken: string;
    let memberToken: string;
    let runtimeLease: THREE.Group | undefined;

    async function post(
      pathname: string,
      token: string,
      body: unknown
    ): Promise<Response> {
      return originalFetch(new URL(pathname, baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    async function removePriorFixtureRows(ids: readonly number[]) {
      if (!ids.length) return;
      const placeholders = ids.map(() => "?").join(", ");
      await pool.execute(
        `DELETE FROM glbAssignments WHERE assignedByUserId IN (${placeholders}) OR assetId IN (SELECT id FROM glbAssets WHERE createdByUserId IN (${placeholders}))`,
        [...ids, ...ids]
      );
      await pool.execute(
        `DELETE FROM glbAssets WHERE createdByUserId IN (${placeholders})`,
        [...ids]
      );
      await pool.execute(
        `DELETE FROM playerProfiles WHERE userId IN (${placeholders})`,
        [...ids]
      );
      await pool.execute(`DELETE FROM users WHERE id IN (${placeholders})`, [
        ...ids,
      ]);
    }

    beforeAll(async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error("ISOLATED_GLB_DATABASE_REQUIRED");
      const parsedUrl = new URL(databaseUrl);
      if (
        parsedUrl.hostname !== "127.0.0.1" ||
        parsedUrl.pathname !== "/aurion_glb_test"
      )
        throw new Error("ISOLATED_GLB_DATABASE_REQUIRED");

      pool = createPool(databaseUrl);
      const [databaseRows] = await pool.query<RowDataPacket[]>(
        "SELECT DATABASE() AS name"
      );
      expect(databaseRows[0]?.name).toBe("aurion_glb_test");
      const [priorUsers] = await pool.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE openId IN (?, ?)",
        [ADMIN_OPEN_ID, MEMBER_OPEN_ID]
      );
      await removePriorFixtureRows(priorUsers.map(user => Number(user.id)));

      const [admin] = await pool.execute<ResultSetHeader>(
        "INSERT INTO users (openId, role) VALUES (?, 'admin')",
        [ADMIN_OPEN_ID]
      );
      adminId = admin.insertId;
      const [member] = await pool.execute<ResultSetHeader>(
        "INSERT INTO users (openId, role) VALUES (?, 'user')",
        [MEMBER_OPEN_ID]
      );
      memberId = member.insertId;
      await pool.execute(
        "INSERT INTO playerProfiles (userId, level, totalXp, aurionPoints, victories, seasonPoints, selectedClass) VALUES (?, 17, 1920, 83, 5, 4, 'unbound')",
        [memberId]
      );

      storageRoot = await mkdtemp(path.join(tmpdir(), "aurion-glb-issue-9-"));
      process.env.DATABASE_URL = databaseUrl;
      process.env.JWT_SECRET = JWT_SECRET;
      process.env.AURION_GLB_STORAGE_DIR = storageRoot;
      store = new GlbImportStore(databaseUrl, storageRoot);
      adminToken = (await issueGlbAgentSession(adminId, JWT_SECRET)).token;
      memberToken = (await issueGlbAgentSession(memberId, JWT_SECRET)).token;

      const app = express();
      app.use(express.json({ limit: "50mb" }));
      registerGlbSmartUpload(app);
      registerGlbAssetRoutes(app);
      server = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("GLB_E2E_SERVER_ADDRESS_UNAVAILABLE");
      baseUrl = `http://127.0.0.1:${address.port}/`;

      // Browser-origin resolution only: requests still traverse the live Express routes,
      // MariaDB metadata and immutable file store; no response or persistence is mocked.
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = input instanceof Request ? input.url : String(input);
        return originalFetch(new URL(requestUrl, baseUrl), init);
      }) as typeof fetch;
    });

    afterAll(async () => {
      globalThis.fetch = originalFetch;
      if (runtimeLease) releaseGlbTree(runtimeLease);
      glbManager.trimIdle();
      if (server?.listening) {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      if (storageRoot && process.env.DATABASE_URL) {
        try {
          await glbImportStore().close();
        } catch {
          /* only close a pool created by a successful route call */
        }
      }
      if (store) await store.close();
      if (pool) {
        if (adminId && memberId)
          await removePriorFixtureRows([adminId, memberId]);
        await pool.end();
      }
      if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
      if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalJwtSecret;
      if (originalStorageRoot === undefined)
        delete process.env.AURION_GLB_STORAGE_DIR;
      else process.env.AURION_GLB_STORAGE_DIR = originalStorageRoot;
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    });

    it("requires authenticated review, persists audit/assignment, and decodes only approved stored bytes", async () => {
      const bytes = testAnimatedPlayerGlb("Lyra_character_questgiver", true);
      const contentBase64 = bytes.toString("base64");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const [profileBeforeRows] = await pool.execute<RowDataPacket[]>(
        "SELECT userId, level, totalXp, aurionPoints, victories, seasonPoints, selectedClass, updatedAt FROM playerProfiles WHERE userId = ?",
        [memberId]
      );
      const profileBefore = profileBeforeRows[0];

      const deniedPlan = await post("/api/admin/glb-import/plan", memberToken, {
        contentBase64,
        fileName: "Lyra_character_questgiver.glb",
        purpose: "npc-fallback",
      });
      expect(deniedPlan.ok).toBe(false);

      const invalidPlan = await post("/api/admin/glb-import/plan", adminToken, {
        contentBase64: Buffer.from("not-a-glb").toString("base64"),
        fileName: "Incomplete.glb",
        purpose: "npc-fallback",
      });
      expect(invalidPlan.status).toBe(422);
      const [beforeIngest] = await pool.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS count FROM glbAssets WHERE createdByUserId = ?",
        [adminId]
      );
      expect(Number(beforeIngest[0]?.count)).toBe(0);

      const planResponse = await post(
        "/api/admin/glb-import/plan",
        adminToken,
        {
          contentBase64,
          fileName: "Lyra_character_questgiver.glb",
          purpose: "npc-fallback",
        }
      );
      expect(planResponse.status).toBe(200);
      const plan = (await planResponse.json()) as {
        planSha256: string;
        sha256: string;
        bytes: number;
        assetType: string;
      };
      expect(plan).toMatchObject({
        sha256,
        bytes: bytes.length,
        assetType: "character",
      });

      const applyResponse = await post(
        "/api/admin/glb-import/apply",
        adminToken,
        {
          displayName: "Lyra Keeper of the Observatory",
          contentBase64,
          fileName: "Lyra_character_questgiver.glb",
          purpose: "npc-fallback",
          expectedPlanSha256: plan.planSha256,
        }
      );
      expect(applyResponse.status).toBe(200);
      const receipt = (await applyResponse.json()) as {
        assetId: string;
        sha256: string;
        bytes: number;
        targetKey: string | null;
      };
      expect(receipt).toMatchObject({
        sha256,
        bytes: bytes.length,
        targetKey: null,
      });

      const [metadataBeforeReview] = await pool.execute<RowDataPacket[]>(
        "SELECT id, status, sha256, bytes, createdByUserId, reviewedByUserId, reviewedAt FROM glbAssets WHERE id = ?",
        [receipt.assetId]
      );
      expect(metadataBeforeReview[0]).toMatchObject({
        id: receipt.assetId,
        status: "approved",
        sha256,
        bytes: bytes.length,
        createdByUserId: adminId,
        reviewedByUserId: adminId,
        reviewedAt: expect.any(Date),
      });

      await expect(
        store.review(memberId, { assetId: receipt.assetId, status: "rejected" })
      ).rejects.toThrow("GLB_ADMIN_REQUIRED");
      await expect(
        store.assignNamedNpcVisual(memberId, {
          assetId: receipt.assetId,
          npcId: "e2e_glb_governance",
          expectedActiveAssetId: null,
        })
      ).rejects.toThrow("GLB_ADMIN_REQUIRED");

      await store.review(adminId, {
        assetId: receipt.assetId,
        status: "rejected",
      });
      const rejectedBytes = await originalFetch(
        new URL(`/api/assets/glb/${sha256}.glb`, baseUrl)
      );
      expect(rejectedBytes.status).toBe(404);
      expect(await store.approvedBytes(sha256)).toBeNull();
      const rejectedCatalogResponse = await originalFetch(
        new URL("/api/game/glb-catalog", baseUrl)
      );
      const rejectedCatalog = (await rejectedCatalogResponse.json()) as {
        entries: Array<{ assetId: string }>;
      };
      expect(
        rejectedCatalog.entries.some(entry => entry.assetId === receipt.assetId)
      ).toBe(false);
      expect(
        (await glbManager.fetchCatalog()).some(
          entry => entry.id === receipt.assetId
        )
      ).toBe(false);
      await expect(glbManager.loadModel(receipt.assetId)).rejects.toThrow(
        "GLB_SOURCE_HASH_REQUIRED"
      );

      await store.review(adminId, {
        assetId: receipt.assetId,
        status: "approved",
      });
      const [approvedReadback] = await pool.execute<RowDataPacket[]>(
        "SELECT status, reviewedByUserId, reviewedAt, sha256, bytes FROM glbAssets WHERE id = ?",
        [receipt.assetId]
      );
      expect(approvedReadback[0]).toMatchObject({
        status: "approved",
        reviewedByUserId: adminId,
        sha256,
        bytes: bytes.length,
      });
      expect(approvedReadback[0]?.reviewedAt).toBeTruthy();
      expect(await store.approvedBytes(sha256)).toEqual(bytes);

      const assignment = await store.assignNamedNpcVisual(adminId, {
        assetId: receipt.assetId,
        npcId: "e2e_glb_governance",
        expectedActiveAssetId: null,
      });
      expect(assignment).toMatchObject({
        assetId: receipt.assetId,
        targetKey: "npc_e2e_glb_governance",
        active: 1,
        changed: true,
      });
      const [assignmentReadback] = await pool.execute<RowDataPacket[]>(
        "SELECT assetId, targetType, targetKey, active, assignedByUserId FROM glbAssignments WHERE assetId = ? AND targetKey = ? AND active = 1",
        [receipt.assetId, "npc_e2e_glb_governance"]
      );
      expect(assignmentReadback).toEqual([
        expect.objectContaining({
          assetId: receipt.assetId,
          targetType: "character",
          targetKey: "npc_e2e_glb_governance",
          active: 1,
          assignedByUserId: adminId,
        }),
      ]);

      const response = await originalFetch(
        new URL(`/api/assets/glb/${sha256}.glb`, baseUrl)
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("model/gltf-binary");
      expect(response.headers.get("content-length")).toBe(String(bytes.length));
      const servedBytes = Buffer.from(await response.arrayBuffer());
      expect(createHash("sha256").update(servedBytes).digest("hex")).toBe(
        sha256
      );
      expect(servedBytes).toEqual(bytes);

      const runtimeCatalog = await glbManager.fetchCatalog();
      expect(
        runtimeCatalog.find(entry => entry.id === receipt.assetId)
      ).toMatchObject({
        url: `/api/assets/glb/${sha256}.glb`,
        status: "approved",
      });
      const loaded = await glbManager.loadModel(receipt.assetId);
      runtimeLease = loaded.scene;
      const runtimeScene = new THREE.Scene();
      runtimeScene.add(loaded.scene);
      runtimeScene.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      loaded.scene.traverse(node => {
        if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
      });
      const dimensions = new THREE.Box3()
        .setFromObject(runtimeScene)
        .getSize(new THREE.Vector3());
      expect(meshes.length).toBeGreaterThan(0);
      expect(dimensions.x + dimensions.y + dimensions.z).toBeGreaterThan(0);
      expect(loaded.animations.map(clip => clip.name)).toEqual([
        "Idle",
        "Walk",
        "Attack",
      ]);
      runtimeScene.remove(loaded.scene);
      releaseGlbTree(loaded.scene);
      runtimeLease = undefined;
      glbManager.trimIdle();

      const [profileAfterRows] = await pool.execute<RowDataPacket[]>(
        "SELECT userId, level, totalXp, aurionPoints, victories, seasonPoints, selectedClass, updatedAt FROM playerProfiles WHERE userId = ?",
        [memberId]
      );
      expect(profileAfterRows[0]).toEqual(profileBefore);
    }, 45_000);
  }
);
