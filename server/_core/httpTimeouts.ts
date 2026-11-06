import type { Server } from "node:http";

/**
 * Idle keep-alive connections stay open longer than the clients and proxies that reuse
 * them (Traefik, browsers, test request contexts). With Node's 5 s default, a client
 * could send on a socket the server was closing at that moment: the request failed with
 * ECONNRESET (seen in the AIM-259 group regression on #1329), behind a proxy a 502.
 * The header timeout must exceed the keep-alive timeout (Node requirement).
 */
// Above Traefik's default upstream idle timeout (serversTransport idleConnTimeout 90 s; the
// deploy config does not override it), so the proxy always closes an idle connection first.
export const HTTP_KEEP_ALIVE_TIMEOUT_MS = 95_000;
export const HTTP_HEADERS_TIMEOUT_MS = 96_000;

export function configureHttpTimeouts(server: Server): Server {
  server.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
  server.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
  return server;
}
