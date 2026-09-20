// Invoke with: NODE_ENV=test node --import tsx scripts/run-aurion-causal-chaos.mjs --all
import { assertTestIsolation, FAULT_BOUNDARIES, runFault } from './causal-chaos/harness.ts';
import { deriveChaosExitCode } from './causal-chaos/report.ts';
try {
  assertTestIsolation();
  const args = process.argv.slice(2);
  const faults = args.length === 1 && args[0] === '--all' ? Object.keys(FAULT_BOUNDARIES) :
    args.length === 2 && args[0] === '--fault' && Object.hasOwn(FAULT_BOUNDARIES, args[1]) ? [args[1]] : null;
  if (!faults) { process.stderr.write('Usage: --all | --fault <FAULT_CLASS>\n'); process.exitCode = 64; }
  else {
    const attestation = process.env.AURION_CHAOS_ATTESTATION_BUNDLE ? {
      artifactPath: process.env.AURION_CHAOS_ATTESTATION_SUBJECT, bundlePath: process.env.AURION_CHAOS_ATTESTATION_BUNDLE,
      repository: process.env.GITHUB_REPOSITORY, sourceRevision: process.env.GITHUB_SHA, sourceRef: process.env.GITHUB_REF,
      testedRevision: process.env.AURION_CHAOS_REVISION,
      workflow: '.github/workflows/aurion-causal-chaos.yml', predicateType: 'https://arelogic.space/attestations/aurion-chaos-fixture/v1',
    } : undefined;
    const results = [];
    for (const fault of faults) results.push(await runFault(fault, attestation));
    const exitCode = deriveChaosExitCode(results);
    process.stdout.write(JSON.stringify({ schema: 'aurion.causal-chaos-report.v1', evidenceKind: 'isolated-test',
      mutationAuthority: 'none', testedRevision: process.env.AURION_CHAOS_REVISION ?? null,
      workflowSourceRevision: process.env.GITHUB_SHA ?? null, exitCode, results }, null, 2) + '\n'); process.exitCode = exitCode;
  }
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
