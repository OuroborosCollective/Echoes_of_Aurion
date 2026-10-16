import { describe, expect, it } from "vitest";
import { createCorsOriginResolver } from "./_core/corsOrigin";

describe("explicit CORS origin boundary", () => {
  it("rejects arbitrary itch tenants, suffix tricks, null and absent origins", () => {
    const resolve = createCorsOriginResolver();
    expect(resolve("https://arelogic.space")).toBe("https://arelogic.space");
    for (const origin of [undefined, "", "null", "https://evil.itch.io", "https://evil.itch.zone",
      "https://arelogic.space.attacker.example", "http://arelogic.space", "https://arelogic.space:444"])
      expect(resolve(origin)).toBeNull();
  });
  it("allows only explicitly configured deployments, including owned itch origins", () => {
    const resolve = createCorsOriginResolver(" https://ouroboros.itch.io, https://owned.itch.zone ,,http://localhost:3000 ");
    for (const origin of ["https://ouroboros.itch.io", "https://owned.itch.zone", "http://localhost:3000"])
      expect(resolve(origin)).toBe(origin);
    expect(resolve("https://other.itch.zone")).toBeNull();
    expect(resolve("https://arelogic.space")).toBeNull();
    expect(createCorsOriginResolver("")("https://arelogic.space")).toBeNull();
  });
});
