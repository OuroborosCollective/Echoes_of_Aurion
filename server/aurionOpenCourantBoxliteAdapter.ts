import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import type { ImpactBakeJob, ImpactBakeReceipt, ReducedDeformationSample } from "../shared/aurionImpactBakeProtocol";
import { buildImpactBakeReceipt } from "../shared/aurionImpactBakeProtocol";

export type BoxliteImpactInvocation = Readonly<{
  executable: "python3";
  args: readonly string[];
  environment: Readonly<Record<string, string>>;
  invocationHash: string;
}>;

export function buildBoxliteImpactInvocation(job: ImpactBakeJob): BoxliteImpactInvocation {
  const environment = Object.freeze({
    AURION_IMPACT_WORK_ID: job.workId,
    AURION_SOURCE_REVISION: job.sourceRevision,
    AURION_LOGICAL_TICK: String(job.logicalTick),
    AURION_STARTER_DECK_HASH: job.starterDeckHash,
    AURION_ENGINE_DECK_HASH: job.engineDeckHash,
    AURION_SCENARIO: job.scenario,
    OPENCOURANT_IMAGE: job.solverImage,
    OPENCOURANT_COMMIT: job.solverCommit,
    BOXLITE_VERSION: job.boxliteVersion,
    BOXLITE_CPUS: String(job.cpus),
    BOXLITE_MEMORY_MIB: String(job.memoryMiB),
  });
  const args = Object.freeze([
    "scripts/run-opencourant-boxlite.py",
    "--starter-deck", job.starterDeckPath,
    "--engine-deck", job.engineDeckPath,
    "--output", ".aurion-impact-results/" + job.workId,
  ]);
  return Object.freeze({
    executable: "python3",
    args,
    environment,
    invocationHash: canonicalSha256({ domain: "aurion.boxlite-opencourant.invocation.v1", environment, args }),
  });
}

export function acceptBoxliteImpactResult(job: ImpactBakeJob, result: {
  resultArchiveHash: string;
  vtkHash: string | null;
  csvHash: string | null;
  reducedSamples: readonly ReducedDeformationSample[];
}): ImpactBakeReceipt {
  return buildImpactBakeReceipt({
    workId: job.workId,
    scenario: job.scenario,
    sourceRevision: job.sourceRevision,
    logicalTick: job.logicalTick,
    starterDeckHash: job.starterDeckHash,
    engineDeckHash: job.engineDeckHash,
    solverImage: job.solverImage,
    solverCommit: job.solverCommit,
    boxliteVersion: job.boxliteVersion,
    resultArchiveHash: result.resultArchiveHash,
    vtkHash: result.vtkHash,
    csvHash: result.csvHash,
    reducedSamples: result.reducedSamples,
  });
}
