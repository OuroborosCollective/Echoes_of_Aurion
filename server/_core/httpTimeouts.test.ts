import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { HTTP_HEADERS_TIMEOUT_MS, HTTP_KEEP_ALIVE_TIMEOUT_MS, configureHttpTimeouts } from "./httpTimeouts";

let server: Server | null = null;
afterEach(async () => { if (server) await new Promise(resolve => server!.close(resolve)); server = null; });

// AIM-259 on #1329: a keep-alive socket reused at Node's 5 s idle cut-off reset the request.
describe("HTTP keep-alive timeouts", () => {
  it("keeps idle connections longer than proxies and clients reuse them, headers above keep-alive", () => {
    server = configureHttpTimeouts(createServer());
    expect(server.keepAliveTimeout).toBe(HTTP_KEEP_ALIVE_TIMEOUT_MS);
    expect(server.headersTimeout).toBe(HTTP_HEADERS_TIMEOUT_MS);
    expect(HTTP_HEADERS_TIMEOUT_MS).toBeGreaterThan(HTTP_KEEP_ALIVE_TIMEOUT_MS);
    expect(HTTP_KEEP_ALIVE_TIMEOUT_MS).toBeGreaterThan(90_000); // Traefik default upstream idle timeout
  });

  it("serves a second request on the same socket after an idle gap beyond Node's 5 s default", async () => {
    server = configureHttpTimeouts(createServer((_request, response) => response.end("ok")));
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const sockets = new Set<unknown>();
    const get = () => new Promise<string>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, path: "/", agent, headers: { connection: "keep-alive" } }, response => {
        sockets.add(response.socket);
        let body = ""; response.on("data", chunk => { body += chunk; }); response.on("end", () => resolve(body));
      });
      req.on("error", reject); req.end();
    });
    const { Agent } = await import("node:http");
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    expect(await get()).toBe("ok");
    await new Promise(resolve => setTimeout(resolve, 7_000)); // beyond 5 s plus Node's keep-alive buffer
    expect(await get()).toBe("ok");
    expect(sockets.size).toBe(1); // same connection: the server did not close it at 5 s
    agent.destroy();
  }, 20_000);
});
