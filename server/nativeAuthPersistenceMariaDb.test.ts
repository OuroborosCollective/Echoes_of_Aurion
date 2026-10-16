import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { NATIVE_AUTH_ACCESS_TTL_SECONDS, NATIVE_AUTH_HANDOFF_TTL_SECONDS, NATIVE_AUTH_CONTRACT_VERSION, NATIVE_AUTH_RETURN_ID } from "../shared/nativeAuthContract";
import { createNativeAuthSecret, nativeAuthCodeChallengeFor } from "./nativeAuthProtocol";
import {
  authenticateNativeAuthAccess, exchangeNativeAuthHandoff,
  issueNativeAuthHandoffAfterVerifiedBrowserLogin, refreshNativeAuthSession,
  revokeNativeAuthSession, startNativeAuthTransaction,
} from "./nativeAuthPersistence";

const suite = process.env.AURION_NATIVE_AUTH_E2E === "1" && !!process.env.DATABASE_URL ? describe : describe.skip;
const NOW = 1_792_000_000_000;
const USER = 9671001;
const APP_BUILD = "godot-native-auth-e2e";
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
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS dbName");
    if (!String(rows[0]?.dbName ?? "").endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
    await cleanup();
  });
  afterEach(async () => { if (isolated) await cleanup(); });
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });
  async function handoff(at = NOW) {
    const requestState = createNativeAuthSecret();
    const start = await startNativeAuthTransaction({
      version: NATIVE_AUTH_CONTRACT_VERSION, platform: "android",
      appBuild: APP_BUILD, returnId: NATIVE_AUTH_RETURN_ID,
      requestState, codeChallenge: nativeAuthCodeChallengeFor(VERIFIER), codeChallengeMethod: "S256",
    }, at);
    const issued = await issueNativeAuthHandoffAfterVerifiedBrowserLogin(start.transactionId, USER, requestState, at + 100);
    return { start, issued, requestState, exchange: { version: NATIVE_AUTH_CONTRACT_VERSION, transactionId: start.transactionId, code: issued.handoffCode, codeVerifier: VERIFIER, appBuild: APP_BUILD } };
  }

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

  it("rejects expired access and revokes all access immediately after logout", async () => {
    const { exchange } = await handoff();
    const tokens = await exchangeNativeAuthHandoff(exchange, NOW + 200);
    expect(await authenticateNativeAuthAccess(tokens.accessToken, NOW + 200 + NATIVE_AUTH_ACCESS_TTL_SECONDS * 1000)).toBeNull();
    expect(await revokeNativeAuthSession(tokens.refreshToken, NOW + 600)).toBe(true);
    expect(await authenticateNativeAuthAccess(tokens.accessToken, NOW + 601)).toBeNull();
    await expect(refreshNativeAuthSession(tokens.refreshToken, NOW + 601)).rejects.toThrow("NATIVE_AUTH_REVOKED");
  });
});
