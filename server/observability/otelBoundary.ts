import { createHash, randomBytes } from "node:crypto";
import type { RequestHandler } from "express";

export interface OTelCausalReceiptReference {
  worldId: string;
  zoneId: string;
  tick: number;
  receiptHash: string;
  sourceRevision: string;
}

export interface OTelHttpTelemetryRecord {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  sourceRevision: string;
  receiptReferenceHash?: string;
}

const HEX_64 = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function redactTelemetryRoute(path: string): string {
  return path
    .split("/")
    .map(segment => {
      if (!segment) return segment;
      if (/^[0-9a-f]{16,}$/i.test(segment)) return ":opaque";
      if (/^\d{1,18}$/.test(segment)) return ":id";
      return segment.length > 96 ? `${segment.slice(0, 96)}…` : segment;
    })
    .join("/");
}

export function buildOtlpTracePayload(record: OTelHttpTelemetryRecord): Record<string, unknown> {
  if (!REVISION.test(record.sourceRevision)) {
    throw new Error("OTEL_SOURCE_REVISION_INVALID");
  }
  const durationNs = Math.max(0, Math.round(record.durationMs * 1_000_000));
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");

  const attributes: Array<{ key: string; value: Record<string, string | number> }> = [
    { key: "http.request.method", value: { stringValue: record.method.slice(0, 16) } },
    { key: "http.route", value: { stringValue: redactTelemetryRoute(record.route) } },
    { key: "http.response.status_code", value: { intValue: record.statusCode } },
    { key: "aurion.source_revision", value: { stringValue: record.sourceRevision } },
  ];
  if (record.receiptReferenceHash) {
    if (!HEX_64.test(record.receiptReferenceHash)) throw new Error("OTEL_RECEIPT_REFERENCE_HASH_INVALID");
    attributes.push({ key: "aurion.receipt_reference_hash", value: { stringValue: record.receiptReferenceHash } });
  }

  return {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: process.env.OTEL_SERVICE_NAME || "echoes-of-aurion" } },
          { key: "service.namespace", value: { stringValue: "aurion" } },
        ],
      },
      scopeSpans: [{
        scope: { name: "aurion-otel-boundary", version: "1.0.0" },
        spans: [{
          traceId,
          spanId,
          name: `${record.method} ${redactTelemetryRoute(record.route)}`.slice(0, 160),
          kind: 2,
          startTimeUnixNano: String(nowNs - BigInt(durationNs)),
          endTimeUnixNano: String(nowNs),
          attributes,
          status: { code: record.statusCode >= 500 ? 2 : 1 },
        }],
      }],
    }],
  };
}

function endpointUrl(): URL | null {
  const configured = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured.endsWith("/v1/traces") ? configured : `${configured.replace(/\/$/, "")}/v1/traces`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function createOtelHttpMiddleware(): RequestHandler {
  return (req, res, next) => {
    const enabled = process.env.OTEL_ENABLED === "true" && endpointUrl() !== null;
    if (!enabled) {
      next();
      return;
    }

    const startedAt = performance.now();
    res.on("finish", () => {
      const endpoint = endpointUrl();
      if (!endpoint) return;
      const record: OTelHttpTelemetryRecord = {
        method: req.method,
        route: req.path,
        statusCode: res.statusCode,
        durationMs: performance.now() - startedAt,
        sourceRevision: process.env.AURION_RELEASE_SHA || process.env.GIT_COMMIT || "",
      };
      if (!REVISION.test(record.sourceRevision)) return;

      let payload: Record<string, unknown>;
      try {
        payload = buildOtlpTracePayload(record);
      } catch {
        return;
      }
      void fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(750),
      }).catch(() => undefined);
    });

    next();
  };
}

export function recordOtelCausalReceiptReference(reference: OTelCausalReceiptReference): void {
  if (process.env.OTEL_ENABLED !== "true") return;
  if (!REVISION.test(reference.sourceRevision)) return;
  if (!HEX_64.test(reference.receiptHash)) return;
  if (!reference.worldId || !reference.zoneId) return;

  const referenceHash = digest(JSON.stringify({
    worldId: reference.worldId,
    zoneId: reference.zoneId,
    tick: reference.tick,
    receiptHash: reference.receiptHash,
    sourceRevision: reference.sourceRevision,
  }));

  const endpoint = endpointUrl();
  if (!endpoint) return;

  let payload: Record<string, unknown>;
  try {
    payload = buildOtlpTracePayload({
      method: "CAUSAL_RECEIPT",
      route: `/world/${reference.worldId}/zone/${reference.zoneId}/tick/${reference.tick}`,
      statusCode: 200,
      durationMs: 0,
      sourceRevision: reference.sourceRevision,
      receiptReferenceHash: referenceHash,
    });
  } catch {
    return;
  }

  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(750),
  }).catch(() => undefined);
}
