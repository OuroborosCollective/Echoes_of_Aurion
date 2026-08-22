import express from "express";
import { createServer, type Server } from "http";
import { registerZoneGateway, type ZoneTicketConsumer } from "./zoneGateway";

export type ZoneServiceRuntime = {
  app: express.Express;
  server: Server;
};

export function createZoneServiceRuntime(revision = process.env.AURION_RUNTIME_REVISION ?? "unknown", consumeTicket?: ZoneTicketConsumer): ZoneServiceRuntime {
  const app = express();
  app.disable("x-powered-by");
  const server = createServer(app);

  app.get("/_runtime/healthz", (_req, res) => {
    res.status(200).json({
      service: "aurion-zone-runtime",
      revision,
      mode: "authoritative-movement",
    });
  });

  registerZoneGateway(server, undefined, consumeTicket ?? (async () => undefined));
  return { app, server };
}
