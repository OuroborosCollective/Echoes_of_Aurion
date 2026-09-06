import { createHash } from "node:crypto";

export const AURION_WOLFRAM_CAG_PROTOCOL = "aurion.wolfram-cag.v1" as const;
export const WOLFRAM_CAG_ORIGIN = "https://services.wolfram.com" as const;
export const WOLFRAM_CAG_COMPONENTS = [
  "language_compute",
  "language_hints",
  "alpha_results",
  "alpha_context",
] as const;
export type WolframCagComponent = (typeof WOLFRAM_CAG_COMPONENTS)[number];

const endpoints: Readonly<Record<WolframCagComponent, string>> = Object.freeze({
  language_compute: "/api/cag/v1/WolframLanguageCompute",
  language_hints: "/api/cag/v1/WolframLanguageHints",
  alpha_results: "/api/cag/v1/WolframAlphaResult",
  alpha_context: "/api/cag/v1/WolframAlphaContext",
});
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_INPUT_CHARS = 20_000;
const MAX_RESULT_CHARS = 50_000;
const MAX_DECLARED_RESPONSE_BYTES = 200_000;
const apiKeyPattern = /^[\x21-\x7e]{16,512}$/;
const uuidPattern = /^[A-Za-z0-9._:-]{1,160}$/;

type FetchLike = typeof fetch;

type ProviderBody = Readonly<{
  result?: unknown;
  code?: unknown;
  success?: unknown;
  uuid?: unknown;
}>;

export type WolframCagEvidence = Readonly<{
  protocol: typeof AURION_WOLFRAM_CAG_PROTOCOL;
  provider: "wolfram-cag";
  component: WolframCagComponent;
  endpoint: string;
  requestSha256: string;
  responseSha256: string;
  providerUuid: string | null;
  providerCode: number;
  success: true;
  result: string;
  resultChars: number;
}>;

export type WolframCagConfigurationStatus = Readonly<{
  protocol: typeof AURION_WOLFRAM_CAG_PROTOCOL;
  provider: "wolfram-cag";
  origin: typeof WOLFRAM_CAG_ORIGIN;
  components: readonly WolframCagComponent[];
  configured: boolean;
  configurationState: "configured" | "missing_key" | "invalid_key";
  mutationAuthority: "none";
}>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function boundedText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_INPUT_CHARS) {
    throw new Error(`${label} must contain 1-${MAX_INPUT_CHARS} characters`);
  }
  return value;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function parseKey(environment: NodeJS.ProcessEnv): { state: WolframCagConfigurationStatus["configurationState"]; key: string | null } {
  const raw = environment.WOLFRAM_CAG_API_KEY;
  if (typeof raw !== "string" || raw.length === 0) return { state: "missing_key", key: null };
  if (!apiKeyPattern.test(raw)) return { state: "invalid_key", key: null };
  return { state: "configured", key: raw };
}

export function wolframCagConfigurationStatus(environment: NodeJS.ProcessEnv = process.env): WolframCagConfigurationStatus {
  const configuration = parseKey(environment);
  return Object.freeze({
    protocol: AURION_WOLFRAM_CAG_PROTOCOL,
    provider: "wolfram-cag",
    origin: WOLFRAM_CAG_ORIGIN,
    components: Object.freeze([...WOLFRAM_CAG_COMPONENTS]),
    configured: configuration.state === "configured",
    configurationState: configuration.state,
    mutationAuthority: "none",
  });
}

function normalizeProviderBody(raw: string): ProviderBody | null {
  try {
    let parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "string" && parsed.trim().startsWith("{")) parsed = JSON.parse(parsed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ProviderBody : null;
  } catch {
    return null;
  }
}

function providerResult(raw: string, body: ProviderBody | null): string {
  const result = typeof body?.result === "string" ? body.result : raw;
  if (!result.length || result.length > MAX_RESULT_CHARS) throw new Error("WOLFRAM_CAG_RESULT_SIZE_INVALID");
  return result;
}

export type WolframCagClient = Readonly<{
  languageCompute(input: Readonly<{ code: string; timeConstraint?: number; maxChars?: number }>): Promise<WolframCagEvidence>;
  languageHints(input: Readonly<{ context: string }>): Promise<WolframCagEvidence>;
  alphaResults(input: Readonly<{ input: string }>): Promise<WolframCagEvidence>;
  alphaContext(input: Readonly<{ context: string; count?: number }>): Promise<WolframCagEvidence>;
}>;

