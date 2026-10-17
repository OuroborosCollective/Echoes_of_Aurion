import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specs = [
  {
    workflow: ".github/workflows/aim292-npc-multi-memory.yml",
    changed: [
      "server/aim292NpcMultiMemoryMariaDb.test.ts", "server/db.ts",
      "drizzle/0042_aurion_npc_multi_memory.sql",
      "drizzle/0054_aurion_semantic_memory_graph_v2.sql",
      "server/_core/context.ts", "package.json",
    ],
    unchanged: [
      "server/nativeAuthPersistence.ts",
      "drizzle/nativeAuthSchema.ts",
      "server/nativeAuthProtocol.test.ts",
      "godot-client/project.godot",
      "drizzle/0075_aurion_native_auth_sessions.sql",
      "drizzle/0076_auth.sql",
      "drizzle/meta/_journal.json",
      "drizzle.config.ts",
    ],
  },
  {
    workflow: ".github/workflows/aim535-item-manipulation-runtime.yml",
    changed: [
      "server/aurionItemManipulationMariaDb.test.ts",
      "server/aurionInventoryBackendAdapter.ts", "server/db.ts",
      "drizzle/0066_aurion_inventory_transaction_kernel.sql",
      "drizzle/0068_aurion_item_manipulation_runtime.sql", "server/routers.ts",
    ],
    unchanged: [
      ...[
      "server/nativeAuthPersistence.ts",
      "drizzle/nativeAuthSchema.ts",
      "server/nativeAuthProtocol.test.ts",
      "godot-client/project.godot",
      "drizzle/0075_aurion_native_auth_sessions.sql",
      "drizzle/0076_auth.sql",
      "drizzle/meta/_journal.json",
      "drizzle.config.ts",
    ],
      "scripts/aurionProductionSchemaReconciliation.ts",
    ],
  },
  {
    workflow: ".github/workflows/aim259-group-instances.yml",
    changed: [
      "server/groupInstanceService.ts", "server/db.ts",
      "drizzle/0032_aurion_group_instances.sql",
      "drizzle/groupInstanceSchema.ts", "server/zoneGateway.ts",
    ],
    unchanged: [
      "server/nativeAuthPersistence.ts",
      "drizzle/nativeAuthSchema.ts",
      "server/nativeAuthProtocol.test.ts",
      "godot-client/project.godot",
      "drizzle/0075_aurion_native_auth_sessions.sql",
      "drizzle/0076_auth.sql",
      "drizzle/meta/_journal.json",
      "drizzle.config.ts",
    ],
  },
  {
    workflow: ".github/workflows/issue-502-inventory-mariadb.yml",
    changed: [
      "server/aurionInventoryBackendAdapter.ts",
      "server/playerUiMariaDb.test.ts",
      "drizzle/0066_aurion_inventory_transaction_kernel.sql",
      "drizzle/0068_aurion_item_manipulation_runtime.sql",
    ],
    unchanged: [
      "server/nativeAuthPersistence.ts",
      "drizzle/nativeAuthSchema.ts",
      "server/nativeAuthProtocol.test.ts",
      "godot-client/project.godot",
      "drizzle/0075_aurion_native_auth_sessions.sql",
      "drizzle/0076_auth.sql",
      "drizzle/meta/_journal.json",
      "drizzle.config.ts",
    ],
  },
  {
    workflow: ".github/workflows/starter-village-pilot.yml",
    changed: [
      "server/starterVillagePilotHttp.test.ts",
      "server/zoneGateway.ts",
      "drizzle/0064_aurion_world_entity_foundation.sql",
      "drizzle/aurionWorldFoundationSchema.ts",
    ],
    unchanged: [
      "server/nativeAuthPersistence.ts",
      "drizzle/nativeAuthSchema.ts",
      "server/nativeAuthProtocol.test.ts",
      "godot-client/project.godot",
      "drizzle/0075_aurion_native_auth_sessions.sql",
      "drizzle/0076_auth.sql",
      "drizzle/meta/_journal.json",
      "drizzle.config.ts",
    ],
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
  test(spec.workflow + ": change-impact routes only domain changes to its PR/push lanes", () => {
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

test("native-auth migrations are still covered by the dedicated core schema pack", () => {
  const source = readFileSync(".github/workflows/aurion-local-test-pack.yml", "utf8");
  for (const event of ["pull_request", "push"]) {
    const paths = pathsForEvent(source, event);
    for (const file of [
      "drizzle/0075_aurion_native_auth_sessions.sql",
      "drizzle/meta/_journal.json",
    ]) {
      assert.ok(paths.some(pattern => matches(pattern, file)),
        event + " core pack must run on " + file);
    }
  }
});
