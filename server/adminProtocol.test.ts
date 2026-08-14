import { describe, expect, it } from "vitest";
import { decodeValidatedGlbBase64, normalizeSafePlacementConfiguration, USER_GLB_MAX_BYTES } from "./adminProtocol";

function minimalGlbBase64(): string {
  const bytes = Buffer.alloc(12);
  bytes.write("glTF", 0, "ascii");
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(12, 8);
  return bytes.toString("base64");
}

describe("admin protocol", () => {
  it("accepts a real GLB v2 header and derives a stable content digest", () => {
    const payload = minimalGlbBase64();
    expect(decodeValidatedGlbBase64(payload)).toMatchObject({ bytes: expect.any(Buffer), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(decodeValidatedGlbBase64(payload).bytes.length).toBe(12);
  });

  it("rejects malformed or length-inconsistent GLB payloads", () => {
    expect(() => decodeValidatedGlbBase64("not-base64")).toThrow("base64");
    const invalidLength = Buffer.alloc(12);
    invalidLength.write("glTF", 0, "ascii");
    invalidLength.writeUInt32LE(2, 4);
    invalidLength.writeUInt32LE(99, 8);
    expect(() => decodeValidatedGlbBase64(invalidLength.toString("base64"))).toThrow("header");
  });

  it("enforces the smaller player-submission cap when requested", () => {
    const oversized = Buffer.alloc(USER_GLB_MAX_BYTES + 1);
    oversized.write("glTF", 0, "ascii");
    oversized.writeUInt32LE(2, 4);
    oversized.writeUInt32LE(oversized.length, 8);
    expect(() => decodeValidatedGlbBase64(oversized.toString("base64"), USER_GLB_MAX_BYTES)).toThrow("size");
  });

  it("normalizes public placement configuration while rejecting credential-shaped keys", () => {
    expect(normalizeSafePlacementConfiguration('{"placement":"mission_complete","region":"eu"}')).toBe('{"placement":"mission_complete","region":"eu"}');
    expect(() => normalizeSafePlacementConfiguration('{"apiKey":"never-store-this"}')).toThrow("credentials");
    expect(() => normalizeSafePlacementConfiguration("[]")).toThrow("JSON object");
  });
});
