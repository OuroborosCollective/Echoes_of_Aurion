import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export type OidcSettings = {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
};

export type OidcMetadata = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
};

export type OidcTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
};

export function isOidcConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(
    env.OIDC_ISSUER_URL &&
    env.OIDC_CLIENT_ID &&
    env.OIDC_CLIENT_SECRET &&
    env.OIDC_REDIRECT_URI
  );
}

export function readOidcSettings(env: Record<string, string | undefined>): OidcSettings {
  if (!isOidcConfigured(env)) {
    throw new Error("OIDC_NOT_CONFIGURED");
  }
  const issuerUrl = env.OIDC_ISSUER_URL!;
  const redirectUri = env.OIDC_REDIRECT_URI!;
  if (!issuerUrl.startsWith("https://") || !redirectUri.startsWith("https://")) {
    throw new Error("OIDC requires HTTPS URLs");
  }
  const scope = env.OIDC_SCOPE ?? "openid profile email";
  if (!scope.split(" ").includes("openid")) {
    throw new Error("OIDC scope must include openid");
  }

  return {
    issuerUrl,
    clientId: env.OIDC_CLIENT_ID!,
    clientSecret: env.OIDC_CLIENT_SECRET!,
    redirectUri,
    scope,
  };
}

export function codeChallengeFor(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

export function createOidcTransaction(rng: (length: number) => Buffer = randomBytes): OidcTransaction {
  return {
    state: rng(32).toString("base64url"),
    nonce: rng(32).toString("base64url"),
    codeVerifier: rng(32).toString("base64url"),
  };
}

export function serializeOidcTransaction(tx: OidcTransaction): string {
  return Buffer.from(JSON.stringify(tx), "utf8").toString("base64url");
}

export function parseOidcTransaction(serialized: string): OidcTransaction | null {
  if (!serialized || serialized.length > 2048) return null;
  try {
    const raw = Buffer.from(serialized, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.state === "string" &&
      typeof parsed?.nonce === "string" &&
      typeof parsed?.codeVerifier === "string"
    ) {
      return parsed as OidcTransaction;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildAuthorizationUrl(
  settings: OidcSettings,
  metadata: OidcMetadata,
  transaction: OidcTransaction
): string {
  const url = new URL(metadata.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", settings.redirectUri);
  url.searchParams.set("scope", settings.scope);
  url.searchParams.set("state", transaction.state);
  url.searchParams.set("nonce", transaction.nonce);
  url.searchParams.set("code_challenge", codeChallengeFor(transaction.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const discoveryCache = new Map<string, { metadata: OidcMetadata; cachedAt: number }>();

export async function discoverOidcMetadata(
  settings: OidcSettings,
  requestFetch: typeof fetch = fetch,
  clock = { now: () => Date.now() }
): Promise<OidcMetadata> {
  const cached = discoveryCache.get(settings.issuerUrl);
  const now = clock.now();
  if (cached && now - cached.cachedAt < 10 * 60 * 1000) {
    return cached.metadata;
  }

  const wellKnown = `${settings.issuerUrl.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  const res = await requestFetch(wellKnown);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const json = (await res.json()) as any;
  if (!json.authorization_endpoint || !json.token_endpoint) {
    throw new Error("Invalid OIDC metadata");
  }

  const metadata: OidcMetadata = {
    issuer: json.issuer ?? settings.issuerUrl,
    authorizationEndpoint: json.authorization_endpoint,
    tokenEndpoint: json.token_endpoint,
    jwksUri: json.jwks_uri,
  };

  discoveryCache.set(settings.issuerUrl, { metadata, cachedAt: now });
  return metadata;
}

export function identityFromVerifiedIdToken(
  payload: Record<string, any>,
  issuerUrl: string,
  expectedNonce: string
): { openId: string; name: string; email: string; loginMethod: string } {
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("ID token payload must contain subject (sub)");
  }
  if (payload.nonce !== expectedNonce) {
    throw new Error("ID token nonce mismatch");
  }

  const openId = createHash("sha256")
    .update(`${issuerUrl}::${payload.sub}`)
    .digest("hex");

  return {
    openId,
    name: payload.name ?? payload.sub,
    email: payload.email ?? "",
    loginMethod: "oidc",
  };
}

export async function exchangeOidcCode(
  settings: OidcSettings,
  metadata: OidcMetadata,
  code: string,
  codeVerifier: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    redirect_uri: settings.redirectUri,
    code,
    code_verifier: codeVerifier,
  });

  const res = await fetch(metadata.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }

  const json = (await res.json()) as any;
  if (!json.id_token) {
    throw new Error("Missing id_token in token response");
  }

  return json.id_token;
}

export async function verifyOidcIdToken(
  idToken: string,
  settings: OidcSettings,
  metadata: OidcMetadata,
  expectedNonce: string
): Promise<{ openId: string; name: string; email: string; loginMethod: string }> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT token format");
  const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
  const payload = JSON.parse(payloadJson);
  return identityFromVerifiedIdToken(payload, settings.issuerUrl, expectedNonce);
}

export function oidcStateMatches(stateA: string, stateB: string): boolean {
  if (typeof stateA !== "string" || typeof stateB !== "string") return false;
  const bufA = Buffer.from(stateA);
  const bufB = Buffer.from(stateB);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
