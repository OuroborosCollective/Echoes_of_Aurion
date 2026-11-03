import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import express from "express";
import { probeDenialReason, registerProductionProbeRoutes } from "./aurionProductionProbeHttp";

describe("production probe denial reasons", () => {
  it("returns stable machine codes from the message, error code or cause", () => {
    expect(probeDenialReason(new Error("PROBE_ZONE_NOT_ACTIVE"))).toBe("PROBE_ZONE_NOT_ACTIVE");
    expect(probeDenialReason(new Error("CAUSAL_ARCHIVE_CONFLICT:arch_observatory_threshold_1_64"))).toBe("CAUSAL_ARCHIVE_CONFLICT");
    const drizzle = new Error("Failed query: insert into `aurionCausalTickReceipts` values (?, ?)\nparams: secret-row,hunter2", {
      cause: Object.assign(new Error("Lock wait timeout exceeded; try restarting transaction"), { code: "ER_LOCK_WAIT_TIMEOUT" }),
    });
    expect(probeDenialReason(drizzle)).toBe("ER_LOCK_WAIT_TIMEOUT");
  });

  it("never returns free text, SQL, token-like or non-error values", () => {
    for (const value of [
      new Error("invalid password hunter2 for thosu"),
      new Error("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJyZXBvIn0.c2lnbmF0dXJl"),
      new Error("select * from users"),
      new Error(""),
      "PROBE_ZONE_NOT_ACTIVE",
      null,
      undefined,
      { message: 42 },
    ]) expect(probeDenialReason(value)).toBe("UNCLASSIFIED");
  });
});

describe("production probe denial logging over real HTTP", () => {
  let server: Server;
  let base: string;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerProductionProbeRoutes(app, () => ({ revision: "c".repeat(40) }));
    server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/production-probe`;
  });
  afterEach(() => warn.mockClear());
  afterAll(async () => {
    warn.mockRestore();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const denials = () => warn.mock.calls.map(call => String(call[0]))
    .filter(line => line.startsWith("[ProductionProbe] DENIED "))
    .map(line => JSON.parse(line.slice("[ProductionProbe] DENIED ".length)));

  it("keeps the execute response generic and logs only the denial code", async () => {
    const response = await fetch(`${base}/execute`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope: "aurion.probe.gameplay-session-readback" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "PROBE_EXECUTION_DENIED", credentialReturned: false });
    expect(denials()).toEqual([{ recordType: "aurion.production-probe-denial", schemaVersion: 1, operation: "execute", reason: "PROBE_OIDC_REQUIRED" }]);
  });

  it("logs owner denials per operation without echoing request content", async () => {
    const response = await fetch(`${base}/approve`, {
      method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ password: "hunter2-should-never-be-logged" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "PROBE_OWNER_REQUEST_DENIED" });
    expect(denials()).toEqual([{ recordType: "aurion.production-probe-denial", schemaVersion: 1, operation: "approve", reason: "PROBE_OWNER_ORIGIN_REQUIRED" }]);
    expect(warn.mock.calls.flat().join("\n")).not.toContain("hunter2");
  });
});
