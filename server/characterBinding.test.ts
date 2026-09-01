import { describe, expect, it } from "vitest";
import { resolveCharacterBinding } from "./db";

describe("persistent character binding", () => {
  it("binds an account without an existing appearance", () => {
    expect(resolveCharacterBinding(undefined, "asset-a")).toBe("bind");
  });

  it("is idempotent for the already bound character", () => {
    expect(resolveCharacterBinding("asset-a", "asset-a")).toBe("idempotent");
  });

  it("rejects switching the bound character", () => {
    expect(() => resolveCharacterBinding("asset-a", "asset-b")).toThrow("CHARACTER_BINDING_IMMUTABLE");
  });
});
