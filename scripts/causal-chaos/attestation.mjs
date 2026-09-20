import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function parseBundle(path) {
  const raw = readFileSync(path, 'utf8').trim();
  try { return JSON.parse(raw); }
  catch {
    const first = raw.split(/\r?\n/).find(line => line.trim());
    if (!first) throw new Error('ATTESTATION_BUNDLE_EMPTY');
    return JSON.parse(first);
  }
}

/**
 * Read the signed in-toto statement. This data is trusted only after the same
 * bundle has passed gh attestation verify for the expected OIDC signer/source.
 */
export function readVerifiedBundleStatement(bundlePath) {
  const bundle = parseBundle(bundlePath);
  const envelope = bundle.dsseEnvelope ?? bundle.content?.dsseEnvelope;
  if (!envelope?.payload || typeof envelope.payload !== 'string') throw new Error('ATTESTATION_DSSE_PAYLOAD_MISSING');
  const statement = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8'));
  const subject = Array.isArray(statement.subject) && statement.subject.length === 1 ? statement.subject[0] : null;
  const sha256 = subject?.digest?.sha256;
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('ATTESTATION_SUBJECT_SHA256_MISSING');
  return { statement, subjectSha256: sha256 };
}

export function classifyCorruptedVerification({ status, error, attestedSubjectSha256, corruptedSubjectSha256 }) {
  if (error || status === null || status === 2 || status === 4) {
    return { status: 'UNPROVABLE', reason: status === 4 ? 'ATTESTATION_AUTH_FAILURE' :
      status === 2 ? 'ATTESTATION_VERIFICATION_CANCELLED' : 'ATTESTATION_REJECTION_UNCLASSIFIED' };
  }
  if (attestedSubjectSha256 === corruptedSubjectSha256) {
    return { status: 'UNPROVABLE', reason: 'ATTESTATION_SUBJECT_NOT_CHANGED' };
  }
  if (status === 0) return { status: 'MATCH', reason: 'TAMPERED_SUBJECT_VERIFIED' };
  if (status === 1) return { status: 'FIRST_DIVERGENCE', boundary: 'ATTESTATION_SUBJECT' };
  return { status: 'UNPROVABLE', reason: `ATTESTATION_EXIT_STATUS_UNCLASSIFIED:${status}` };
}

/** Real GitHub/Sigstore verification only. Missing evidence is never a pass. */
export function verifyAttestationTamper(input) {
  if (!input) return { status: 'UNPROVABLE', reason: 'ATTESTATION_EVIDENCE_REQUIRED' };
  const { artifactPath, bundlePath, repository, sourceRevision, sourceRef, workflow, predicateType, testedRevision } = input;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(sourceRevision) ||
      !/^refs\//.test(sourceRef) || !/^\.github\/workflows\/[\w.-]+\.yml$/.test(workflow) ||
      !/^https:\/\//.test(predicateType) || !/^[a-f0-9]{40}$/.test(testedRevision)) throw new Error('ATTESTATION_BINDING_INVALID');
  const dir = mkdtempSync(join(tmpdir(), 'aurion-chaos-attestation-'));
  const copy = join(dir, 'subject.bin');
  const verify = () => spawnSync('gh', ['attestation', 'verify', copy,
    '--repo', repository, '--signer-workflow', `${repository}/${workflow}`,
    '--source-digest', sourceRevision, '--source-ref', sourceRef,
    '--predicate-type', predicateType, '--deny-self-hosted-runners', '--bundle', bundlePath,
  ], { encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 });
  try {
    copyFileSync(artifactPath, copy);
    const before = verify();
    if (before.error || before.status !== 0) return { status: 'UNPROVABLE', reason: 'ATTESTATION_BASELINE_UNVERIFIED' };

    let signed;
    try { signed = readVerifiedBundleStatement(bundlePath); }
    catch { return { status: 'UNPROVABLE', reason: 'ATTESTATION_SIGNED_SUBJECT_UNREADABLE' }; }
    const baselineSubjectSha256 = sha256File(copy);
    if (signed.subjectSha256 !== baselineSubjectSha256) {
      return { status: 'UNPROVABLE', reason: 'ATTESTATION_BASELINE_SUBJECT_DIGEST_MISMATCH' };
    }
    if (signed.statement?.predicate?.sourceRevision !== testedRevision) {
      return { status: 'UNPROVABLE', reason: 'ATTESTATION_TESTED_REVISION_MISMATCH' };
    }

    appendFileSync(copy, Buffer.from([0]));
    const corruptedSubjectSha256 = sha256File(copy);
    const corrupted = verify();

    copyFileSync(artifactPath, copy);
    const after = verify();
    if (after.error || after.status !== 0) return { status: 'UNPROVABLE', reason: 'ATTESTATION_RESTORED_UNVERIFIED' };

    const classified = classifyCorruptedVerification({
      status: corrupted.status,
      error: corrupted.error,
      attestedSubjectSha256: signed.subjectSha256,
      corruptedSubjectSha256,
    });
    return {
      ...classified,
      baseline: 'MATCH',
      restored: 'MATCH',
      attestedSubjectSha256: signed.subjectSha256,
      corruptedSubjectSha256,
      testedRevision,
      workflowSourceRevision: sourceRevision,
      sourceRef,
      repository,
      workflow,
      predicateType,
    };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
