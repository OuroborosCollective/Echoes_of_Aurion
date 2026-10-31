import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { investigationDeductionRequestSchema } from "../shared/investigationClientContract";
import { journalGuidanceSchema } from "../shared/investigationJournalProtocol";
import { protectedProcedure, router } from "./_core/trpc";
import {
  readInvestigationJournalForUser,
  validateAndRecordInvestigationDeduction,
} from "./investigationJournalPersistence";

export const investigationJournalRouter = router({
  read: protectedProcedure
    .input(z.object({
      viewerUserId: z.number().int().positive(),
      guidance: journalGuidanceSchema.default("plot"),
    }).strict())
    .query(({ ctx, input }) => {
      if (input.viewerUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "INVESTIGATION_VIEWER_MISMATCH" });
      }
      return readInvestigationJournalForUser(ctx.user.id, input.guidance);
    }),

  submitDeduction: protectedProcedure
    .input(investigationDeductionRequestSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await validateAndRecordInvestigationDeduction(ctx.user.id, input);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message === "DEDUCTION_ACTOR_MISMATCH") {
          throw new TRPCError({ code: "FORBIDDEN", message });
        }
        if (message === "DEDUCTION_STALE_PROJECTION") {
          throw new TRPCError({ code: "CONFLICT", message });
        }
        if ([
          "DEDUCTION_UNKNOWN_CLAIM",
          "DEDUCTION_DUPLICATE_CLAIM",
          "DEDUCTION_ARITY_INVALID",
          "DEDUCTION_CONTRADICTION_PRESENT",
          "DEDUCTION_RELATION_REQUIRED",
        ].includes(message)) {
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
        throw error;
      }
    }),
});
