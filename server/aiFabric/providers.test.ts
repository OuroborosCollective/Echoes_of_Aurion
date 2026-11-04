import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { boundedJson, freeModel, loopbackUrl, reservationMicros, suitable, type Model } from "./providers";
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
