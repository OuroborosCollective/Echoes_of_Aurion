import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const zoneIdSchema = z.literal("observatory_threshold");
export type ZoneId = z.infer<typeof zoneIdSchema>;

export const zoneHelloSchema = z.object({
  type: z.literal("hello"),
  ticket: z.string().min(24).max(160),
  zoneId: zoneIdSchema,
  protocolVersion: z.literal(1),
});

export type ZoneHello = z.infer<typeof zoneHelloSchema>;

export type ZonePresence = { entityId: string; userId: number };
export type ZoneWelcome = { type: "welcome"; connectionId: string; zoneId: ZoneId; snapshotSeq: number; presences: ZonePresence[] };
export type ZoneSnapshot = { type: "snapshot"; zoneId: ZoneId; snapshotSeq: number; presences: ZonePresence[] };
export type ZoneReject = { type: "reject"; code: "READ_ONLY_PRESENCE" | "INVALID_MESSAGE" };

export function createZoneTicket(): string {
  return `aurion_zone_${randomBytes(32).toString("base64url")}`;
}

export function digestZoneTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

export function parseZoneHello(value: unknown): ZoneHello | null {
  const parsed = zoneHelloSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Browsers may connect from production or local development; opaque origins and unrelated hosts are rejected. */
export function isAllowedZoneOrigin(origin: string | undefined, environment = process.env.NODE_ENV): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (localhost) return url.protocol === "http:" || url.protocol === "https:";
    if (url.protocol !== "https:") return false;
    if (url.hostname === "arelogic.space") return true;
    return environment === "development" && url.hostname.endsWith(".manus.computer");
  } catch {
    return false;
  }
}

export function makeZoneConnectionId(): string {
  return `zone_peer_${randomBytes(12).toString("base64url")}`;
}
