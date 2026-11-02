import { createPool } from "mysql2/promise";
import { afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import { and,eq } from "drizzle-orm";
import { getDb, resolveAndRecordGlobalWorldEpoch, recordWorldChunkDelta } from "./db";
import { aurionActiveCivilizations, aurionCivilizationHistoryEvents, aurionExplorationMemoryProjections, aurionGlobalWorldEpochReceipts, aurionGlobalWorldStates, aurionRuinOrigins, aurionSettlementRebirthCandidates, aurionWorldChunkDeltas, aurionWorldEpochReactions, aurionWorldEpochRequests } from "../drizzle/schema";
import { aurionCausalTickReceipts, aurionGlobalStateProofs } from "../drizzle/aurionCausalitySchema";
import { createExplorationMemoryRecord } from "../shared/explorationMemoryProtocol";
import { recordExplorationDiscovery, readExplorationMemory } from "./explorationMemoryPersistence";
import { MariaDBCausalPersistenceAdapter } from "./causality/persistence";
import { globalZoneRegistry } from "./zoneRuntime";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { worldCausalRootService } from "./causality/worldCausalRootService";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "../shared/const";
import { registerGlbSmartUpload } from "./glbSmartUpload";
import { orderCanonicalZoneIntents } from "../shared/aurionZoneIntentContract";

const suite=process.env.AURION_EXPLORATION_MEMORY_E2E==="1"&&process.env.DATABASE_URL?describe:describe.skip;

suite("Issue 323 Phase H exploration memory",()=>{
  let pool:any;
  beforeAll(async()=>{
    const url=new URL(process.env.DATABASE_URL!);
    if(url.hostname!=="127.0.0.1"||!url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool=createPool(process.env.DATABASE_URL!);
    const [rows]=await pool.query("SELECT DATABASE() AS name");
    if(rows[0]?.name!==url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  });
  beforeEach(async()=>{
    await pool.query("TRUNCATE TABLE aurionExplorationMemoryProjections");
  });
  afterAll(async()=>{if(pool){await pool.query("TRUNCATE TABLE aurionExplorationMemoryProjections");await pool.end();}});
  // This suite and worldEpochReaction.e2e share an isolated MariaDB database in CI.
  // Keep the epoch receipt assertions strict: delete our own persisted fixtures,
  // rather than accepting unrelated chunk receipts in the next Vitest process.
  afterEach(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");
    const worldId = "echoes-of-aurion-global";
    const ownChunk = and(
      eq(aurionWorldChunkDeltas.worldId, worldId),
      eq(aurionWorldChunkDeltas.chunkX, 0),
      eq(aurionWorldChunkDeltas.chunkZ, 0),
      eq(aurionWorldChunkDeltas.targetId, "exploration-memory-proof-house"),
    );
    await pool.query("TRUNCATE TABLE aurionExplorationMemoryProjections");
    await db.delete(aurionWorldChunkDeltas).where(ownChunk);
    await pool.execute("DELETE FROM aurionWorldChunkDeltas WHERE worldId=? AND idempotencyKey LIKE ?", [worldId, "world-slice-cold-root:%"]);
    await db.delete(aurionSettlementRebirthCandidates).where(eq(aurionSettlementRebirthCandidates.worldId, worldId));
    await db.delete(aurionRuinOrigins);
    await db.delete(aurionCivilizationHistoryEvents).where(eq(aurionCivilizationHistoryEvents.worldId, worldId));
    await db.delete(aurionActiveCivilizations).where(eq(aurionActiveCivilizations.worldId, worldId));
    await db.delete(aurionWorldEpochReactions).where(eq(aurionWorldEpochReactions.worldId, worldId));
    await db.delete(aurionWorldEpochRequests).where(eq(aurionWorldEpochRequests.worldId, worldId));
    await db.delete(aurionGlobalWorldEpochReceipts).where(eq(aurionGlobalWorldEpochReceipts.worldId, worldId));
    await db.delete(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.worldId, worldId));
    await db.delete(aurionCausalTickReceipts).where(eq(aurionCausalTickReceipts.worldId, worldId));
    await db.delete(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, worldId));
    // Explicit readback catches cleanup regressions before the next E2E job.
    expect(await db.select({ id: aurionWorldChunkDeltas.id }).from(aurionWorldChunkDeltas).where(ownChunk)).toHaveLength(0);
  });

  it("derives stable memory hashes and never rewrites first discovery provenance",async()=>{
    const db=await getDb(); if(!db) throw new Error("Database not initialized");
    const first=await createExplorationMemoryRecord({
      userId:1,worldId:"echoes-of-aurion-global",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:"sha256:"+"1".repeat(64),latestConfirmedVisitSequence:10,
      latestProjectionHash:"sha256:"+"2".repeat(64),sourceRevision:"a".repeat(40),
    });
    await db.insert(aurionExplorationMemoryProjections).values({
      id:"exp_test",userId:1,worldId:"echoes-of-aurion-global",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:first.firstDiscoveryReceiptHash,latestConfirmedVisitSequence:first.latestConfirmedVisitSequence,
      latestProjectionHash:first.latestProjectionHash,sourceRevision:first.sourceRevision,memoryHash:first.memoryHash
    });
    const updated=await createExplorationMemoryRecord({
      userId:1,worldId:"echoes-of-aurion-global",worldEpoch:1,chunkX:0,chunkZ:0,
      firstDiscoveryReceiptHash:first.firstDiscoveryReceiptHash,latestConfirmedVisitSequence:20,
      latestProjectionHash:"sha256:"+"3".repeat(64),sourceRevision:"b".repeat(40),
    });
    await db.update(aurionExplorationMemoryProjections).set({
      latestConfirmedVisitSequence:updated.latestConfirmedVisitSequence,
      latestProjectionHash:updated.latestProjectionHash,
      sourceRevision:updated.sourceRevision,memoryHash:updated.memoryHash,
    }).where(eq(aurionExplorationMemoryProjections.id,"exp_test"));
    const read=await readExplorationMemory(1,"echoes-of-aurion-global",1);
    expect(read.records).toHaveLength(1);
    expect(read.records[0]?.firstDiscoveryReceiptHash).toBe(first.firstDiscoveryReceiptHash);
    expect(read.records[0]?.latestConfirmedVisitSequence).toBe(20);
    expect(read.records[0]?.latestProjectionHash).toBe("sha256:"+"3".repeat(64));
  });

  it("persists discovery only after a real confirmed chunk readback", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");
    const worldId = "echoes-of-aurion-global";
    const chunk = { x: 0, z: 0 };
    const userId = 2146999970;

    // Isolated synthetic socket; the actual authoritative zone, tick recorder,
    // MariaDB persistence, epoch root and readback are exercised together.
    const causalZone = globalZoneRegistry.get("observatory_threshold");
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as any;
    const connected = causalZone.join({
      userId,
      socket,
      combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
    }).connectionId;
    const unseenUserId = userId + 9;
    const unseenConnection = causalZone.join({ userId: unseenUserId, socket }).connectionId;
    const causalIntents = [...causalZone.getPendingIntents()];
    causalZone.tick();
    const causalReceipt = causalZone.getLatestReceipt();
    if (!causalReceipt) throw new Error("CAUSAL_RECEIPT_EXPECTED");
    const causalAdapter = new MariaDBCausalPersistenceAdapter();
    await causalZone.flushEvidencePersistence();
    await causalAdapter.saveReceipt(causalReceipt, causalIntents);

    await recordWorldChunkDelta({
      actorUserId: userId,
      coordinate: chunk,
      baseRevision: 1,
      kind: "structure_placed",
      targetId: "exploration-memory-proof-house",
      idempotencyKey: "exploration-memory-e2e:place:0001",
      payload: { xMm: 1000, zMm: 1000, assetKey: "aurion_tripo_starpath_marker" },
    });

    const epochResult = await resolveAndRecordGlobalWorldEpoch({
      requestedByUserId: userId,
      idempotencyKey: "exploration-memory-e2e:epoch:0001",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const epoch = epochResult.plan.epoch;

    // A confirmed world chunk does not prove that another user observed it.
    await expect(recordExplorationDiscovery(userId + 7, {
      epoch,
      chunkX: chunk.x,
      chunkZ: chunk.z,
      observedAtLogicalFrame: 999999,
    })).rejects.toThrow("EXPLORATION_ACTOR_NOT_CONNECTED");
    expect((await readExplorationMemory(userId + 7, worldId, epoch)).records).toHaveLength(0);

    await expect(recordExplorationDiscovery(userId, {
      epoch, chunkX: chunk.x + 1, chunkZ: chunk.z, observedAtLogicalFrame: 999999,
    })).rejects.toThrow("EXPLORATION_ACTOR_CHUNK_MISMATCH");

    const lateConnection = causalZone.join({ userId: userId + 1, socket }).connectionId;
    await expect(recordExplorationDiscovery(userId + 1, {
      epoch, chunkX: chunk.x, chunkZ: chunk.z, observedAtLogicalFrame: 999999,
    })).rejects.toThrow("EXPLORATION_ACTOR_NOT_IN_EPOCH");

    // A legacy hash only proves row integrity. It must not be promoted to an
    // actor observation or rewritten under the new contract.
    const legacy = await createExplorationMemoryRecord({
      userId, worldId, worldEpoch: epoch, chunkX: chunk.x, chunkZ: chunk.z,
      firstDiscoveryReceiptHash: "sha256:" + "1".repeat(64),
      latestConfirmedVisitSequence: 999999,
      latestProjectionHash: "sha256:" + "2".repeat(64),
      sourceRevision: causalReceipt.sourceRevision,
    });
    await db.insert(aurionExplorationMemoryProjections).values({ id: "exp_legacy", ...legacy });
    await expect(recordExplorationDiscovery(userId, {
      epoch, chunkX: chunk.x, chunkZ: chunk.z, observedAtLogicalFrame: 999999,
    })).rejects.toThrow("EXPLORATION_MEMORY_PROVENANCE_MISMATCH");
    expect((await readExplorationMemory(userId, worldId, epoch)).records).toEqual([legacy]);
    await db.delete(aurionExplorationMemoryProjections).where(eq(aurionExplorationMemoryProjections.id, "exp_legacy"));

    const first = await recordExplorationDiscovery(userId, {
      epoch,
      chunkX: chunk.x,
      chunkZ: chunk.z,
      observedAtLogicalFrame: 999999,
    });
    expect(first.status).toBe("VERIFIED");
    if (first.status !== "VERIFIED") throw new Error("EXPLORATION_MEMORY_NOT_VERIFIED");
    expect(first.memory.firstDiscoveryReceiptHash).toBe(causalReceipt.receiptHash);
    expect(first.memory.latestConfirmedVisitSequence).toBe(causalReceipt.tick);
    expect(first.memory.latestProjectionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.memory.sourceRevision).toMatch(/^[a-f0-9]{40}$/);

    const replay = await recordExplorationDiscovery(userId, {
      epoch,
      chunkX: chunk.x,
      chunkZ: chunk.z,
      observedAtLogicalFrame: 9,
    });
    expect(replay.status).toBe("VERIFIED");
    expect(replay.memory.firstDiscoveryReceiptHash).toBe(first.memory.firstDiscoveryReceiptHash);
    expect(replay.memory.latestConfirmedVisitSequence).toBe(causalReceipt.tick);

    const read = await readExplorationMemory(userId, worldId, epoch);
    expect(read.records).toHaveLength(1);
    expect(read.records[0]).toEqual(first.memory);

    // WT01: exercise the protected public seam with actual zone ticks, MariaDB,
    // discovery and epoch reconstruction. Context/socket are explicit fixtures;
    // no production authentication or physical device is claimed.
    const caller = (id: number | null) => appRouter.createCaller({
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
      user: id === null ? null : {
        id, openId: `world-slice-fixture-${id}`, name: "WorldSlice fixture", email: null,
        loginMethod: "fixture", role: "user", createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"), lastSignedIn: new Date("2026-01-01"),
      },
    });
    const root = await worldCausalRootService.read(worldId, epoch);
    if (root?.status !== "VERIFIED") throw new Error("WORLD_ROOT_EXPECTED");
    const fixtureRootChunkCount = "chunkReceipts" in root.root ? root.root.chunkReceipts.length : 0;
    expect(fixtureRootChunkCount).toBe(1);
    const query = { worldId, zoneId: "observatory_threshold", coordinate: chunk, radius: 1, lod: "full",
      expectedEpoch: epoch, expectedWorldRoot: root.root.worldRootHash };
    const invoke = (id: number | null, value: unknown = query) => (caller(id).gameplay as any).worldSlice(value);
    const durableFacts = async () => {
      const tables = ["aurionCausalTickReceipts", "aurionCausalCheckpoints", "aurionExplorationMemoryProjections", "aurionWorldChunkDeltas", "aurionGlobalWorldStates"];
      return Promise.all(tables.map(async table => (await pool.query(`SELECT * FROM ${table} ORDER BY 1`))[0]));
    };
    const factsBefore = await durableFacts();
    let fixtureSelectCount = 0;
    const selects = vi.spyOn(db, "select");
    const slice = await (async () => {
      try {
        const result = await invoke(userId);
        fixtureSelectCount = selects.mock.calls.length;
        expect(selects.mock.calls.length, "single-chunk WorldSlice SELECT budget").toBeLessThanOrEqual(40);
        return result;
      } finally { selects.mockRestore(); }
    })();
    expect(slice.status).toBe("VERIFIED");
    expect(slice.slice).toMatchObject({ worldId, zoneId: "observatory_threshold", epoch,
      actorId: `player:${userId}`, worldRoot: root.root.worldRootHash, coordinate: chunk, radius: 1 });
    expect(slice.slice.chunks).toHaveLength(1);
    expect(slice.slice.chunks[0].tiles).toHaveLength(256);
    expect(slice.slice.entities.map((entity: any) => entity.entityId)).toEqual([`player:${userId}`]);
    expect(JSON.stringify(slice)).not.toMatch(/worldSeed|visibleResources|yieldKey|questSummaries|weaponBonus|skillCooldowns|idempotencyKey|combatProfile/);
    expect(Buffer.byteLength(JSON.stringify(slice), "utf8")).toBeLessThanOrEqual(65536);
    expect(slice.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await invoke(userId)).toEqual(slice);
    // A separate actual Node process starts with an empty runtime recorder and
    // epoch cache. It may only reconstruct the same slice from durable facts.
    const coldRead = (value: unknown) => new Promise<{ slice: any; fingerprint: string; status: string; selectCount: number }>((resolveCold, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", resolve("scripts/world-slice/cold-read.ts")], {
        env: { ...process.env, AURION_WORLD_SLICE_TEST_INPUT: JSON.stringify({ userId, query: value }) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "", diagnostics = "";
      const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("WORLD_SLICE_COLD_TIMEOUT")); }, 20_000);
      child.stdout.on("data", chunk => {
        output += String(chunk);
        if (output.length > 131_072) { child.kill("SIGKILL"); reject(new Error("WORLD_SLICE_COLD_OUTPUT_LIMIT")); }
      });
      child.stderr.on("data", chunk => { diagnostics = (diagnostics + String(chunk)).slice(-4096); });
      child.once("error", error => { clearTimeout(timeout); reject(error); });
      child.once("close", code => {
        clearTimeout(timeout);
        if (code !== 0) {
          const safe = diagnostics.replaceAll(process.env.DATABASE_URL ?? "[unset-db]", "[isolated-db]");
          reject(new Error(`WORLD_SLICE_COLD_EXIT:${code}:` + safe)); return;
        }
        const lines = output.split("\n").filter(line => line.startsWith("WORLD_SLICE_COLD_RESULT="));
        if (lines.length !== 1) { reject(new Error("WORLD_SLICE_COLD_RESULT_MISSING")); return; }
        try { resolveCold(JSON.parse(lines[0].slice("WORLD_SLICE_COLD_RESULT=".length))); } catch (error) { reject(error); }
      });
    });
    const cold = await coldRead(query);
    expect({ slice: cold.slice, fingerprint: cold.fingerprint, status: cold.status })
      .toEqual({ slice: slice.slice, fingerprint: slice.fingerprint, status: slice.status });
    expect(cold.selectCount).toBeLessThanOrEqual(40);
    const map = await invoke(userId, { ...query, lod: "map" });
    expect(map.slice.chunks).toEqual(slice.slice.chunks);
    expect(map.slice.worldRoot).toBe(slice.slice.worldRoot);
    const fogged = await invoke(unseenUserId);
    expect(fogged.status).toBe("FOGGED");
    expect(fogged.slice.chunks).toEqual([]);
    expect(fogged.slice.entities.every((entity: any) => entity.entityId === `player:${unseenUserId}`)).toBe(true);

    // Actual signed fixture sessions pass through the unmodified SDK and real
    // users table, over HTTP. This is isolated auth, not an owner/live session.
    const httpUsers = [userId, unseenUserId];
    for (const id of httpUsers) {
      await pool.execute("INSERT INTO users (id,openId,name,loginMethod,role) VALUES (?,?,?,?,?)",
        [id, `world-slice-http-fixture:${id}`, "WorldSlice HTTP fixture", "fixture", "user"]);
    }
    const app = express();
    registerGlbSmartUpload(app);
    const server = await new Promise<ReturnType<typeof app.listen>>(resolveServer => {
      const listener = app.listen(0, "127.0.0.1", () => resolveServer(listener));
    });
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/game/world-slice?x=0&z=0&radius=1&lod=full`;
      const cookieFor = async (id: number) => COOKIE_NAME + "=" + await sdk.createSessionToken(`world-slice-http-fixture:${id}`, { name: "WorldSlice fixture", expiresInMs: 60_000 });
      const ownCookie = await cookieFor(userId);
      const own = await fetch(url, { headers: { cookie: ownCookie } });
      expect(own.status).toBe(200);
      expect(own.headers.get("cache-control")).toBe("no-store");
      const ownReadback = await own.json();
      expect(ownReadback.fingerprint).toBe(slice.fingerprint);
      const other = await fetch(url, { headers: { cookie: await cookieFor(unseenUserId) } });
      expect(other.status).toBe(200);
      const otherReadback = await other.json();
      expect(otherReadback).toMatchObject({ status: "FOGGED", slice: { chunks: [] } });
      if (process.env.AURION_WORLD_SLICE_GODOT_EDITOR) {
        const { startNativeAuthTransaction, issueNativeAuthHandoffAfterVerifiedBrowserLogin, exchangeNativeAuthHandoff, revokeNativeAuthSession } = await import("./nativeAuthPersistence");
        const { createNativeAuthSecret, nativeAuthCodeChallengeFor } = await import("./nativeAuthProtocol");
        const { NATIVE_AUTH_CONTRACT_VERSION, NATIVE_AUTH_RETURN_ID } = await import("../shared/nativeAuthContract");
        const appBuild = "world-slice-native-godot-fixture";
        const pairs: any[] = [];
        try {
          const accounts = [];
          for (const [id, readback] of [[userId, ownReadback], [unseenUserId, otherReadback]] as const) {
            const requestState = createNativeAuthSecret(), verifier = createNativeAuthSecret();
            const started = await startNativeAuthTransaction({ version: NATIVE_AUTH_CONTRACT_VERSION, platform: "android", appBuild,
              returnId: NATIVE_AUTH_RETURN_ID, requestState, codeChallenge: nativeAuthCodeChallengeFor(verifier), codeChallengeMethod: "S256" });
            // Isolated verified-browser-identity fixture; real canonical PKCE
            // exchange, session tables and unmodified SDK bearer verification.
            const issued = await issueNativeAuthHandoffAfterVerifiedBrowserLogin(started.transactionId, id, requestState);
            const tokens = await exchangeNativeAuthHandoff({ version: NATIVE_AUTH_CONTRACT_VERSION, transactionId: started.transactionId,
              code: issued.handoffCode, codeVerifier: verifier, appBuild });
            pairs.push(tokens);
            const native = await fetch(url, { headers: { authorization: "Bearer " + tokens.accessToken } });
            expect(native.status).toBe(200);
            expect((await native.json()).fingerprint).toBe(readback.fingerprint);
            accounts.push({ tokens, connectionId: readback.connectionId, actorId: readback.slice.actorId, fingerprint: readback.fingerprint, status: readback.status });
          }
          const godotResult = await new Promise<string>((resolveGodot, reject) => {
            const child = spawn(process.env.AURION_WORLD_SLICE_GODOT_EDITOR!, ["--headless", "--path", resolve("godot-client"), "--script", "tests/integration/test_world_slice_server.gd"], {
              env: { ...process.env, AURION_WORLD_SLICE_GODOT_INPUT: JSON.stringify({ server: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, accounts }) }, stdio: ["ignore", "pipe", "pipe"],
            });
            let output = "";
            const timeout = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("ACTUAL_GODOT_SLICE_TIMEOUT")); }, 25_000);
            for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => {
              output += bytes.toString();
              if (output.length > 65536) { child.kill("SIGKILL"); reject(new Error("ACTUAL_GODOT_SLICE_OUTPUT_LIMIT")); }
            });
            child.on("error", error => { clearTimeout(timeout); reject(error); });
            child.on("close", code => {
              clearTimeout(timeout);
              if (code !== 0 || output.includes("ERROR:") || !output.includes("WORLD_SLICE_ACTUAL_GODOT=")) reject(new Error("ACTUAL_GODOT_SLICE_FAILED: " + output));
              else resolveGodot(output);
            });
          });
          console.info(godotResult.trim());
        } finally {
          for (const tokens of pairs) await revokeNativeAuthSession(tokens.refreshToken);
          // Only this test's native-session rows; never broad production cleanup.
          const [sessions] = await pool.execute("SELECT id FROM aurionNativeAuthSessions WHERE appBuild=?", [appBuild]);
          for (const session of sessions as any[]) {
            await pool.execute("DELETE FROM aurionNativeAuthAccessTokens WHERE sessionId=?", [session.id]);
            await pool.execute("DELETE FROM aurionNativeAuthRefreshTokens WHERE sessionId=?", [session.id]);
          }
          await pool.execute("DELETE FROM aurionNativeAuthSessions WHERE appBuild=?", [appBuild]);
          await pool.execute("DELETE FROM aurionNativeAuthTransactions WHERE appBuild=?", [appBuild]);
        }
      }
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: { cookie: COOKIE_NAME + "=invalid" } })).status).toBe(401);
      expect((await fetch(url + "&actorId=player:1", { headers: { cookie: ownCookie } })).status).toBe(422);
      expect((await fetch(url.replace("radius=1", "radius=2"), { headers: { cookie: ownCookie } })).status).toBe(422);
      expect((await fetch(url + "&expectedEpoch=" + (epoch + 1), { headers: { cookie: ownCookie } })).status).toBe(409);
    } finally {
      await new Promise<void>(resolveClosed => server.close(() => resolveClosed()));
      for (const id of httpUsers) await pool.execute("DELETE FROM users WHERE id=? AND openId=?", [id, `world-slice-http-fixture:${id}`]);
    }
    console.info("WORLD_SLICE_ISOLATED_MEASUREMENTS=" + JSON.stringify({
      sourceRevision: process.env.AURION_RELEASE_SHA, fixtureRootChunkCount,
      selects: fixtureSelectCount, payloadBytes: Buffer.byteLength(JSON.stringify(slice), "utf8"),
      knownChunks: slice.slice.chunks.length, unknownChunksSent: fogged.slice.chunks.length,
      coldProcessFingerprintMatched: cold.fingerprint === slice.fingerprint,
      coldSelects: cold.selectCount,
    }));
    await expect(invoke(null)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    for (const invalid of [{ ...query, actorId: `player:${unseenUserId}` }, { ...query, worldId: "other-world" }, { ...query, radius: 2 }]) {
      await expect(invoke(userId, invalid)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await expect(invoke(userId, { ...query, expectedEpoch: epoch + 1 })).rejects.toThrow("WORLD_SLICE_REVISION_STALE");
    await expect(invoke(userId, { ...query, expectedWorldRoot: "sha256:" + "0".repeat(64) })).rejects.toThrow("WORLD_SLICE_REVISION_STALE");
    await expect(invoke(userId, { ...query, coordinate: { x: 1, z: 0 } })).rejects.toThrow("WORLD_SLICE_ACTOR_SCOPE_MISMATCH");
    // Call-through fault injection changes a real connection after the initial
    // scope read. No DB return value is mocked or substituted.
    const originalRootRead = worldCausalRootService.read.bind(worldCausalRootService);
    const replaced = vi.spyOn(worldCausalRootService, "read").mockImplementationOnce(async (...args) => {
      const result = await originalRootRead(...args);
      causalZone.join({ userId, socket });
      return result;
    });
    try { await expect(invoke(userId)).rejects.toThrow("WORLD_SLICE_SESSION_CHANGED"); }
    finally { replaced.mockRestore(); }
    expect(await durableFacts()).toEqual(factsBefore);

    // Once the world epoch advances, the old snapshot cannot be used as a new
    // current discovery. The prior stored record remains independently readable.
    const nextIntents = orderCanonicalZoneIntents(causalZone.getPendingIntents());
    causalZone.tick();
    const nextReceipt = causalZone.getLatestReceipt();
    if (!nextReceipt) throw new Error("CAUSAL_RECEIPT_EXPECTED");
    await causalZone.flushEvidencePersistence();
    await causalAdapter.saveReceipt(nextReceipt, nextIntents);
    // Advance the actual persisted epoch while an old slice read is awaiting
    // its root. The final re-read must reject it instead of publishing old data.
    const advanced = vi.spyOn(worldCausalRootService, "read").mockImplementationOnce(async (...args) => {
      const result = await originalRootRead(...args);
      // Fill the existing canonical root's maximum 64 chunk slots with actual
      // durable delta streams. The actor still knows only chunk (0,0).
      for (let x = 1; x < 64; x++) await recordWorldChunkDelta({
        actorUserId: userId, coordinate: { x, z: 0 }, baseRevision: 1, kind: "structure_placed",
        targetId: `world-slice-neighbor:${x}`, idempotencyKey: `world-slice-cold-root:${x}`,
        payload: { xMm: 1000, zMm: 1000, assetKey: "aurion_tripo_starpath_marker" },
      });
      await resolveAndRecordGlobalWorldEpoch({
        requestedByUserId: userId, idempotencyKey: "exploration-memory-e2e:epoch:0002",
        now: new Date("2026-01-01T00:00:01.000Z"),
      });
      return result;
    });
    try { await expect(invoke(userId)).rejects.toThrow("WORLD_SLICE_REVISION_STALE"); }
    finally { advanced.mockRestore(); }
    await expect(recordExplorationDiscovery(userId, {
      epoch, chunkX: chunk.x, chunkZ: chunk.z, observedAtLogicalFrame: 1,
    })).rejects.toThrow("EXPLORATION_WORLD_EPOCH_STALE");
    expect((await readExplorationMemory(userId, worldId, epoch)).records).toEqual([first.memory]);
    const nextRoot = await originalRootRead(worldId, epoch + 1);
    if (nextRoot?.status !== "VERIFIED" || !("chunkReceipts" in nextRoot.root)) throw new Error("WORLD_SLICE_MAXIMUM_ROOT_EXPECTED");
    expect(nextRoot.root.chunkReceipts).toHaveLength(64);
    await recordExplorationDiscovery(userId, { epoch: epoch + 1, chunkX: 0, chunkZ: 0, observedAtLogicalFrame: 1 });
    const maximumQuery = { ...query, expectedEpoch: epoch + 1, expectedWorldRoot: nextRoot.root.worldRootHash };
    const maximumBefore = await durableFacts();
    const maximumWarm = await invoke(userId, maximumQuery);
    const maximumCold = await coldRead(maximumQuery);
    expect(maximumCold.fingerprint).toBe(maximumWarm.fingerprint);
    expect(maximumCold.slice.chunks).toHaveLength(1);
    expect(maximumCold.slice.chunks[0].coordinate).toEqual({ x: 0, z: 0 });
    // 64 prefix reads plus fixed root/checkpoint/actor overhead, not the
    // one-chunk fixture's 40-query bound. No threshold has been relaxed.
    expect(maximumCold.selectCount).toBeLessThanOrEqual(96);
    expect(Buffer.byteLength(JSON.stringify(maximumWarm), "utf8")).toBeLessThanOrEqual(65536);
    expect(await durableFacts()).toEqual(maximumBefore);
    console.info("WORLD_SLICE_MAXIMUM_COLD_MEASUREMENTS=" + JSON.stringify({
      sourceRevision: process.env.AURION_RELEASE_SHA, rootChunkCount: nextRoot.root.chunkReceipts.length,
      selects: maximumCold.selectCount, disclosedChunks: maximumCold.slice.chunks.length,
      payloadBytes: Buffer.byteLength(JSON.stringify(maximumWarm), "utf8"),
    }));
    causalZone.leave(lateConnection);
    causalZone.leave(unseenConnection);
    causalZone.leave(connected);
    const replacementConnection = causalZone.liveConnectionIdForUser(userId);
    if (replacementConnection) causalZone.leave(replacementConnection);
  }, 60_000);
});
