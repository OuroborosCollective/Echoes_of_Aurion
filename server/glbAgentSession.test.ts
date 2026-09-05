import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { issueGlbAgentSession, verifyGlbAgentSession } from "./glbAgentSession";
const secret = 'isolated-test-key-never-production-112';
const now = 1_800_000_000_000;
describe('bounded GLB agent sessions', () => {
  it('cryptographically binds user, purpose, audience and expiry, rejecting expired, forged and login credentials', async () => {
    const session = await issueGlbAgentSession(17, secret, now);
    expect(await verifyGlbAgentSession(session.token, secret, now + 1000)).toBe(17);
    await expect(verifyGlbAgentSession(session.token, secret, now + 3_600_000)).rejects.toThrow();
    await expect(verifyGlbAgentSession(session.token, secret + '-wrong', now)).rejects.toThrow();
    const login = await new SignJWT({ openId: 'login-user', appId: 'app' }).setProtectedHeader({ alg: 'HS256' }).setSubject('17').setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 3600).sign(new TextEncoder().encode(secret));
    await expect(verifyGlbAgentSession(login, secret, now)).rejects.toThrow();
    await expect(issueGlbAgentSession(17, '', now)).rejects.toThrow('GLB_AGENT_SESSION_NOT_CONFIGURED');
  });
});
