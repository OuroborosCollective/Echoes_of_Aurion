import { operationalDate } from "../../shared/operationalClock";
import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import {
  createOidcTransaction,
  discoverOidcMetadata,
  exchangeOidcCode,
  identityFromVerifiedIdToken,
  isOidcConfigured,
  oidcStateMatches,
  parseOidcTransaction,
  readOidcSettings,
  serializeOidcTransaction,
  verifyOidcIdToken,
  buildAuthorizationUrl,
} from "./oidcProtocol";
import { sdk } from "./sdk";

const OIDC_TRANSACTION_COOKIE = "__Host-aurion_oidc_tx";
const OIDC_TRANSACTION_TTL_MS = 10 * 60 * 1000;
const OIDC_REQUIRED_ENV_KEYS = ["OIDC_ISSUER_URL", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"] as const;

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function oidcConfigurationState(): "disabled" | "configured" | "partial" {
  const present = OIDC_REQUIRED_ENV_KEYS.filter(key => typeof process.env[key] === "string" && process.env[key]!.trim().length > 0);
  if (present.length === 0) return "disabled";
  return present.length === OIDC_REQUIRED_ENV_KEYS.length && isOidcConfigured(process.env) ? "configured" : "partial";
}

function clearOidcTransaction(res: Response): void {
  res.clearCookie(OIDC_TRANSACTION_COOKIE, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
  });
}

async function handleOidcCallback(req: Request, res: Response): Promise<void> {
  const code = getQueryParam(req, "code");
  const state = getQueryParam(req, "state");
  const transaction = parseOidcTransaction(parseCookieHeader(req.headers.cookie ?? "")[OIDC_TRANSACTION_COOKIE]);
  clearOidcTransaction(res);

  if (!code || !state || !transaction || !oidcStateMatches(transaction.state, state)) {
    res.status(403).json({ error: "invalid oidc login transaction" });
    return;
  }

  try {
    const settings = readOidcSettings(process.env);
    const metadata = await discoverOidcMetadata(settings);
    const idToken = await exchangeOidcCode(settings, metadata, code, transaction.codeVerifier);
    const identity = await verifyOidcIdToken(idToken, settings, metadata, transaction.nonce);

    await db.upsertUser({
      openId: identity.openId,
      name: identity.name,
      email: identity.email,
      loginMethod: identity.loginMethod,
      lastSignedIn: operationalDate(),
    });
    const sessionToken = await sdk.createSessionToken(identity.openId, {
      name: identity.name,
      expiresInMs: ONE_YEAR_MS,
    });
    res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
    res.redirect(302, "/");
  } catch (error) {
    console.error("[OIDC] Callback failed", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "OIDC callback failed" });
  }
}

async function handleLegacyOAuthCallback(req: Request, res: Response): Promise<void> {
  const code = getQueryParam(req, "code");
  const state = getQueryParam(req, "state");

  if (!code || !state) {
    res.status(400).json({ error: "code and state are required" });
    return;
  }

  // CSRF guard: the nonce in `state` must match the one-time cookie that
  // startLogin set in the browser that began this login. An attacker can
  // forge `state`, but cannot plant this cookie in the victim's browser.
  const { nonce } = decodeOAuthState(state);
  const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
  if (!nonce || nonce !== expectedNonce) {
    res.status(403).json({ error: "invalid oauth state" });
    return;
  }
  res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

  try {
    const tokenResponse = await sdk.exchangeCodeForToken(code, state);
    const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

    if (!userInfo.openId) {
      res.status(400).json({ error: "openId missing from user info" });
      return;
    }

    await db.upsertUser({
      openId: userInfo.openId,
      name: userInfo.name || null,
      email: userInfo.email ?? null,
      loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
      lastSignedIn: operationalDate(),
    });

    const sessionToken = await sdk.createSessionToken(userInfo.openId, {
      name: userInfo.name || "",
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    res.redirect(302, "/");
  } catch (error) {
    console.error("[OAuth] Callback failed", error);
    res.status(500).json({ error: "OAuth callback failed" });
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/start", async (_req: Request, res: Response) => {
    const configuration = oidcConfigurationState();
    if (configuration !== "configured") {
      res.status(503).json({ error: configuration === "partial" ? "OIDC configuration is incomplete" : "OIDC login is not configured" });
      return;
    }

    try {
      const settings = readOidcSettings(process.env);
      const metadata = await discoverOidcMetadata(settings);
      const transaction = createOidcTransaction();
      res.cookie(OIDC_TRANSACTION_COOKIE, serializeOidcTransaction(transaction), {
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        maxAge: OIDC_TRANSACTION_TTL_MS,
      });
      res.redirect(302, buildAuthorizationUrl(settings, metadata, transaction));
    } catch (error) {
      console.error("[OIDC] Start failed", error instanceof Error ? error.message : "unknown error");
      res.status(503).json({ error: "OIDC login is unavailable" });
    }
  });

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const configuration = oidcConfigurationState();
    if (configuration === "configured") {
      await handleOidcCallback(req, res);
      return;
    }
    if (configuration === "partial") {
      res.status(503).json({ error: "OIDC configuration is incomplete" });
      return;
    }
    await handleLegacyOAuthCallback(req, res);
  });
}

export const __oidcTestOnly = {
  identityFromVerifiedIdToken,
};
