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

const ALLOWED_RECEIPT_KEYS = new Set([
  "schema",
  "connectionId",
  "clientSessionId",
  "serverReceiptHash",
  "projectionHash",
  "appliedGeneration",
  "observedAtLogicalFrame",
  "receiptHash",
]);

export async function decodeClientVerificationReceipt(
  raw: unknown
): Promise<ClientVerificationReceipt> {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("CLIENT_RECEIPT_INVALID: must be an object");
  }
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_RECEIPT_KEYS.has(key)) {
      throw new Error(`CLIENT_RECEIPT_UNAPPROVED_FIELD: ${key}`);
    }
  }
  if (typeof obj.connectionId !== "string" || !obj.connectionId) {
    throw new Error("CLIENT_RECEIPT_INVALID: connectionId required");
  }
  if (typeof obj.clientSessionId !== "string" || !obj.clientSessionId) {
    throw new Error("CLIENT_RECEIPT_INVALID: clientSessionId required");
  }
  if (typeof obj.serverReceiptHash !== "string" || !obj.serverReceiptHash) {
    throw new Error("CLIENT_RECEIPT_INVALID: serverReceiptHash required");
  }
  if (typeof obj.projectionHash !== "string" || !obj.projectionHash) {
    throw new Error("CLIENT_RECEIPT_INVALID: projectionHash required");
  }
  if (typeof obj.appliedGeneration !== "number" || !Number.isSafeInteger(obj.appliedGeneration)) {
    throw new Error("CLIENT_RECEIPT_INVALID: appliedGeneration must be an integer");
  }
  if (typeof obj.observedAtLogicalFrame !== "number" || !Number.isSafeInteger(obj.observedAtLogicalFrame)) {
    throw new Error("CLIENT_RECEIPT_INVALID: observedAtLogicalFrame must be an integer");
  }
  if (typeof obj.receiptHash !== "string" || !obj.receiptHash) {
    throw new Error("CLIENT_RECEIPT_INVALID: receiptHash required");
  }
  const payload = {
    schema: (obj.schema as string) ?? AURION_CLIENT_VERIFICATION_SCHEMA,
    connectionId: obj.connectionId,
    clientSessionId: obj.clientSessionId,
    serverReceiptHash: obj.serverReceiptHash,
    projectionHash: obj.projectionHash,
    appliedGeneration: obj.appliedGeneration,
    observedAtLogicalFrame: obj.observedAtLogicalFrame,
  };
  const expectedHash = canonicalSha256(payload);
  if (expectedHash !== obj.receiptHash) {
    throw new Error(`CLIENT_RECEIPT_HASH_MISMATCH: expected ${expectedHash} got ${obj.receiptHash}`);
  }
  return {
    ...payload,
    receiptHash: obj.receiptHash,
  };
}
