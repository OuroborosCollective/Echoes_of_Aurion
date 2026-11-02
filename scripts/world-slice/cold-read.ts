/** Disposable CI process only. Synthetic transport; actual persisted replay/DB. */
import { readActorWorldSlice } from "../../server/worldSlice";
import { globalZoneRegistry } from "../../server/zoneRuntime";
import { getDb } from "../../server/db";

if (process.env.NODE_ENV !== "test" || process.env.AURION_EXPLORATION_MEMORY_E2E !== "1") throw new Error("ISOLATED_WORLD_SLICE_TEST_REQUIRED");
const database = new URL(process.env.DATABASE_URL ?? "");
if (database.hostname !== "127.0.0.1" || !database.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
const { userId, query } = JSON.parse(process.env.AURION_WORLD_SLICE_TEST_INPUT ?? "null");
const zone = globalZoneRegistry.get("observatory_threshold");
const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as any;
const connection = zone.join({ userId, socket }).connectionId;
const db = await getDb();
if (!db) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
let selectCount = 0;
const select = db.select.bind(db);
// Call-through measurement in this disposable process; no rows are replaced.
db.select = ((...args: unknown[]) => { selectCount++; return (select as any)(...args); }) as typeof db.select;
try {
  // No tick is executed here: this process has no historical recorder entry.
  const result = await readActorWorldSlice(userId, query);
  process.stdout.write("WORLD_SLICE_COLD_RESULT=" + JSON.stringify({ slice: result.slice, fingerprint: result.fingerprint, status: result.status, selectCount }) + "\n");
} finally { db.select = select as typeof db.select; zone.leave(connection); }
process.exit(0);
