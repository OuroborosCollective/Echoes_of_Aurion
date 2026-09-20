import { createHash } from "node:crypto";
import type { AurionCagProbe } from "../shared/aurionCagDesignProtocol";
import type { WolframCagClient, WolframCagEvidence } from "./wolframCag";

export const AURION_CAG_DESIGN_ORACLE_VERSION = "aurion.cag-design-oracle-receipt.v1" as const;

export type AurionCagDesignOracleReceipt = Readonly<{
  version: typeof AURION_CAG_DESIGN_ORACLE_VERSION;
  kind: AurionCagProbe["kind"];
  verdict: "SUPPORTED" | "CONTRADICTED" | "INCONCLUSIVE";
  expectedExact: string;
  observedExact: string | null;
  requestSha256: string | null;
  responseSha256: string | null;
  providerUuidSha256: string | null;
  providerCode: number | null;
  failureFamily: string | null;
  truthNotice: string;
  mutationPerformed: false;
  secretValuesReturned: false;
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Accept the bounded provider result itself or Wolfram's notebook-style Out[n]= wrapper. */
export function normalizeWolframComputeResult(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || /[\r\n]/.test(trimmed)) throw new Error("CAG_RESULT_BOUNDS");
  const match = /^(?:Out\[[0-9]{1,9}\]\s*=\s*)?(.+)$/.exec(trimmed);
  if (!match?.[1]) throw new Error("CAG_RESULT_FORMAT");
  return match[1].trim();
}

function safeFailureFamily(error: unknown): string {
  if (!(error instanceof Error)) return "provider_failure_unclassified";
  const message = error.message;
  if (/^WOLFRAM_CAG_HTTP_[0-9]{3}$/.test(message)) return message.toLowerCase();
  if (/^WOLFRAM_CAG_[A-Z0-9_]+$/.test(message)) return message.toLowerCase();
  if (/^CAG_[A-Z0-9_]+$/.test(message)) return message.toLowerCase();
  if (error.name === "AbortError" || error.name === "TimeoutError") return "provider_timeout";
  if (error instanceof TypeError) return "provider_unreachable";
  return "provider_failure_unclassified";
}

function receiptFromEvidence(
  probe: AurionCagProbe,
  evidence: WolframCagEvidence,
): AurionCagDesignOracleReceipt {
  const observedExact = normalizeWolframComputeResult(evidence.result);
  return Object.freeze({
    version: AURION_CAG_DESIGN_ORACLE_VERSION,
    kind: probe.kind,
    verdict: observedExact === probe.expectedExact ? "SUPPORTED" : "CONTRADICTED",
    expectedExact: probe.expectedExact,
    observedExact,
    requestSha256: evidence.requestSha256,
    responseSha256: evidence.responseSha256,
    providerUuidSha256: evidence.providerUuid ? sha256(evidence.providerUuid) : null,
    providerCode: evidence.providerCode,
    failureFamily: null,
    truthNotice: `${probe.truthNotice} A non-SUPPORTED verdict never mutates authoritative Aurion state.`,
    mutationPerformed: false,
    secretValuesReturned: false,
  });
}

export async function verifyAurionCagDesignProbe(
  probe: AurionCagProbe,
  client: WolframCagClient,
): Promise<AurionCagDesignOracleReceipt> {
  try {
    const evidence = await client.languageCompute({
      code: probe.code,
      timeConstraint: 10,
      maxChars: 4096,
    });
    return receiptFromEvidence(probe, evidence);
  } catch (error) {
    return Object.freeze({
      version: AURION_CAG_DESIGN_ORACLE_VERSION,
      kind: probe.kind,
      verdict: "INCONCLUSIVE",
      expectedExact: probe.expectedExact,
      observedExact: null,
      requestSha256: null,
      responseSha256: null,
      providerUuidSha256: null,
      providerCode: null,
      failureFamily: safeFailureFamily(error),
      truthNotice: `${probe.truthNotice} Provider failure is non-authoritative and cannot change already-confirmed gameplay or world state.`,
      mutationPerformed: false,
      secretValuesReturned: false,
    });
  }
}

export async function verifyAurionCagDesignSuite(
  probes: readonly AurionCagProbe[],
  client: WolframCagClient,
): Promise<readonly AurionCagDesignOracleReceipt[]> {
  const receipts: AurionCagDesignOracleReceipt[] = [];
  for (const probe of probes) receipts.push(await verifyAurionCagDesignProbe(probe, client));
  return Object.freeze(receipts);
}
