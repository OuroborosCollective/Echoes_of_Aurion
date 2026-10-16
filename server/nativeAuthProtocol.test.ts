import { describe, expect, it } from "vitest";
import { NATIVE_AUTH_CONTRACT_VERSION, NATIVE_AUTH_RETURN_ID } from "../shared/nativeAuthContract";
import {
  createNativeAuthSecret, digestNativeAuthSecret, isNativeAuthPkceS256,
  nativeAuthCodeChallengeFor, nativeAuthPkceMatches, nativeAuthSecretMatches,
  parseNativeAuthExchangeRequest, parseNativeAuthStartRequest,
} from "./nativeAuthProtocol";

const VERIFIER = "v".repeat(43);
describe("Aurion native auth protocol vs canonical public contract", () => {
  it("produces 256-bit base64url secrets and only stores stable digests", () => {
    const a = createNativeAuthSecret(n => Buffer.alloc(n, 3));
    const b = createNativeAuthSecret(n => Buffer.alloc(n, 4));
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toEqual(b);
    expect(digestNativeAuthSecret(a)).toMatch(/^[a-f0-9]{64}$/);
    expect(nativeAuthSecretMatches(a, digestNativeAuthSecret(a))).toBe(true);
    expect(nativeAuthSecretMatches(b, digestNativeAuthSecret(a))).toBe(false);
  });
  it("uses the exact Android return contract and only S256", () => {
    const requestState = createNativeAuthSecret();
    const request = {
      version: NATIVE_AUTH_CONTRACT_VERSION, platform: "android", appBuild: "godot-preview.1",
      returnId: NATIVE_AUTH_RETURN_ID, requestState, codeChallenge: nativeAuthCodeChallengeFor(VERIFIER),
      codeChallengeMethod: "S256",
    };
    expect(parseNativeAuthStartRequest(request)).toMatchObject({ requestState });
    expect(parseNativeAuthStartRequest({ ...request, codeChallengeMethod: "plain" })).toBeNull();
    expect(parseNativeAuthStartRequest({ ...request, returnId: "https://evil.test/" })).toBeNull();
    expect(isNativeAuthPkceS256("S256")).toBe(true);
    expect(isNativeAuthPkceS256("plain")).toBe(false);
  });
  it("validates canonical exchange fields and exact verifier binding", () => {
    const request = {
      version: NATIVE_AUTH_CONTRACT_VERSION, transactionId: createNativeAuthSecret(),
      code: createNativeAuthSecret(), codeVerifier: VERIFIER, appBuild: "godot-preview.1",
    };
    expect(parseNativeAuthExchangeRequest(request)).toEqual(request);
    expect(parseNativeAuthExchangeRequest({ ...request, extra: createNativeAuthSecret() })).toBeNull();
    expect(parseNativeAuthExchangeRequest({ ...request, codeVerifier: "bad" })).toBeNull();
    expect(nativeAuthPkceMatches(VERIFIER, nativeAuthCodeChallengeFor(VERIFIER))).toBe(true);
    expect(nativeAuthPkceMatches("w".repeat(43), nativeAuthCodeChallengeFor(VERIFIER))).toBe(false);
  });
});
