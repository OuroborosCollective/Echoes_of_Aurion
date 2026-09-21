import type { Request } from "express";
import { getUserById, getUserByOpenId } from "../db";
import type { User } from "../../drizzle/schema";
import { createHmac } from "node:crypto";

const JWT_SECRET = process.env.JWT_SECRET || "aurion-disposable-local-pack-signing-key-never-production";

export type SessionOptions = {
  name?: string;
  expiresInMs?: number;
};

function signToken(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSignature = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (signature !== expectedSignature) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export class Sdk {
  async authenticateRequest(req: Request): Promise<User | null> {
    try {
      const authHeader = req.headers.authorization;
      let token: string | null = null;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      } else if (req.cookies && req.cookies.aurion_session) {
        token = req.cookies.aurion_session;
      } else if (req.cookies && req.cookies.session) {
        token = req.cookies.session;
      }

      if (!token) return null;

      const decoded = verifyToken(token);
      if (!decoded) return null;

      if (decoded.openId && typeof decoded.openId === "string") {
        const user = await getUserByOpenId(decoded.openId);
        if (user) return user;
      }
      const userId = decoded.userId || decoded.id;
      if (userId && Number.isInteger(userId)) {
        const user = await getUserById(userId);
        if (user) return user;
      }
      return null;
    } catch {
      return null;
    }
  }

  async createSessionToken(openId: string, _options?: SessionOptions): Promise<string> {
    return signToken({ openId, exp: Math.floor(Date.now() / 1000) + 365 * 86400 });
  }

  async exchangeCodeForToken(_code: string, _state: string): Promise<{ accessToken: string }> {
    return { accessToken: "legacy-oauth-access-token" };
  }

  async getUserInfo(_accessToken: string): Promise<{ openId: string; name: string | null; email: string | null; loginMethod: string | null; platform: string | null }> {
    return {
      openId: "legacy-oauth-user",
      name: "Legacy User",
      email: null,
      loginMethod: "oauth",
      platform: "legacy",
    };
  }
}

export const sdk = new Sdk();
