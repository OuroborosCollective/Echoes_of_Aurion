import {
  requireWolframCagClient,
  runAurionWolframCagCanary,
  wolframCagConfigurationStatus,
  type WolframCagClient,
} from "./wolframCag";

export type WolframCagRuntimeReadback = Readonly<{
  protocol: "aurion.wolfram-cag-runtime.v1";
  configured: boolean;
  providerCallExecuted: boolean;
  providerCanaryVerified: boolean;
  status: "not_configured" | "verified" | "provider_failed";
  failureFamily: string | null;
  requestSha256: string | null;
  responseSha256: string | null;
  providerUuid: string | null;
  providerCode: number | null;
  mutationAuthority: "none";
}>;

function safeFailureFamily(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  const http = /^WOLFRAM_CAG_HTTP_([0-9]{3})$/.exec(message);
  if (http) return `provider_http_${http[1]}`;
  if (message === "WOLFRAM_CAG_CANARY_RESULT_MISMATCH") return "canary_result_mismatch";
  if (message === "WOLFRAM_CAG_PROVIDER_REJECTED") return "provider_rejected";
  if (message === "WOLFRAM_CAG_RESPONSE_TOO_LARGE") return "provider_response_too_large";
  if (message === "WOLFRAM_CAG_RESULT_SIZE_INVALID") return "provider_result_size_invalid";
  if (name === "AbortError" || name === "TimeoutError") return "provider_timeout";
  if (error instanceof TypeError) return "provider_unreachable";
  return "provider_failure_unclassified";
}

export function initialWolframCagRuntimeReadback(environment: NodeJS.ProcessEnv = process.env): WolframCagRuntimeReadback {
  const configuration = wolframCagConfigurationStatus(environment);
  return Object.freeze({
    protocol: "aurion.wolfram-cag-runtime.v1",
    configured: configuration.configured,
    providerCallExecuted: false,
    providerCanaryVerified: false,
    status: "not_configured",
    failureFamily: configuration.configured ? null : configuration.configurationState,
    requestSha256: null,
    responseSha256: null,
    providerUuid: null,
    providerCode: null,
    mutationAuthority: "none",
  });
}

export async function resolveWolframCagRuntimeReadback(options: Readonly<{
  environment?: NodeJS.ProcessEnv;
  client?: WolframCagClient;
}> = {}): Promise<WolframCagRuntimeReadback> {
  const environment = options.environment ?? process.env;
  const configuration = wolframCagConfigurationStatus(environment);
  if (!configuration.configured) return initialWolframCagRuntimeReadback(environment);

  try {
    const canary = await runAurionWolframCagCanary(options.client ?? requireWolframCagClient(environment));
    return Object.freeze({
      protocol: "aurion.wolfram-cag-runtime.v1",
      configured: true,
      providerCallExecuted: true,
      providerCanaryVerified: true,
      status: "verified",
      failureFamily: null,
      requestSha256: canary.evidence.requestSha256,
      responseSha256: canary.evidence.responseSha256,
      providerUuid: canary.evidence.providerUuid,
      providerCode: canary.evidence.providerCode,
      mutationAuthority: "none",
    });
  } catch (error) {
    return Object.freeze({
      protocol: "aurion.wolfram-cag-runtime.v1",
      configured: true,
      providerCallExecuted: true,
      providerCanaryVerified: false,
      status: "provider_failed",
      failureFamily: safeFailureFamily(error),
      requestSha256: null,
      responseSha256: null,
      providerUuid: null,
      providerCode: null,
      mutationAuthority: "none",
    });
  }
}
