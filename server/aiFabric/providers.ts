import { z } from "zod";
import { FabricError, type FabricConfig } from "./policy";

export const OUTPUT_TOKENS = 8192;
const JsonObject = z.record(z.string(), z.unknown());
export async function boundedJson(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(timeoutMs) }); }
  catch (error) { throw new FabricError((error as Error).name === "TimeoutError" ? "TIMEOUT" : "OFFLINE"); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new FabricError(response.status === 401 || response.status === 403 ? "AUTH_FAILED" : response.status === 429 ? "FREE_RATE_LIMIT" : response.status === 402 ? "CREDIT_LIMIT" : "PROVIDER_HTTP_ERROR");
  }
  if (!response.headers.get("content-type")?.split(";")[0]?.trim().endsWith("/json")) { await response.body?.cancel(); throw new FabricError("INVALID_CONTENT_TYPE"); }
  const reader = response.body?.getReader();
  if (!reader) throw new FabricError("EMPTY_RESPONSE");
  const parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new FabricError("RESPONSE_TOO_LARGE"); }
      parts.push(value);
    }
  } catch (error) { if (error instanceof FabricError) throw error; throw new FabricError("TRANSPORT_UNCERTAIN"); }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new FabricError("INVALID_JSON"); }
}
const ModelSchema = z.object({
  id: z.string(), context_length: z.number().int().positive(),
  architecture: z.object({ input_modalities: z.array(z.string()), output_modalities: z.array(z.string()) }),
  supported_parameters: z.array(z.string()).default([]), pricing: z.record(z.string(), z.string()),
  top_provider: z.object({ max_completion_tokens: z.number().nullable().optional() }).optional(),
});
export type Model = z.infer<typeof ModelSchema>;
function price(value: string | undefined): number {
  if (value === undefined || !/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new FabricError("PRICE_UNKNOWN");
  const n = Number(value); if (!Number.isFinite(n) || n < 0 || n > 100) throw new FabricError("PRICE_UNKNOWN"); return n;
}
export function freeModel(model: Model): boolean {
  return model.id.endsWith(":free") && "prompt" in model.pricing && "completion" in model.pricing && Object.values(model.pricing).every(p => price(p) === 0);
}
export function suitable(model: Model, promptBytes: number): boolean {
  // Byte count + framing is a pessimistic input token bound; not a tokenizer estimate.
  return model.architecture.input_modalities.includes("text") && model.architecture.output_modalities.includes("text")
    && model.context_length >= promptBytes + OUTPUT_TOKENS + 1024
    && (model.top_provider?.max_completion_tokens ?? OUTPUT_TOKENS) >= OUTPUT_TOKENS;
}
export function providerPriceCeiling(model: Model) {
  // OpenRouter max_price token fields are USD per million tokens, whereas
  // /models pricing is per token. Constrain routing to the reserved tariff.
  return { prompt: Math.max(price(model.pricing.prompt), price(model.pricing.input_cache_read ?? "0"), price(model.pricing.input_cache_write ?? "0")) * 1_000_000,
    completion: price(model.pricing.completion) * 1_000_000, request: price(model.pricing.request ?? "0") };
}
export function reservationMicros(model: Model, promptBytes: number): number {
  // Refuse unmodelled nonzero billable dimensions (images, web search, reasoning extras).
  for (const [key, value] of Object.entries(model.pricing)) if (!["prompt", "completion", "request", "input_cache_read", "input_cache_write"].includes(key) && price(value) !== 0) throw new FabricError("PRICE_DIMENSION_UNSUPPORTED");
  const input = Math.max(price(model.pricing.prompt), price(model.pricing.input_cache_read ?? "0"), price(model.pricing.input_cache_write ?? "0"));
  const total = ((promptBytes + 1024) * input + OUTPUT_TOKENS * price(model.pricing.completion) + price(model.pricing.request ?? "0")) * 2;
  const micros = Math.ceil(total * 1_000_000);
  if (!Number.isSafeInteger(micros)) throw new FabricError("PRICE_UNKNOWN");
  return micros;
}
export type Generation = { content: string; model: string; provider: string; tokens: number | null; costMicros: number | null; policyViolation?: boolean };
export class OpenRouterProvider {
  constructor(private readonly key: string) {}
  async models(): Promise<Model[]> {
    const data = z.object({ data: z.array(z.unknown()) }).parse(await boundedJson("https://openrouter.ai/api/v1/models", {}, 10_000));
    return data.data.flatMap(m => { const parsed = ModelSchema.safeParse(m); return parsed.success ? [parsed.data] : []; });
  }
  async account() {
    if (!this.key) throw new FabricError("AUTH_FAILED");
    const raw = z.object({ data: JsonObject }).parse(await boundedJson("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${this.key}` } }, 10_000)).data;
    let purchasedCreditsVerified = false;
    try {
      const credits = z.object({ data: z.object({ total_credits: z.number().nonnegative(), total_usage: z.number().nonnegative() }) }).parse(await boundedJson("https://openrouter.ai/api/v1/credits", { headers: { Authorization: `Bearer ${this.key}` } }, 8000));
      purchasedCreditsVerified = credits.data.total_credits >= 10 && credits.data.total_credits >= credits.data.total_usage;
    } catch { /* Restricted execution keys may not inspect purchases. Keep the lower cap. */ }
    // No API key labels/ids or arbitrary provider metadata leave this boundary.
    return { limitRemainingUsd: typeof raw.limit_remaining === "number" ? raw.limit_remaining : null, usageDailyUsd: typeof raw.usage_daily === "number" ? raw.usage_daily : null,
      freeTier: typeof raw.is_free_tier === "boolean" ? raw.is_free_tier : null, purchasedCreditsVerified };
  }
  async generate(model: Model, prompt: string): Promise<Generation> {
    if (!this.key) throw new FabricError("AUTH_FAILED");
    const envelope = z.object({ model: z.string(), provider: z.string().optional(),
      choices: z.array(z.object({ finish_reason: z.string().nullable().optional(), message: z.object({ content: z.string().max(120000) }) })).min(1),
      usage: z.object({ total_tokens: z.number().int().nonnegative().optional(), cost: z.number().nonnegative().finite().optional() }).optional(),
    }).parse(await boundedJson("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.id, max_tokens: OUTPUT_TOKENS, stream: false,
        provider: { allow_fallbacks: false, require_parameters: true, max_price: providerPriceCeiling(model) },
        messages: [{ role: "user", content: prompt }],
        ...(model.supported_parameters.includes("response_format") ? { response_format: { type: "json_object" } } : {}),
      }),
    }, 40_000));
    const cost = envelope.usage?.cost;
    const costMicros = cost === undefined ? null : Math.ceil(cost * 1_000_000);
    return { content: envelope.choices[0]!.message.content, model: envelope.model, provider: envelope.provider ?? "UNREPORTED",
      tokens: envelope.usage?.total_tokens ?? null, costMicros: costMicros !== null && Number.isSafeInteger(costMicros) ? costMicros : null };
  }
}

