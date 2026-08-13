import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { createGatewaySessionId, createPairingToken, defaultGatewayCommands, digestPairingToken, normalizeAurionCommand, type AurionCommand } from "./gatewayProtocol";

function gatewayUrl(request: { protocol: string; get(name: string): string | undefined; header(name: string): string | undefined }) {
  const protocol = request.header("x-forwarded-proto") ?? request.protocol;
  return `${protocol}://${request.get("host") ?? "arelogic.space"}/mcp`;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  gateway: router({
    createSession: protectedProcedure.input(z.object({ providerLabel: z.string().trim().min(2).max(120), allowedCommands: z.array(z.string()).min(1).max(13).optional() })).mutation(async ({ ctx, input }) => {
      const allowed = Array.from(new Set((input.allowedCommands ?? defaultGatewayCommands()).map(normalizeAurionCommand).filter((value): value is AurionCommand => value !== null)));
      if (allowed.length === 0) throw new Error("No valid gateway commands selected");
      const pairingToken = createPairingToken();
      const sessionId = createGatewaySessionId();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8);
      await db.createGatewaySession({ id: sessionId, userId: ctx.user.id, providerLabel: input.providerLabel, tokenDigest: digestPairingToken(pairingToken), allowedCommands: JSON.stringify(allowed), expiresAt });
      return { sessionId, pairingToken, expiresAt, mcpUrl: gatewayUrl(ctx.req), allowedCommands: allowed };
    }),
    listSessions: protectedProcedure.query(async ({ ctx }) => {
      return db.listGatewaySessionsForUser(ctx.user.id);
    }),
    revokeSession: protectedProcedure.input(z.object({ sessionId: z.string().min(8).max(64) })).mutation(async ({ ctx, input }) => {
      await db.revokeGatewaySession(input.sessionId, ctx.user.id);
      return { revoked: true };
    }),
    pullCommands: protectedProcedure.input(z.object({ sessionId: z.string().min(8).max(64), afterSequence: z.number().int().min(0) })).query(async ({ ctx, input }) => {
      const session = await db.getGatewaySessionForUser(input.sessionId, ctx.user.id);
      if (!session || session.status !== "active" || session.expiresAt <= new Date()) throw new Error("Gateway session unavailable");
      return db.listGatewayCommandsAfter(input.sessionId, input.afterSequence);
    }),
  }),
});

export type AppRouter = typeof appRouter;
