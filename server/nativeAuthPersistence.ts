import { and, eq, isNull } from "drizzle-orm";
import {
  NATIVE_AUTH_ACCESS_TTL_SECONDS,
  NATIVE_AUTH_CONTRACT_VERSION,
  NATIVE_AUTH_HANDOFF_TTL_SECONDS,
  NATIVE_AUTH_RETURN_ID,
  NATIVE_AUTH_REFRESH_ABSOLUTE_TTL_SECONDS,
  NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS,
  NATIVE_AUTH_TRANSACTION_TTL_SECONDS,
  nativeAuthExchangeRequestSchema,
  nativeAuthStartRequestSchema,
  type NativeAuthExchangeRequest,
  type NativeAuthStartRequest,
  type NativeAuthTokenPair,
  type NativeAuthRevokeRequest,
} from "@shared/nativeAuthContract";
import { deadlineAfter, operationalNow, validEpochMilliseconds } from "@shared/operationalClock";
import {
  aurionNativeAuthAccessTokens,
  aurionNativeAuthRefreshTokens,
  aurionNativeAuthSessions,
  aurionNativeAuthTransactions,
} from "../drizzle/nativeAuthSchema";
import {
  createNativeAuthSecret, digestNativeAuthSecret, nativeAuthPkceMatches, nativeAuthSecretMatches,
} from "./nativeAuthProtocol";
import { openNativeAuthRequestState, sealNativeAuthRequestState } from "./nativeAuthStateSeal";
import { getDb } from "./db";

function effectiveNow(nowMs?: number): number {
  return nowMs === undefined ? operationalNow() : validEpochMilliseconds(nowMs);
}

async function requireNativeAuthDb() {
  const db = await getDb();
  if (!db) throw new Error("NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
  return db;
}

function buildTokenPair(accessToken: string, refreshToken: string, nowMs: number, absoluteExpiresAtMs: number): NativeAuthTokenPair {
  return {
    version: NATIVE_AUTH_CONTRACT_VERSION,
    tokenType: "Bearer",
    accessToken,
    accessExpiresInSeconds: NATIVE_AUTH_ACCESS_TTL_SECONDS,
    refreshToken,
    refreshAbsoluteRemainingSeconds: Math.ceil((absoluteExpiresAtMs - nowMs) / 1000),
    refreshIdleExpiresInSeconds: NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS,
  };
}

/** Create only a digest-bound transaction; this method issues no user identity or session. */
export async function startNativeAuthTransaction(raw: NativeAuthStartRequest, nowMs?: number): Promise<{ transactionId: string; expiresAtMs: number }> {
  const request = nativeAuthStartRequestSchema.parse(raw);
  const now = effectiveNow(nowMs);
  const db = await requireNativeAuthDb();
  const transactionId = createNativeAuthSecret();
  const expiresAtMs = deadlineAfter(now, NATIVE_AUTH_TRANSACTION_TTL_SECONDS * 1000);
  await db.insert(aurionNativeAuthTransactions).values({
    id: transactionId,
    requestStateDigest: digestNativeAuthSecret(request.requestState),
    requestStateSealed: sealNativeAuthRequestState(request.requestState, transactionId, request.appBuild, request.returnId),
    returnId: request.returnId,
    codeChallenge: request.codeChallenge,
    appBuild: request.appBuild,
    createdAtMs: now,
    expiresAtMs,
  });
  return { transactionId, expiresAtMs };
}

/**
 * Read a pending browser transaction from the real MariaDB authority.
 * Missing, expired, issued and consumed transactions are intentionally indistinguishable.
 */
export async function isNativeAuthBrowserTransactionPending(transactionId: string, nowMs?: number): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(transactionId)) return false;
  const now = effectiveNow(nowMs);
  const db = await requireNativeAuthDb();
  const rows = await db.select({
    expiresAtMs: aurionNativeAuthTransactions.expiresAtMs,
    issuedAtMs: aurionNativeAuthTransactions.issuedAtMs,
    consumedAtMs: aurionNativeAuthTransactions.consumedAtMs,
  }).from(aurionNativeAuthTransactions).where(eq(aurionNativeAuthTransactions.id, transactionId)).limit(1);
  const row = rows[0];
  return !!row && row.expiresAtMs > now && row.issuedAtMs === null && row.consumedAtMs === null;
}

