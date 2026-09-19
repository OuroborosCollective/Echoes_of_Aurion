import { z } from "zod";

export type ResonanceType =
  | "tactical_vulnerability"
  | "historical_echo"
  | "harmonic_affinity"
  | "celestial_alignment";

export interface CausalResonanceEcho {
  resonanceId: string;
  sourceTick: number;
  zoneId: string;
  encounterOrQuestKey: string;
  resonanceType: ResonanceType;
  stabilityScore: number; // 0..1000 integer permille
  glyphSignature: string;
  insightTitle: string;
  insightDetail: string;
  evidenceReceiptHash: string;
}

export type CertificateRank = "S" | "A" | "B" | "C" | "D";

export interface ExpeditionCertificate {
  certificateId: string;
  schema: "aurion.expedition.certificate.v1";
  expeditionKey: string;
  userId: number;
  seedDigest: string;
  resultDigest: string;
  tickCount: number;
  rank: CertificateRank;
  stabilityIndex: number; // 0..1000 integer permille
  glyphSignature: string;
  receiptHash: string;
  verifiableProofHash: string;
}

export const CausalResonanceQuerySchema = z.object({
  zoneId: z.string().trim().min(3).max(64),
  encounterOrQuestKey: z.string().trim().min(3).max(96),
  targetTick: z.number().int().min(0),
  limit: z.number().int().min(1).max(20).default(5),
});
export type CausalResonanceQuery = z.infer<typeof CausalResonanceQuerySchema>;

export const GenerateCertificateInputSchema = z.object({
  expeditionKey: z.string().trim().min(3).max(96),
  userId: z.number().int().positive(),
  seedDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  resultDigest: z.string().regex(/^[a-f0-9]{64}$/i),
  tickCount: z.number().int().min(1).max(1_000_000),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/i),
});
export type GenerateCertificateInput = z.infer<typeof GenerateCertificateInputSchema>;

export const VerifyCertificateInputSchema = z.object({
  certificateId: z.string().trim().min(8).max(96),
  verifiableProofHash: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
});
export type VerifyCertificateInput = z.infer<typeof VerifyCertificateInputSchema>;
