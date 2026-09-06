import {
  requireWolframCagClient,
  runAurionWolframCagCanary,
  wolframCagConfigurationStatus,
  type WolframCagEvidence,
} from "../../server/wolframCag";

const status = wolframCagConfigurationStatus();
if (!status.configured) {
  process.stderr.write(`${JSON.stringify(status)}\n`);
  process.exitCode = 2;
} else {
  const client = requireWolframCagClient();
  try {
    const result = await runAurionWolframCagCanary(client);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const classify = (value: unknown) => {
      const message = value instanceof Error ? value.message : String(value);
      const http = /^WOLFRAM_CAG_HTTP_(\d{3})$/.exec(message);
      if (http) return `http_${http[1]}`;
      if (/^WOLFRAM_CAG_[A-Z0-9_]+$/.test(message)) return message.toLowerCase();
      return "provider_failure_unclassified";
    };
    const attempt = async (component: string, operation: () => Promise<WolframCagEvidence>) => {
      try {
        const evidence = await operation();
        return Object.freeze({
          component,
          state: "success" as const,
          providerCode: evidence.providerCode,
          providerUuidPresent: Boolean(evidence.providerUuid),
          requestSha256: evidence.requestSha256,
          responseSha256: evidence.responseSha256,
        });
      } catch (diagnosticError) {
        return Object.freeze({ component, state: "failure" as const, failureFamily: classify(diagnosticError) });
      }
    };
    // These are intentionally tiny, documented requests. They distinguish a
    // compute-kernel failure from a wider CAG provisioning/service failure while
    // never returning provider bodies or the Authorization secret to CI logs.
    const diagnostics = Object.freeze([
      await attempt("language_compute_minimal", () => client.languageCompute({ code: "Sin[Pi]", timeConstraint: 10, maxChars: 1_000 })),
      await attempt("alpha_results_minimal", () => client.alphaResults({ input: "2+2" })),
      await attempt("language_hints_minimal", () => client.languageHints({ context: "Wolfram Language code for 2+2" })),
      await attempt("alpha_context_minimal", () => client.alphaContext({ context: "What is 2+2?", count: 1 })),
    ]);
    process.stdout.write(`${JSON.stringify({
      protocol: "aurion.wolfram-cag-provider-diagnostic.v1",
      configured: true,
      canaryFailureFamily: classify(error),
      diagnostics,
      mutationAuthority: "none",
    })}\n`);
    process.exitCode = 1;
  }
}
