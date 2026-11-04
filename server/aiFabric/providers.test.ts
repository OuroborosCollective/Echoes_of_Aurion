import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { FabricConfigSchema } from "./policy";
import { OpenCodeProvider, boundedJson, freeModel, loopbackUrl, reservationMicros, suitable, type Model } from "./providers";
const model: Model = { id: "fixture/model:free", context_length: 100000, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, supported_parameters: [], pricing: { prompt: "0", completion: "0" } };
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { for (const s of servers.splice(0)) { s.closeAllConnections(); await new Promise<void>(r => s.close(() => r())); } });
async function serve(handler: Parameters<typeof createServer>[0]) {
  const server = createServer(handler); servers.push(server); await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
describe("real HTTP transport, explicitly synthetic upstream responses", () => {
  it("accepts bounded JSON and rejects redirects, malformed JSON, oversized streams and rate limits", async () => {
    const base = await serve((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/redirect") { res.writeHead(302, { Location: "/ok" }); res.end(); }
      else if (req.url === "/large") res.end('"' + "x".repeat(4 * 1024 * 1024) + '"');
      else if (req.url === "/limit") { res.statusCode = 429; res.end("{}"); }
      else res.end(req.url === "/bad" ? "{" : '{"ok":true}');
    });
    expect(await boundedJson(base + "/ok")).toEqual({ ok: true });
    await expect(boundedJson(base + "/redirect")).rejects.toThrow("OFFLINE");
    await expect(boundedJson(base + "/bad")).rejects.toThrow("INVALID_JSON");
    await expect(boundedJson(base + "/large")).rejects.toThrow("RESPONSE_TOO_LARGE");
    await expect(boundedJson(base + "/limit")).rejects.toThrow("FREE_RATE_LIMIT");
  });
  it("times out real stalled connections", async () => {
    const base = await serve(() => undefined);
    await expect(boundedJson(base, {}, 20)).rejects.toThrow("TIMEOUT");
  });
});
describe("model metadata and private connectivity", () => {
  it("requires explicit free ID and every pricing dimension to be zero", () => {
    expect(freeModel(model)).toBe(true);
    expect(freeModel({ ...model, id: "openrouter/free" })).toBe(false);
    expect(freeModel({ ...model, pricing: { ...model.pricing, request: "0.1" } })).toBe(false);
    expect(suitable(model, 1000)).toBe(true);
    expect(suitable({ ...model, context_length: 8000 }, 1000)).toBe(false);
    expect(suitable({ ...model, architecture: { input_modalities: ["text"], output_modalities: ["image"] } }, 100)).toBe(false);
  });
  it("reserves pessimistically and rejects unpriced dimensions", () => {
    expect(reservationMicros({ ...model, pricing: { prompt: "0.000001", completion: "0.000002" } }, 1000)).toBeGreaterThan(18000);
    expect(() => reservationMicros({ ...model, pricing: { ...model.pricing, image: "1" } }, 100)).toThrow("PRICE_DIMENSION_UNSUPPORTED");
    expect(() => reservationMicros({ ...model, pricing: { completion: "0" } }, 100)).toThrow("PRICE_UNKNOWN");
  });
  it("rejects public endpoints, credentials and loopback-looking domains", () => {
    expect(loopbackUrl("http://127.0.0.1:4096")).toBe("http://127.0.0.1:4096");
    for (const u of ["http://127.0.0.1.evil.test", "http://user:pass@127.0.0.1", "https://integrate.api.nvidia.com", "http://0.0.0.0", "http://127.0.0.1/?q=1"]) expect(() => loopbackUrl(u)).toThrow();
  });
});

it("checks OpenCode contracts over real loopback HTTP with synthetic inference", async () => {
  let unsafe = false, calls = 0, toolRequested = false;
  const localModel = "local/nemotron-fixture";
  const base = await serve(async (req, res) => {
    if (req.headers.authorization !== `Basic ${Buffer.from("opencode:isolated-password").toString("base64")}`) { res.writeHead(401).end(); return; }
    let value: unknown;
    if (req.url === "/global/health") value = { healthy: true, version: "fixture-1" };
    else if (req.url === "/doc") value = { paths: { "/session": {}, "/session/{sessionID}/message": {} } };
    else if (req.url === "/config") value = { permission: "deny", model: localModel, small_model: unsafe ? "paid/other" : localModel, compaction: { auto: false },
      agent: { "aurion-designer": { model: localModel, steps: 1 } }, provider: { local: { options: { baseURL: "http://127.0.0.1:8000/v1" } } } };
    else if (req.url === "/agent") value = [{ name: "aurion-designer", permission: [{ permission: "*", pattern: "*", action: "deny" }] }];
    else if (req.url === "/config/providers") value = { providers: [{ id: "local", models: { "nemotron-fixture": { id: "nemotron-fixture", limit: { context: 100000, output: 8192 }, cost: { input: 0, output: 0 } } } }] };
    else if (req.url === "/session") {
      let body = ""; for await (const chunk of req) body += chunk;
      const data = JSON.parse(body); toolRequested ||= JSON.stringify(data.permission) !== JSON.stringify([{ permission: "*", pattern: "*", action: "deny" }]);
      value = { id: "session_fixture" };
    } else if (req.url === "/session/session_fixture/message") {
      calls++; value = { info: { modelID: "nemotron-fixture", providerID: "local", cost: 0, tokens: { input: 10, output: 20 } }, parts: [{ type: "text", text: "{}" }] };
    } else { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(value));
  });
  const config = FabricConfigSchema.parse({ ledgerPath: "/tmp/not-used-by-provider", openCodeUrl: base, openCodePassword: "isolated-password", openCodeVersion: "fixture-1", openCodeProvider: "local", openCodeModel: "nemotron-fixture" });
  const provider = new OpenCodeProvider(config);
  expect((await provider.inspect()).inference).toBe("loopback");
  expect(await provider.generate("isolated test prompt")).toMatchObject({ content: "{}", costMicros: 0, model: "nemotron-fixture" });
  expect(toolRequested).toBe(false); expect(calls).toBe(1);
  unsafe = true; await expect(provider.generate("never submitted")).rejects.toThrow("OPENCODE_AUXILIARY_MODEL_UNSAFE"); expect(calls).toBe(1);
  await expect(new OpenCodeProvider({ ...config, openCodePassword: "wrong" }).inspect()).rejects.toThrow("AUTH_FAILED");
  await expect(new OpenCodeProvider({ ...config, openCodeVersion: "wrong" }).inspect()).rejects.toThrow("OPENCODE_VERSION_UNVERIFIED");
});
