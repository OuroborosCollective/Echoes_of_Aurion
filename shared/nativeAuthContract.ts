import { z } from "zod";

export const NATIVE_AUTH_PROTOCOL_VERSION = "aurion.native-auth.v1" as const;
export const NATIVE_AUTH_PLATFORM = "android" as const;
export const NATIVE_AUTH_RETURN_ID = "arelogic.space/app/auth/callback" as const;
export const NATIVE_AUTH_PKCE_METHOD = "S256" as const;

export const NATIVE_AUTH_TRANSACTION_TTL_MS = 10 * 60 * 1_000;
export const NATIVE_AUTH_HANDOFF_CODE_TTL_MS = 60 * 1_000;
export const NATIVE_AUTH_ACCESS_TOKEN_TTL_MS = 15 * 60 * 1_000;
export const NATIVE_AUTH_REFRESH_TOKEN_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
export const NATIVE_AUTH_REFRESH_TOKEN_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export const nativeAuthErrorCodeValues = [
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

export const nativeAuthErrorCodeSchema = z.enum(nativeAuthErrorCodeValues);
export type NativeAuthErrorCode = z.infer<typeof nativeAuthErrorCodeSchema>;

const nativeAuthOpaqueValueSchema = z.string().regex(/^aurion_native_[A-Za-z0-9_-]{43}$/);
const nativeAuthBuildSchema = z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._-]+$/);
const nativeAuthVerifierSchema = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);
const nativeAuthChallengeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const nativeAuthStartRequestSchema = z.object({
  protocolVersion: z.literal(NATIVE_AUTH_PROTOCOL_VERSION),
  platform: z.literal(NATIVE_AUTH_PLATFORM),
  appBuild: nativeAuthBuildSchema,
  returnId: z.literal(NATIVE_AUTH_RETURN_ID),
  requestState: nativeAuthOpaqueValueSchema,
  codeChallenge: nativeAuthChallengeSchema,
  codeChallengeMethod: z.literal(NATIVE_AUTH_PKCE_METHOD),
}).strict();
export type NativeAuthStartRequest = z.infer<typeof nativeAuthStartRequestSchema>;

export const nativeAuthStartResponseSchema = z.object({
  browserUrl: z.string().url(),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
export type NativeAuthStartResponse = z.infer<typeof nativeAuthStartResponseSchema>;

export const nativeAuthExchangeRequestSchema = z.object({
  handoffCode: nativeAuthOpaqueValueSchema,
  requestState: nativeAuthOpaqueValueSchema,
  codeVerifier: nativeAuthVerifierSchema,
}).strict();
export type NativeAuthExchangeRequest = z.infer<typeof nativeAuthExchangeRequestSchema>;

export const nativeAuthTokenResponseSchema = z.object({
  accessToken: nativeAuthOpaqueValueSchema,
  accessExpiresAt: z.string().datetime({ offset: true }),
  refreshToken: nativeAuthOpaqueValueSchema,
  refreshExpiresAt: z.string().datetime({ offset: true }),
}).strict();
export type NativeAuthTokenResponse = z.infer<typeof nativeAuthTokenResponseSchema>;

export const nativeAuthRefreshRequestSchema = z.object({
  refreshToken: nativeAuthOpaqueValueSchema,
}).strict();
export type NativeAuthRefreshRequest = z.infer<typeof nativeAuthRefreshRequestSchema>;

export const nativeAuthRevokeRequestSchema = z.object({
  refreshToken: nativeAuthOpaqueValueSchema,
}).strict();
export type NativeAuthRevokeRequest = z.infer<typeof nativeAuthRevokeRequestSchema>;

export const nativeAuthErrorResponseSchema = z.object({
  error: nativeAuthErrorCodeSchema,
}).strict();
export type NativeAuthErrorResponse = z.infer<typeof nativeAuthErrorResponseSchema>;
