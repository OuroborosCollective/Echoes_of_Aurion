import { createHash } from "node:crypto";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getQuest, type QuestKey } from "../gameplayProtocol";
import { assertQuestNpcAuthority } from "../questNpcAuthority";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;

/** Compatibility guard for the isolated legacy tRPC quest surface. `/play` does not use it. */
function questInput(value: unknown): { questKey: QuestKey; giver?: string } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.questKey !== "string") return null;
  try { getQuest(raw.questKey as QuestKey); } catch { return null; }
  if (raw.giver !== undefined && typeof raw.giver !== "string") return null;
  return { questKey: raw.questKey as QuestKey, ...(typeof raw.giver === "string" ? { giver: raw.giver } : {}) };
}

/**
 * These routes belonged to the retired Aurion arena/encounter authority.
 * AX1 `/play` already uses the WASD zone combat contract instead. Keep the
 * route shapes temporarily for compatibility, but make the old write surface
 * unreachable before any resolver or database effect can execute.
 */
export const RETIRED_AURION_GAMEPLAY_WRITE_PATHS = Object.freeze([
  "gameplay.startEncounter",
  "gameplay.act",
] as const);
const retiredAurionGameplayWritePaths = new Set<string>(RETIRED_AURION_GAMEPLAY_WRITE_PATHS);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });

  if (retiredAurionGameplayWritePaths.has(opts.path)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "LEGACY_AURION_GAMEPLAY_WRITE_RETIRED",
    });
  }

  if (opts.path === "gameplay.acceptQuest" || opts.path === "gameplay.completeQuest") {
    const parsed = questInput(await opts.getRawInput());
    if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: "Questmutation benötigt einen kanonischen Questschlüssel." });
    try {
      await assertQuestNpcAuthority({
        userId: ctx.user.id,
        questKey: parsed.questKey,
        kind: opts.path === "gameplay.acceptQuest" ? "accept" : "complete",
        ...(parsed.giver ? { clientGiver: parsed.giver } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "QUEST_NPC_AUTHORITY_REQUIRED";
      throw new TRPCError({ code: "FORBIDDEN", message });
    }
  }

  const result = await next({ ctx: { ...ctx, user: ctx.user } });
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
    if (!ctx.user || ctx.user.role !== 'admin') throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
