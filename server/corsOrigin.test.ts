import { describe, expect, it } from "vitest";
import { createCorsOriginResolver } from "./_core/corsOrigin";

describe("explicit CORS origin boundary", () => {
  it("rejects arbitrary itch tenants, suffix tricks, null and absent origins", () => {
    const resolve = createCorsOriginResolver();
    expect(resolve("https://arelogic.space")).toBe("https://arelogic.space");
    for (const origin of [undefined, "", "null", "https://evil.itch.io", "https://evil.itch.zone",
      "https://arelogic.space.attacker.example", "http://arelogic.space", "https://arelogic.space:444"])
      expect(resolve(origin)).toBeUndefined();
  });
  it("allows only explicitly configured deployments, including owned itch origins", () => {
    const resolve = createCorsOriginResolver(" https://ouroboros.itch.io, https://owned.itch.zone ,,http://localhost:3000 ");
    for (const origin of ["https://ouroboros.itch.io", "https://owned.itch.zone", "http://localhost:3000"])
      expect(resolve(origin)).toBe(origin);
    expect(resolve("https://other.itch.zone")).toBeUndefined();
    expect(resolve("https://arelogic.space")).toBeUndefined();
    expect(createCorsOriginResolver("")("https://arelogic.space")).toBeUndefined();
  });
  it("fails closed on opaque, wildcard or non-origin deployment configuration", () => {
    for (const origin of ["null", "*", "file:///tmp", "https://arelogic.space/path", "https://user@arelogic.space", "https://arelogic.space?x=1"]) {
      expect(() => createCorsOriginResolver(origin)).toThrow("CORS_DEPLOYMENT_ORIGIN_INVALID");
    }
  });
});
