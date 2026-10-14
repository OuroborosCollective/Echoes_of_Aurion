import { runActualAurionZoneProfile, multirateFrames, summarizeMultirateCounts } from "../server/validation/aurionTickProfileBenchmark";

if (process.env.NODE_ENV !== "test" || process.env.DATABASE_URL || process.env.AURION_RELEASE_SHA) {
  throw new Error("AURION_TICK_BENCHMARK_ISOLATED_TEST_ONLY");
}
const windows = [1, 5, 10] as const;
const seconds = 10;
const samples = windows.map(hz => runActualAurionZoneProfile(hz, seconds));
const result = Object.freeze({
  protocol: "aurion.tick-profile-isolated-measurement.v1",
  authorityRuntimeChanged: false,
  productionMutation: false,
  persistenceEnabled: false,
  secondsSimulated: seconds,
  deterministicCadences: summarizeMultirateCounts(multirateFrames(seconds)),
  measurements: samples,
  comparisonNote: "CPU and heap values are isolated-process observations, not production capacity estimates. Lower Hz runs fewer actual game ticks but changes movement and gameplay speed; only the 10 Hz canonical clock is production safe without gameplay-time normalization.",
});
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
