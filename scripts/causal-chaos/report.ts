export type ChaosDetectionResult = Readonly<{
  detected: boolean;
  observed: Readonly<{ status?: string }>;
}>;

/**
 * Exit priority is intentionally fail-closed:
 * 1 = at least one real detector failed;
 * 2 = no detector failed, but required evidence is unavailable;
 * 0 = every requested fault was detected.
 */
export function deriveChaosExitCode(results: readonly ChaosDetectionResult[]): 0 | 1 | 2 {
  if (results.some(result => !result.detected && result.observed.status !== "UNPROVABLE")) return 1;
  if (results.some(result => !result.detected && result.observed.status === "UNPROVABLE")) return 2;
  return 0;
}
