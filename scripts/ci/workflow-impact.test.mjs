import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specs = [
  {
    workflow: ".github/workflows/aim292-npc-multi-memory.yml",
    changed: ["server/aim292NpcMultiMemoryMariaDb.test.ts", "server/db.ts", "drizzle/0076_auth.sql", "drizzle/meta/_journal.json", "server/_core/context.ts", "package.json"],
    unchanged: ["server/nativeAuthPersistence.ts", "drizzle/nativeAuthSchema.ts", "server/nativeAuthProtocol.test.ts", "godot-client/project.godot"],
  },
  {
    workflow: ".github/workflows/aim535-item-manipulation-runtime.yml",
    changed: ["server/aurionItemManipulationMariaDb.test.ts", "server/aurionInventoryBackendAdapter.ts", "server/db.ts", "drizzle/0076_auth.sql", "drizzle/meta/_journal.json", "server/routers.ts"],
    unchanged: ["server/nativeAuthPersistence.ts", "drizzle/nativeAuthSchema.ts", "server/nativeAuthProtocol.test.ts", "godot-client/project.godot"],
  },
  {
    workflow: ".github/workflows/aim259-group-instances.yml",
    changed: ["server/groupInstanceService.ts", "server/db.ts", "drizzle/0076_auth.sql", "drizzle/meta/_journal.json", "server/zoneGateway.ts"],
    unchanged: ["server/nativeAuthPersistence.ts", "drizzle/nativeAuthSchema.ts", "server/nativeAuthProtocol.test.ts", "godot-client/project.godot"],
  },
];

function pathsForEvent(source, event) {
  const lines = source.split(/\r?\n/);
  const eventStart = lines.findIndex(line => line === "  " + event + ":");
  assert.notEqual(eventStart, -1, event + " trigger missing");
  const eventLines = lines.slice(eventStart + 1);
  const end = eventLines.findIndex(line => /^  [a-z_]+:/.test(line) || /^[A-Za-z_]+:/.test(line));
  const block = (end === -1 ? eventLines : eventLines.slice(0, end)).join("\n");
  const matches = block.match(/["']([^"']+)["']/g) ?? [];
  return matches.map(value => value.slice(1, -1));
}
function matches(pattern, path) {
  const escaped = pattern.split(/(\*\*|\*)/g).map(part => {
    if (part === "**") return ".*";
    if (part === "*") return "[^/]*";
    return part.replace(/[.*+?^$()|[\]{}\\]/g, "\\$&");
  }).join("");
  return new RegExp("^" + escaped + "$").test(path);
}
for (const spec of specs) {
  test(spec.workflow + ": change-impact routes PR and main only to relevant lanes", () => {
    const source = readFileSync(spec.workflow, "utf8");
    for (const event of ["pull_request", "push"]) {
      const paths = pathsForEvent(source, event);
      assert.ok(paths.includes(spec.workflow), event + " must recheck its own workflow");
      for (const path of spec.changed) {
        assert.ok(paths.some(pattern => matches(pattern, path)), event + " must run on " + path);
      }
      for (const path of spec.unchanged) {
        assert.ok(!paths.some(pattern => matches(pattern, path)), event + " must not run on " + path);
      }
    }
  });
}
