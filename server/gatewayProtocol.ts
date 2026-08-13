import { createHash, randomBytes, randomUUID } from "node:crypto";

export const AURION_COMMANDS = ["W", "A", "S", "D", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export type AurionCommand = (typeof AURION_COMMANDS)[number];

export function normalizeAurionCommand(value: string): AurionCommand | null {
  const normalized = value.trim().toUpperCase();
  return (AURION_COMMANDS as readonly string[]).includes(normalized)
    ? (normalized as AurionCommand)
    : null;
}

/** Converts a raw client signal only when the paired session explicitly allows it. */
export function allowGatewayCommand(value: string, allowedCommands: readonly string[]): AurionCommand | null {
  const normalized = normalizeAurionCommand(value);
  return normalized && allowedCommands.includes(normalized) ? normalized : null;
}

export function parseAllowedCommands(serialized: string): AurionCommand[] {
  try {
    const candidate = JSON.parse(serialized);
    if (!Array.isArray(candidate)) return [];
    return Array.from(new Set(candidate.map(value => typeof value === "string" ? normalizeAurionCommand(value) : null).filter((value): value is AurionCommand => value !== null)));
  } catch {
    return [];
  }
}

export function createPairingToken(): string {
  return `aurion_${randomBytes(32).toString("base64url")}`;
}

export function digestPairingToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createGatewaySessionId(): string {
  return `ags_${randomUUID().replaceAll("-", "")}`;
}

export const defaultGatewayCommands = (): AurionCommand[] => ["W", "A", "S", "D", "1", "2", "9"];
