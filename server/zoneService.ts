import { createZoneServiceRuntime } from "./zoneServiceRuntime";
import { createRemoteZoneTicketConsumer } from "./zoneTicketBridge";

function resolvePort(value = process.env.PORT): number {
  const port = Number(value ?? "3100");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer from 1 through 65535");
  }
  return port;
}

const ticketEndpoint = process.env.AURION_TICKET_CONSUME_URL;
if (!ticketEndpoint) throw new Error("AURION_TICKET_CONSUME_URL is required for the zone runtime");
const port = resolvePort();

const { server } = createZoneServiceRuntime(process.env.AURION_RUNTIME_REVISION, createRemoteZoneTicketConsumer(ticketEndpoint));

server.listen(port, "127.0.0.1", () => {
  console.log(`Aurion zone runtime listening on 127.0.0.1:${port}`);
});