export function createWolframCagClient(options: Readonly<{
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}>): WolframCagClient {
  if (!apiKeyPattern.test(options.apiKey)) throw new Error("WOLFRAM_CAG_API_KEY_INVALID");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs === undefined
    ? DEFAULT_TIMEOUT_MS
    : boundedInteger(options.timeoutMs, "timeoutMs", 1_000, MAX_TIMEOUT_MS);

  async function call(component: WolframCagComponent, request: Readonly<Record<string, unknown>>, method: "GET" | "POST"): Promise<WolframCagEvidence> {
    const endpoint = endpoints[component];
    const url = new URL(endpoint, WOLFRAM_CAG_ORIGIN);
    let body: string | undefined;
    if (method === "GET") {
      for (const [key, value] of Object.entries(request)) url.searchParams.set(key, String(value));
    } else {
      body = JSON.stringify(request);
    }
    const requestSha256 = sha256(stable({ component, request }));
    const response = await fetchImpl(url, {
      method,
      headers: {
        accept: "application/json, text/plain;q=0.9",
        authorization: options.apiKey,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`WOLFRAM_CAG_HTTP_${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DECLARED_RESPONSE_BYTES) throw new Error("WOLFRAM_CAG_RESPONSE_TOO_LARGE");
    const raw = await response.text();
    if (raw.length > MAX_RESULT_CHARS * 2) throw new Error("WOLFRAM_CAG_RESPONSE_TOO_LARGE");
    const parsed = normalizeProviderBody(raw);
    if (parsed?.success === false) throw new Error("WOLFRAM_CAG_PROVIDER_REJECTED");
    const result = providerResult(raw, parsed);
    const providerCode = Number.isSafeInteger(parsed?.code) ? parsed!.code as number : response.status;
    const providerUuid = typeof parsed?.uuid === "string" && uuidPattern.test(parsed.uuid) ? parsed.uuid : null;
    return Object.freeze({
      protocol: AURION_WOLFRAM_CAG_PROTOCOL,
      provider: "wolfram-cag",
      component,
      endpoint,
      requestSha256,
      responseSha256: sha256(result),
      providerUuid,
      providerCode,
      success: true,
      result,
      resultChars: result.length,
    });
  }

  return Object.freeze({
    languageCompute: async input => call("language_compute", {
      code: boundedText(input.code, "code"),
      timeConstraint: input.timeConstraint === undefined ? 60 : boundedInteger(input.timeConstraint, "timeConstraint", 1, 60),
      maxChars: input.maxChars === undefined ? 10_000 : boundedInteger(input.maxChars, "maxChars", 1, 20_000),
    }, "POST"),
    languageHints: async input => call("language_hints", { context: boundedText(input.context, "context") }, "POST"),
    alphaResults: async input => call("alpha_results", { input: boundedText(input.input, "input") }, "GET"),
    alphaContext: async input => call("alpha_context", {
      context: boundedText(input.context, "context"),
      count: input.count === undefined ? 5 : boundedInteger(input.count, "count", 1, 10),
    }, "POST"),
  });
}

export function requireWolframCagClient(environment: NodeJS.ProcessEnv = process.env): WolframCagClient {
  const configuration = parseKey(environment);
  if (configuration.state === "missing_key") throw new Error("WOLFRAM_CAG_NOT_CONFIGURED");
  if (configuration.state !== "configured" || !configuration.key) throw new Error("WOLFRAM_CAG_CONFIGURATION_INVALID");
  return createWolframCagClient({ apiKey: configuration.key });
}

export async function runAurionWolframCagCanary(client: WolframCagClient = requireWolframCagClient()) {
  const expression = "Total[Range[1000]^2]";
  const expectedExact = "333833500";
  const evidence = await client.languageCompute({ code: expression, timeConstraint: 10, maxChars: 1_000 });
  const compact = evidence.result.replace(/[\s,]/g, "");
  if (!compact.includes(expectedExact)) throw new Error("WOLFRAM_CAG_CANARY_RESULT_MISMATCH");
  return Object.freeze({
    protocol: "aurion.wolfram-cag-canary.v1" as const,
    expression,
    expectedExact,
    evidence,
    mutationAuthority: "none" as const,
  });
}
