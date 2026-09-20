import { z } from "zod";
import { hashWorldChunkProjectionPayload } from "./worldChunkProjectionV2";

export const AURION_CLIENT_VERIFICATION_SCHEMA = "aurion.client-verification.v1" as const;
export const CLIENT_VERIFICATION_STATUSES = [
  "CLIENT_VERIFIED", "CLIENT_CONTRADICTED", "CLIENT_UNOBSERVABLE", "CLIENT_TIMEOUT",
] as const;
export type ClientVerificationStatus = (typeof CLIENT_VERIFICATION_STATUSES)[number];
export const clientObservationIdentifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const unsignedSchema = z.strictObject({
  schema: z.literal(AURION_CLIENT_VERIFICATION_SCHEMA),
  connectionId: clientObservationIdentifier,
  clientSessionId: clientObservationIdentifier,
  serverReceiptHash: hash,
  projectionHash: hash,
  appliedGeneration: counter,
  observedAtLogicalFrame: counter,
});
const receiptSchema = unsignedSchema.extend({ clientVerificationHash: hash });
export type ClientVerificationInput = z.infer<typeof unsignedSchema>;
export type ClientVerificationReceipt = Readonly<z.infer<typeof receiptSchema>>;

/** Call only after actual client apply. A client-controlled hash is not a signature. */
export async function createClientVerificationReceipt(input: ClientVerificationInput): Promise<ClientVerificationReceipt> {
  const value = unsignedSchema.parse(input);
  // Fixed ordered tuple and domain tag: independent of input object insertion order.
  const clientVerificationHash = await hashWorldChunkProjectionPayload(new TextEncoder().encode(JSON.stringify([
    "aurion.client-verification-receipt.v1", value.schema, value.connectionId,
    value.clientSessionId, value.serverReceiptHash, value.projectionHash,
    value.appliedGeneration, value.observedAtLogicalFrame,
  ])));
  return Object.freeze({ ...value, clientVerificationHash });
}

export async function decodeClientVerificationReceipt(input: unknown): Promise<ClientVerificationReceipt> {
  const parsed = receiptSchema.parse(input);
  const { clientVerificationHash, ...unsigned } = parsed;
  const expected = await createClientVerificationReceipt(unsigned);
  if (clientVerificationHash !== expected.clientVerificationHash) throw new Error("CLIENT_VERIFICATION_HASH_MISMATCH");
  return expected;
}
