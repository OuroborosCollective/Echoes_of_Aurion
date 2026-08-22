import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const zoneIdSchema = z.literal("observatory_threshold");
export type ZoneId = z.infer<typeof zoneIdSchema>;
export const ZONE_FIXED_POINT_SCALE = 1_000;
export const ZONE_TICK_MS = 100;

export const zoneHelloSchema = z.object({
  type: z.literal("hello"),
  ticket: z.string().min(24).max(160),
  zoneId: zoneIdSchema,
  protocolVersion: z.literal(1),
});

export type ZoneHello = z.infer<typeof zoneHelloSchema>;

export const zoneMoveSchema = z.object({
  type: z.literal("move"),
  clientSeq: z.number().int().min(1).max(2_147_483_647),
  input: z.object({
    x: z.number().int().min(-1).max(1),
    z: z.number().int().min(-1).max(1),
  }),
});

export type ZoneMove = z.infer<typeof zoneMoveSchema>;
export type ZonePosition = { x: number; z: number };
export type ZonePresence = { entityId: string; userId: number; position: ZonePosition; lastAcceptedClientSeq: number };
export type ZoneWelcome = { type: "welcome"; connectionId: string; zoneId: ZoneId; snapshotSeq: number; tick: number; presences: ZonePresence[] };
export type ZoneSnapshot = { type: "snapshot"; zoneId: ZoneId; snapshotSeq: number; tick: number; presences: ZonePresence[] };
export type ZoneReject = { type: "reject"; code: "INVALID_MESSAGE" | "STALE_CLIENT_SEQUENCE" | "UNSUPPORTED_ZONE_COMMAND" };

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

export function parseZoneMove(value: unknown): ZoneMove | null {
  const parsed = zoneMoveSchema.safeParse(value);
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
