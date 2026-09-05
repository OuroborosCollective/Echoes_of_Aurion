import { createHash } from "node:crypto";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const result = await next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
  // Observe successful committed API results only. Delivery and consent failures cannot
  // change, retry or reject a gameplay transaction. No payload fields leave the server.
  if (result.ok && process.env.AURION_AMPLITUDE_ENABLED === "true") {
    void import("../amplitudeAnalytics").then(({ amplitudeAnalytics }) => {
      if (opts.path === "player.saveControls") amplitudeAnalytics.forget(ctx.user!.id);
      const receiptKey = createHash("sha256").update(JSON.stringify(result.data) ?? "null").digest("hex");
      return amplitudeAnalytics.record(ctx.user!.id, opts.path, receiptKey);
    }).catch(() => undefined);
  }
  return result;
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
