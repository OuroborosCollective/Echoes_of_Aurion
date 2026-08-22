import express from "express";
import { createServer } from "http";
import { afterAll, describe, expect, it } from "vitest";
import { createRemoteZoneTicketConsumer } from "./zoneTicketBridge";

describe("remote zone ticket bridge", () => {
  const app = express();
  app.use(express.json());
  const server = createServer(app);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });

  it("forwards only the one-time bearer and accepts a canonical tRPC receipt", async () => {
    app.post("/api/trpc/gameplay.consumeZoneTicket", (request, response) => {
      expect(request.query.batch).toBe("1");
      expect(request.body).toEqual({ 0: { json: { ticket: "t".repeat(48), zoneId: "observatory_threshold" } } });
      response.status(200).json([{
        result: {
          data: {
            json: {
              userId: 77,
              zoneId: "observatory_threshold",
              clientBuild: "zone-service-test",
              expiresAt: "2030-01-01T00:00:00.000Z",
            },
          },
        },
      }]);
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");

    const consume = createRemoteZoneTicketConsumer(`http://127.0.0.1:${address.port}/api/trpc`);
    await expect(consume({ ticket: "t".repeat(48), zoneId: "observatory_threshold" })).resolves.toMatchObject({
      userId: 77,
      zoneId: "observatory_threshold",
      clientBuild: "zone-service-test",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
  });
});
