import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { exportCompanionMemory, sanitizeCompanionMemoryEnvelope } from "./export-arelogic-companion-memory.mjs";

const dirs = [];
const base = {
  memoryVersion: "aurion-companion-memory.v1",
  userId: 7,
  sessionId: "cmp_gateway_session_123",
  sequenceIndex: 0,
  timestampEpoch: 1791216000000,
  sampleId: "sample_00000001",
  featureVector: Array.from({ length: 16 }, (_, i) => i / 16),
  targetAction: [1, 0, 0.5, 1],
  stateVector: [1, 0, 0.5, 0, 1, 0.25],
  stateMask: [1, 1, 1, 0, 1, 1],
  note: "private free text",
};

test.afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

test("sanitizer removes identity, timestamp, note and preserves bounded vectors", () => {
  const row = sanitizeCompanionMemoryEnvelope(base);
  assert.equal(row.schema, "aurion.rl.demonstration.v1");
  assert.equal(row.source_schema, "aurion-companion-memory.v1");
  assert.match(row.sample_id, /^[0-9a-f]{64}$/);
  assert.match(row.episode_id, /^[0-9a-f]{64}$/);
  assert.equal(row.sequence_index, 0);
  assert.deepEqual(row.action.vector, base.targetAction);
  const serialized = JSON.stringify(row);
  for (const forbidden of ["userId", "sessionId", "timestampEpoch", "note", "cmp_gateway_session_123", "private free text"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("same source yields same pseudonyms", () => {
  assert.deepEqual(sanitizeCompanionMemoryEnvelope(base), sanitizeCompanionMemoryEnvelope({ ...base }));
});

test("export is deterministic and does not leak source paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aurion-arelogic-export-"));
  dirs.push(root);
  const memory = path.join(root, "memory");
  await mkdir(path.join(memory, "user-7"), { recursive: true });
  await writeFile(path.join(memory, "user-7", "cmp.jsonl"), `${JSON.stringify(base)}\n${JSON.stringify({ ...base, sequenceIndex: 1, sampleId: "sample_00000002" })}\n`, "utf8");

  const a = path.join(root, "a.jsonl"), ar = path.join(root, "a-report.json");
  const b = path.join(root, "b.jsonl"), br = path.join(root, "b-report.json");
  await exportCompanionMemory({ inputDir: memory, outputFile: a, reportFile: ar });
  await exportCompanionMemory({ inputDir: memory, outputFile: b, reportFile: br });

  assert.deepEqual(await readFile(a), await readFile(b));
  assert.deepEqual(await readFile(ar), await readFile(br));
  const combined = `${await readFile(a, "utf8")}${await readFile(ar, "utf8")}`;
  assert.equal(combined.includes("user-7"), false);
  assert.equal(combined.includes("cmp_gateway_session_123"), false);
  assert.equal(combined.includes("private free text"), false);
});

test("invalid action or vector dimensions fail closed", () => {
  assert.throws(() => sanitizeCompanionMemoryEnvelope({ ...base, targetAction: [2, 0, 0, 1] }), /within/);
  assert.throws(() => sanitizeCompanionMemoryEnvelope({ ...base, featureVector: base.featureVector.slice(1) }), /16/);
});
