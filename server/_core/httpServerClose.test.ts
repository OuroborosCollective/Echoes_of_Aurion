import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { closeHttpServerForShutdown } from "./httpServerClose";

// Review (Devin on #1334): a SIGTERM during boot lease release skips `listen`;
// the drain must still finish successfully instead of failing on close().
describe("HTTP server close during the shutdown drain", () => {
  it("treats a server that never listened as closed", async () => {
    const server = createServer();
    await expect(closeHttpServerForShutdown(server)).resolves.toBeUndefined();
  });

  it("closes a listening server", async () => {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    expect(server.listening).toBe(true);
    await closeHttpServerForShutdown(server);
    expect(server.listening).toBe(false);
  });
});
