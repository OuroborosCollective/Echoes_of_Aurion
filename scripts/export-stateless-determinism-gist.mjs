#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    revision: { type: "string" },
  },
});

assert(values.out, "--out is required");
if (values.revision) {
  assert.match(values.revision, /^[0-9a-f]{40}$/, "revision must be a full Git SHA");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(values.out);
mkdirSync(out);

const files = {
  "README.md": readFileSync(
    join(root, "docs/public-patterns/stateless-determinism-minimal-runtime.md"),
    "utf8",
  ),
  "deterministic-step.ts": readFileSync(
    join(root, "examples/stateless-determinism/deterministic-step.ts"),
    "utf8",
  ),
  "deterministic-step.test.ts": readFileSync(
    join(root, "examples/stateless-determinism/deterministic-step.test.ts"),
    "utf8",
  ),
  "demo.ts": readFileSync(
    join(root, "examples/stateless-determinism/demo.ts"),
    "utf8",
  ),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(out, name), content);
}

writeFileSync(
  join(out, "gist-create.json"),
  JSON.stringify(
    {
      description:
        "OuroborosCollective — Stateless Determinism: executable TypeScript reference",
      public: true,
      files: Object.fromEntries(
        Object.entries(files).map(([name, content]) => [name, { content }]),
      ),
      sourceRevision: values.revision ?? null,
      publicationStatus: "NOT_PERFORMED",
    },
    null,
    2,
  ) + "\n",
);

console.log(out);
