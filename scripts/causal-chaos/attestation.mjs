import { spawnSync } from 'node:child_process';
import { copyFileSync, appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Real GitHub/Sigstore verification only. Missing evidence is never a pass. */
export function verifyAttestationTamper(input) {
  if (!input) return { status: 'UNPROVABLE', reason: 'ATTESTATION_EVIDENCE_REQUIRED' };
  const { artifactPath, bundlePath, repository, sourceRevision, sourceRef, workflow, predicateType } = input;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(sourceRevision) ||
      !/^refs\//.test(sourceRef) || !/^\.github\/workflows\/[\w.-]+\.yml$/.test(workflow) ||
      !/^https:\/\//.test(predicateType)) throw new Error('ATTESTATION_BINDING_INVALID');
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
    appendFileSync(copy, Buffer.from([0]));
    const corrupted = verify();
    copyFileSync(artifactPath, copy);
    const after = verify();
    if (after.error || after.status !== 0) return { status: 'UNPROVABLE', reason: 'ATTESTATION_RESTORED_UNVERIFIED' };
    // The same local bundle and bindings verify immediately before and after;
    // the single changed input between those successful calls is one subject byte.
    if (corrupted.error || corrupted.status === null) return { status: 'UNPROVABLE', reason: 'ATTESTATION_REJECTION_UNCLASSIFIED' };
    return { status: corrupted.status === 0 ? 'MATCH' : 'FIRST_DIVERGENCE',
      boundary: 'ATTESTATION_SUBJECT', baseline: 'MATCH', restored: 'MATCH',
      sourceRevision, sourceRef, repository, workflow, predicateType };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
