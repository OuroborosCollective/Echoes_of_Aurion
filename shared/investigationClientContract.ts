import { z } from "zod";

/** Client-safe Aurion investigation contract leaves; intentionally no Node APIs. */
export const DEDUCTION_MIN_CLAIMS = 2;
export const DEDUCTION_MAX_CLAIMS = 8;

export const deductionTypeSchema = z.enum(["affirm", "challenge", "chain"]);
export type DeductionType = z.infer<typeof deductionTypeSchema>;

export const journalGuidanceSchema = z.enum(["whisper", "plot", "conspiracy"]);
export type JournalGuidance = z.infer<typeof journalGuidanceSchema>;

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

/** Browser sends a revision-bound selection; the authenticated server adds the actor and builds the intent. */
export const investigationDeductionRequestSchema = z.strictObject({
  selectedClaimIds: z.array(identifier).min(DEDUCTION_MIN_CLAIMS).max(DEDUCTION_MAX_CLAIMS),
  deductionType: deductionTypeSchema,
  sourceProjectionHash: sha256,
});
export type InvestigationDeductionRequest = Readonly<z.infer<typeof investigationDeductionRequestSchema>>;

/** Presentation only. Guidance never changes the claims in the canonical readmodel. */
export function guidancePresentation(guidance: JournalGuidance): Readonly<{
  showProvenance: boolean;
  showRelations: boolean;
}> {
  journalGuidanceSchema.parse(guidance);
  return Object.freeze({
    showProvenance: guidance === "whisper",
    showRelations: guidance !== "conspiracy",
  });
}
