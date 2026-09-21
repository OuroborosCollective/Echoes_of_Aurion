import { createHash } from "node:crypto";

export const MAX_GLB_BYTES = 24 * 1024 * 1024;
export const MAX_GLB_BASE64_CHARS = Math.ceil((MAX_GLB_BYTES * 4) / 3);

export const USER_GLB_MAX_BYTES = 12 * 1024 * 1024;
export const USER_GLB_MAX_BASE64_CHARS = Math.ceil((USER_GLB_MAX_BYTES * 4) / 3);

export function decodeValidatedGlbBase64(
  contentBase64: string,
  maxBytes: number = MAX_GLB_BYTES
): { bytes: Buffer; sha256: string } {
  if (typeof contentBase64 !== "string") {
    throw new Error("GLB_BASE64_TYPE_INVALID");
  }
  const cleanBase64 = contentBase64.replace(/^data:model\/gltf-binary;base64,/, "").trim();
  const bytes = Buffer.from(cleanBase64, "base64");
  if (bytes.length < 12) {
    throw new Error("GLB_TOO_SMALL");
  }
  if (bytes.length > maxBytes) {
    throw new Error("GLB_SIZE_EXCEEDED");
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { bytes, sha256 };
}

export function normalizeSafePlacementConfiguration(configurationJson: unknown): string {
  if (typeof configurationJson === "string") {
    try {
      const parsed = JSON.parse(configurationJson);
      return JSON.stringify(parsed);
    } catch {
      throw new Error("INVALID_PLACEMENT_CONFIGURATION_JSON");
    }
  }
  if (configurationJson && typeof configurationJson === "object") {
    return JSON.stringify(configurationJson);
  }
  return "{}";
}
