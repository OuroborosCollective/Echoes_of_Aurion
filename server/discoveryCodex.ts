import { eq } from "drizzle-orm";
import { aurionGlobalWorldStates } from "../drizzle/schema";
import { getDb, GLOBAL_WORLD_ID } from "./db";
import { readExplorationMemoryChunk } from "./explorationMemoryPersistence";
import { createCanonicalDiscoveryCatalog } from "./discoveryCatalog";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { AURION_WORLD_CHUNK_RULESET } from "../shared/worldChunkProtocol";
import { DISCOVERY_CODEX_VERSION, discoveryRegionQuerySchema, discoveryRegionProjectionSchema } from "../shared/discoveryCodexProtocol";

// The server catalog is never serialized to an actor. Only this opaque version
// binding accompanies an authorized point projection of their existing memory.
export const DISCOVERY_CATALOG_FINGERPRINT = canonicalSha256({
  graph: createCanonicalDiscoveryCatalog().fingerprint, regionRule: AURION_WORLD_CHUNK_RULESET,
});

/** Read-only adapter over the existing durable knowledge owner; no new journal. */
export async function readActorRegionDiscovery(userId: number, untrusted: unknown) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("DISCOVERY_OWNER_INVALID");
  const input = discoveryRegionQuerySchema.parse(untrusted);
  if (input.expectedCatalogFingerprint && input.expectedCatalogFingerprint !== DISCOVERY_CATALOG_FINGERPRINT) throw new Error("DISCOVERY_CATALOG_STALE");
  const db = await getDb();
  if (!db) throw new Error("DISCOVERY_DATABASE_UNAVAILABLE");
  const assertCurrentEpoch = async () => {
    const [world] = await db.select({ epoch: aurionGlobalWorldStates.epoch })
      .from(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, GLOBAL_WORLD_ID)).limit(1);
    if (!world || world.epoch !== input.worldEpoch) throw new Error("DISCOVERY_WORLD_EPOCH_STALE");
  };
  await assertCurrentEpoch();
  const memory = await readExplorationMemoryChunk(userId, GLOBAL_WORLD_ID, input.worldEpoch, { x: input.chunkX, z: input.chunkZ });
  // Coordinates identify the requested point only. Unobserved points disclose no
  // terrain, biome, plants, availability, catalog identities or graph neighbours.
  const entry = memory ? {
    state: "confirmed" as const, category: "regions" as const,
    canonicalReference: { chunkX: memory.chunkX, chunkZ: memory.chunkZ },
    observation: { firstDiscoveryReceiptHash: memory.firstDiscoveryReceiptHash,
      latestConfirmedVisitSequence: memory.latestConfirmedVisitSequence, latestProjectionHash: memory.latestProjectionHash, sourceRevision: memory.sourceRevision,
      knowledgeHash: memory.memoryHash }, connections: [] as [],
  } : { state: "locked" as const };
  const values = { schema: DISCOVERY_CODEX_VERSION, worldId: GLOBAL_WORLD_ID, worldEpoch: input.worldEpoch,
    catalogFingerprint: DISCOVERY_CATALOG_FINGERPRINT,
    scopeFingerprint: canonicalSha256({ domain: DISCOVERY_CODEX_VERSION, userId, worldId: GLOBAL_WORLD_ID, worldEpoch: input.worldEpoch }),
    entry, currentWorldState: "not_projected" as const, mutationAuthority: "none" as const };
  const projection = discoveryRegionProjectionSchema.parse({ ...values, fingerprint: canonicalSha256(values) });
  // Bound response work to one indexed memory point and two epoch checks. Epoch
  // advancement while awaiting the stored receipt invalidates the projection.
  await assertCurrentEpoch();
  return Object.freeze(projection);
}
