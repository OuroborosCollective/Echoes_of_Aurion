import type { Express, Request, Response } from "express";
import { hostHeaderValidation } from "@modelcontextprotocol/express";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod/v4";
import * as db from "./db";
import { allowGatewayCommand, digestPairingToken, parseAllowedCommands } from "./gatewayProtocol";

const allowedHosts = ["arelogic.space", "aurion3d-6hpapr2g.manus.space", "localhost", "localhost:3000", "127.0.0.1", "127.0.0.1:3000"];

function bearerToken(request: Request): string | null {
  const header = request.header("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 20 ? token : null;
}

function createMcpServer(grant: { id: string; providerLabel: string; allowedCommands: string }) {
  const allowed = parseAllowedCommands(grant.allowedCommands);
  const server = new McpServer({ name: "echoes-of-aurion", version: "0.2.0" });

  server.registerTool("aurion_get_mission_contract", {
    title: "Aurion mission contract",
    description: "Read the active Echo Scout contract. Only the listed commands may be sent to the game.",
    inputSchema: z.object({}),
  }, async () => ({
    content: [{ type: "text", text: JSON.stringify({ protocol: "aurion.command.v1", session: grant.id, provider: grant.providerLabel, allowedCommands: allowed, instruction: "Return one decision by calling aurion_send_command. Never control a browser, device, private data, or unrelated tool." }) }],
  }));

  server.registerTool("aurion_send_command", {
    title: "Send an Echo Scout command",
    description: "Queue exactly one allowed WASD or 1-9 command for the authorized Echo Scout session.",
    inputSchema: z.object({ command: z.string().min(1).max(12), sequence: z.number().int().positive() }),
  }, async ({ command, sequence }) => {
    const normalized = allowGatewayCommand(command, allowed);
    if (!normalized) {
      return { isError: true, content: [{ type: "text", text: "Command rejected. Use only the session allowlist." }] };
    }
    const result = await db.appendGatewayCommand({ gatewaySessionId: grant.id, sequence, command: normalized });
    if (!result.accepted) return { isError: true, content: [{ type: "text", text: "Command rejected because sequence must strictly increase." }] };
    return { content: [{ type: "text", text: JSON.stringify({ accepted: true, command: normalized, sequence }) }], structuredContent: { accepted: true, command: normalized, sequence } };
  });
  return server;
}

export function registerMcpGateway(app: Express) {
  app.use("/mcp", hostHeaderValidation(allowedHosts));
  app.all("/mcp", async (request: Request, response: Response) => {
    const token = bearerToken(request);
    const grant = token ? await db.getActiveGatewaySessionByTokenDigest(digestPairingToken(token)) : undefined;
    if (!grant) {
      const protocol = request.header("x-forwarded-proto") ?? request.protocol;
      const publicGatewayUrl = `${protocol}://${request.get("host") ?? "arelogic.space"}/mcp`;
      response.setHeader("WWW-Authenticate", `Bearer realm="Echoes of Aurion", resource="${publicGatewayUrl}"`);
      response.status(401).json({ error: "authorized_pairing_required" });
      return;
    }
    try {
      const server = createMcpServer(grant);
      const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("[Aurion MCP] Request failed", error);
      if (!response.headersSent) response.status(500).json({ error: "gateway_request_failed" });
    }
  });
}
