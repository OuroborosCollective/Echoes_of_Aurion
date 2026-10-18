import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NATIVE_AUTH_ACCESS_TTL_SECONDS, NATIVE_AUTH_HANDOFF_TTL_SECONDS, NATIVE_AUTH_CONTRACT_VERSION, NATIVE_AUTH_RETURN_ID } from "../shared/nativeAuthContract";
import { createNativeAuthSecret, nativeAuthCodeChallengeFor } from "./nativeAuthProtocol";
import {
  authenticateNativeAuthAccess, exchangeNativeAuthHandoff, isNativeAuthBrowserTransactionPending,
  issueNativeAuthHandoffAfterVerifiedBrowserLogin, refreshNativeAuthSession,
  revokeNativeAuthSession, revokeNativeAuthSessions, startNativeAuthTransaction,
} from "./nativeAuthPersistence";
import { createContext } from "./_core/context";
import { appRouter } from "./routers";
import { consumeZoneConnectionTicket } from "./db";

const suite = process.env.AURION_NATIVE_AUTH_E2E === "1" && !!process.env.DATABASE_URL ? describe : describe.skip;
const NOW = 1_792_000_000_000;
const USER = 9671001;
const OTHER_USER = 9671002;
const APP_BUILD = "godot-native-auth-e2e";
const nativeSealKeyBeforeTests = process.env.NATIVE_AUTH_STATE_SEAL_KEY;
const VERIFIER = "v".repeat(43);

