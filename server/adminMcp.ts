import type { Express, Request, Response } from "express";
import * as db from "./db";
import { sdk } from "./_core/sdk";
import { verifyGlbAgentSession } from "./glbAgentSession";

export async function authenticateAdminGlbBearer(request: Request): Promise<{ id: number; role: "admin" }> {
  const authHeader = request.header("authorization");
  if (!authHeader) {
    throw new Error("UNAUTHORIZED");
  }
  const token = authHeader.match(/^Bearer (\S+)$/)?.[1];
  if (!token) {
    throw new Error("INVALID_TOKEN");
  }
  try {
    const id = await verifyGlbAgentSession(token, process.env.JWT_SECRET ?? "");
    const user = await db.getUserById(id);
    if (user && user.role === "admin") {
      return { id: user.id, role: "admin" };
    }
  } catch {
    // try fallback sdk auth if applicable
  }
  const user = await sdk.authenticateRequest(request);
  if (user && user.role === "admin") {
    return { id: user.id, role: "admin" };
  }
  throw new Error("ADMIN_REQUIRED");
}

export function registerAdminMcp(app: Express) {
  app.get("/api/admin-mcp/status", async (req: Request, res: Response) => {
    res.json({ status: "ok", protocol: "aurion.admin.mcp.v1" });
  });
}
