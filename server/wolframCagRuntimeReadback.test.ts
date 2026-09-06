import { describe, expect, it } from "vitest";
import { createWolframCagClient } from "./wolframCag";
import { initialWolframCagRuntimeReadback, resolveWolframCagRuntimeReadback } from "./wolframCagRuntimeReadback";

const key = "test-wolfram-cag-key-1234567890";

describe("Wolfram CAG runtime readback", () => {
  it("reports a missing key without making a provider call", async () => {
    const initial = initialWolframCagRuntimeReadback({});
    expect(initial).toEqual({
      protocol: "aurion.wolfram-cag-runtime.v1",
      configured: false,
      providerCallExecuted: false,
      providerCanaryVerified: false,
      status: "not_configured",
      failureFamily: "missing_key",
      requestSha256: null,
      responseSha256: null,
      providerUuid: null,
      providerCode: null,
      mutationAuthority: "none",
    });
    await expect(resolveWolframCagRuntimeReadback({ environment: {} })).resolves.toEqual(initial);
  });

  it("returns only hashes and provider identity after a verified exact canary", async () => {
    const client = createWolframCagClient({
      apiKey: key,
      fetchImpl: async () => new Response(JSON.stringify({ result: "Out[1]=333833500", code: 200, success: true, uuid: "runtime-canary-uuid" }), { status: 200 }),
    });
    const readback = await resolveWolframCagRuntimeReadback({ environment: { WOLFRAM_CAG_API_KEY: key }, client });
    expect(readback).toMatchObject({
      configured: true,
      providerCallExecuted: true,
      providerCanaryVerified: true,
      status: "verified",
      failureFamily: null,
      providerUuid: "runtime-canary-uuid",
      providerCode: 200,
      mutationAuthority: "none",
    });
    expect(readback.requestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(readback.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(readback)).not.toContain(key);
    expect(JSON.stringify(readback)).not.toContain("333833500");
  });

  it("classifies provider failures without reflecting response bodies or secrets", async () => {
    const client = createWolframCagClient({
      apiKey: key,
      fetchImpl: async () => new Response(`invalid credential ${key}`, { status: 403 }),
    });
    const readback = await resolveWolframCagRuntimeReadback({ environment: { WOLFRAM_CAG_API_KEY: key }, client });
    expect(readback).toMatchObject({
      configured: true,
      providerCallExecuted: true,
      providerCanaryVerified: false,
      status: "provider_failed",
      failureFamily: "provider_http_403",
      requestSha256: null,
      responseSha256: null,
      providerUuid: null,
      providerCode: null,
    });
    expect(JSON.stringify(readback)).not.toContain(key);
    expect(JSON.stringify(readback)).not.toContain("invalid credential");
  });
});
