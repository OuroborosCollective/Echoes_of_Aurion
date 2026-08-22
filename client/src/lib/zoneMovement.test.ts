import { describe, expect, it } from "vitest";
import { zoneWebSocketUrl } from "./zoneMovement";

describe("zone movement browser transport", () => {
  it("derives a secure production WSS endpoint without exposing a ticket in the URL", () => {
    expect(zoneWebSocketUrl("https://arelogic.space")).toBe("wss://arelogic.space/v1/ws");
    expect(zoneWebSocketUrl("http://localhost:3000")).toBe("ws://localhost:3000/v1/ws");
  });
});
