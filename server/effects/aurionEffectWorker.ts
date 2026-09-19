import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { createEffectIntent } from "../../shared/aurionEffectIntentContract";
import type { PersistedAurionEffectIntent } from "./aurionEffectJournal";
import { globalAurionEffectJournal, type AurionEffectDeliveryOutcome } from "./aurionEffectJournal";

export interface AurionEffectProvider {
  deliver(
    intent: PersistedAurionEffectIntent,
    context: Readonly<{ idempotencyKey: string; attempt: number }>,
  ): Promise<
    | Readonly<{ status: "DELIVERED"; providerReceiptHash: string }>
    | Readonly<{ status: "RETRYABLE"; errorCode: string }>
    | Readonly<{ status: "PERMANENT_FAILURE"; errorCode: string }>
  >;
}

export class AurionEffectWorker {
  async processEffect(
    effectId: string,
    provider: AurionEffectProvider,
    options: Readonly<{ mode?: "LIVE" | "REPLAY" }> = {},
  ): Promise<
    | Readonly<{ status: "MATCH"; effectId: string; payloadHash: string }>
    | Readonly<{ status: "UNPROVABLE"; effectId: string; reason: "EFFECT_INTENT_MISSING" }>
    | Readonly<{ status: "FIRST_DIVERGENCE"; effectId: string; expectedEffectId: string; observedEffectId: string }>
    | Awaited<ReturnType<typeof globalAurionEffectJournal.withDeliveryLock>>
  > {
    if (options.mode === "REPLAY") {
      const persisted = await globalAurionEffectJournal.readIntent(effectId);
      if (!persisted) {
        return Object.freeze({ status: "UNPROVABLE", effectId, reason: "EFFECT_INTENT_MISSING" });
      }
      const recomputed = createEffectIntent({
        authorityReceiptHash: persisted.authorityReceiptHash,
        effectType: persisted.effectType,
        subjectId: persisted.subjectId,
        ordinal: persisted.ordinal,
        payload: persisted.payload,
      });
      if (recomputed.effectId !== persisted.effectId || recomputed.payloadHash !== persisted.payloadHash) {
        return Object.freeze({
          status: "FIRST_DIVERGENCE",
          effectId,
          expectedEffectId: persisted.effectId,
          observedEffectId: recomputed.effectId,
        });
      }
      return Object.freeze({ status: "MATCH", effectId: persisted.effectId, payloadHash: persisted.payloadHash });
    }

    return globalAurionEffectJournal.withDeliveryLock(effectId, async (intent, attempt) => {
      let outcome: AurionEffectDeliveryOutcome;
      try {
        const result = await provider.deliver(intent, {
          idempotencyKey: intent.effectId,
          attempt,
        });
        if (result.status === "DELIVERED") {
          if (!/^sha256:[a-f0-9]{64}$/.test(result.providerReceiptHash)) {
            throw new Error("EFFECT_PROVIDER_RECEIPT_INVALID");
          }
          outcome = {
            deliveryState: "DELIVERED",
            providerReceiptHash: result.providerReceiptHash,
            errorCode: null,
          };
        } else {
          outcome = {
            deliveryState: result.status,
            providerReceiptHash: null,
            errorCode: sanitizeErrorCode(result.errorCode),
          };
        }
      } catch (error) {
        outcome = {
          deliveryState: "FAILED",
          providerReceiptHash: null,
          errorCode: sanitizeErrorCode(error instanceof Error ? error.message : String(error)),
        };
      }
      return Object.freeze(outcome);
    });
  }
}

function sanitizeErrorCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9_.:-]+/g, "_").slice(0, 96);
  return normalized || "EFFECT_PROVIDER_FAILURE";
}

/**
 * Test/provider utility: produce a provider receipt without exposing provider
 * payloads or secrets to the effect evidence lane.
 */
export function hashProviderDeliveryReceipt(value: unknown): string {
  return canonicalSha256({ schema: "aurion.effect-provider-receipt.v1", value });
}

export const globalAurionEffectWorker = new AurionEffectWorker();
