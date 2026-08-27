import { describe, expect, it } from "vitest";
import { aurionMcpBrokerUrl, gatewayUrl } from "./routers";

describe("Aurion MCP broker URL", () => {
  it("bindet Pairingantworten an den getrennten ChatGPT-Broker", () => {
    expect(aurionMcpBrokerUrl).toBe("https://arelogic.space/mcp");
    expect(gatewayUrl()).toBe("https://arelogic.space/mcp");
  });
});
