# Aurion Admin MCP Contract

## Status and boundary

This document records the additive **Aurion Admin MCP** candidate. It is a separate OAuth resource at `/admin-mcp`; it never extends, replaces, or trusts the paired gameplay MCP at `/mcp`.

The current surface is intentionally **read-only** so that it is compatible with ChatGPT Pro's documented custom-MCP read/fetch mode. No tool can write a world chunk delta, place an object, publish a quest, mutate NPC rewards, access a database directly, execute a shell command, read Git data, or control a VPS.

| Surface | Current tools | Authority |
| --- | --- | --- |
| Gameplay MCP `/mcp` | `aurion_get_mission_contract`, `aurion_send_command` | Short-lived player session; allowlisted WASD / ability command only. |
| Admin MCP `/admin-mcp` | `aurion_admin_get_capabilities`, `aurion_admin_get_world_overview` | OIDC-authenticated Aurion account whose **stored Aurion role** is `admin`; read only. |
| Future apply service | Not registered | Must be a separately reviewed, receipt-bound server service. It is not an MCP tool in this candidate. |

## OAuth resource requirements

The resource server is configured solely by environment variables; no credential or issuer value belongs in source control.

```dotenv
# Existing Aurion OIDC setting; FusionAuth must be 1.67.0 or newer for `resource` indicators.
OIDC_ISSUER_URL=https://<fusionauth-issuer>

# Canonical public, TLS-protected Resource URL. It must end exactly in /admin-mcp.
AURION_ADMIN_MCP_RESOURCE_URL=https://arelogic.space/admin-mcp
```

On a public deployment, the route `GET /.well-known/oauth-protected-resource` returns the resource metadata pointing to the configured FusionAuth issuer. `POST /admin-mcp` requires a bearer access token. Aurion verifies, before serving an MCP request:

1. the token signature using the issuer's discovered JWKS;
2. issuer, expiry and exact `aud`/`resource` binding to `AURION_ADMIN_MCP_RESOURCE_URL`;
3. the `aurion.admin.read` scope; and
4. the matching subject's already stored Aurion `admin` role.

The OIDC subject is converted using the same SHA-256 `(issuer, subject)` mapping as Aurion login. Display claims and a role claim presented by a token do not grant authority.

## FusionAuth preparation

FusionAuth should host an **additional ChatGPT public OAuth application**, never reuse Aurion's confidential web-client credentials. The application needs Authorization Code, PKCE `S256`, strict scope handling, refresh-token support for `offline_access`, and exact redirect URI and resource URI values copied from the ChatGPT app creation screen. Configure `https://arelogic.space/admin-mcp` as an authorized resource URI. Configure only the `aurion.admin.read` custom scope for this candidate.

FusionAuth's own MCP guidance notes that dynamic client registration and Client ID Metadata Documents are not currently supported as automatic paths. Register ChatGPT out of band as a public OAuth client with its exact ChatGPT callback URI, and use exact-match redirect URI validation. Do not add a client secret to ChatGPT or the browser.

## ChatGPT connection and operating procedure

1. In ChatGPT **Web**, enable Developer Mode and add the canonical HTTPS endpoint `https://arelogic.space/admin-mcp` as a custom app.
2. ChatGPT discovers protected-resource metadata, starts the FusionAuth OAuth authorization-code flow and requests `aurion.admin.read`.
3. Sign in as an Aurion account already set to role `admin`. The server independently verifies that role on every request.
4. Use `aurion_admin_get_capabilities` before any game-master workflow, then `aurion_admin_get_world_overview` to read the confirmed global descriptor.

The mobile ChatGPT app is not the current connection surface for MCP apps. It may be used to discuss already returned content, but initial connection and MCP tool use must occur in ChatGPT Web according to the current OpenAI documentation.

## Future mutation gate

A future Business or Enterprise/Edu deployment may add a new, separately reviewed scope and tool only after all gates pass:

```text
ChatGPT request
→ typed proposal draft
→ independent schema + rule + chunk/base-revision + conflict checks
→ human approval of proposal hash
→ dedicated server apply service
→ idempotent receipt + audit record
→ confirmed player readmodel
```

A language model is an untrusted proposal producer. It can never itself select an authoritative coordinate, decide resources, grant rewards, write SQL, apply migrations, access source control, or deploy infrastructure.

## Evidence

- Code: `server/adminMcpProtocol.ts`, `server/adminMcp.ts`, `server/db.ts`.
- Unit regressions: `server/adminMcpProtocol.test.ts`, `server/adminMcp.test.ts`.
- External platform review: OpenAI Developer Mode / MCP App documentation and FusionAuth protected MCP documentation, consulted 2026-08-27.
- No public deployment, token issuance, FusionAuth configuration, ChatGPT connector installation or world mutation is part of this candidate change.

## Sources

- [OpenAI: Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)
- [OpenAI: Plugin authentication and MCP OAuth](https://developers.openai.com/plugins/build/auth)
- [FusionAuth: Controlling access to an MCP server](https://fusionauth.io/docs/extend/examples/controlling-access-mcp-server)
- [FusionAuth: OAuth authorize endpoint and resource indicators](https://fusionauth.io/docs/apis/oauth/authorize)
