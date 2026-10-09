import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import { githubProbeIdentity, verifyGithubProbeOidc } from "./aurionProductionProbeOidc";
import { requireProbeOwnerOrigin } from "./aurionProductionProbeHttp";
const revision = 'a'.repeat(40), now = new Date();
const payload = { repository: 'OuroborosCollective/Echoes_of_Aurion', repository_id: '1313103794', repository_owner_id: '266194342',
  sub: 'repo:OuroborosCollective@266194342/Echoes_of_Aurion@1313103794:environment:production', environment: 'production', event_name: 'workflow_dispatch',
  ref: 'refs/heads/main', ref_type: 'branch', workflow_ref: 'OuroborosCollective/Echoes_of_Aurion/.github/workflows/deploy-aurion-zone-runtime.yml@refs/heads/main',
  workflow_sha: revision, sha: revision, runner_environment: 'github-hosted', run_attempt: '1', run_id: '123456789', aud: 'aurion-production-probe' };
let pair: Awaited<ReturnType<typeof generateKeyPair>>, jwks: ReturnType<typeof createLocalJWKSet>;
beforeAll(async () => { pair = await generateKeyPair('RS256'); jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(pair.publicKey), kid: 'test-rs256' }] }); });
async function token(changes = {}, key = pair.privateKey) {
  const seconds = Math.floor(now.getTime()/1000);
  return new SignJWT({ ...payload, ...changes }).setProtectedHeader({alg:'RS256',kid:'test-rs256'})
    .setIssuer('https://token.actions.githubusercontent.com').setIssuedAt(seconds).setNotBefore(seconds)
    .setExpirationTime(seconds+300).setJti('test-job-unique-id').sign(key);
}
describe('GitHub signed OIDC verification (local cryptographic contract, not live GitHub evidence)', () => {
  it('verifies a real RSA signature and exact identity', async () => { expect((await verifyGithubProbeOidc(await token(),jwks,now)).revision).toBe(revision); });
  it('rejects independently signed forgery', async () => { const attacker=await generateKeyPair('RS256'); await expect(verifyGithubProbeOidc(await token({},attacker.privateKey),jwks,now)).rejects.toThrow('PROBE_OIDC_INVALID'); });
  it('rejects each altered identity claim', async () => {
    for (const [field,value] of Object.entries({repository:'other/repo',repository_id:'1',repository_owner_id:'1',sub:'repo:other/repo:environment:production',environment:'staging',event_name:'pull_request',ref:'refs/heads/dev',ref_type:'tag',workflow_ref:'other',workflow_sha:'b'.repeat(40),runner_environment:'self-hosted',run_attempt:'0',run_id:'0',aud:'other'})) {
      await expect(verifyGithubProbeOidc(await token({[field]:value}),jwks,now)).rejects.toThrow('PROBE_OIDC_INVALID');
    }
    await expect(verifyGithubProbeOidc(await token({sub:'repo:OuroborosCollective/Echoes_of_Aurion:environment:production'}),jwks,now)).rejects.toThrow('PROBE_OIDC_INVALID');
  });
  it('rejects expiration and not-before violations', async () => {
    const jwt=await token(); await expect(verifyGithubProbeOidc(jwt,jwks,new Date(now.getTime()+301000))).rejects.toThrow();
    await expect(verifyGithubProbeOidc(jwt,jwks,new Date(now.getTime()-2000))).rejects.toThrow();
  });
  it('rejects malformed and missing claims', () => { expect(()=>githubProbeIdentity({})).toThrow(); });
});
describe('Ops origin/CSRF contract', () => {
  const valid={origin:'https://arelogic.space',contentType:'application/json',requestedWith:'AurionOps',fetchSite:'same-origin'};
  it('accepts same-origin non-simple owner request',()=>expect(()=>requireProbeOwnerOrigin(valid)).not.toThrow());
  it('rejects cross-origin, null/missing Origin, simple forms, missing header and foreign fetch-site',()=>{
    for(const changes of [{origin:'https://attacker.test'},{origin:'null'},{origin:undefined},{contentType:'text/plain'},{requestedWith:undefined},{fetchSite:'cross-site'}]) expect(()=>requireProbeOwnerOrigin({...valid,...changes})).toThrow();
  });
});