suite("Aurion native auth in isolated MariaDB", () => {
  let pool: Pool;
  let isolated = false;
  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    const [sessions] = await pool.query<RowDataPacket[]>("SELECT id FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD]);
    for (const session of sessions) {
      await pool.query("DELETE FROM aurionNativeAuthAccessTokens WHERE sessionId = ?", [session.id]);
      await pool.query("DELETE FROM aurionNativeAuthRefreshTokens WHERE sessionId = ?", [session.id]);
    }
    await pool.query("DELETE FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD]);
    await pool.query("DELETE FROM aurionNativeAuthTransactions WHERE appBuild = ?", [APP_BUILD]);
  }
  beforeAll(async () => {
    process.env.NATIVE_AUTH_STATE_SEAL_KEY = Buffer.alloc(32, 17).toString("base64url");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS dbName");
    if (!String(rows[0]?.dbName ?? "").endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
    await cleanup();
  });
  afterEach(async () => { if (isolated) await cleanup(); });
  afterAll(async () => {
    if (pool) { if (isolated) await cleanup(); await pool.end(); }
    if (nativeSealKeyBeforeTests === undefined) delete process.env.NATIVE_AUTH_STATE_SEAL_KEY;
    else process.env.NATIVE_AUTH_STATE_SEAL_KEY = nativeSealKeyBeforeTests;
  });
  async function handoff(at = NOW, userId = USER) {
    const requestState = createNativeAuthSecret();
    const start = await startNativeAuthTransaction({
      version: NATIVE_AUTH_CONTRACT_VERSION, platform: "android",
      appBuild: APP_BUILD, returnId: NATIVE_AUTH_RETURN_ID,
      requestState, codeChallenge: nativeAuthCodeChallengeFor(VERIFIER), codeChallengeMethod: "S256",
    }, at);
    const issued = await issueNativeAuthHandoffAfterVerifiedBrowserLogin(start.transactionId, userId, requestState, at + 100);
    return { start, issued, requestState, exchange: { version: NATIVE_AUTH_CONTRACT_VERSION, transactionId: start.transactionId, code: issued.handoffCode, codeVerifier: VERIFIER, appBuild: APP_BUILD } };
  }

  it("reads a real pending browser transaction and rejects expiry and issuance", async () => {
    const requestState = createNativeAuthSecret();
    const created = await startNativeAuthTransaction({
      version: NATIVE_AUTH_CONTRACT_VERSION, platform: "android",
      appBuild: APP_BUILD, returnId: NATIVE_AUTH_RETURN_ID, requestState,
      codeChallenge: nativeAuthCodeChallengeFor(VERIFIER), codeChallengeMethod: "S256",
    }, NOW);
    expect(await isNativeAuthBrowserTransactionPending(created.transactionId, NOW + 10)).toBe(true);
    expect(await isNativeAuthBrowserTransactionPending(created.transactionId, created.expiresAtMs)).toBe(false);
    expect(await isNativeAuthBrowserTransactionPending("x".repeat(43), NOW + 10)).toBe(false);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionNativeAuthTransactions WHERE id = ?", [created.transactionId]);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(requestState);
    expect(rows[0].returnId).toBe(NATIVE_AUTH_RETURN_ID);
    expect(rows[0].requestStateSealed).toMatch(/^[A-Za-z0-9_-]{90,256}$/);
    await issueNativeAuthHandoffAfterVerifiedBrowserLogin(created.transactionId, USER, requestState, NOW + 100);
    expect(await isNativeAuthBrowserTransactionPending(created.transactionId, NOW + 200)).toBe(false);
  });

  it("exchanges once and stores only digests; resolves the verified server user", async () => {
    const { issued, exchange, start, requestState } = await handoff();
    const tokens = await exchangeNativeAuthHandoff(exchange, NOW + 200);
    expect(tokens.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokens.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await authenticateNativeAuthAccess(tokens.accessToken, NOW + 201)).toMatchObject({ userId: USER });
    await expect(exchangeNativeAuthHandoff(exchange, NOW + 300)).rejects.toThrow("NATIVE_AUTH_CODE_CONSUMED");
    const [sessions] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD]);
    const [transactions] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionNativeAuthTransactions WHERE appBuild = ?", [APP_BUILD]);
    const [refresh] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionNativeAuthRefreshTokens WHERE sessionId = ?", [sessions[0].id]);
    const [access] = await pool.query<RowDataPacket[]>("SELECT * FROM aurionNativeAuthAccessTokens WHERE sessionId = ?", [sessions[0].id]);
    expect(sessions).toHaveLength(1);
    expect(transactions[0].consumedAtMs).not.toBeNull();
    expect(refresh).toHaveLength(1);
    expect(access).toHaveLength(1);
    const storage = JSON.stringify({ sessions, transactions, refresh, access });
    for (const secret of [tokens.accessToken, tokens.refreshToken, issued.handoffCode, requestState]) expect(storage).not.toContain(secret);
  });

  it("rejects invalid state and PKCE while leaving valid code consumable", async () => {
    const { exchange } = await handoff();
    await expect(issueNativeAuthHandoffAfterVerifiedBrowserLogin(exchange.transactionId, USER, createNativeAuthSecret(), NOW + 200)).rejects.toThrow("NATIVE_AUTH_STATE_MISMATCH");
    await expect(exchangeNativeAuthHandoff({ ...exchange, codeVerifier: "w".repeat(43) }, NOW + 300)).rejects.toThrow("NATIVE_AUTH_PKCE_FAILED");
    expect((await exchangeNativeAuthHandoff(exchange, NOW + 400)).accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("rejects an expired code without issuing a session", async () => {
    const { exchange } = await handoff();
    await expect(exchangeNativeAuthHandoff(exchange, NOW + 100 + NATIVE_AUTH_HANDOFF_TTL_SECONDS * 1000 + 1)).rejects.toThrow("NATIVE_AUTH_CODE_EXPIRED");
    const [sessions] = await pool.query<RowDataPacket[]>("SELECT id FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD]);
    expect(sessions).toHaveLength(0);
  });

  it("rejects an app build mismatch without burning the legitimate one-time code", async () => {
    const { exchange } = await handoff();
    await expect(exchangeNativeAuthHandoff({ ...exchange, appBuild: "other-client" }, NOW + 200))
      .rejects.toThrow("NATIVE_AUTH_BUILD_UNSUPPORTED");
    expect((await exchangeNativeAuthHandoff(exchange, NOW + 300)).refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("serializes parallel exchanges to one successful issue", async () => {
    const { exchange } = await handoff();
    const outcomes = await Promise.allSettled([
      exchangeNativeAuthHandoff(exchange, NOW + 200), exchangeNativeAuthHandoff(exchange, NOW + 200),
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const [sessions] = await pool.query<RowDataPacket[]>("SELECT id FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD]);
    expect(sessions).toHaveLength(1);
  });

  it("serializes parallel handoff issuance to one MariaDB code with no sessions", async () => {
    const requestState = createNativeAuthSecret();
    const started = await startNativeAuthTransaction({
      version: NATIVE_AUTH_CONTRACT_VERSION, platform: "android", appBuild: APP_BUILD,
      returnId: NATIVE_AUTH_RETURN_ID, requestState,
      codeChallenge: nativeAuthCodeChallengeFor(VERIFIER), codeChallengeMethod: "S256",
    }, NOW);
    const outcomes = await Promise.allSettled([
      issueNativeAuthHandoffAfterVerifiedBrowserLogin(started.transactionId, USER, requestState, NOW + 10),
      issueNativeAuthHandoffAfterVerifiedBrowserLogin(started.transactionId, USER, requestState, NOW + 10),
    ]);
    const success = outcomes.filter(result => result.status === "fulfilled");
    const rejected = outcomes.filter(result => result.status === "rejected");
    expect(success).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const [transactions] = await pool.query<RowDataPacket[]>(
      "SELECT handoffCodeDigest, issuedAtMs, verifiedUserId FROM aurionNativeAuthTransactions WHERE id = ?",
      [started.transactionId],
    );
    const [sessions] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD],
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0].handoffCodeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(transactions[0].issuedAtMs).toBe(NOW + 10);
    expect(transactions[0].verifiedUserId).toBe(USER);
    expect(sessions).toHaveLength(0);
    expect(JSON.stringify(transactions)).not.toContain(requestState);
  });

  it("rejects tampered encrypted State and leaves the transaction unissued", async () => {
    const requestState = createNativeAuthSecret();
    const started = await startNativeAuthTransaction({
      version: NATIVE_AUTH_CONTRACT_VERSION, platform: "android", appBuild: APP_BUILD,
      returnId: NATIVE_AUTH_RETURN_ID, requestState,
      codeChallenge: nativeAuthCodeChallengeFor(VERIFIER), codeChallengeMethod: "S256",
    }, NOW);
    await pool.query("UPDATE aurionNativeAuthTransactions SET requestStateSealed = ? WHERE id = ?",
      ["tampered", started.transactionId]);
    await expect(issueNativeAuthHandoffAfterVerifiedBrowserLogin(
      started.transactionId, USER, requestState, NOW + 20,
    )).rejects.toThrow("NATIVE_AUTH_TRANSACTION_INVALID");
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT issuedAtMs, verifiedUserId, handoffCodeDigest FROM aurionNativeAuthTransactions WHERE id = ?",
      [started.transactionId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].issuedAtMs).toBeNull();
    expect(rows[0].verifiedUserId).toBeNull();
    expect(rows[0].handoffCodeDigest).toBeNull();
  });

  it("rotates refresh once and revokes the full family on old-token replay", async () => {
    const { exchange } = await handoff();
    const original = await exchangeNativeAuthHandoff(exchange, NOW + 200);
    const rotated = await refreshNativeAuthSession(original.refreshToken, NOW + 500);
    expect(rotated.refreshToken).not.toEqual(original.refreshToken);
    expect(await authenticateNativeAuthAccess(rotated.accessToken, NOW + 600)).toMatchObject({ userId: USER });
    await expect(refreshNativeAuthSession(original.refreshToken, NOW + 700)).rejects.toThrow("NATIVE_AUTH_REFRESH_REUSED");
    expect(await authenticateNativeAuthAccess(rotated.accessToken, NOW + 800)).toBeNull();
    await expect(refreshNativeAuthSession(rotated.refreshToken, NOW + 800)).rejects.toThrow("NATIVE_AUTH_REVOKED");
    const [rows] = await pool.query<RowDataPacket[]>("SELECT revokedAtMs FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD]);
    expect(rows[0].revokedAtMs).not.toBeNull();
  });

  it("serializes duplicate refresh and invalidates the newly issued pair on replay", async () => {
    const { exchange } = await handoff();
    const original = await exchangeNativeAuthHandoff(exchange, NOW + 200);
    const outcomes = await Promise.allSettled([
      refreshNativeAuthSession(original.refreshToken, NOW + 500),
      refreshNativeAuthSession(original.refreshToken, NOW + 501),
    ]);
    const successes = outcomes.filter(result => result.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof refreshNativeAuthSession>>>[];
    expect(successes).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await authenticateNativeAuthAccess(successes[0].value.accessToken, NOW + 600)).toBeNull();
  });

  it("enforces refresh idle timeout by server time", async () => {
    const { exchange } = await handoff();
    const tokens = await exchangeNativeAuthHandoff(exchange, NOW + 200);
    await expect(refreshNativeAuthSession(tokens.refreshToken, NOW + 200 + 7 * 24 * 60 * 60 * 1000 + 1))
      .rejects.toThrow("NATIVE_AUTH_SESSION_EXPIRED");
  });

  it("revokes every native session for the credential user and preserves other users", async () => {
    const first = await handoff(NOW, USER);
    const second = await handoff(NOW + 1_000, USER);
    const other = await handoff(NOW + 2_000, OTHER_USER);
    const firstTokens = await exchangeNativeAuthHandoff(first.exchange, NOW + 200);
    const secondTokens = await exchangeNativeAuthHandoff(second.exchange, NOW + 1_200);
    const otherTokens = await exchangeNativeAuthHandoff(other.exchange, NOW + 2_200);

    expect(await revokeNativeAuthSessions(firstTokens.refreshToken, "all_sessions", NOW + 3_000)).toBe(true);
    expect(await authenticateNativeAuthAccess(firstTokens.accessToken, NOW + 3_001)).toBeNull();
    expect(await authenticateNativeAuthAccess(secondTokens.accessToken, NOW + 3_001)).toBeNull();
    expect(await authenticateNativeAuthAccess(otherTokens.accessToken, NOW + 3_001))
      .toMatchObject({ userId: OTHER_USER });
    await expect(refreshNativeAuthSession(firstTokens.refreshToken, NOW + 3_001))
      .rejects.toThrow("NATIVE_AUTH_REVOKED");
    await expect(refreshNativeAuthSession(secondTokens.refreshToken, NOW + 3_001))
      .rejects.toThrow("NATIVE_AUTH_REVOKED");
    expect((await refreshNativeAuthSession(otherTokens.refreshToken, NOW + 3_001)).accessToken)
      .toMatch(/^[A-Za-z0-9_-]{43}$/);

    const later = await handoff(NOW + 4_000, USER);
    const laterTokens = await exchangeNativeAuthHandoff(later.exchange, NOW + 4_200);
    expect(await revokeNativeAuthSessions(firstTokens.refreshToken, "all_sessions", NOW + 5_000)).toBe(false);
    expect(await authenticateNativeAuthAccess(laterTokens.accessToken, NOW + 5_001))
      .toMatchObject({ userId: USER });

    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT userId, revokedAtMs FROM aurionNativeAuthSessions WHERE appBuild = ? ORDER BY userId, createdAtMs",
      [APP_BUILD],
    );
    expect(rows.filter(row => row.userId === USER).map(row => row.revokedAtMs))
      .toEqual([NOW + 3_000, NOW + 3_000, null]);
    expect(rows.find(row => row.userId === OTHER_USER)?.revokedAtMs).toBeNull();
  });

  it("carries a real native bearer through tRPC zone-ticket persistence and consumption", async () => {
    const now = Date.now();
    await pool.query(
      "INSERT INTO users (id, openId, name, loginMethod, role) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
      [USER, "native:9671001", "Native zone tester", "native", "user"],
    );
    const native = await handoff(now, USER);
    const tokens = await exchangeNativeAuthHandoff(native.exchange, now + 200);
    const app = express();
    app.use(express.json({ limit: "8kb" }));
    app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
    const server = await new Promise<Server>(resolve => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/trpc/gameplay.issueZoneTicket?batch=1`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${tokens.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            0: { json: { zoneId: "observatory_threshold", clientBuild: APP_BUILD } },
          }),
        },
      );
      expect(response.status).toBe(200);
      const body = await response.json() as Array<{
        result?: { data?: { json?: { ticket?: string; zoneId?: string } } };
      }>;
      const receipt = body[0]?.result?.data?.json;
      expect(receipt).toMatchObject({
        ticket: expect.stringMatching(/^[A-Za-z0-9_-]{32,128}$/),
        zoneId: "observatory_threshold",
      });
      const [persisted] = await pool.query<RowDataPacket[]>(
        "SELECT userId, zoneId, ticketDigest, consumedAt FROM zoneConnectionTickets WHERE userId = ? AND clientBuild = ?",
        [USER, APP_BUILD],
      );
      expect(persisted).toHaveLength(1);
      expect(persisted[0].ticketDigest).not.toBe(receipt!.ticket);
      expect(persisted[0].consumedAt).toBeNull();
      await expect(consumeZoneConnectionTicket({
        ticket: receipt!.ticket!,
        zoneId: "observatory_threshold",
      })).resolves.toMatchObject({ userId: USER, clientBuild: APP_BUILD });
      await expect(consumeZoneConnectionTicket({
        ticket: receipt!.ticket!,
        zoneId: "observatory_threshold",
      })).resolves.toBeUndefined();
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await pool.query(
        "DELETE FROM zoneConnectionTickets WHERE userId = ? AND clientBuild = ?",
        [USER, APP_BUILD],
      );
    }
  });

  it("rejects expired access and revokes all access immediately after logout", async () => {
    const { exchange } = await handoff();
    const tokens = await exchangeNativeAuthHandoff(exchange, NOW + 200);
    expect(await authenticateNativeAuthAccess(tokens.accessToken, NOW + 200 + NATIVE_AUTH_ACCESS_TTL_SECONDS * 1000)).toBeNull();
    expect(await revokeNativeAuthSession(tokens.refreshToken, NOW + 600)).toBe(true);
    expect(await authenticateNativeAuthAccess(tokens.accessToken, NOW + 601)).toBeNull();
    await expect(refreshNativeAuthSession(tokens.refreshToken, NOW + 601)).rejects.toThrow("NATIVE_AUTH_REVOKED");
  });
});
