import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import type { QuestReceipt } from "../shared/aurionQuestContract";
import { findQuestReceiptReplay, maxQuestReceiptSequence } from "../server/questCompiler/receiptIteration";

const size = 75_000;
const rounds = 60;
const samples = 7;
const target = "quest-target";
const missingKey = "missing-key";
const receipts = new Map<string, QuestReceipt>();
for (let index = 0; index < size; index += 1) {
  const instanceId = index % 5 === 0 ? target : `quest-${index % 97}`;
  receipts.set(`receipt-${index}`, {
    id: `receipt-${index}`,
    instanceId,
    eventSequence: index % 2048,
    planHash: "a".repeat(64),
    graphHash: "b".repeat(64),
    previousStateHash: "c".repeat(64),
    resultStateHash: "d".repeat(64),
    idempotencyKey: `key-${index}`,
    receiptHash: "e".repeat(64),
    createdAt: "2026-10-18T13:14:00.000Z",
  });
}

const legacy = () => {
  const replay = [...receipts.values()].find(candidate =>
    candidate.instanceId === target && candidate.idempotencyKey === missingKey
  );
  const maximum = [...receipts.values()]
    .filter(candidate => candidate.instanceId === target)
    .reduce((value, candidate) => Math.max(value, candidate.eventSequence), 0);
  return { replay, maximum };
};
const candidate = () => ({
  replay: findQuestReceiptReplay(receipts.values(), target, missingKey),
  maximum: maxQuestReceiptSequence(receipts.values(), target),
});

assert.deepEqual(candidate(), legacy());

function measure(run: () => { replay: QuestReceipt | undefined; maximum: number }) {
  global.gc?.();
  const heapBefore = process.memoryUsage().heapUsed;
  let checksum = 0;
  const started = performance.now();
  for (let round = 0; round < rounds; round += 1) {
    const result = run();
    checksum += result.maximum + (result.replay?.eventSequence ?? 0);
  }
  const durationMs = performance.now() - started;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  assert.ok(checksum > 0);
  return { durationMs, heapDeltaBytes };
}

for (let warmup = 0; warmup < 3; warmup += 1) {
  candidate();
  legacy();
}

const legacySamples = [];
const candidateSamples = [];
for (let sample = 0; sample < samples; sample += 1) {
  if (sample % 2 === 0) {
    legacySamples.push(measure(legacy));
    candidateSamples.push(measure(candidate));
  } else {
    candidateSamples.push(measure(candidate));
    legacySamples.push(measure(legacy));
  }
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const legacyMedianHeapDeltaBytes = median(legacySamples.map(sample => sample.heapDeltaBytes));
const candidateMedianHeapDeltaBytes = median(candidateSamples.map(sample => sample.heapDeltaBytes));
const result = {
  workload: { receipts: size, rounds, samples, replay: "full miss", sequence: "full scan" },
  parity: true,
  allocationMetric: "median process.heapUsed delta after forced pre-sample GC",
  legacy: {
    medianMs: median(legacySamples.map(sample => sample.durationMs)),
    medianHeapDeltaBytes: legacyMedianHeapDeltaBytes,
  },
  candidate: {
    medianMs: median(candidateSamples.map(sample => sample.durationMs)),
    medianHeapDeltaBytes: candidateMedianHeapDeltaBytes,
  },
};
assert.ok(result.candidate.medianMs < result.legacy.medianMs,
  `direct iteration did not improve median latency: ${JSON.stringify(result)}`);
assert.ok(
  candidateMedianHeapDeltaBytes >= 0 &&
    legacyMedianHeapDeltaBytes > 0 &&
    candidateMedianHeapDeltaBytes < legacyMedianHeapDeltaBytes * 0.05,
  `direct iteration did not reduce measured heap allocation by at least 95%: ${JSON.stringify(result)}`,
);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
