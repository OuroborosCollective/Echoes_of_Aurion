import { createHash } from "node:crypto";
import { AURION_RELEASE_BUDGET, assertRuntimeBinaryLimit } from "../shared/runtimeContracts";

export const MAX_GLB_BYTES = AURION_RELEASE_BUDGET.maxAdminGlbBytes;
export const MAX_GLB_BASE64_CHARS = Math.ceil((MAX_GLB_BYTES * 4) / 3) + 8;
export const USER_GLB_MAX_BYTES = AURION_RELEASE_BUDGET.maxCommunityGlbBytes;
export const USER_GLB_MAX_BASE64_CHARS = Math.ceil((USER_GLB_MAX_BYTES * 4) / 3) + 8;

const forbiddenConfigurationKeys = ["apikey", "api_key", "secret", "token", "password", "authorization", "cookie"];

export function decodeValidatedGlbBase64(contentBase64: string, maxBytes = MAX_GLB_BYTES): { bytes: Buffer; sha256: string } {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(contentBase64) || contentBase64.length % 4 !== 0) {
    throw new Error("GLB payload is not canonical base64");
  }

  const bytes = Buffer.from(contentBase64, "base64");
  if (bytes.length < 12 || bytes.toString("base64") !== contentBase64) {
    throw new Error("GLB payload size is invalid");
  }
  assertRuntimeBinaryLimit(bytes.length, maxBytes, "GLB payload size is invalid");
  if (bytes.subarray(0, 4).toString("ascii") !== "glTF" || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error("GLB binary header is invalid");
  }

  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function assertSafeConfiguration(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertSafeConfiguration);
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replaceAll(/[-\s]/g, "");
    if (forbiddenConfigurationKeys.some(forbidden => normalized.includes(forbidden))) {
      throw new Error("Monetization configuration must not contain credentials or secrets");
    }
    assertSafeConfiguration(nested);
  }
}

export function normalizeSafePlacementConfiguration(configurationJson: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(configurationJson);
  } catch {
    throw new Error("Monetization configuration must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Monetization configuration must be a JSON object");
  }
  assertSafeConfiguration(parsed);
  return JSON.stringify(parsed);
}
