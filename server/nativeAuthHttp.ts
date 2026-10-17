import type { Express, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import {
  NATIVE_AUTH_CONTRACT_VERSION as VERSION,
  NATIVE_AUTH_TRANSACTION_TTL_SECONDS,
  nativeAuthStartRequestSchema,
  nativeAuthStartResponseSchema,
  nativeAuthExchangeRequestSchema,
  nativeAuthRefreshRequestSchema,
  nativeAuthRevokeRequestSchema,
  nativeAuthTokenPairSchema,
  nativeAuthErrorCodes,
  type NativeAuthStartRequest,
  type NativeAuthExchangeRequest,
  type NativeAuthTokenPair,
} from "@shared/nativeAuthContract";
import {
  startNativeAuthTransaction,
  isNativeAuthBrowserTransactionPending,
  readNativeAuthRequestStateForBrowser,
  issueNativeAuthHandoffAfterVerifiedBrowserLogin,
  exchangeNativeAuthHandoff,
  refreshNativeAuthSession,
  revokeNativeAuthSession,
} from "./nativeAuthPersistence";
import { parse as parseCookieHeader } from "cookie";
import { createNativeBrowserBinding, nativeBrowserCsrfMatches, readNativeBrowserBinding } from "./nativeAuthStateSeal";
import {
  authenticatedNativeBrowserUser, NATIVE_BROWSER_PENDING_COOKIE, nativeBrowserContinuePath,
  nativeBrowserCookieOptions,
} from "./nativeAuthBrowser";

export interface NativeAuthHttpDependencies {
  ready: () => Promise<boolean>;
  start: (request: NativeAuthStartRequest) => Promise<{ transactionId: string; expiresAtMs: number }>;
  browserTransaction: (transactionId: string) => Promise<boolean>;
  issueHandoff: (transactionId: string, userId: number, state: string) => Promise<{ handoffCode: string; expiresAtMs: number }>;
  exchange: (request: NativeAuthExchangeRequest) => Promise<NativeAuthTokenPair>;
  refresh: (token: string) => Promise<NativeAuthTokenPair>;
  revoke: (token: string) => Promise<boolean>;
}
const DEFAULTS: NativeAuthHttpDependencies = {
  // Production stays fail-closed until native schema 0075, OIDC/browser handoff
  // and owner release evidence have been independently approved.
  ready: async () => false,
  start: startNativeAuthTransaction,
  browserTransaction: isNativeAuthBrowserTransactionPending,
  issueHandoff: issueNativeAuthHandoffAfterVerifiedBrowserLogin,
  exchange: exchangeNativeAuthHandoff,
  refresh: refreshNativeAuthSession,
  revoke: revokeNativeAuthSession,
};
const BASE_PATH = "/api/native-auth";
const CANONICAL_BROWSER_ORIGIN = "https://arelogic.space";
const response = (res: Response, status: number, error: string) =>
  res.status(status).json({ version: VERSION, error });
const errors = new Set<string>(nativeAuthErrorCodes);
function fail(res: Response, value: unknown) {
  const code = value instanceof Error && errors.has(value.message)
    ? value.message : "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE";
  const status = code === "NATIVE_AUTH_CODE_CONSUMED" || code === "NATIVE_AUTH_REFRESH_REUSED" ? 409 :
    code === "NATIVE_AUTH_RATE_LIMITED" ? 429 :
    code === "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE" ? 503 : 401;
  return response(res, status, code);
}
function hostile(req: Request): boolean {
  return Boolean(req.headers.cookie || req.headers.authorization || req.headers.origin ||
    req.headers.referer || (req.headers["sec-fetch-site"] && req.headers["sec-fetch-site"] !== "none"));
}
function browserPage(transactionId: string, csrf: string | null): string {
  // No user data, PKCE verifier, request State, handoff code or token is rendered.
  const head = '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Aurion – Sichere Geräteanmeldung</title></head><body><main>' +
    '<h1>Aurion – Sichere Geräteanmeldung</h1>';
  if (!csrf) return head +
    '<p>Melde dich zunächst im Aurion-Systembrowser an. Danach kehre zu dieser Seite zurück.</p>' +
    '<p><a href="/api/oauth/start">Mit Aurion OIDC anmelden</a></p>' +
    '<p><a href="/">Mit lokalem Aurion-Konto anmelden</a></p>' +
    '</main></body></html>';
  return head + '<p>Du gibst einem Android-Gerät den Zugriff auf dein Aurion-Konto. ' +
    'Bestätige ausschließlich deine eigene, gerade gestartete Anmeldung.</p>' +
    '<form method="post" action="/api/native-auth/browser/' + transactionId + '/confirm">' +
    '<input type="hidden" name="csrf" value="' + csrf + '">' +
    '<button type="submit">Diese Anmeldung einmalig bestätigen</button></form>' +
    '<p>Du kannst die Seite schließen, um die Anmeldung abzubrechen.</p>' +
    '</main></body></html>';
}
function confirmOriginIsTrusted(req: Request): boolean {
  return req.headers.origin === CANONICAL_BROWSER_ORIGIN &&
    (!req.headers["sec-fetch-site"] || req.headers["sec-fetch-site"] === "same-origin") &&
    !req.headers.authorization;
}
function refuseBrowser(res: Response) {
  return response(res, 401, "NATIVE_AUTH_TRANSACTION_INVALID");
}
export function registerNativeAuthHttpRoutes(app: Express, options: Partial<NativeAuthHttpDependencies> = {}): void {
  const deps = { ...DEFAULTS, ...options };
  app.use(BASE_PATH, rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }));
  app.use(BASE_PATH, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.post(BASE_PATH + "/start", async (req, res) => {
    try {
      if (!await deps.ready()) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      if (hostile(req)) return response(res, 403, "NATIVE_AUTH_REQUEST_INVALID");
      const parsed = nativeAuthStartRequestSchema.safeParse(req.body);
      if (!parsed.success) return response(res, 400, "NATIVE_AUTH_REQUEST_INVALID");
      const created = await deps.start(parsed.data);
      const result = nativeAuthStartResponseSchema.safeParse({
        version: VERSION,
        transactionId: created.transactionId,
        browserUrl: CANONICAL_BROWSER_ORIGIN + BASE_PATH + "/browser/" + created.transactionId,
        expiresInSeconds: NATIVE_AUTH_TRANSACTION_TTL_SECONDS,
      });
      if (!result.success) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      return res.status(200).json(result.data);
    } catch (error) {
      return fail(res, error);
    }
  });
  app.get(BASE_PATH + "/continue", async (req, res) => {
    // Existing web-login providers may return here. With no valid native
    // browser binding, this behaves like the original home-page redirect.
    try {
      if (!await deps.ready()) return res.redirect(302, "/");
      const candidate = nativeBrowserContinuePath(req.headers.cookie);
      if (candidate === "/") return res.redirect(302, "/");
      const id = candidate.split("/").at(-1)!;
      if (!await deps.browserTransaction(id)) return res.redirect(302, "/");
      return res.redirect(302, candidate);
    } catch {
      return res.redirect(302, "/");
    }
  });
  app.get(BASE_PATH + "/browser/:transactionId", async (req, res) => {
    try {
      if (!await deps.ready()) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      const id = req.params.transactionId;
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(id) || !await deps.browserTransaction(id)) {
        return refuseBrowser(res);
      }
      const userId = await authenticatedNativeBrowserUser(req);
      const binding = createNativeBrowserBinding(id);
      res.cookie(NATIVE_BROWSER_PENDING_COOKIE, binding.cookie, nativeBrowserCookieOptions());
      res.setHeader("Content-Security-Policy", "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).type("html").send(browserPage(id, userId ? binding.csrf : null));
    } catch (error) {
      return fail(res, error);
    }
  });
  app.post(BASE_PATH + "/browser/:transactionId/confirm", async (req, res) => {
    try {
      if (!await deps.ready()) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      if (!confirmOriginIsTrusted(req)) return response(res, 403, "NATIVE_AUTH_REQUEST_INVALID");
      if (!req.is("application/x-www-form-urlencoded") || !req.body ||
          typeof req.body !== "object" || Object.keys(req.body).length !== 1 ||
          typeof req.body.csrf !== "string") {
        return response(res, 400, "NATIVE_AUTH_REQUEST_INVALID");
      }
      const id = req.params.transactionId;
      const cookie = parseCookieHeader(req.headers.cookie ?? "")[NATIVE_BROWSER_PENDING_COOKIE];
      const binding = readNativeBrowserBinding(cookie);
      if (!binding || binding.transactionId !== id || !nativeBrowserCsrfMatches(req.body.csrf, binding.csrf)) {
        return refuseBrowser(res);
      }
      const userId = await authenticatedNativeBrowserUser(req);
      if (!userId) return refuseBrowser(res);
      const state = await readNativeAuthRequestStateForBrowser(id);
      // The persistence layer locks the row, validates State, expires the code
      // and atomically rejects a parallel second issue.
      const issued = await deps.issueHandoff(id, userId, state);
      const callback = new URL("/app/auth/callback", CANONICAL_BROWSER_ORIGIN);
      callback.searchParams.set("code", issued.handoffCode);
      callback.searchParams.set("state", state);
      res.clearCookie(NATIVE_BROWSER_PENDING_COOKIE, { path: "/", secure: true, httpOnly: true, sameSite: "lax" });
      return res.status(303).setHeader("Location", callback.toString()).end();
    } catch (error) {
      return fail(res, error);
    }
  });
  app.get("/app/auth/callback", (_req, res) => {
    // If Android does not intercept the HTTPS app link, render a neutral
    // terminal page without reflecting the query or leaking its credentials.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.status(200).type("html").send(
      '<!doctype html><html lang="de"><meta charset="utf-8"><title>Aurion</title>' +
      '<p>Der Browser-Schritt ist abgeschlossen. Kehre in die Aurion-App zurück.</p></html>',
    );
  });
  app.post(BASE_PATH + "/exchange", async (req, res) => {
    try {
      if (!await deps.ready()) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      if (hostile(req)) return response(res, 403, "NATIVE_AUTH_REQUEST_INVALID");
      const parsed = nativeAuthExchangeRequestSchema.safeParse(req.body);
      if (!parsed.success) return response(res, 400, "NATIVE_AUTH_REQUEST_INVALID");
      const tokens = await deps.exchange(parsed.data);
      const valid = nativeAuthTokenPairSchema.safeParse(tokens);
      if (!valid.success) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      return res.status(200).json(valid.data);
    } catch (error) {
      return fail(res, error);
    }
  });
  app.post(BASE_PATH + "/refresh", async (req, res) => {
    try {
      if (!await deps.ready()) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      if (hostile(req)) return response(res, 403, "NATIVE_AUTH_REQUEST_INVALID");
      const parsed = nativeAuthRefreshRequestSchema.safeParse(req.body);
      if (!parsed.success) return response(res, 400, "NATIVE_AUTH_REQUEST_INVALID");
      const tokens = await deps.refresh(parsed.data.refreshToken);
      const valid = nativeAuthTokenPairSchema.safeParse(tokens);
      if (!valid.success) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      return res.status(200).json(valid.data);
    } catch (error) {
      return fail(res, error);
    }
  });
  app.post(BASE_PATH + "/revoke", async (req, res) => {
    try {
      if (!await deps.ready()) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      if (hostile(req)) return response(res, 403, "NATIVE_AUTH_REQUEST_INVALID");
      const parsed = nativeAuthRevokeRequestSchema.safeParse(req.body);
      if (!parsed.success) return response(res, 400, "NATIVE_AUTH_REQUEST_INVALID");
      if (parsed.data.scope !== "session") return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      await deps.revoke(parsed.data.refreshToken);
      return res.status(204).end();
    } catch (error) {
      return fail(res, error);
    }
  });
}
