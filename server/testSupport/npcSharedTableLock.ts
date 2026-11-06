import { afterAll, beforeAll } from "vitest";
import { createConnection, type Connection, type RowDataPacket } from "mysql2/promise";

/**
 * Test files that reset the shared, append-only NPC memory and semantic-graph tables
 * (TRUNCATE) must not overlap: vitest runs files in parallel against one isolated
 * database, and one file's TRUNCATE wiped another file's freshly created NPC memory
 * (NPC_ACTION_SOURCE_MEMORY_RECORD_REQUIRED, seen locally with 8 workers).
 *
 * Call once at the top level of such a file: it holds a MariaDB named lock for the
 * whole file lifetime. Without an isolated test database it does nothing.
 */
export const NPC_SHARED_TABLE_LOCK = "aurion-test:npc-shared-tables";

export function useNpcSharedTableLock(timeoutSeconds = 600): void {
  let connection: Connection | null = null;
  beforeAll(async () => {
    const raw = process.env.DATABASE_URL;
    if (!raw) return;
    const url = new URL(raw);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) return;
    connection = await createConnection(raw);
    const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, ?) AS acquired", [NPC_SHARED_TABLE_LOCK, timeoutSeconds]);
    if (Number(rows[0]?.acquired) !== 1) throw new Error("NPC_SHARED_TABLE_LOCK_TIMEOUT");
  }, (timeoutSeconds + 30) * 1000);
  afterAll(async () => {
    if (!connection) return;
    try { await connection.query("SELECT RELEASE_LOCK(?)", [NPC_SHARED_TABLE_LOCK]); }
    finally { await connection.end(); connection = null; }
  });
}
