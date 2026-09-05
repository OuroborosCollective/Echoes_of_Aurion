import { z } from "zod";

export const aurionRuntimeCommandSchema = z.enum(["W", "A", "S", "D", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

export const AURION_RELEASE_BUDGET = Object.freeze({
  maxCommunityGlbBytes: 16 * 1024 * 1024,
  maxAdminGlbBytes: 24 * 1024 * 1024,
  maxTextureDimension: 2048,
  maxTextureSetBytes: 4 * 1024 * 1024,
  maxMobileSceneDrawCalls: 80,
  maxMobileSceneTriangles: 180_000,
  maxMobileCharacterTriangles: 15_000,
});

export function assertRuntimeIntegerInRange(value: number, minimum: number, maximum: number, message: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(message);
  return value;
}

export function assertRuntimeBinaryLimit(bytes: number, maximum: number, message: string): number {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > maximum) throw new Error(message);
  return bytes;
}

export function validateRuntimeModelSource(sourceUrl?: string): { valid: boolean; reason?: string } {
  if (!sourceUrl) return { valid: true };
  try {
    const url = new URL(sourceUrl, "https://aurion.local");
    const isRelativeStoragePath = sourceUrl.startsWith("/manus-storage/") || /^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/.test(sourceUrl);
    const isBundledStaticAsset = sourceUrl.startsWith("./aurion-assets/") || sourceUrl.startsWith("aurion-assets/");
    const isSecureRemoteUrl = sourceUrl.startsWith("https://") && url.protocol === "https:";
    if (!isRelativeStoragePath && !isBundledStaticAsset && !isSecureRemoteUrl) return { valid: false, reason: "Quelle muss über HTTPS oder den Aurion-Speicher geladen werden." };
    if (!url.pathname.toLowerCase().endsWith(".glb")) return { valid: false, reason: "Quelle ist kein GLB-Modell." };
    if (sourceUrl.length > 2048) return { valid: false, reason: "Quelladresse überschreitet die sichere Runtime-Grenze." };
    return { valid: true };
  } catch {
    return { valid: false, reason: "Quelle besitzt keine gültige Modelladresse." };
  }
}

export function runtimeIssueCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown";
  let hash = 0;
  for (let index = 0; index < message.length; index += 1) hash = (hash * 31 + message.charCodeAt(index)) | 0;
  return `AUR-${Math.abs(hash).toString(36).slice(0, 6).toUpperCase()}`;
}
