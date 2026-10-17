import {
  createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual,
} from "node:crypto";
import { NATIVE_AUTH_TRANSACTION_TTL_SECONDS } from "@shared/nativeAuthContract";

// Only a separately configured 256-bit server key can decrypt client State.
// This secret is not a client secret, not the web JWT key, and never leaves the server.
function key(): Buffer {
  const encoded = process.env.NATIVE_AUTH_STATE_SEAL_KEY;
  if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) {
    throw new Error("NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
  }
  const value = Buffer.from(encoded, "base64url");
  if (value.length !== 32 || value.toString("base64url") !== encoded) {
    throw new Error("NATIVE_AUTH_CONFIGURATION_UNAVAILABLE");
  }
  return value;
}

function aad(transactionId: string, appBuild: string, returnId: string): Buffer {
  return Buffer.from(["aurion.native-auth.state.v1", transactionId, appBuild, returnId].join("\0"), "utf8");
}

function matches(left: string, right: string): boolean {
  const lhs = Buffer.from(left, "utf8");
  const rhs = Buffer.from(right, "utf8");
  return lhs.length === rhs.length && timingSafeEqual(lhs, rhs);
}

/** AES-256-GCM with random nonce, authentication tag and transaction-bound AAD. */
export function sealNativeAuthRequestState(
  requestState: string, transactionId: string, appBuild: string, returnId: string,
): string {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(requestState)) {
    throw new Error("NATIVE_AUTH_STATE_MISMATCH");
  }
  const encryptionKey = key();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
  cipher.setAAD(aad(transactionId, appBuild, returnId));
  const ciphertext = Buffer.concat([cipher.update(requestState, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openNativeAuthRequestState(
  sealed: string, transactionId: string, appBuild: string, returnId: string,
): string {
  const encryptionKey = key();
  try {
    if (!/^[A-Za-z0-9_-]{40,256}$/.test(sealed)) throw new Error("invalid sealed state");
    const raw = Buffer.from(sealed, "base64url");
    if (raw.length < 29 || raw.toString("base64url") !== sealed) throw new Error("invalid sealed state");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, raw.subarray(0, 12));
    decipher.setAAD(aad(transactionId, appBuild, returnId));
    decipher.setAuthTag(raw.subarray(12, 28));
    const state = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(state)) throw new Error("invalid state");
    return state;
  } catch {
    throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
  }
}

/** A browser-only CSRF pairing, not a device credential or login permission. */
export function createNativeBrowserBinding(
  transactionId: string, issuedAtMs: number = Date.now(),
): { cookie: string; csrf: string } {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(transactionId) ||
      !Number.isSafeInteger(issuedAtMs) || issuedAtMs <= 0) {
    throw new Error("NATIVE_AUTH_TRANSACTION_INVALID");
  }
  const csrf = randomBytes(32).toString("base64url");
  const issued = issuedAtMs.toString(36);
  const payload = [transactionId, csrf, issued].join(".");
  const mac = createHmac("sha256", key()).update("aurion.native-auth.browser.v1\0")
    .update(payload).digest("base64url");
  return { cookie: payload + "." + mac, csrf };
}

export function readNativeBrowserBinding(
  cookie: string | undefined, nowMs: number = Date.now(),
): { transactionId: string; csrf: string } | null {
  if (!cookie) return null;
  const match = /^([A-Za-z0-9_-]{32,128})\.([A-Za-z0-9_-]{43})\.([a-z0-9]{1,12})\.([A-Za-z0-9_-]{43})$/.exec(cookie);
  if (!match || !Number.isSafeInteger(nowMs)) return null;
  const [, transactionId, csrf, issued, signature] = match;
  const createdAtMs = Number.parseInt(issued, 36);
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs > nowMs + 30_000 ||
      createdAtMs + NATIVE_AUTH_TRANSACTION_TTL_SECONDS * 1000 <= nowMs) return null;
  const payload = [transactionId, csrf, issued].join(".");
  const expected = createHmac("sha256", key()).update("aurion.native-auth.browser.v1\0")
    .update(payload).digest("base64url");
  return matches(signature, expected) ? { transactionId, csrf } : null;
}

export function nativeBrowserCsrfMatches(supplied: string, expected: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(supplied) && matches(supplied, expected);
}
