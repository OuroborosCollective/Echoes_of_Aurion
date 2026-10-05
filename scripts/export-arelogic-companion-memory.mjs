#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FILES = 128;
const MAX_ROWS = 5000;
const MEMORY_VERSION = "aurion-companion-memory.v1";
const OUTPUT_SCHEMA = "aurion.rl.demonstration.v1";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function finiteVector(value, length, field) {
  if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
    throw new Error(`${field} must contain exactly ${length} finite numbers`);
  }
  return value;
}

export function sanitizeCompanionMemoryEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("memory envelope must be an object");
  if (envelope.memoryVersion !== MEMORY_VERSION) throw new Error("unsupported companion memory version");
  if (typeof envelope.sessionId !== "string" || envelope.sessionId.length < 8) throw new Error("sessionId is invalid");
  if (typeof envelope.sampleId !== "string" || envelope.sampleId.length < 8) throw new Error("sampleId is invalid");
  if (!Number.isInteger(envelope.sequenceIndex) || envelope.sequenceIndex < 0) throw new Error("sequenceIndex is invalid");

  const featureVector = finiteVector(envelope.featureVector, 16, "featureVector");
  const targetAction = finiteVector(envelope.targetAction, 4, "targetAction");
  if (!targetAction.every(value => value >= 0 && value <= 1)) throw new Error("targetAction must remain within [0, 1]");
  const stateVector = finiteVector(envelope.stateVector, 6, "stateVector");
  if (!Array.isArray(envelope.stateMask) || envelope.stateMask.length !== 6 || !envelope.stateMask.every(value => value === 0 || value === 1)) {
    throw new Error("stateMask must contain six 0/1 values");
  }

  const episodeId = sha256(`aurion-arelogic-episode-v1\0${envelope.sessionId}`);
  const sampleId = sha256(`aurion-arelogic-sample-v1\0${envelope.sessionId}\0${envelope.sampleId}\0${envelope.sequenceIndex}`);

  return {
    schema: OUTPUT_SCHEMA,
    source_schema: MEMORY_VERSION,
    sample_id: sampleId,
    episode_id: episodeId,
    sequence_index: envelope.sequenceIndex,
    observation: {
      feature_vector: [...featureVector],
      state_vector: [...stateVector],
      state_mask: [...envelope.stateMask],
    },
    action: { vector: [...targetAction] },
  };
}

async function collectJsonlFiles(root) {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error("companion memory root must be a directory");

  const files = [];
  const levelOne = (await readdir(root, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of levelOne) {
    const entryPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error("symlinks inside companion memory are not allowed");
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(entryPath);
    } else if (entry.isDirectory()) {
      const levelTwo = (await readdir(entryPath, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      for (const child of levelTwo) {
        if (child.isSymbolicLink()) throw new Error("symlinks inside companion memory are not allowed");
        if (child.isFile() && child.name.endsWith(".jsonl")) files.push(path.join(entryPath, child.name));
      }
    }
    if (files.length > MAX_FILES) throw new Error(`companion memory exceeds ${MAX_FILES} JSONL files`);
  }
  return files.sort();
}

export async function exportCompanionMemory({ inputDir, outputFile, reportFile }) {
  const files = await collectJsonlFiles(inputDir);
  const rows = [];

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    for (const [index, line] of raw.split("\n").entries()) {
      if (!line.trim()) continue;
      if (rows.length >= MAX_ROWS) throw new Error(`companion memory exceeds ${MAX_ROWS} rows`);
      let parsed;
      try { parsed = JSON.parse(line); }
      catch (error) { throw new Error(`invalid companion memory JSON at file-index ${files.indexOf(file)} line ${index + 1}: ${error instanceof Error ? error.message : error}`); }
      rows.push(sanitizeCompanionMemoryEnvelope(parsed));
    }
  }

  rows.sort((a, b) => a.episode_id.localeCompare(b.episode_id) || a.sequence_index - b.sequence_index || a.sample_id.localeCompare(b.sample_id));
  const sampleIds = new Set();
  const positions = new Set();
  for (const row of rows) {
    if (sampleIds.has(row.sample_id)) throw new Error("duplicate sanitized sample identity");
    const position = `${row.episode_id}:${row.sequence_index}`;
    if (positions.has(position)) throw new Error("duplicate sanitized episode/sequence position");
    sampleIds.add(row.sample_id);
    positions.add(position);
  }

  const body = rows.length ? `${rows.map(canonical).join("\n")}\n` : "";
  const report = {
    schema: "aurion.arelogic.companion-export.v1",
    source_schema: MEMORY_VERSION,
    output_schema: OUTPUT_SCHEMA,
    files_scanned: files.length,
    rows: rows.length,
    episodes: new Set(rows.map(row => row.episode_id)).size,
    output_sha256: sha256(body),
    privacy: {
      account_identifier: "omitted",
      session_identifier: "sha256-pseudonymized",
      source_sample_identifier: "sha256-pseudonymized",
      timestamp: "omitted",
      note: "omitted",
      captured_frame: "not_present_in_server_memory",
    },
    reward_semantics: "absent",
    production_authority: false,
  };

  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, body, "utf8");
  await writeFile(reportFile, `${canonical(report)}\n`, "utf8");
  return report;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("expected --input/--output/--report arguments");
    result[key.slice(2)] = value;
  }
  if (!result.input || !result.output || !result.report) throw new Error("--input, --output and --report are required");
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = await exportCompanionMemory({ inputDir: args.input, outputFile: args.output, reportFile: args.report });
  process.stdout.write(`${canonical(report)}\n`);
}
