import type { ZoneTicketConsumer, ZoneTicketReceipt } from "./zoneGateway";

type TrpcResultEnvelope = {
  result?: { data?: { json?: unknown } };
};

function endpointFor(url: string): string {
  return `${url.replace(/\/+$/, "")}/gameplay.consumeZoneTicket?batch=1`;
}

function readResult(payload: unknown): unknown {
  if (Array.isArray(payload)) return (payload[0] as TrpcResultEnvelope | undefined)?.result?.data?.json;
  return (payload as TrpcResultEnvelope | undefined)?.result?.data?.json;
}

function isTicketReceipt(value: unknown): value is Omit<ZoneTicketReceipt, "expiresAt"> & { expiresAt: string | Date } {
  if (!value || typeof value !== "object") return false;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.userId === "number"
    && receipt.zoneId === "observatory_threshold"
    && typeof receipt.clientBuild === "string"
    && (typeof receipt.expiresAt === "string" || receipt.expiresAt instanceof Date);
}

/**
 * Consumes a ticket through the existing Aurion backend. The ticket remains a
 * short-lived one-time bearer; the VPS receives no database credential.
 */
export function createRemoteZoneTicketConsumer(endpoint: string, fetchImpl: typeof fetch = fetch): ZoneTicketConsumer {
  return async ({ ticket, zoneId }) => {
    const response = await fetchImpl(endpointFor(endpoint), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: { json: { ticket, zoneId } } }),
    });
    if (!response.ok) return undefined;
    const result = readResult(await response.json());
    if (!isTicketReceipt(result)) return undefined;
    return {
      ...result,
      expiresAt: result.expiresAt instanceof Date ? result.expiresAt : new Date(result.expiresAt),
    };
  };
}
