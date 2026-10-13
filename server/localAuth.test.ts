import { describe, expect, it } from "vitest";
import { assertLocalHandle, assertLocalPassword, hashLocalPassword, normalizeLocalHandle, verifyLocalPassword, DUMMY_LOCAL_AUTH_HASH } from "./localAuth";

describe("Aurion local authentication primitives", () => {
  it("normalizes and strictly validates local handles", () => {
    expect(normalizeLocalHandle("  Goloslos  ")).toBe("goloslos");
    expect(assertLocalHandle("Goloslos_01")).toBe("goloslos_01");
    expect(() => assertLocalHandle("admin name")).toThrow(/Rufname/);
    expect(() => assertLocalHandle("ab")).toThrow(/Rufname/);
  });

  it("enforces the local password boundary", () => {
    expect(() => assertLocalPassword("zu kurz")).toThrow(/Passwort/);
    expect(assertLocalPassword("Sternwarte-2026!" )).toBe("Sternwarte-2026!");
  });

  it("verifies only the original password against a real scrypt hash", async () => {
    const encoded = await hashLocalPassword("Sternwarte-2026!");
    expect(encoded.startsWith("scrypt$16384$")).toBe(true);
    await expect(verifyLocalPassword("Sternwarte-2026!", encoded)).resolves.toBe(true);
    await expect(verifyLocalPassword("Sternwarte-2026?", encoded)).resolves.toBe(false);
  });
  it("uses a structurally valid real-cost scrypt dummy while never granting access", async () => {
    expect(DUMMY_LOCAL_AUTH_HASH.split("$")).toHaveLength(4);
    await expect(verifyLocalPassword("any-password", DUMMY_LOCAL_AUTH_HASH)).resolves.toBe(false);
    await expect(verifyLocalPassword("", DUMMY_LOCAL_AUTH_HASH)).resolves.toBe(false);
  });

});
