import { describe, expect, it } from "vitest";
import {
  NATIVE_AUTH_ACCESS_TTL_SECONDS,
  NATIVE_AUTH_CONTRACT_VERSION,
  NATIVE_AUTH_REFRESH_ABSOLUTE_TTL_SECONDS,
  NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS,
  NATIVE_AUTH_RETURN_ID,
  nativeAuthCallbackQuerySchema,
  nativeAuthErrorSchema,
  nativeAuthExchangeRequestSchema,
  nativeAuthRefreshRequestSchema,
  nativeAuthRevokeRequestSchema,
  nativeAuthStartRequestSchema,
  nativeAuthStartResponseSchema,
  nativeAuthTokenPairSchema,
} from "./nativeAuthContract";

const opaque = (character: string) => character.repeat(43);
const version = NATIVE_AUTH_CONTRACT_VERSION;

describe("native auth public contract", () => {
  it("accepts one complete S256-bound Android exchange shape", () => {
    expect(
      nativeAuthStartRequestSchema.parse({
        version,
        codeChallenge: opaque("c"),
        codeChallengeMethod: "S256",
        requestState: opaque("s"),
        appBuild: "f16691487936",
        platform: "android",
        returnId: NATIVE_AUTH_RETURN_ID,
      }),
    ).toMatchObject({ codeChallengeMethod: "S256", platform: "android" });
    expect(
      nativeAuthStartResponseSchema.parse({
        version,
        transactionId: opaque("t"),
        browserUrl: "https://arelogic.space/api/native-auth/browser/t",
        expiresInSeconds: 300,
      }),
    ).toMatchObject({ expiresInSeconds: 300 });
    expect(
      nativeAuthCallbackQuerySchema.parse({
        code: opaque("h"),
        state: opaque("s"),
      }),
    ).toMatchObject({ state: opaque("s") });
    expect(
      nativeAuthExchangeRequestSchema.parse({
        version,
        transactionId: opaque("t"),
        code: opaque("h"),
        codeVerifier: opaque("v"),
        appBuild: "f16691487936",
      }),
    ).toMatchObject({ appBuild: "f16691487936" });
  });

  it("fixes the token lifetimes and keeps both credentials opaque", () => {
    const pair = nativeAuthTokenPairSchema.parse({
      version,
      tokenType: "Bearer",
      accessToken: opaque("a"),
      accessExpiresInSeconds: NATIVE_AUTH_ACCESS_TTL_SECONDS,
      refreshToken: opaque("r"),
      refreshAbsoluteExpiresInSeconds:
        NATIVE_AUTH_REFRESH_ABSOLUTE_TTL_SECONDS,
      refreshIdleExpiresInSeconds: NATIVE_AUTH_REFRESH_IDLE_TTL_SECONDS,
    });
    expect(pair.accessExpiresInSeconds).toBe(15 * 60);
    expect(pair.refreshAbsoluteExpiresInSeconds).toBe(30 * 24 * 60 * 60);
    expect(pair.refreshIdleExpiresInSeconds).toBe(7 * 24 * 60 * 60);
    expect(() =>
      nativeAuthTokenPairSchema.parse({
        ...pair,
        accessToken: "header.payload.signature",
      }),
    ).toThrow();
  });

  it("rejects downgrade, weak binding and unsafe browser destinations", () => {
    const request = {
      version,
      codeChallenge: opaque("c"),
      codeChallengeMethod: "S256",
      requestState: opaque("s"),
      appBuild: "aurion-preview.1",
      platform: "android",
      returnId: NATIVE_AUTH_RETURN_ID,
    } as const;
    expect(() =>
      nativeAuthStartRequestSchema.parse({
        ...request,
        codeChallengeMethod: "plain",
      }),
    ).toThrow();
    expect(() =>
      nativeAuthStartRequestSchema.parse({ ...request, requestState: "short" }),
    ).toThrow();
    expect(() =>
      nativeAuthStartRequestSchema.parse({ ...request, returnId: "custom" }),
    ).toThrow();
    expect(() =>
      nativeAuthStartResponseSchema.parse({
        version,
        transactionId: opaque("t"),
        browserUrl: "http://arelogic.space/api/native-auth/browser/t",
        expiresInSeconds: 300,
      }),
    ).toThrow();
  });

  it("rejects secrets smuggled into callback and error envelopes", () => {
    expect(() =>
      nativeAuthCallbackQuerySchema.parse({
        code: opaque("h"),
        state: opaque("s"),
        accessToken: opaque("a"),
      }),
    ).toThrow();
    expect(() =>
      nativeAuthErrorSchema.parse({
        version,
        error: "SESSION_REVOKED",
        detail: opaque("a"),
      }),
    ).toThrow();
  });

  it("uses the same opaque refresh credential for rotation and revocation", () => {
    const refreshToken = opaque("r");
    expect(
      nativeAuthRefreshRequestSchema.parse({ version, refreshToken }),
    ).toEqual({ version, refreshToken });
    expect(
      nativeAuthRevokeRequestSchema.parse({
        version,
        refreshToken,
        scope: "all_sessions",
      }),
    ).toMatchObject({ scope: "all_sessions" });
  });
});
