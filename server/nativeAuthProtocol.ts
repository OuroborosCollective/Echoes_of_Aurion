import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  nativeAuthExchangeRequestSchema,
  nativeAuthStartRequestSchema,
  type NativeAuthExchangeRequest, type NativeAuthStartRequest,
} from "@shared/nativeAuthContract";

function fixedTimeTextMatches(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createNativeAuthSecret(random: (length: number) => Buffer = randomBytes): string {
  return random(32).toString("base64url");
}
export function digestNativeAuthSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}
export function nativeAuthCodeChallengeFor(verifier: string): string {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}
export function nativeAuthPkceMatches(verifier: string, challenge: string): boolean {
  return fixedTimeTextMatches(nativeAuthCodeChallengeFor(verifier), challenge);
}
export function nativeAuthSecretMatches(secret: string, digest: string): boolean {
  return fixedTimeTextMatches(digestNativeAuthSecret(secret), digest);
}
export function parseNativeAuthStartRequest(raw: unknown): NativeAuthStartRequest | null {
  const parsed = nativeAuthStartRequestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
export function parseNativeAuthExchangeRequest(raw: unknown): NativeAuthExchangeRequest | null {
  const parsed = nativeAuthExchangeRequestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
export function isNativeAuthPkceS256(method: string): boolean {
  return fixedTimeTextMatches(method, "S256");
}