export function loopbackUrl(raw: string): string {
  let url: URL; try { url = new URL(raw); } catch { throw new FabricError("OFFLINE"); }
  if (!["127.0.0.1", "[::1]"].includes(url.hostname) || url.protocol !== "http:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new FabricError("PRIVATE_TUNNEL_REQUIRED");
  return url.origin;
}
/** A dedicated deny-all OpenCode instance, over loopback or an SSH tunnel.
 * Existing interactive sessions, global settings and permission prompts are never changed. */
export class OpenCodeProvider {
  constructor(private readonly config: FabricConfig) {}
  private request(path: string, body?: unknown, timeout = 8000) {
    if (!this.config.openCodePassword) throw new FabricError("AUTH_FAILED");
    return boundedJson(loopbackUrl(this.config.openCodeUrl) + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${this.config.openCodeUsername}:${this.config.openCodePassword}`).toString("base64")}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }, timeout);
  }
  async inspect(promptBytes = 0) {
    if (!this.config.openCodeUrl) throw new FabricError("OFFLINE");
    const health = z.object({ healthy: z.literal(true), version: z.string() }).parse(await this.request("/global/health"));
    if (!this.config.openCodeVersion || health.version !== this.config.openCodeVersion) throw new FabricError("OPENCODE_VERSION_UNVERIFIED");
    const spec = z.object({ paths: JsonObject }).parse(await this.request("/doc"));
    if (!spec.paths["/session"] || !spec.paths["/session/{sessionID}/message"]) throw new FabricError("OPENCODE_API_UNSUPPORTED");
    const config = JsonObject.parse(await this.request("/config"));
    // Deny every tool, MCP, plugin and automatic compaction in the dedicated instance.
    // Never rely on prompt instructions to confine a coding agent.
    if (config.permission !== "deny" || Object.keys((config.mcp ?? {}) as object).length || (Array.isArray(config.plugin) && config.plugin.length)) throw new FabricError("OPENCODE_TOOL_POLICY_UNSAFE");
    const configuredModel = `${this.config.openCodeProvider}/${this.config.openCodeModel}`;
    const auxiliary = config.agent as Record<string, { model?: string; steps?: number }> | undefined;
    if (config.model !== configuredModel || config.small_model !== configuredModel || auxiliary?.["aurion-designer"]?.model !== configuredModel
      || auxiliary?.["aurion-designer"]?.steps !== 1 || (config.compaction as { auto?: boolean } | undefined)?.auto !== false
      || Object.values(auxiliary ?? {}).some(a => a.model !== undefined && a.model !== configuredModel)) throw new FabricError("OPENCODE_AUXILIARY_MODEL_UNSAFE");
    const agents = z.array(z.object({ name: z.string(), permission: z.array(z.object({ permission: z.string(), pattern: z.string(), action: z.string() })) })).parse(await this.request("/agent"));
    const agent = agents.find(a => a.name === "aurion-designer");
    if (!agent || !agent.permission.some(p => p.permission === "*" && p.pattern === "*" && p.action === "deny") || agent.permission.some(p => p.action !== "deny")) throw new FabricError("OPENCODE_TOOL_POLICY_UNSAFE");
    const providers = z.object({ providers: z.array(z.object({ id: z.string(), models: z.record(z.string(), z.object({ id: z.string(), limit: z.object({ context: z.number(), output: z.number() }), cost: z.object({ input: z.number(), output: z.number() }) })) })) }).parse(await this.request("/config/providers"));
    const provider = providers.providers.find(p => p.id === this.config.openCodeProvider);
    const model = provider?.models[this.config.openCodeModel];
    if (!model || model.limit.context < promptBytes + OUTPUT_TOKENS + 1024 || model.limit.output < OUTPUT_TOKENS) throw new FabricError("MODEL_UNAVAILABLE");
    const providerConfig = (config.provider as Record<string, { options?: { baseURL?: string } }> | undefined)?.[this.config.openCodeProvider];
    const inferenceUrl = providerConfig?.options?.baseURL;
    // A local OpenCode process does not establish local inference. Reject an
    // external NVIDIA endpoint until it has its own approved accounting policy.
    if (!inferenceUrl) throw new FabricError("INFERENCE_LOCATION_UNVERIFIED");
    const inference = new URL(inferenceUrl); inference.pathname = "/";
    loopbackUrl(inference.href);
    if (model.cost.input !== 0 || model.cost.output !== 0) throw new FabricError("LOCAL_COST_UNVERIFIED");
    return { status: "CONNECTED", version: health.version, model: model.id, provider: provider!.id, inference: "loopback", contextLength: model.limit.context };
  }
  async generate(prompt: string): Promise<Generation> {
    await this.inspect(Buffer.byteLength(prompt));
    const session = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]+$/) }).parse(await this.request("/session", { title: "Aurion review-only world proposal", permission: [{ permission: "*", pattern: "*", action: "deny" }] }));
    const response = z.object({ info: z.object({ modelID: z.string(), providerID: z.string(), cost: z.number().nonnegative(), tokens: z.object({ input: z.number().int().nonnegative(), output: z.number().int().nonnegative() }) }), parts: z.array(z.object({ type: z.string(), text: z.string().optional() })) }).parse(await this.request(`/session/${session.id}/message`, {
      agent: "aurion-designer", model: { providerID: this.config.openCodeProvider, modelID: this.config.openCodeModel },
      parts: [{ type: "text", text: prompt }],
    }, 40_000));
    const micros = Math.ceil(response.info.cost * 1_000_000);
    return { content: response.parts.filter(p => p.type === "text").map(p => p.text ?? "").join("\n"), model: response.info.modelID,
      provider: response.info.providerID, costMicros: Number.isSafeInteger(micros) ? micros : null,
      policyViolation: response.info.cost !== 0 || response.parts.some(p => p.type === "tool"), tokens: response.info.tokens.input + response.info.tokens.output };
  }
}