/**
 * Return decrypted State ONLY within the server's authenticated browser-confirmation
 * handler. This never enters a normal API body, cookie or log.
 */
export async function readNativeAuthRequestStateForBrowser(transactionId: string, nowMs?: number): Promise<string> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(transactionId)) throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
  const now = effectiveNow(nowMs);
  const db = await requireNativeAuthDb();
  const rows = await db.select().from(aurionNativeAuthTransactions)
    .where(eq(aurionNativeAuthTransactions.id, transactionId)).limit(1);
  const row = rows[0];
  if (!row || row.expiresAtMs <= now || row.returnId !== NATIVE_AUTH_RETURN_ID) {
    throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
  }
  if (row.issuedAtMs !== null || row.consumedAtMs !== null) {
    throw new Error("NATIVE_AUTH_CODE_CONSUMED");
  }
  const state = openNativeAuthRequestState(row.requestStateSealed, row.id, row.appBuild, row.returnId);
  if (!nativeAuthSecretMatches(state, row.requestStateDigest)) {
    throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
  }
  return state;
}

/** Call ONLY after Aurion's trusted browser-login/OIDC boundary authenticated userId. */
export async function issueNativeAuthHandoffAfterVerifiedBrowserLogin(
  transactionId: string,
  userId: number,
  requestState: string,
  nowMs?: number,
): Promise<{ handoffCode: string; expiresAtMs: number }> {
  const now = effectiveNow(nowMs);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !/^[A-Za-z0-9_-]{32,128}$/.test(transactionId)) {
    throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
  }
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(requestState)) throw new Error("NATIVE_AUTH_STATE_MISMATCH");
  const db = await requireNativeAuthDb();
  return db.transaction(async tx => {
    const row = (await tx.select().from(aurionNativeAuthTransactions)
      .where(eq(aurionNativeAuthTransactions.id, transactionId)).for("update"))[0];
    if (!row || row.expiresAtMs <= now) throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
    if (!nativeAuthSecretMatches(requestState, row.requestStateDigest)) throw new Error("NATIVE_AUTH_STATE_MISMATCH");
    if (row.returnId !== NATIVE_AUTH_RETURN_ID ||
        !nativeAuthSecretMatches(requestState, digestNativeAuthSecret(openNativeAuthRequestState(row.requestStateSealed, row.id, row.appBuild, row.returnId)))) {
      throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
    }
    if (row.issuedAtMs !== null || row.handoffCodeDigest !== null) throw new Error("NATIVE_AUTH_CODE_CONSUMED");
    const handoffCode = createNativeAuthSecret();
    const expiresAtMs = Math.min(row.expiresAtMs, deadlineAfter(now, NATIVE_AUTH_HANDOFF_TTL_SECONDS * 1000));
    await tx.update(aurionNativeAuthTransactions).set({
      handoffCodeDigest: digestNativeAuthSecret(handoffCode),
      handoffExpiresAtMs: expiresAtMs,
      verifiedUserId: userId,
      issuedAtMs: now,
    }).where(eq(aurionNativeAuthTransactions.id, transactionId));
    return { handoffCode, expiresAtMs };
  });
}

