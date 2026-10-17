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
  exchangeNativeAuthHandoff,
  refreshNativeAuthSession,
  revokeNativeAuthSession,
} from "./nativeAuthPersistence";

export interface NativeAuthHttpDependencies {
  ready: () => Promise<boolean>;
  start: (request: NativeAuthStartRequest) => Promise<{ transactionId: string; expiresAtMs: number }>;
  browserTransaction: (transactionId: string) => Promise<boolean>;
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
function browserPage(): string {
  // This is a non-authorizing, no-script entry page, NOT a completed native handoff.
  // Both buttons use Aurion's existing verified browser login paths.
  return '<!doctype html><html lang="de"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Aurion – Anmeldung im Systembrowser</title></head><body>' +
    '<main><h1>Aurion – Anmeldung im Systembrowser</h1>' +
    '<p>Die Anmeldung erfolgt ausschließlich über Aurions bestehende Kontoverwaltung.</p>' +
    '<p>Nach der Anmeldung zu dieser Browserseite zurückkehren. Eine Gerätefreigabe ist noch nicht aktiviert.</p>' +
    '<p><a href="/api/oauth/start">Mit Aurion OIDC anmelden</a></p>' +
    '<p><a href="/">Mit lokalem Aurion-Konto anmelden</a></p>' +
    '</main></body></html>';
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
  app.get(BASE_PATH + "/browser/:transactionId", async (req, res) => {
    try {
      if (!await deps.ready()) return response(res, 503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
      const id = req.params.transactionId;
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(id) || !await deps.browserTransaction(id)) {
        return response(res, 401, "NATIVE_AUTH_TRANSACTION_INVALID");
      }
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).type("html").send(browserPage());
    } catch (error) {
      return fail(res, error);
    }
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
