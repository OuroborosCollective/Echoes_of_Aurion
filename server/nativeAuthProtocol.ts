import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  NATIVE_AUTH_PKCE_METHOD,
  nativeAuthExchangeRequestSchema,
  nativeAuthStartRequestSchema,
  type NativeAuthExchangeRequest,
  type NativeAuthStartRequest,
} from "@shared/nativeAuthContract";

const NATIVE_AUTH_SECRET_PREFIX = "aurion_native_";

function fixedTimeTextMatches(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createNativeAuthSecret(random: (length: number) => Buffer = randomBytes): string {
  return `${NATIVE_AUTH_SECRET_PREFIX}${random(32).toString("base64url")}`;
}

export function digestNativeAuthSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function nativeAuthCodeChallengeFor(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

export function nativeAuthPkceMatches(verifier: string, expectedChallenge: string): boolean {
  return fixedTimeTextMatches(nativeAuthCodeChallengeFor(verifier), expectedChallenge);
}

export function nativeAuthSecretMatches(secret: string, expectedDigest: string): boolean {
  return fixedTimeTextMatches(digestNativeAuthSecret(secret), expectedDigest);
}

export function parseNativeAuthStartRequest(value: unknown): NativeAuthStartRequest | null {
  const parsed = nativeAuthStartRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseNativeAuthExchangeRequest(value: unknown): NativeAuthExchangeRequest | null {
  const parsed = nativeAuthExchangeRequestSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isNativeAuthPkceS256(method: string): boolean {
  return fixedTimeTextMatches(method, NATIVE_AUTH_PKCE_METHOD);
}
