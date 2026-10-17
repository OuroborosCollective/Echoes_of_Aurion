import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  sealNativeAuthRequestState, openNativeAuthRequestState,
  createNativeBrowserBinding, readNativeBrowserBinding,
  nativeBrowserCsrfMatches,
} from "./nativeAuthStateSeal";

const previous = process.env.NATIVE_AUTH_STATE_SEAL_KEY;
const KEY = Buffer.alloc(32, 17).toString("base64url");
const TX = "t".repeat(43);
const STATE = "s".repeat(43);
const BUILD = "godot-android.1";
const RETURN = "aurion.android.app-link.v1";

describe("native browser state confidentiality and anti-CSRF binding", () => {
  beforeEach(() => { process.env.NATIVE_AUTH_STATE_SEAL_KEY = KEY; });
  afterEach(() => {
    if (previous === undefined) delete process.env.NATIVE_AUTH_STATE_SEAL_KEY;
    else process.env.NATIVE_AUTH_STATE_SEAL_KEY = previous;
  });

  it("seals the client request state with authenticated per-transaction encryption", () => {
    const sealed = sealNativeAuthRequestState(STATE, TX, BUILD, RETURN);
    expect(sealed).not.toContain(STATE);
    expect(openNativeAuthRequestState(sealed, TX, BUILD, RETURN)).toBe(STATE);
    expect(() => openNativeAuthRequestState(sealed, "x".repeat(43), BUILD, RETURN)).toThrow();
    expect(() => openNativeAuthRequestState(sealed, TX, "other-build", RETURN)).toThrow();
    expect(() => openNativeAuthRequestState(sealed, TX, BUILD, "other-return")).toThrow();
    expect(() => openNativeAuthRequestState(sealed.slice(0, -1) + "!", TX, BUILD, RETURN)).toThrow();
  });

  it("rejects missing or insufficient state-encryption key deterministically", () => {
    delete process.env.NATIVE_AUTH_STATE_SEAL_KEY;
    expect(() => sealNativeAuthRequestState(STATE, TX, BUILD, RETURN))
      .toThrow("NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
    process.env.NATIVE_AUTH_STATE_SEAL_KEY = "short";
    expect(() => sealNativeAuthRequestState(STATE, TX, BUILD, RETURN))
      .toThrow("NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
  });

  it("signs a cookie-bound browser confirmation and rejects tampering and expiry", () => {
    const issuedAt = 1_792_000_000_000;
    const binding = createNativeBrowserBinding(TX, issuedAt);
    const decoded = readNativeBrowserBinding(binding.cookie, issuedAt + 100);
    expect(decoded).toEqual({ transactionId: TX, csrf: binding.csrf });
    expect(nativeBrowserCsrfMatches(binding.csrf, decoded!.csrf)).toBe(true);
    expect(nativeBrowserCsrfMatches("x".repeat(43), decoded!.csrf)).toBe(false);
    expect(readNativeBrowserBinding(binding.cookie.replace(TX, "x".repeat(43)), issuedAt + 100)).toBeNull();
    expect(readNativeBrowserBinding(binding.cookie, issuedAt + 600_000)).toBeNull();
    expect(readNativeBrowserBinding(binding.cookie, issuedAt - 60_000)).toBeNull();
  });
});
