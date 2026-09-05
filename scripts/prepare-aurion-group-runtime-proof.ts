import { createPool, type RowDataPacket } from "mysql2/promise";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb, resolveAndRecordGlobalWorldEpoch } from "../server/db";

// This fixture initializer is exclusively for the disposable HTTP/DB proof.
// The running application has no test authentication or world-state bypass.
const url = new URL(process.env.DATABASE_URL ?? "invalid:");
if (process.env.AURION_GROUP_E2E !== "1" || url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_group_test") throw new Error("ISOLATED_GROUP_RUNTIME_REQUIRED");
const revision = process.env.AURION_RELEASE_SHA;
if (!revision || !/^[a-f0-9]{40}$/.test(revision)) throw new Error("EXACT_RUNTIME_REVISION_REQUIRED");
const pool = createPool(process.env.DATABASE_URL!);
const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
if (database[0]?.name !== "aurion_group_test") throw new Error("ISOLATED_GROUP_RUNTIME_REQUIRED");
const db = (await getDb())!;
const openId = "local:aim259-isolated-world-resolver";
await db.insert(users).values({ openId, name: "Isolated world proof fixture" }).onDuplicateKeyUpdate({ set: { name: "Isolated world proof fixture" } });
const [user] = await db.select().from(users).where(eq(users.openId, openId));
if (!user) throw new Error("FIXTURE_USER_READBACK_REQUIRED");
const result = await resolveAndRecordGlobalWorldEpoch({ requestedByUserId: user.id, idempotencyKey: `aim259-runtime-${revision}` });
const [world] = await pool.query<RowDataPacket[]>("SELECT snapshotHash,snapshotJson FROM aurionGlobalWorldStates");
if (world.length !== 1 || world[0]!.snapshotHash !== result.plan.deterministicHash || JSON.stringify(JSON.parse(world[0]!.snapshotJson)) !== JSON.stringify(result.plan)) throw new Error("PERSISTED_WORLD_READBACK_REQUIRED");
console.log(JSON.stringify({ sourceRevision: revision, source: result.source, worldHash: result.plan.deterministicHash, epoch: result.plan.epoch, production: false }));
await pool.end();
// getDb owns a process-wide pool without a shutdown API. All writes and the
// independent readback have completed before this isolated initializer exits.
process.exit(0);
