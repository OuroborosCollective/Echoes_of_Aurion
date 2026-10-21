import { createServer } from "node:http";
import { once } from "node:events";
import { connect } from "node:net";
import WebSocket from "ws";
import { registerZoneGateway } from "../../server/zoneGateway.ts";
import { ZoneRegistry } from "../../server/zoneRuntime.ts";

function within(promise, label, ms = 5_000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + "_TIMEOUT")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const server = createServer();
const gateway = registerZoneGateway(server, new ZoneRegistry(), async () => undefined);
let client;
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("ZONE_PROBE_LISTEN_FAILED");

  switch (process.argv[2]) {
    case "oversize": {
      client = new WebSocket(`ws://127.0.0.1:${address.port}/v1/ws`, {
        origin: "http://127.0.0.1",
      });
      // A protocol rejection may produce a client-side socket error, which must
      // not mask an unhandled error in the separate server-side socket.
      client.on("error", () => undefined);
      await within(once(client, "open"), "ZONE_PROBE_OPEN");
      const closed = within(
        new Promise(resolve => client.once("close", code => resolve(code))),
        "ZONE_PROBE_OVERSIZE_CLOSE",
      );
      client.send("x".repeat(5_000));
      const code = await closed;
      if (code !== 1009) throw new Error("ZONE_PROBE_EXPECTED_1009_GOT_" + code);
      console.log("ZONE_INGRESS_OVERSIZE_SURVIVED");
      break;
    }
    case "unknown-upgrade": {
      client = connect(address.port, "127.0.0.1");
      // ECONNRESET is acceptable: the server must not leave the upgrade open.
      client.on("error", () => undefined);
      await within(once(client, "connect"), "ZONE_PROBE_TCP_CONNECT");
      const closed = within(
        new Promise(resolve => client.once("close", resolve)),
        "ZONE_PROBE_UNKNOWN_UPGRADE_CLOSE",
        2_000,
      );
      client.write(
        "GET /other-websocket HTTP/1.1\r\n" +
        "Host: localhost\r\n" +
        "Connection: Upgrade\r\n" +
        "Upgrade: websocket\r\n" +
        "Sec-WebSocket-Version: 13\r\n" +
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
        "Origin: http://127.0.0.1\r\n\r\n",
      );
      await closed;
      console.log("ZONE_INGRESS_UNKNOWN_UPGRADE_CLOSED");
      break;
    }
    default:
      throw new Error("ZONE_PROBE_SCENARIO_INVALID");
  }
} finally {
  client?.terminate?.();
  client?.destroy?.();
  gateway.close();
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}
