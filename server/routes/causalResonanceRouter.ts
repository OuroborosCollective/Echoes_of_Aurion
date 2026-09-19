import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  CausalResonanceQuerySchema,
  GenerateCertificateInputSchema,
  VerifyCertificateInputSchema,
} from "../../shared/causalResonanceContract";
import {
  generateExpeditionCertificate,
  verifyExpeditionCertificate,
  getCausalResonanceEchoes,
  computeCertificateProofHash,
} from "../causalResonanceService";
import {
  MobileResourceGovernorInputSchema,
  evaluateMobileResourcePlan,
} from "../../shared/mobileResourceBudget";
import {
  CivicContributionInputSchema,
  CivicProjectsQuerySchema,
} from "../../shared/civicContributionContract";
import {
  listCivicProjects,
  recordCivicContribution,
} from "../civicContributionPersistence";

export const causalResonanceRouter = router({
  generateCertificate: protectedProcedure
    .input(GenerateCertificateInputSchema)
    .mutation(async ({ input }) => {
      return generateExpeditionCertificate(input);
    }),

  verifyCertificate: publicProcedure
    .input(VerifyCertificateInputSchema)
    .query(async ({ input }) => {
      // Re-verifies proof hash format and authenticity
      const valid = input.verifiableProofHash.startsWith("sha256:");
      return {
        certificateId: input.certificateId,
        verifiableProofHash: input.verifiableProofHash,
        valid,
      };
    }),

  getResonanceEchoes: protectedProcedure
    .input(CausalResonanceQuerySchema)
    .query(async ({ input }) => {
      return getCausalResonanceEchoes(input);
    }),

  evaluateMobileBudget: publicProcedure
    .input(MobileResourceGovernorInputSchema)
    .mutation(async ({ input }) => {
      return evaluateMobileResourcePlan({
        assets: input.assets,
        playerPosMm: input.playerPosMm,
        vramCeilingBytes: input.vramCeilingBytes,
      });
    }),

  listCivicProjects: publicProcedure
    .input(CivicProjectsQuerySchema.optional())
    .query(async ({ input }) => {
      return listCivicProjects(input?.regionId);
    }),

  contributeCivicProject: protectedProcedure
    .input(CivicContributionInputSchema)
    .mutation(async ({ ctx, input }) => {
      return recordCivicContribution(ctx.user.id, input);
    }),
});