/** A locked one-time exchange. Wrong state/code/verifier never consumes a valid credential. */
export async function exchangeNativeAuthHandoff(raw: NativeAuthExchangeRequest, nowMs?: number): Promise<NativeAuthTokenPair> {
  const request = nativeAuthExchangeRequestSchema.parse(raw);
  const now = effectiveNow(nowMs);
  const db = await requireNativeAuthDb();
  return db.transaction(async tx => {
    const row = (await tx.select().from(aurionNativeAuthTransactions)
      .where(eq(aurionNativeAuthTransactions.id, request.transactionId)).for("update"))[0];
    if (!row || !row.handoffCodeDigest || !nativeAuthSecretMatches(request.code, row.handoffCodeDigest)) {
      throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
    }
    if (row.consumedAtMs !== null) throw new Error("NATIVE_AUTH_CODE_CONSUMED");
    if (row.expiresAtMs <= now || !row.handoffExpiresAtMs || row.handoffExpiresAtMs <= now) {
      throw new Error("NATIVE_AUTH_CODE_EXPIRED");
    }
    if (request.appBuild !== row.appBuild) throw new Error("NATIVE_AUTH_BUILD_UNSUPPORTED");
    if (!row.verifiedUserId || row.verifiedUserId <= 0) throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
    if (!nativeAuthPkceMatches(request.codeVerifier, row.codeChallenge)) throw new Error("NATIVE_AUTH_PKCE_FAILED");

    const sessionId = createNativeAuthSecret();
    const accessToken = createNativeAuthSecret();
    const refreshToken = createNativeAuthSecret();
    const absoluteExpiresAtMs = deadlineAfter(now, NATIVE_AUTH_REFRESH_ABSOLUTE_TTL_SECONDS * 1000);
    const idleExpiresAtMs = Math.min(absoluteExpiresAtMs, deadlineAfter(now, NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS * 1000));
    await tx.update(aurionNativeAuthTransactions).set({ consumedAtMs: now })
      .where(eq(aurionNativeAuthTransactions.id, row.id));
    await tx.insert(aurionNativeAuthSessions).values({
      id: sessionId, userId: row.verifiedUserId, appBuild: row.appBuild,
      currentRefreshDigest: digestNativeAuthSecret(refreshToken), createdAtMs: now,
      absoluteExpiresAtMs, idleExpiresAtMs,
    });
    await tx.insert(aurionNativeAuthRefreshTokens).values({
      tokenDigest: digestNativeAuthSecret(refreshToken), sessionId, issuedAtMs: now,
      expiresAtMs: absoluteExpiresAtMs,
    });
    await tx.insert(aurionNativeAuthAccessTokens).values({
      tokenDigest: digestNativeAuthSecret(accessToken), sessionId, issuedAtMs: now,
      expiresAtMs: Math.min(absoluteExpiresAtMs, deadlineAfter(now, NATIVE_AUTH_ACCESS_TTL_SECONDS * 1000)),
    });
    return buildTokenPair(accessToken, refreshToken, now, absoluteExpiresAtMs);
  });
}

/** Persist family revocation even when a consumed refresh token is replayed. */
export async function refreshNativeAuthSession(refreshToken: string, nowMs?: number): Promise<NativeAuthTokenPair> {
  const now = effectiveNow(nowMs);
  if (!/^[A-Za-z0-9_-]{43,256}$/.test(refreshToken)) throw new Error("NATIVE_AUTH_SESSION_EXPIRED");
  const db = await requireNativeAuthDb();
  const digest = digestNativeAuthSecret(refreshToken);
  const outcome = await db.transaction(async tx => {
    const old = (await tx.select().from(aurionNativeAuthRefreshTokens)
      .where(eq(aurionNativeAuthRefreshTokens.tokenDigest, digest)).for("update"))[0];
    if (!old) return { error: "NATIVE_AUTH_SESSION_EXPIRED" };
    const session = (await tx.select().from(aurionNativeAuthSessions)
      .where(eq(aurionNativeAuthSessions.id, old.sessionId)).for("update"))[0];
    if (!session || session.revokedAtMs !== null) return { error: "NATIVE_AUTH_REVOKED" };
    if (old.consumedAtMs !== null || session.currentRefreshDigest !== digest) {
      await tx.update(aurionNativeAuthSessions).set({ revokedAtMs: now })
        .where(eq(aurionNativeAuthSessions.id, session.id));
      return { error: "NATIVE_AUTH_REFRESH_REUSED" };
    }
    if (session.absoluteExpiresAtMs <= now || session.idleExpiresAtMs <= now || old.expiresAtMs <= now) {
      return { error: "NATIVE_AUTH_SESSION_EXPIRED" };
    }
    const replacementRefresh = createNativeAuthSecret();
    const replacementAccess = createNativeAuthSecret();
    const idleExpiresAtMs = Math.min(session.absoluteExpiresAtMs, deadlineAfter(now, NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS * 1000));
    await tx.update(aurionNativeAuthRefreshTokens).set({ consumedAtMs: now })
      .where(eq(aurionNativeAuthRefreshTokens.tokenDigest, digest));
    await tx.insert(aurionNativeAuthRefreshTokens).values({
      tokenDigest: digestNativeAuthSecret(replacementRefresh), sessionId: session.id,
      issuedAtMs: now, expiresAtMs: session.absoluteExpiresAtMs,
    });
    await tx.insert(aurionNativeAuthAccessTokens).values({
      tokenDigest: digestNativeAuthSecret(replacementAccess), sessionId: session.id,
      issuedAtMs: now, expiresAtMs: Math.min(session.absoluteExpiresAtMs, deadlineAfter(now, NATIVE_AUTH_ACCESS_TTL_SECONDS * 1000)),
    });
    await tx.update(aurionNativeAuthSessions).set({
      currentRefreshDigest: digestNativeAuthSecret(replacementRefresh),
      idleExpiresAtMs,
    }).where(eq(aurionNativeAuthSessions.id, session.id));
    return { tokens: buildTokenPair(replacementAccess, replacementRefresh, now, session.absoluteExpiresAtMs) };
  });
  if ("error" in outcome) throw new Error(outcome.error);
  return outcome.tokens;
}

