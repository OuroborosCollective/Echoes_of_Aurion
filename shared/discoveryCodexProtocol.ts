import { z } from "zod";

export const DISCOVERY_CODEX_VERSION = "aurion.discovery-codex.v1" as const;
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const coordinate = z.number().int().min(-1_000_000).max(1_000_000);
export const discoveryRegionQuerySchema = z.strictObject({
  worldEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  chunkX: coordinate, chunkZ: coordinate,
  expectedCatalogFingerprint: sha256.optional(),
});
// Locked entries deliberately have no hidden identity, name, provenance or edges.
const locked = z.strictObject({ state: z.literal("locked") });
const confirmed = z.strictObject({
  state: z.literal("confirmed"), category: z.literal("regions"),
  canonicalReference: z.strictObject({ chunkX: coordinate, chunkZ: coordinate }),
  observation: z.strictObject({
    firstDiscoveryReceiptHash: sha256, latestConfirmedVisitSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    latestProjectionHash: sha256, sourceRevision: z.string().regex(/^[a-f0-9]{40}$/), knowledgeHash: sha256,
  }),
  // A regional receipt does not prove any species, item, recipe or weather.
  connections: z.tuple([]),
});
export const discoveryRegionProjectionSchema = z.strictObject({
  schema: z.literal(DISCOVERY_CODEX_VERSION), worldId: z.string().min(1).max(96),
  worldEpoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  catalogFingerprint: sha256, scopeFingerprint: sha256,
  entry: z.discriminatedUnion("state", [locked, confirmed]),
  currentWorldState: z.literal("not_projected"), mutationAuthority: z.literal("none"),
  fingerprint: sha256,
});
export type DiscoveryRegionProjection = z.infer<typeof discoveryRegionProjectionSchema>;
