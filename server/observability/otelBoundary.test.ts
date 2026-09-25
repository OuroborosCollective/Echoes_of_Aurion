import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { buildOtlpTracePayload, createOtelHttpMiddleware, redactTelemetryRoute } from "./otelBoundary";

describe("Issue #142: OpenTelemetry side-channel boundary", () => {
  it("redacts opaque and numeric route segments", () => {
    expect(redactTelemetryRoute("/api/player/123/profile/abcdef1234567890")).toBe("/api/player/:id/profile/:opaque");
  });

  it("emits only bounded telemetry metadata and never request payloads", () => {
    const payload = JSON.stringify(buildOtlpTracePayload({
      method: "POST", route: "/api/player/123/profile", statusCode: 200, durationMs: 4, sourceRevision: "a".repeat(40),
    }));
    expect(payload).toContain(":id");
    expect(payload).not.toContain("password");
    expect(payload).not.toContain("authorization");
    expect(payload).not.toContain("requestBody");
  });

  it("leaves request execution unchanged when OTel is disabled", () => {
    const previousEnabled = process.env.OTEL_ENABLED;
    const previousEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.OTEL_ENABLED = "false";
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const middleware = createOtelHttpMiddleware();
    const next = vi.fn();
    const on = vi.fn();
    middleware({ method: "GET", path: "/healthz" } as any, { statusCode: 200, on } as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(on).not.toHaveBeenCalled();
    if (previousEnabled === undefined) delete process.env.OTEL_ENABLED; else process.env.OTEL_ENABLED = previousEnabled;
    if (previousEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT; else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previousEndpoint;
  });

  it("keeps collector outages off the request path", async () => {
    const previousEnabled = process.env.OTEL_ENABLED;
    const previousEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const previousRevision = process.env.AURION_RELEASE_SHA;
    process.env.OTEL_ENABLED = "true";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:9";
    process.env.AURION_RELEASE_SHA = "b".repeat(40);
    const middleware = createOtelHttpMiddleware();
    const next = vi.fn();
    const listeners = new Map<string, () => void>();
    const on = vi.fn((event: string, listener: () => void) => listeners.set(event, listener));
    const res = { statusCode: 200, on } as any;
    middleware({ method: "GET", path: "/healthz" } as any, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    listeners.get("finish")?.();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(next).toHaveBeenCalledTimes(1);
    if (previousEnabled === undefined) delete process.env.OTEL_ENABLED; else process.env.OTEL_ENABLED = previousEnabled;
    if (previousEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT; else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previousEndpoint;
    if (previousRevision === undefined) delete process.env.AURION_RELEASE_SHA; else process.env.AURION_RELEASE_SHA = previousRevision;
  });

  it("keeps OTel out of canonical gameplay reducer modules", () => {
    const prohibited = [/opentelemetry/i, /otelBoundary/i];
    const files = ["server/gameplayProtocol.ts", "server/worldChunkProtocol.ts", "server/wasdAurionProtocol.ts", "server/aurionLootProtocol.ts"];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      for (const pattern of prohibited) expect(source).not.toMatch(pattern);
    }
  });
});