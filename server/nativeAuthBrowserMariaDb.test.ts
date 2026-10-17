import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import express from "express";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  NATIVE_AUTH_CONTRACT_VERSION, NATIVE_AUTH_RETURN_ID,
} from "../shared/nativeAuthContract";
import { COOKIE_NAME } from "../shared/const";
import * as db from "./db";
import { hashLocalPassword, verifyLocalPassword } from "./localAuth";
import { sdk } from "./_core/sdk";
import { registerNativeAuthHttpRoutes } from "./nativeAuthHttp";
import { createNativeAuthSecret, nativeAuthCodeChallengeFor } from "./nativeAuthProtocol";
import { NATIVE_BROWSER_PENDING_COOKIE } from "./nativeAuthBrowser";
import { authenticateNativeAuthAccess } from "./nativeAuthPersistence";

const suite = process.env.AURION_NATIVE_AUTH_E2E === "1" && !!process.env.DATABASE_URL
  ? describe : describe.skip;
const APP_BUILD = "aurion-g09a-native-browser-mariadb";
const HANDLE = "native_g09a";
const OPEN_ID = "local:" + HANDLE;
const PASSWORD = "isolated-local-g09a-test-password-2026";
const VERIFIER = "v".repeat(43);
const SEAL_KEY_BEFORE = process.env.NATIVE_AUTH_STATE_SEAL_KEY;

