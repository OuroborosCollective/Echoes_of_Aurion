import { describe, expect, it } from "vitest";
import { resolveApprovedGatewayHost } from "./gatewayHost";

describe("resolveApprovedGatewayHost", () => {
  it("accepts the verified platform host without trusting an arbitrary forwarded value", () => {
    expect(resolveApprovedGatewayHost("vchd74l3bk-on7gpcjxhq-ue.a.run.app", "evil.example")).toBe("vchd74l3bk-on7gpcjxhq-ue.a.run.app");
  });

  it("uses an approved forwarded public host behind an approved platform proxy", () => {
    expect(resolveApprovedGatewayHost("vchd74l3bk-on7gpcjxhq-ue.a.run.app", "aurion3d-6hpapr2g.manus.space")).toBe("aurion3d-6hpapr2g.manus.space");
  });

  it("accepts the current platform-assigned Cloud Run hostname", () => {
    expect(resolveApprovedGatewayHost("new-revision-xyz-ue.a.run.app", undefined)).toBe("new-revision-xyz-ue.a.run.app");
  });

  it("rejects an unknown direct host even when it claims an approved forwarded host", () => {
    expect(resolveApprovedGatewayHost("attacker.example", "aurion3d-6hpapr2g.manus.space")).toBeNull();
  });

  it("does not authorize the Aurion game domain as an MCP broker host", () => {
    expect(resolveApprovedGatewayHost("arelorian.de", undefined)).toBeNull();
  });
});
