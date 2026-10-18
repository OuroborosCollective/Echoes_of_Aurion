import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  orderedWorldChunkWindow,
  planWorldChunkCache,
  worldChunkCoordinateKey,
  worldChunkStreamingBudget,
  type WorldChunkCacheEntry,
  type WorldChunkCachePlan,
  type WorldChunkStreamingTier,
} from "../shared/worldChunkStreamingProtocol";

type Input = { center: { x: number; z: number }; tier: WorldChunkStreamingTier; cached: readonly WorldChunkCacheEntry[] };

function referencePlanWorldChunkCache(input: Input): WorldChunkCachePlan {
  const budget = worldChunkStreamingBudget(input.tier);
  const visible = orderedWorldChunkWindow(input.center, budget.visibleRadius);
  const visibleKeys = new Set(visible.map(worldChunkCoordinateKey));
  const byKey = new Map<string, WorldChunkCacheEntry>();
  for (const entry of input.cached) {
    const key = worldChunkCoordinateKey(entry.coordinate);
    const previous = byKey.get(key);
    if (!previous || entry.lastAccess > previous.lastAccess) byKey.set(key, Object.freeze({ coordinate: Object.freeze({ ...entry.coordinate }), lastAccess: entry.lastAccess }));
  }
  const request = visible.filter(coordinate => !byKey.has(worldChunkCoordinateKey(coordinate)));
  const retainedBackground = Array.from(byKey.values()).filter(entry => !visibleKeys.has(worldChunkCoordinateKey(entry.coordinate))).sort((left, right) => right.lastAccess - left.lastAccess || left.coordinate.z - right.coordinate.z || left.coordinate.x - right.coordinate.x).slice(0, Math.max(0, budget.maxCachedChunks - visible.length));
  const retain = Object.freeze([...visible, ...retainedBackground.map(entry => entry.coordinate)]);
  const retainKeys = new Set(retain.map(worldChunkCoordinateKey));
  const evict = Object.freeze(Array.from(byKey.values()).filter(entry => !retainKeys.has(worldChunkCoordinateKey(entry.coordinate))).sort((left, right) => left.lastAccess - right.lastAccess || left.coordinate.z - right.coordinate.z || left.coordinate.x - right.coordinate.x).map(entry => entry.coordinate));
  return Object.freeze({ visible, request: Object.freeze(request), retain, evict });
}

function workload(tier: WorldChunkStreamingTier): Input {
  const radius = worldChunkStreamingBudget(tier).visibleRadius;
  const visible = orderedWorldChunkWindow({ x: 0, z: 0 }, radius);
  const background = Array.from({ length: 240 }, (_, index) => ({
    coordinate: { x: 20 + (index % 40), z: 20 + Math.floor(index / 40) },
    lastAccess: index % 29,
  }));
  return { center: { x: 0, z: 0 }, tier, cached: [...visible.map((coordinate, index) => ({ coordinate, lastAccess: 1_000 + index })), ...background] };
}

function percentile(values: readonly number[], fraction: number): number {
  return [...values].sort((left, right) => left - right)[Math.ceil(values.length * fraction) - 1];
}

function measure(label: string, fn: (input: Input) => WorldChunkCachePlan, input: Input) {
  for (let index = 0; index < 500; index += 1) fn(input);
  const samples: number[] = [];
  for (let sample = 0; sample < 15; sample += 1) {
    const started = performance.now();
    for (let index = 0; index < 1_000; index += 1) fn(input);
    samples.push(performance.now() - started);
  }
  return { label, medianMs: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95) };
}

function measureAllocatedBytes(variant: "baseline" | "candidate", tier: "phone" | "desktop"): number {
  const child = spawnSync(process.execPath, ["--trace-gc-nvp", ...process.execArgv, fileURLToPath(import.meta.url)], {
    encoding: "utf8",
    env: { ...process.env, CHUNK_CACHE_BENCH_VARIANT: variant, CHUNK_CACHE_BENCH_TIER: tier },
    maxBuffer: 50 * 1024 * 1024,
  });
  if (child.status !== 0) throw new Error(`${variant} allocation measurement failed: ${child.stderr}`);
  return Array.from(`${child.stdout}\n${child.stderr}`.matchAll(/\ballocated=(\d+)/g), match => Number(match[1])).reduce((total, value) => total + value, 0);
}

const childVariant = process.env.CHUNK_CACHE_BENCH_VARIANT;
const childTier = process.env.CHUNK_CACHE_BENCH_TIER;
if ((childVariant === "baseline" || childVariant === "candidate") && (childTier === "phone" || childTier === "desktop")) {
  const input = workload(childTier);
  const fn = childVariant === "baseline" ? referencePlanWorldChunkCache : planWorldChunkCache;
  for (let index = 0; index < 5_000; index += 1) fn(input);
} else {
  for (const tier of ["phone", "desktop"] as const) {
    const input = workload(tier);
    const expected = referencePlanWorldChunkCache(input);
    const observed = planWorldChunkCache(input);
    if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error(`${tier} parity failed`);
    const baseline = measure("array-from-filter", referencePlanWorldChunkCache, input);
    const candidate = measure("direct-iteration", planWorldChunkCache, input);
    const allocatedBytes = {
      baseline: measureAllocatedBytes("baseline", tier),
      candidate: measureAllocatedBytes("candidate", tier),
    };
    if (allocatedBytes.candidate > allocatedBytes.baseline * 0.9) throw new Error(`${tier} allocation reduction was less than 10%`);
    if (candidate.medianMs > baseline.medianMs * 1.1) throw new Error(`${tier} median latency regressed by more than 10%`);
    console.log(JSON.stringify({
      tier,
      visibleChunks: observed.visible.length,
      cachedEntries: input.cached.length,
      parity: true,
      baseline,
      candidate,
      allocatedBytes,
    }));
  }
}
