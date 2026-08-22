import { afterAll, describe, expect, it } from "vitest";
import { createZoneServiceRuntime } from "./zoneServiceRuntime";

describe("zone service runtime", () => {
  const { server } = createZoneServiceRuntime("zone-service-test-revision");

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });

  it("exposes a revision-bound local health response", async () => {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP listener");

    const response = await fetch(`http://127.0.0.1:${address.port}/_runtime/healthz`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "aurion-zone-runtime",
      revision: "zone-service-test-revision",
      mode: "read-only-presence",
    });
  });
});