suite("G09.A browser consent uses real Aurion sessions and isolated MariaDB", () => {
  let pool: Pool;
  let server: Server;
  let origin: string;
  let webSession: string;
  let userId: number;
  let isolated = false;
  const startRequest = () => ({
    version: NATIVE_AUTH_CONTRACT_VERSION,
    codeChallenge: nativeAuthCodeChallengeFor(VERIFIER),
    codeChallengeMethod: "S256" as const,
    requestState: createNativeAuthSecret(),
    appBuild: APP_BUILD,
    platform: "android" as const,
    returnId: NATIVE_AUTH_RETURN_ID,
  });
  const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(origin + path, {
      method: "POST", headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body), redirect: "manual",
    });
  async function clearTransactionRows() {
    if (!isolated) throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    const [sessions] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD],
    );
    for (const row of sessions) {
      await pool.query("DELETE FROM aurionNativeAuthAccessTokens WHERE sessionId = ?", [row.id]);
      await pool.query("DELETE FROM aurionNativeAuthRefreshTokens WHERE sessionId = ?", [row.id]);
    }
    await pool.query("DELETE FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD]);
    await pool.query("DELETE FROM aurionNativeAuthTransactions WHERE appBuild = ?", [APP_BUILD]);
  }
  async function openConsent(transactionId: string) {
    const r = await fetch(origin + "/api/native-auth/browser/" + transactionId, {
      headers: { cookie: COOKIE_NAME + "=" + webSession }, redirect: "manual",
    });
    expect(r.status).toBe(200);
    const html = await r.text();
    const csrf = /name="csrf" value="([A-Za-z0-9_-]{43})"/.exec(html)?.[1];
    const pendingCookie = r.headers.get("set-cookie")?.split(";")[0];
    expect(csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pendingCookie).toMatch(/^__Host-aurion_native_browser=/);
    expect(html).not.toContain("accessToken");
    expect(html).not.toContain("refreshToken");
    expect(html).not.toContain("codeVerifier");
    return { csrf: csrf!, cookie: COOKIE_NAME + "=" + webSession + "; " + pendingCookie };
  }
  async function confirm(transactionId: string, csrf: string, cookie: string, originHeader = "https://arelogic.space") {
    return fetch(origin + "/api/native-auth/browser/" + transactionId + "/confirm", {
      method: "POST",
      headers: {
        origin: originHeader, "sec-fetch-site": "same-origin",
        cookie, "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf }), redirect: "manual",
    });
  }
  beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL!);
    if (u.protocol !== "mysql:" || u.hostname !== "127.0.0.1" || u.port !== "3306" ||
        !u.pathname.endsWith("_test")) throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    process.env.NATIVE_AUTH_STATE_SEAL_KEY = Buffer.alloc(32, 23).toString("base64url");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (!String(rows[0]?.name).endsWith("_test")) throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
    await clearTransactionRows();
    await pool.query("DELETE FROM localCredentials WHERE handle = ?", [HANDLE]);
    await pool.query("DELETE FROM users WHERE openId = ?", [OPEN_ID]);
    const record = await db.createLocalUser({ handle: HANDLE, passwordHash: await hashLocalPassword(PASSWORD) });
    userId = record.id;
    const local = await db.getLocalCredential(HANDLE);
    expect(local).toBeTruthy();
    expect(await verifyLocalPassword(PASSWORD, local!.credential.passwordHash)).toBe(true);
    webSession = await sdk.createSessionToken(record.openId, { name: HANDLE, expiresInMs: 600_000 });
    const app = express();
    app.use(express.json({ limit: "8kb" }));
    app.use(express.urlencoded({ extended: false, limit: "2kb" }));
    // Enable only this disposable in-process application, never the production DEFAULTS.ready.
    registerNativeAuthHttpRoutes(app, { ready: async () => true });
    await new Promise<void>(resolve => { server = app.listen(0, "127.0.0.1", () => resolve()); });
    origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  });
  afterEach(async () => { if (isolated) await clearTransactionRows(); });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    if (pool) {
      if (isolated) {
        await clearTransactionRows();
        await pool.query("DELETE FROM localCredentials WHERE handle = ?", [HANDLE]);
        await pool.query("DELETE FROM users WHERE openId = ?", [OPEN_ID]);
      }
      await pool.end();
    }
    if (SEAL_KEY_BEFORE === undefined) delete process.env.NATIVE_AUTH_STATE_SEAL_KEY;
    else process.env.NATIVE_AUTH_STATE_SEAL_KEY = SEAL_KEY_BEFORE;
  });

  it("requires authenticated explicit consent and produces one PKCE-locked native session", async () => {
    const payload = startRequest();
    const started = await postJson("/api/native-auth/start", payload);
    expect(started.status).toBe(200);
    const start = await started.json() as { transactionId: string; browserUrl: string };
    expect(start.browserUrl).toBe("https://arelogic.space/api/native-auth/browser/" + start.transactionId);
    expect(started.headers.get("set-cookie")).toBeNull();
    const consent = await openConsent(start.transactionId);
    const missingSession = await confirm(start.transactionId, consent.csrf, consent.cookie.split("; ")[1]);
    expect(missingSession.status).toBe(401);
    const wrongOrigin = await confirm(start.transactionId, consent.csrf, consent.cookie, "https://malicious.example");
    expect(wrongOrigin.status).toBe(403);
    const wrongCsrf = await confirm(start.transactionId, "x".repeat(43), consent.cookie);
    expect(wrongCsrf.status).toBe(401);
    const [pending] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM aurionNativeAuthTransactions WHERE id = ?", [start.transactionId],
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].handoffCodeDigest).toBeNull();
    expect(JSON.stringify(pending)).not.toContain(payload.requestState);

    const issued = await confirm(start.transactionId, consent.csrf, consent.cookie);
    expect(issued.status).toBe(303);
    const callback = new URL(issued.headers.get("location")!);
    expect(callback.origin).toBe("https://arelogic.space");
    expect(callback.pathname).toBe("/app/auth/callback");
    expect([...callback.searchParams.keys()]).toEqual(["code", "state"]);
    expect(callback.searchParams.get("state")).toBe(payload.requestState);
    const code = callback.searchParams.get("code")!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.headers.get("set-cookie")).not.toContain(code);
    expect(await issued.text()).toBe("");
    const twice = await confirm(start.transactionId, consent.csrf, consent.cookie);
    expect(twice.status).toBe(409);
    const [persisted] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM aurionNativeAuthTransactions WHERE id = ?", [start.transactionId],
    );
    expect(JSON.stringify(persisted)).not.toContain(code);
    expect(persisted[0].issuedAtMs).not.toBeNull();

    const exchange = {
      version: NATIVE_AUTH_CONTRACT_VERSION, transactionId: start.transactionId,
      code, codeVerifier: VERIFIER, appBuild: APP_BUILD,
    };
    const tokensResponse = await postJson("/api/native-auth/exchange", exchange);
    expect(tokensResponse.status).toBe(200);
    const tokens = await tokensResponse.json() as { accessToken: string; refreshToken: string };
    expect(await authenticateNativeAuthAccess(tokens.accessToken)).toMatchObject({ userId });
    expect((await postJson("/api/native-auth/exchange", exchange)).status).toBe(409);
    const [sessions] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM aurionNativeAuthSessions WHERE appBuild = ?", [APP_BUILD],
    );
    expect(sessions).toHaveLength(1);
    const storage = JSON.stringify([persisted, sessions]);
    for (const secret of [code, payload.requestState, tokens.accessToken, tokens.refreshToken]) {
      expect(storage).not.toContain(secret);
    }
  });

  it("refuses forged session, invalid browser transaction and expired native start", async () => {
    const payload = startRequest();
    const start = await (await postJson("/api/native-auth/start", payload)).json() as { transactionId: string };
    const bogus = await fetch(origin + "/api/native-auth/browser/" + "x".repeat(43));
    expect(bogus.status).toBe(401);
    const cookie = COOKIE_NAME + "=" + await sdk.createSessionToken("unknown:not-a-user", {
      name: "forged", expiresInMs: 60_000,
    });
    const notLogged = await fetch(origin + "/api/native-auth/browser/" + start.transactionId, {
      headers: { cookie },
    });
    expect(notLogged.status).toBe(200);
    expect(await notLogged.text()).not.toContain('name="csrf"');
    await pool.query("UPDATE aurionNativeAuthTransactions SET expiresAtMs = ? WHERE id = ?", [
      Date.now() - 1, start.transactionId,
    ]);
    const expired = await fetch(origin + "/api/native-auth/browser/" + start.transactionId);
    expect(expired.status).toBe(401);
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT handoffCodeDigest, verifiedUserId FROM aurionNativeAuthTransactions WHERE id = ?", [start.transactionId],
    );
    expect(rows[0].handoffCodeDigest).toBeNull();
    expect(rows[0].verifiedUserId).toBeNull();
  });
});
