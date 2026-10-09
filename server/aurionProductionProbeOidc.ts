import { operationalDate } from "../shared/operationalClock";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { parseAurionProbeRunIdentity, AURION_PROBE_REPOSITORY, AURION_PROBE_WORKFLOW, AURION_PROBE_REF, AURION_PROBE_ENVIRONMENT, AURION_PROBE_OIDC_AUDIENCE } from "./aurionProductionProbeApprovalContract";

const issuer = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`), { timeoutDuration: 5000 });

/** Called only after JOSE signature, issuer, audience and temporal verification. */
export function githubProbeIdentity(payload: JWTPayload) {
  if (payload.repository_id !== "1313103794" || payload.repository_owner_id !== "266194342"
    || payload.repository !== AURION_PROBE_REPOSITORY
    || payload.sub !== `repo:${AURION_PROBE_REPOSITORY}:environment:${AURION_PROBE_ENVIRONMENT}`
    || payload.environment !== AURION_PROBE_ENVIRONMENT || payload.event_name !== "workflow_dispatch"
    || payload.ref !== AURION_PROBE_REF || payload.ref_type !== "branch"
    || payload.workflow_ref !== `${AURION_PROBE_REPOSITORY}/${AURION_PROBE_WORKFLOW}@${AURION_PROBE_REF}`
    || payload.workflow_sha !== payload.sha || payload.runner_environment !== "github-hosted"
    || typeof payload.run_attempt !== "string" || !/^[1-9][0-9]*$/.test(payload.run_attempt)) throw new Error("PROBE_OIDC_IDENTITY_INVALID");
  return parseAurionProbeRunIdentity({ repository: payload.repository, workflow: AURION_PROBE_WORKFLOW,
    ref: payload.ref, revision: payload.sha, runId: payload.run_id, runAttempt: Number(payload.run_attempt),
    environment: payload.environment, audience: payload.aud });
}

/** Dependency injection is confined to tests; HTTP callers cannot select keys or issuer. */
export async function verifyGithubProbeOidc(token: string, key: JWTVerifyGetKey = keys, now = operationalDate()) {
  if (token.length < 100 || token.length > 16384) throw new Error("PROBE_OIDC_INVALID");
  try {
    const { payload } = await jwtVerify(token, key, { issuer, audience: AURION_PROBE_OIDC_AUDIENCE,
      algorithms: ["RS256"], requiredClaims: ["iss", "sub", "aud", "iat", "nbf", "exp", "jti"],
      maxTokenAge: "5m", clockTolerance: 0, currentDate: now });
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number" || payload.exp - payload.iat > 600
      || typeof payload.jti !== "string" || payload.jti.length < 8) throw new Error("PROBE_OIDC_INVALID");
    return githubProbeIdentity(payload);
  } catch { throw new Error("PROBE_OIDC_INVALID"); }
}
