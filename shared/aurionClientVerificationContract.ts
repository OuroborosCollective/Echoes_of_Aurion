import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_CLIENT_VERIFICATION_SCHEMA = "aurion.client-verification.v1" as const;

export const clientObservationIdentifier = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._~:-]+$/);

export const clientVerificationStatusEnum = z.enum([
  "CLIENT_VERIFIED",
  "CLIENT_UNOBSERVABLE",
  "CLIENT_CONTRADICTED",
  "CLIENT_TIMEOUT",
]);

export type ClientVerificationStatus = z.infer<typeof clientVerificationStatusEnum>;

export const clientVerificationReadbackSchema = z.object({
  status: clientVerificationStatusEnum,
  trust: z.literal("untrusted-client-observation").default("untrusted-client-observation"),
  mutationAuthority: z.literal("none").default("none"),
  generation: z.number().int().optional(),
  connectionId: z.string().optional(),
  clientSessionId: z.string().optional(),
  reason: z.string().optional(),
});

export type ClientVerificationReadback = z.infer<typeof clientVerificationReadbackSchema>;

export interface ClientVerificationReceipt {
  schema: typeof AURION_CLIENT_VERIFICATION_SCHEMA | string;
  connectionId: string;
  clientSessionId: string;
  serverReceiptHash: string;
  projectionHash: string;
  appliedGeneration: number;
  observedAtLogicalFrame: number;
  receiptHash: string;
}

export async function createClientVerificationReceipt(params: {
  schema?: string;
  connectionId: string;
  clientSessionId: string;
  serverReceiptHash: string;
  projectionHash: string;
  appliedGeneration: number;
  observedAtLogicalFrame: number;
  [key: string]: unknown;
}): Promise<ClientVerificationReceipt> {
  const schema = params.schema ?? AURION_CLIENT_VERIFICATION_SCHEMA;
  const payload = {
    schema,
    connectionId: params.connectionId,
    clientSessionId: params.clientSessionId,
    serverReceiptHash: params.serverReceiptHash,
    projectionHash: params.projectionHash,
    appliedGeneration: params.appliedGeneration,
    observedAtLogicalFrame: params.observedAtLogicalFrame,
  };
  const receiptHash = canonicalSha256(payload);
  return {
    ...payload,
    receiptHash,
  };
}
