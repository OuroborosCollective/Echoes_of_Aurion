import { describe, expect, it } from "vitest";
import {
  NATIVE_AUTH_PKCE_METHOD,
  NATIVE_AUTH_PROTOCOL_VERSION,
  NATIVE_AUTH_RETURN_ID,
} from "../shared/nativeAuthContract";
import {
  createNativeAuthSecret,
  digestNativeAuthSecret,
  isNativeAuthPkceS256,
  nativeAuthCodeChallengeFor,
  nativeAuthPkceMatches,
  nativeAuthSecretMatches,
  parseNativeAuthExchangeRequest,
  parseNativeAuthStartRequest,
} from "./nativeAuthProtocol";

const verifier = "a".repeat(43);

describe("Aurion native authentication protocol", () => {
  it("uses opaque 256-bit values and persists only stable digests", () => {
    const first = createNativeAuthSecret(length => Buffer.alloc(length, 7));
    const second = createNativeAuthSecret(length => Buffer.alloc(length, 8));

    expect(first).toMatch(/^aurion_native_[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^aurion_native_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(digestNativeAuthSecret(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(nativeAuthSecretMatches(first, digestNativeAuthSecret(first))).toBe(true);
    expect(nativeAuthSecretMatches(second, digestNativeAuthSecret(first))).toBe(false);
  });

  it("accepts only the fixed Android return contract and S256 PKCE", () => {
    const requestState = createNativeAuthSecret(length => Buffer.alloc(length, 3));
    const challenge = nativeAuthCodeChallengeFor(verifier);

    expect(parseNativeAuthStartRequest({
      protocolVersion: NATIVE_AUTH_PROTOCOL_VERSION,
      platform: "android",
      appBuild: "godot-preview-1",
      returnId: NATIVE_AUTH_RETURN_ID,
      requestState,
      codeChallenge: challenge,
      codeChallengeMethod: NATIVE_AUTH_PKCE_METHOD,
    })).toMatchObject({ requestState, codeChallenge: challenge });
    expect(parseNativeAuthStartRequest({
      protocolVersion: NATIVE_AUTH_PROTOCOL_VERSION,
      platform: "android",
      appBuild: "godot-preview-1",
      returnId: "https://attacker.example/callback",
      requestState,
      codeChallenge: challenge,
      codeChallengeMethod: "plain",
    })).toBeNull();
    expect(isNativeAuthPkceS256("S256")).toBe(true);
    expect(isNativeAuthPkceS256("plain")).toBe(false);
  });

  it("binds exchange codes to an exact verifier and state without accepting extra fields", () => {
    const handoffCode = createNativeAuthSecret(length => Buffer.alloc(length, 9));
    const requestState = createNativeAuthSecret(length => Buffer.alloc(length, 10));
    const challenge = nativeAuthCodeChallengeFor(verifier);

    expect(nativeAuthPkceMatches(verifier, challenge)).toBe(true);
    expect(nativeAuthPkceMatches("b".repeat(43), challenge)).toBe(false);
    expect(parseNativeAuthExchangeRequest({ handoffCode, requestState, codeVerifier: verifier })).toEqual({ handoffCode, requestState, codeVerifier: verifier });
    expect(parseNativeAuthExchangeRequest({ handoffCode, requestState, codeVerifier: verifier, accessToken: createNativeAuthSecret() })).toBeNull();
    expect(parseNativeAuthExchangeRequest({ handoffCode, requestState: "short", codeVerifier: verifier })).toBeNull();
  });
});
