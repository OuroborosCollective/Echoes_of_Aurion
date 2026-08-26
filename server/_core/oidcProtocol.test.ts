import { describe, expect, it } from "vitest";
import {
  buildAuthorizationUrl,
  codeChallengeFor,
  createOidcTransaction,
  identityFromVerifiedIdToken,
  isOidcConfigured,
  oidcStateMatches,
  parseOidcTransaction,
  readOidcSettings,
  serializeOidcTransaction,
  type OidcMetadata,
  type OidcSettings,
} from "./oidcProtocol";

const settings: OidcSettings = {
  issuerUrl: "https://id.example.test",
  clientId: "aurion-client",
  clientSecret: "never-log-this-secret",
  redirectUri: "https://arelogic.space/api/oauth/callback",
  scope: "openid profile email",
};

const metadata: OidcMetadata = {
  issuer: settings.issuerUrl,
  authorizationEndpoint: "https://id.example.test/oauth2/authorize",
  tokenEndpoint: "https://id.example.test/oauth2/token",
  jwksUri: "https://id.example.test/.well-known/jwks.json",
};

describe("oidcProtocol", () => {
  it("creates a PKCE S256 challenge matching the RFC 7636 test vector", () => {
    expect(codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("serializes a bounded login transaction and rejects malformed transaction data", () => {
    const transaction = createOidcTransaction(length => Buffer.alloc(length, 7));
    expect(parseOidcTransaction(serializeOidcTransaction(transaction))).toEqual(transaction);
    expect(parseOidcTransaction("not-base64")).toBeNull();
    expect(parseOidcTransaction("a".repeat(2_049))).toBeNull();
  });

  it("builds a same-origin authorization request with state, nonce and S256 PKCE", () => {
    const transaction = { state: "state-value-with-sufficient-length-1234567890", nonce: "nonce-value-with-sufficient-length-1234567890", codeVerifier: "verifier-value-with-sufficient-length-12345678901234567890" };
    const url = new URL(buildAuthorizationUrl(settings, metadata, transaction));
    expect(url.origin).toBe("https://id.example.test");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe(settings.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(settings.redirectUri);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallengeFor(transaction.codeVerifier));
    expect(url.searchParams.get("state")).toBe(transaction.state);
    expect(url.searchParams.get("nonce")).toBe(transaction.nonce);
  });

  it("derives a stable, issuer-bound Aurion identity without retaining provider tokens", () => {
    const payload = { sub: "provider-user-42", nonce: "nonce-value-with-sufficient-length-1234567890", name: "Lyra", email: "lyra@example.test" };
    const first = identityFromVerifiedIdToken(payload, settings.issuerUrl, payload.nonce);
    expect(first).toEqual(identityFromVerifiedIdToken(payload, settings.issuerUrl, payload.nonce));
    expect(first).toMatchObject({ openId: expect.stringMatching(/^[a-f0-9]{64}$/), name: "Lyra", email: "lyra@example.test", loginMethod: "oidc" });
    expect(identityFromVerifiedIdToken({ ...payload, sub: "provider-user-43" }, settings.issuerUrl, payload.nonce).openId).not.toBe(first.openId);
  });

  it("rejects missing subjects and nonce mismatches", () => {
    expect(() => identityFromVerifiedIdToken({ nonce: "nonce-value-with-sufficient-length-1234567890" }, settings.issuerUrl, "nonce-value-with-sufficient-length-1234567890")).toThrow("subject");
    expect(() => identityFromVerifiedIdToken({ sub: "provider-user-42", nonce: "not-the-request-nonce" }, settings.issuerUrl, "nonce-value-with-sufficient-length-1234567890")).toThrow("nonce");
    expect(oidcStateMatches("same", "same")).toBe(true);
    expect(oidcStateMatches("same", "different")).toBe(false);
  });

  it("requires complete HTTPS configuration and an openid scope", () => {
    expect(isOidcConfigured({ OIDC_ISSUER_URL: settings.issuerUrl, OIDC_CLIENT_ID: settings.clientId, OIDC_CLIENT_SECRET: settings.clientSecret, OIDC_REDIRECT_URI: settings.redirectUri })).toBe(true);
    expect(isOidcConfigured({ OIDC_ISSUER_URL: settings.issuerUrl, OIDC_CLIENT_ID: settings.clientId })).toBe(false);
    expect(() => readOidcSettings({ ...process.env, OIDC_ISSUER_URL: "http://id.example.test", OIDC_CLIENT_ID: settings.clientId, OIDC_CLIENT_SECRET: settings.clientSecret, OIDC_REDIRECT_URI: settings.redirectUri })).toThrow("HTTPS");
    expect(() => readOidcSettings({ ...process.env, OIDC_ISSUER_URL: settings.issuerUrl, OIDC_CLIENT_ID: settings.clientId, OIDC_CLIENT_SECRET: settings.clientSecret, OIDC_REDIRECT_URI: settings.redirectUri, OIDC_SCOPE: "profile email" })).toThrow("openid");
  });
});
