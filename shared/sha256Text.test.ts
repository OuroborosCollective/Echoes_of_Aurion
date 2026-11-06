import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Text } from "./sha256Text";

describe("synchronous SHA-256 for browser identifiers", () => {
  it("matches node:crypto for padding boundaries, unicode and random input", () => {
    const inputs = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(63), "a".repeat(64), "a".repeat(119), "a".repeat(1_000),
      "Fachwerkhaus · Ünïcödé · 世界 · 🏰", JSON.stringify(["admin.placements.1", "p.0123456789ab"])];
    for (let i = 0; i < 200; i += 1) inputs.push(randomBytes(i).toString("base64") + String.fromCodePoint(0x1f300 + i));
    for (const input of inputs) expect(sha256Text(input)).toBe(createHash("sha256").update(input, "utf8").digest("hex"));
  });
});
