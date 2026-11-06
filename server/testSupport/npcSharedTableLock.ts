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
/**
 * Test files that change the shared GLB runtime catalog (ingest, review/archive) must not
 * overlap with files that bind a catalog revision: a parallel ingest made every plan of
 * the world-authoring suite fail with AUTHORING_GLB_CATALOG_CHANGED (CI, #1329).
 */
export const GLB_CATALOG_LOCK = "aurion-test:glb-catalog";

export function useNpcSharedTableLock(timeoutSeconds = 600): void {
  useSharedDbFixtureLock(NPC_SHARED_TABLE_LOCK, timeoutSeconds);
}

export function useGlbCatalogLock(timeoutSeconds = 600): void {
  useSharedDbFixtureLock(GLB_CATALOG_LOCK, timeoutSeconds);
}

/** Holds a MariaDB named lock for the whole lifetime of the calling test file. */
export function useSharedDbFixtureLock(name: string, timeoutSeconds = 600): void {
  let connection: Connection | null = null;
  beforeAll(async () => {
    const raw = process.env.DATABASE_URL;
    if (!raw) return;
    const url = new URL(raw);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) return;
    connection = await createConnection(raw);
    const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, ?) AS acquired", [name, timeoutSeconds]);
    if (Number(rows[0]?.acquired) !== 1) throw new Error(`TEST_FIXTURE_LOCK_TIMEOUT:${name}`);
  }, (timeoutSeconds + 30) * 1000);
  afterAll(async () => {
    if (!connection) return;
    try { await connection.query("SELECT RELEASE_LOCK(?)", [name]); }
    finally { await connection.end(); connection = null; }
  });
}
