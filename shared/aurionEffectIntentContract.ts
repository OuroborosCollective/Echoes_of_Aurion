import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_EFFECT_INTENT_SCHEMA = "aurion.effect-intent.v1" as const;

export type AurionEffectDeliveryState =
  | "PENDING"
  | "DELIVERED"
  | "FAILED"
  | "RETRYABLE"
  | "PERMANENT_FAILURE";

export interface AurionEffectIntent {
  schema: typeof AURION_EFFECT_INTENT_SCHEMA;
  effectId: string;
  authorityReceiptHash: string;
  effectType: string;
  subjectId: string;
  ordinal: number;
  payload: Readonly<Record<string, unknown>>;
  payloadHash: string;
}

const HASH = /^sha256:[a-f0-9]{64}$/;

export function computeEffectId(input: {
  authorityReceiptHash: string;
  effectType: string;
  subjectId: string;
  ordinal: number;
}): string {
  if (!HASH.test(input.authorityReceiptHash)) throw new Error("EFFECT_AUTHORITY_RECEIPT_INVALID");
  if (!input.effectType.trim() || !input.subjectId.trim()) throw new Error("EFFECT_IDENTITY_INVALID");
  if (!Number.isSafeInteger(input.ordinal) || input.ordinal < 0) throw new Error("EFFECT_ORDINAL_INVALID");
  return canonicalSha256({
    schema: "aurion.effect-identity.v1",
    authorityReceiptHash: input.authorityReceiptHash,
    effectType: input.effectType,
    subjectId: input.subjectId,
    ordinal: input.ordinal,
  });
}

export function createEffectIntent(input: {
  authorityReceiptHash: string;
  effectType: string;
  subjectId: string;
  ordinal: number;
  payload: Readonly<Record<string, unknown>>;
}): AurionEffectIntent {
  const effectId = computeEffectId(input);
  const payloadHash = canonicalSha256(input.payload);
  return Object.freeze({
    schema: AURION_EFFECT_INTENT_SCHEMA,
    effectId,
    authorityReceiptHash: input.authorityReceiptHash,
    effectType: input.effectType,
    subjectId: input.subjectId,
    ordinal: input.ordinal,
    payload: Object.freeze({ ...input.payload }),
    payloadHash,
  });
}

export function verifyEffectIntent(intent: AurionEffectIntent): boolean {
  if (intent.schema !== AURION_EFFECT_INTENT_SCHEMA) return false;
  if (canonicalSha256(intent.payload) !== intent.payloadHash) return false;
  try {
    return intent.effectId === computeEffectId(intent);
  } catch {
    return false;
  }
}
