import { describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";
import type { Request } from "express";

function request(protocol: "http" | "https", forwardedProto?: string): Request {
  return { protocol, headers: forwardedProto ? { "x-forwarded-proto": forwardedProto } : {} } as Request;
}

describe("session cookie options", () => {
  it("uses Secure and SameSite=None for HTTPS and trusted HTTPS forwarding", () => {
    expect(getSessionCookieOptions(request("https"))).toMatchObject({ secure: true, sameSite: "none", httpOnly: true, path: "/" });
    expect(getSessionCookieOptions(request("http", "http, https"))).toMatchObject({ secure: true, sameSite: "none" });
  });

  it("uses a browser-valid local HTTP fallback", () => {
    expect(getSessionCookieOptions(request("http"))).toMatchObject({ secure: false, sameSite: "lax", httpOnly: true, path: "/" });
  });
});
