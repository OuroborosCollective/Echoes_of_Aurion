import type { Server } from "node:http";

/**
 * Close the HTTP server during the causal shutdown drain. A server that never
 * started listening (shutdown began during boot, before `listen`) is already
 * closed; `server.close()` would reject with ERR_SERVER_NOT_RUNNING and turn a
 * completed causal flush into a failed shutdown.
 */
export function closeHttpServerForShutdown(server: Pick<Server, "listening" | "close">): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
