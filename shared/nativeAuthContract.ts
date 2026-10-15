import { z } from "zod";

export const NATIVE_AUTH_CONTRACT_VERSION = "aurion.native-auth.v1" as const;
export const NATIVE_AUTH_RETURN_ID = "aurion.android.app-link.v1" as const;
export const NATIVE_AUTH_ACCESS_TTL_SECONDS = 15 * 60;
export const NATIVE_AUTH_REFRESH_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const NATIVE_AUTH_HANDOFF_TTL_SECONDS = 60;
export const NATIVE_AUTH_TRANSACTION_TTL_SECONDS = 10 * 60;

const base64Url = /^[A-Za-z0-9_-]+$/;
const opaqueSecretSchema = z.string().min(43).max(256).regex(base64Url);
const transactionIdSchema = z.string().min(32).max(128).regex(base64Url);
const requestStateSchema = z.string().min(43).max(128).regex(base64Url);
const appBuildSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9._-]+$/);
const pkceChallengeSchema = z.string().length(43).regex(base64Url);
const pkceVerifierSchema = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9._~-]+$/);

const httpsBrowserUrlSchema = z.string().url().superRefine((value, ctx) => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "HTTPS_BROWSER_URL_REQUIRED" });
    return;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== "https://arelogic.space" ||
    !/^\/api\/native-auth\/browser\/[A-Za-z0-9_-]{32,128}$/.test(
      parsed.pathname,
    ) ||
    parsed.search !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.hash !== ""
  ) {
    ctx.addIssue({ code: "custom", message: "HTTPS_BROWSER_URL_REQUIRED" });
  }
});

export const nativeAuthStartRequestSchema = z.strictObject({
  version: z.literal(NATIVE_AUTH_CONTRACT_VERSION),
  codeChallenge: pkceChallengeSchema,
  codeChallengeMethod: z.literal("S256"),
  requestState: requestStateSchema,
  appBuild: appBuildSchema,
  platform: z.literal("android"),
  returnId: z.literal(NATIVE_AUTH_RETURN_ID),
});

export const nativeAuthStartResponseSchema = z.strictObject({
  version: z.literal(NATIVE_AUTH_CONTRACT_VERSION),
  transactionId: transactionIdSchema,
  browserUrl: httpsBrowserUrlSchema,
  expiresInSeconds: z.literal(NATIVE_AUTH_TRANSACTION_TTL_SECONDS),
}).superRefine((value, ctx) => {
  try {
    if (new URL(value.browserUrl).pathname.split("/").at(-1) !== value.transactionId) {
      ctx.addIssue({ code: "custom", message: "TRANSACTION_URL_MISMATCH" });
    }
  } catch {
    // The field-level schema owns malformed URL reporting.
  }
});

export const nativeAuthCallbackQuerySchema = z.strictObject({
  code: opaqueSecretSchema,
  state: requestStateSchema,
});

export const nativeAuthExchangeRequestSchema = z.strictObject({
  version: z.literal(NATIVE_AUTH_CONTRACT_VERSION),
  transactionId: transactionIdSchema,
  code: opaqueSecretSchema,
  codeVerifier: pkceVerifierSchema,
  appBuild: appBuildSchema,
});

export const nativeAuthTokenPairSchema = z
  .strictObject({
    version: z.literal(NATIVE_AUTH_CONTRACT_VERSION),
    tokenType: z.literal("Bearer"),
    accessToken: opaqueSecretSchema,
    accessExpiresInSeconds: z.literal(NATIVE_AUTH_ACCESS_TTL_SECONDS),
    refreshToken: opaqueSecretSchema,
    refreshAbsoluteRemainingSeconds: z
      .number()
      .int()
      .positive()
      .max(NATIVE_AUTH_REFRESH_ABSOLUTE_TTL_SECONDS),
    refreshIdleExpiresInSeconds: z.literal(NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS),
  })
  .refine((value) => value.accessToken !== value.refreshToken, {
    message: "NATIVE_AUTH_TOKENS_MUST_DIFFER",
  });

export const nativeAuthRefreshRequestSchema = z.strictObject({
  version: z.literal(NATIVE_AUTH_CONTRACT_VERSION),
  refreshToken: opaqueSecretSchema,
});

export const nativeAuthRevokeRequestSchema = z.strictObject({
  version: z.literal(NATIVE_AUTH_CONTRACT_VERSION),
  refreshToken: opaqueSecretSchema,
  scope: z.enum(["session", "all_sessions"]),
});

export const nativeAuthErrorCodes = [
  "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE",
  "NATIVE_AUTH_TRANSACTION_INVALID",
  "NATIVE_AUTH_STATE_MISMATCH",
  "NATIVE_AUTH_CODE_EXPIRED",
  "NATIVE_AUTH_CODE_CONSUMED",
  "NATIVE_AUTH_PKCE_FAILED",
  "NATIVE_AUTH_SESSION_EXPIRED",
  "NATIVE_AUTH_REFRESH_REUSED",
  "NATIVE_AUTH_REVOKED",
  "NATIVE_AUTH_BUILD_UNSUPPORTED",
  "NATIVE_AUTH_RATE_LIMITED",
] as const;

export const nativeAuthErrorSchema = z.strictObject({
  version: z.literal(NATIVE_AUTH_CONTRACT_VERSION),
  error: z.enum(nativeAuthErrorCodes),
});

export type NativeAuthStartRequest = z.infer<typeof nativeAuthStartRequestSchema>;
export type NativeAuthStartResponse = z.infer<typeof nativeAuthStartResponseSchema>;
export type NativeAuthExchangeRequest = z.infer<typeof nativeAuthExchangeRequestSchema>;
export type NativeAuthTokenPair = z.infer<typeof nativeAuthTokenPairSchema>;
export type NativeAuthRefreshRequest = z.infer<typeof nativeAuthRefreshRequestSchema>;
export type NativeAuthRevokeRequest = z.infer<typeof nativeAuthRevokeRequestSchema>;
export type NativeAuthError = z.infer<typeof nativeAuthErrorSchema>;