/** Only already-confirmed server sessions yield an identity; no preview bearer fallback. */
export async function authenticateNativeAuthAccess(accessToken: string, nowMs?: number): Promise<{ userId: number; sessionId: string } | null> {
  const now = effectiveNow(nowMs);
  if (!/^[A-Za-z0-9_-]{43,256}$/.test(accessToken)) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    userId: aurionNativeAuthSessions.userId,
    sessionId: aurionNativeAuthSessions.id,
    revokedAtMs: aurionNativeAuthSessions.revokedAtMs,
    absoluteExpiresAtMs: aurionNativeAuthSessions.absoluteExpiresAtMs,
    idleExpiresAtMs: aurionNativeAuthSessions.idleExpiresAtMs,
    accessExpiresAtMs: aurionNativeAuthAccessTokens.expiresAtMs,
  }).from(aurionNativeAuthAccessTokens).innerJoin(
    aurionNativeAuthSessions, eq(aurionNativeAuthAccessTokens.sessionId, aurionNativeAuthSessions.id),
  ).where(eq(aurionNativeAuthAccessTokens.tokenDigest, digestNativeAuthSecret(accessToken))).limit(1);
  const row = rows[0];
  if (!row || row.revokedAtMs !== null || row.accessExpiresAtMs <= now ||
      row.absoluteExpiresAtMs <= now || row.idleExpiresAtMs <= now) return null;
  return { userId: row.userId, sessionId: row.sessionId };
}

/** Revocation derives its user solely from a locked, confirmed refresh credential. */
export async function revokeNativeAuthSessions(
  refreshToken: string,
  scope: NativeAuthRevokeRequest["scope"],
  nowMs?: number,
): Promise<boolean> {
  const now = effectiveNow(nowMs);
  if (!/^[A-Za-z0-9_-]{43,256}$/.test(refreshToken)) return false;
  const db = await requireNativeAuthDb();
  return db.transaction(async tx => {
    const record = (await tx.select().from(aurionNativeAuthRefreshTokens)
      .where(eq(aurionNativeAuthRefreshTokens.tokenDigest, digestNativeAuthSecret(refreshToken))).for("update"))[0];
    if (!record) return false;
    const session = (await tx.select().from(aurionNativeAuthSessions)
      .where(eq(aurionNativeAuthSessions.id, record.sessionId)).for("update"))[0];
    if (!session) return false;
    const target = scope === "all_sessions"
      ? eq(aurionNativeAuthSessions.userId, session.userId)
      : eq(aurionNativeAuthSessions.id, session.id);
    await tx.update(aurionNativeAuthSessions).set({ revokedAtMs: now })
      .where(and(target, isNull(aurionNativeAuthSessions.revokedAtMs)));
    return true;
  });
}

/** Backward-compatible single-session logout for existing server call sites. */
export async function revokeNativeAuthSession(refreshToken: string, nowMs?: number): Promise<boolean> {
  return revokeNativeAuthSessions(refreshToken, "session", nowMs);
}
