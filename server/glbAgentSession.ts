import { SignJWT, jwtVerify } from "jose";
import { operationalNow } from "../shared/operationalClock";

const ISSUER = "https://arelogic.space";
const AUDIENCE = "aurion-glb-import";
const PURPOSE = "aurion.glb-agent-session.v1";
const SCOPE = "aurion.admin.assets.write";
const TTL_SECONDS = 3600;
function key(secret: string) {
  if (secret.length < 32) throw new Error("GLB_AGENT_SESSION_NOT_CONFIGURED");
  return new TextEncoder().encode(secret);
}
/** Narrow, one-hour import credential. It is not a login cookie or an OAuth token. */
export async function issueGlbAgentSession(userId: number, secret: string, now = operationalNow()) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("GLB_ADMIN_REQUIRED");
  const issued = Math.floor(now / 1000), expires = issued + TTL_SECONDS;
  const token = await new SignJWT({ purpose: PURPOSE, scope: SCOPE })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(ISSUER).setAudience(AUDIENCE)
    .setSubject(String(userId)).setIssuedAt(issued).setExpirationTime(expires).sign(key(secret));
  return { token, expiresAt: new Date(expires * 1000).toISOString(), scope: SCOPE };
}
export async function verifyGlbAgentSession(token: string, secret: string, now = operationalNow()): Promise<number> {
  const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE, currentDate: new Date(now) });
  if (payload.purpose !== PURPOSE || payload.scope !== SCOPE || !payload.iat || !payload.exp || payload.iat > Math.floor(now / 1000) || payload.exp - payload.iat !== TTL_SECONDS || !/^[1-9][0-9]*$/.test(payload.sub ?? "")) throw new Error("GLB_AGENT_SESSION_INVALID");
  const id = Number(payload.sub); if (!Number.isSafeInteger(id)) throw new Error("GLB_AGENT_SESSION_INVALID"); return id;
}
