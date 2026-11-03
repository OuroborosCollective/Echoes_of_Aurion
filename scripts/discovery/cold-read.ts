/** Isolated integration harness: independent process, real persisted receipt. */
import { readActorRegionDiscovery } from "../../server/discoveryCodex";
import { getDb } from "../../server/db";
import { z } from "zod";
import { discoveryRegionQuerySchema } from "../../shared/discoveryCodexProtocol";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (process.env.NODE_ENV !== "test" || url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
  const input = z.strictObject({ userId: z.number().int().positive(), query: discoveryRegionQuerySchema }).parse(JSON.parse(process.env.AURION_DISCOVERY_TEST_INPUT ?? "null"));
  const db = await getDb();
  if (!db) throw new Error("DISCOVERY_DATABASE_UNAVAILABLE");
  let selectCount = 0;
  const original = db.select.bind(db);
  db.select = ((...args: Parameters<typeof db.select>) => { selectCount++; return original(...args); }) as typeof db.select;
  const projection = await readActorRegionDiscovery(input.userId, input.query);
  console.log("DISCOVERY_COLD_RESULT=" + JSON.stringify({ projection, selectCount }));
}
main().then(() => process.exit(0)).catch(() => { console.error("DISCOVERY_COLD_READ_FAILED"); process.exit(1); });
