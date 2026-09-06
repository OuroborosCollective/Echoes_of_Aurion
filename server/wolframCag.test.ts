import { describe, expect, it } from "vitest";
import {
  createWolframCagClient,
  runAurionWolframCagCanary,
  wolframCagConfigurationStatus,
} from "./wolframCag";

const key = "test-wolfram-cag-key-1234567890";

describe("Wolfram CAG provider boundary", () => {
  it("keeps the secret out of evidence while binding request and response hashes", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = createWolframCagClient({
      apiKey: key,
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify({ result: "Out[1]=2", code: 200, success: true, uuid: "provider-uuid-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const evidence = await client.languageCompute({ code: "1+1", timeConstraint: 5, maxChars: 100 });
    expect(evidence).toMatchObject({ component: "language_compute", providerCode: 200, providerUuid: "provider-uuid-1", result: "Out[1]=2", success: true });
    expect(evidence.requestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(evidence)).not.toContain(key);
    expect(calls[0]!.url).toBe("https://services.wolfram.com/api/cag/v1/WolframLanguageCompute");
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe(key);
  });

  it("supports the text Wolfram Alpha Results response without pretending it is JSON", async () => {
    const client = createWolframCagClient({
      apiKey: key,
      fetchImpl: async input => {
        expect(String(input)).toContain("/api/cag/v1/WolframAlphaResult?input=properties+of+diamond");
        return new Response("Query:\nproperties of diamond\nAssumption:\nmineral", { status: 200, headers: { "content-type": "text/plain" } });
      },
    });
    const evidence = await client.alphaResults({ input: "properties of diamond" });
    expect(evidence.component).toBe("alpha_results");
    expect(evidence.result).toContain("properties of diamond");
    expect(evidence.providerUuid).toBeNull();
  });

  it("fails closed on provider HTTP errors and never reflects the provider body", async () => {
    const client = createWolframCagClient({
      apiKey: key,
      fetchImpl: async () => new Response(`invalid key ${key}`, { status: 401 }),
    });
    await expect(client.languageHints({ context: "balance a dungeon" })).rejects.toThrow("WOLFRAM_CAG_HTTP_401");
  });

  it("distinguishes missing, invalid and configured runtime keys without exposing them", () => {
    expect(wolframCagConfigurationStatus({})).toMatchObject({ configured: false, configurationState: "missing_key" });
    expect(wolframCagConfigurationStatus({ WOLFRAM_CAG_API_KEY: "bad key" })).toMatchObject({ configured: false, configurationState: "invalid_key" });
    const configured = wolframCagConfigurationStatus({ WOLFRAM_CAG_API_KEY: key });
    expect(configured).toMatchObject({ configured: true, configurationState: "configured", mutationAuthority: "none" });
    expect(JSON.stringify(configured)).not.toContain(key);
  });

  it("runs the deterministic exact computation canary", async () => {
    const client = createWolframCagClient({
      apiKey: key,
      fetchImpl: async () => new Response(JSON.stringify({ result: "Out[1]=333833500", code: 200, success: true, uuid: "canary-uuid" }), { status: 200 }),
    });
    const canary = await runAurionWolframCagCanary(client);
    expect(canary).toMatchObject({ expression: "Total[Range[1000]^2]", expectedExact: "333833500", mutationAuthority: "none" });
    expect(canary.evidence.providerUuid).toBe("canary-uuid");
  });

  it("rejects oversized or empty inputs before any network call", async () => {
    let calls = 0;
    const client = createWolframCagClient({ apiKey: key, fetchImpl: async () => { calls += 1; return new Response("unexpected"); } });
    await expect(client.alphaContext({ context: "" })).rejects.toThrow("context must contain");
    await expect(client.languageCompute({ code: "x".repeat(20_001) })).rejects.toThrow("code must contain");
    expect(calls).toBe(0);
  });
});
