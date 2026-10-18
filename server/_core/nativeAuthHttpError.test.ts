import { describe, expect, it } from "vitest";
import { HttpError } from "@shared/_core/errors";
import { isNativeAuthSessionExpired, isNativeAuthUnavailable } from "./nativeAuthHttpError";

describe("native-auth HTTP availability classification", () => {
  it("passes only typed retryable native availability failures", () => {
    expect(isNativeAuthUnavailable(new HttpError(503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE"))).toBe(true);
    expect(isNativeAuthUnavailable(new HttpError(401, "NATIVE_AUTH_SESSION_EXPIRED"))).toBe(false);
    expect(isNativeAuthUnavailable(new Error("NATIVE_AUTH_CONFIGURATION_UNAVAILABLE"))).toBe(false);
    expect(isNativeAuthUnavailable(new HttpError(503, "mysql://private:password@host/db"))).toBe(false);
  });

  it("passes only typed native access expiry failures", () => {
    expect(isNativeAuthSessionExpired(new HttpError(401, "NATIVE_AUTH_SESSION_EXPIRED"))).toBe(true);
    expect(isNativeAuthSessionExpired(new HttpError(503, "NATIVE_AUTH_CONFIGURATION_UNAVAILABLE"))).toBe(false);
    expect(isNativeAuthSessionExpired(new Error("NATIVE_AUTH_SESSION_EXPIRED"))).toBe(false);
    expect(isNativeAuthSessionExpired(new HttpError(401, "OTHER_AUTHENTICATION_FAILURE"))).toBe(false);
  });
});
