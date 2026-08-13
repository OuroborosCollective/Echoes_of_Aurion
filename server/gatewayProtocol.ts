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

/** Reject duplicate, stale, non-positive, and non-integer command counters before persistence. */
export function isStrictlyIncreasingSequence(sequence: number, previousSequence: number | undefined): boolean {
  return Number.isSafeInteger(sequence) && sequence > 0 && (previousSequence === undefined || sequence > previousSequence);
}

/** A bearer grant is usable only while its persisted status is active and its expiry is still in the future. */
export function isGatewayGrantActive(status: string, expiresAt: Date, now = new Date()): boolean {
  return status === "active" && expiresAt.getTime() > now.getTime();
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
