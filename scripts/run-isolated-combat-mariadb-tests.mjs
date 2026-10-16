import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = new URL(process.env.DATABASE_URL ?? "");
if (process.env.NODE_ENV !== "test" || source.protocol !== "mysql:" ||
    source.hostname !== "127.0.0.1" || source.pathname !== "/aurion_classless_test" ||
    source.search || source.hash) {
  throw new Error("ISOLATED_LOOPBACK_CLASSLESS_TEST_DATABASE_REQUIRED");
}
const cases = [
  { database: "aurion_archive_test", name: "causal-archive-packets", optIn: { AURION_ARCHIVE_DB_E2E: "1" },
    files: ["server/causality/archivePacketsMariaDb.test.ts"] },
  { database: "aurion_atomic_test", name: "combat-outbox-atomic", optIn: { AURION_ATOMIC_OUTBOX_E2E: "1" },
    files: ["server/causality/combatOutboxAtomicMariaDb.test.ts"] },
  { database: "aurion_combat_classless_test", name: "combat-continuity-equipment", optIn: {},
    files: ["server/zoneCombatContinuityMariaDb.test.ts", "server/zoneCombatEquipmentMariaDb.test.ts"] },
];
const evidence = path.join(root, ".aurion-local-test-pack/evidence");
await mkdir(evidence, { recursive: true });
async function run(binary, args, env, logName) {
  const log = await open(path.join(evidence, logName), "w");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(path.join(root, "node_modules/.bin", binary), args,
        { cwd: root, env, stdio: ["ignore", log.fd, log.fd] });
      child.once("error", reject);
      child.once("exit", (code, signal) => code === 0 ? resolve() :
        reject(new Error(`${binary} failed (${signal ?? code}); see ${logName}`)));
    });
  } finally { await log.close(); }
}
for (const scenario of cases) {
  const adminUrl = new URL(source);
  adminUrl.pathname = "/";
  const connection = await mysql.createConnection(adminUrl.toString());
  try {
    // Refuse to reuse/reset existing databases, including leftovers after a failed run.
    // GitHub's disposable service starts with only aurion_classless_test.
    await connection.query(`CREATE DATABASE \`${scenario.database}\``);
  } finally { await connection.end(); }
  const testUrl = new URL(source);
  testUrl.pathname = `/${scenario.database}`;
  const env = { ...process.env, DATABASE_URL: testUrl.toString(), NODE_ENV: "test", ...scenario.optIn };
  console.log(`Applying full migration chain to ${scenario.database}`);
  await run("drizzle-kit", ["migrate"], env, `${scenario.name}-migrations.log`);
  console.log(`Running ${scenario.files.join(", ")} serially`);
  await run("vitest", ["run", ...scenario.files, "--no-file-parallelism"], env, `${scenario.name}-mariadb.log`);
  console.log(`${scenario.name}: PASS`);
}
