import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  AURION_STRUCTURE_OBSERVATION_PROTOCOL,
  STRUCTURE_OBSERVATION_CACHE_MAX_ENTRIES,
  structureObservationRequestSchema,
  structureObservationIdentitySchema,
  structureObservationReceiptSchema,
  type StructureMaterialization,
  type StructureObservationDeltaOverride,
  type StructureObservationIdentity,
  type StructureObservationReceipt,
  type StructureObservationRequest,
  type StructureObservationResult,
} from "../shared/structureObservationProtocol";
import { compileDeterministicStructureGrammar } from "./deterministicStructureGrammarCompiler";
import type { StructureGrammarCompilation } from "../shared/deterministicStructureGrammarProtocol";
import {
  chunkCoordinateSchema,
  type CanonicalChunkReceipt,
} from "../shared/aurionChunkStateContract";
import {
  createWorldChunkDelta,
  type WorldChunkDelta,
} from "../shared/worldChunkProtocol";
import { readChunkDeltaPage } from "./worldChunkDeltaPaging";
import {
  worldCausalRootService,
  type AurionWorldCausalRootService,
} from "./causality/worldCausalRootService";

type ConfirmedChunkReadback = Extract<
  Awaited<ReturnType<AurionWorldCausalRootService["readChunk"]>>,
  { status: "VERIFIED" }
>;

type DeltaPageReader = typeof readChunkDeltaPage;

type CachedObservation = Extract<StructureObservationResult, { status: "VERIFIED" }>;

export function structureObservationIdentity(input: {
  request: StructureObservationRequest;
  confirmedChunk: ConfirmedChunkReadback;
}): StructureObservationIdentity {
  const identity: StructureObservationIdentity = {
    protocol: AURION_STRUCTURE_OBSERVATION_PROTOCOL,
    worldId: input.request.worldId,
    epoch: input.request.epoch,
    chunkCoordinate: { ...input.request.chunkCoordinate },
    structureId: input.request.structureId,
    anchorId: input.request.anchorId,
    grammarId: input.request.grammar.grammarId,
    grammarVersion: input.request.grammar.grammarVersion,
    worldSeedHash: input.confirmedChunk.state.universe.worldSeedHash,
    confirmedChunkAuthorityStateHash: input.confirmedChunk.state.authorityStateHash,
    sourceRevision: input.confirmedChunk.receipt.sourceRevision,
    sourceCausalRoot: input.confirmedChunk.worldRootHash,
  };
  return Object.freeze(structureObservationIdentitySchema.parse(identity));
}

function observationKey(identity: StructureObservationIdentity): string {
  return canonicalSha256({
    domain: "aurion.structure-observation-key.v1",
    identity,
  });
}

function canonicalDeltaFromRow(row: unknown): WorldChunkDelta {
  if (!row || typeof row !== "object") throw new Error("OBSERVATION_DELTA_ROW_INVALID");
  const value = row as Record<string, unknown>;
  const payload = JSON.parse(String(value.payloadJson)) as Record<string, string | number | boolean>;
  const delta = createWorldChunkDelta({
    id: String(value.id),
    worldId: String(value.worldId),
    coordinate: { x: Number(value.chunkX), z: Number(value.chunkZ) },
    baseRevision: Number(value.baseRevision),
    sequence: Number(value.sequence),
    kind: value.kind as WorldChunkDelta["kind"],
    targetId: String(value.targetId),
    actorUserId: Number(value.actorUserId),
    idempotencyKey: String(value.idempotencyKey),
    payload,
  });
  if (delta.deterministicHash !== String(value.deterministicHash)) {
    throw new Error("OBSERVATION_DELTA_HASH_MISMATCH");
  }
  return delta;
}

async function readConfirmedDeltaPrefix(
  reader: DeltaPageReader,
  worldId: string,
  coordinate: { x: number; z: number },
  expectedBaseRevision: number,
  throughSequence: number,
): Promise<readonly WorldChunkDelta[]> {
  chunkCoordinateSchema.parse(coordinate);
  if (!Number.isSafeInteger(throughSequence) || throughSequence < 0) {
    throw new Error("OBSERVATION_DELTA_SEQUENCE_INVALID");
  }
  if (throughSequence === 0) return Object.freeze([]);

  const result: WorldChunkDelta[] = [];
  let afterSequence = 0;
  let afterId: string | null = null;
  while (result.length < throughSequence) {
    const remaining = throughSequence - result.length;
    const page = await reader({
      worldId,
      chunkX: coordinate.x,
      chunkZ: coordinate.z,
      expectedBaseRevision,
      afterSequence,
      afterId,
      limit: Math.min(100, remaining),
    });
    if (
      page.worldId !== worldId ||
      page.chunkX !== coordinate.x ||
      page.chunkZ !== coordinate.z ||
      page.baseRevision !== expectedBaseRevision
    ) {
      throw new Error("OBSERVATION_DELTA_PAGE_SCOPE_MISMATCH");
    }
    const rows = page.deltas.map(canonicalDeltaFromRow);
    for (const delta of rows) {
      if (delta.sequence !== result.length + 1) throw new Error("OBSERVATION_DELTA_SEQUENCE_GAP");
      result.push(delta);
    }
    if (result.length === throughSequence) break;
    if (!page.nextCursor) throw new Error("OBSERVATION_DELTA_PREFIX_INCOMPLETE");
    const [cursorSequence, ...cursorId] = page.nextCursor.split(":");
    const parsedSequence = Number(cursorSequence);
    const parsedId = cursorId.join(":");
    if (!Number.isSafeInteger(parsedSequence) || parsedSequence <= afterSequence || !parsedId) {
      throw new Error("OBSERVATION_DELTA_CURSOR_INVALID");
    }
    afterSequence = parsedSequence;
    afterId = parsedId;
  }
  return Object.freeze(result);
}

function latestStructureDelta(
  deltas: readonly WorldChunkDelta[],
  structureId: string,
): WorldChunkDelta | undefined {
  return Array.from(deltas)
    .filter(delta =>
      delta.targetId === structureId &&
      (delta.kind === "structure_placed" || delta.kind === "structure_removed"),
    )
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
    .at(-1);
}

function deltaOverride(delta: WorldChunkDelta): StructureObservationDeltaOverride {
  if (delta.kind !== "structure_placed") throw new Error("OBSERVATION_PLACEMENT_REQUIRED");
  const xMm = delta.payload.xMm;
  const zMm = delta.payload.zMm;
  const assetKey = delta.payload.assetKey;
  if (
    typeof xMm !== "number" || !Number.isSafeInteger(xMm) ||
    typeof zMm !== "number" || !Number.isSafeInteger(zMm) ||
    typeof assetKey !== "string" || !assetKey.trim()
  ) {
    throw new Error("OBSERVATION_STRUCTURE_PLACEMENT_INVALID");
  }
  return Object.freeze({
    source: "structure_placed_delta",
    deltaId: delta.id,
    targetId: delta.targetId,
    assetKey,
    positionMm: Object.freeze({ x: xMm, z: zMm }),
    deterministicHash: delta.deterministicHash,
  });
}

function buildMaterialization(
  key: string,
  compilation: StructureGrammarCompilation,
  latestDelta: WorldChunkDelta | undefined,
): StructureMaterialization {
  const override = latestDelta?.kind === "structure_placed" ? deltaOverride(latestDelta) : null;
  const primitives = override
    ? Object.freeze([])
    : Object.freeze(compilation.recipe.primitives.map(primitive => Object.freeze({
        id: primitive.id,
        source: "grammar" as const,
        primitive: primitive.primitive,
        ...(primitive.assetKey ? { assetKey: primitive.assetKey } : {}),
        ...(primitive.materialKey ? { materialKey: primitive.materialKey } : {}),
        positionMm: Object.freeze({ ...primitive.positionMm }),
        rotationDiscrete: Object.freeze({ ...primitive.rotationDiscrete }),
        sizeMm: Object.freeze({ ...primitive.sizeMm }),
      })));
  const assetKeys = override
    ? [override.assetKey]
    : Array.from(new Set(primitives.map(primitive => primitive.assetKey).filter((value): value is string => typeof value === "string"))).sort();
  const primitiveKinds = Array.from(
    new Set(primitives.map(primitive => primitive.primitive)),
  ).sort();
  const footprint = Object.freeze({
    protocol: "aurion.structure-footprint.v1" as const,
    semantics: "projection-only" as const,
    primitives: Object.freeze(primitives.map(primitive => Object.freeze({
      id: primitive.id,
      positionMm: Object.freeze({ x: primitive.positionMm.x, z: primitive.positionMm.z }),
      sizeMm: Object.freeze({ x: primitive.sizeMm.x, z: primitive.sizeMm.z }),
      rotationDiscrete: Object.freeze({ ...primitive.rotationDiscrete }),
    }))),
    deltaOverridePositionMm: override ? override.positionMm : null,
  });
  const materializationEnvelope: Omit<StructureMaterialization, "materializationHash"> = {
    protocol: "aurion.structure-materialization.v1" as const,
    observationKey: key,
    recipeHash: compilation.deterministicFingerprint,
    state: override ? "DELTA_OVERRIDE" : "BASE_GRAMMAR",
    primitives,
    deltaOverride: override,
    footprint,
    collision: {
      protocol: "aurion.structure-collision-descriptor.v1",
      semantics: "projection-only" as const,
      primitiveIds: primitives.map(primitive => primitive.id),
      deltaOverride: !!override,
    },
    presentation: {
      protocol: "aurion.structure-presentation-descriptor.v1",
      semantics: "presentation-only" as const,
      assetKeys,
      primitiveKinds,
    },
  };
  return Object.freeze({
    ...materializationEnvelope,
    materializationHash: canonicalSha256({
      domain: "aurion.structure-materialization.v1",
      materialization: materializationEnvelope,
    }),
  });
}

function receipt(
  identity: StructureObservationIdentity,
  key: string,
  compilation: StructureGrammarCompilation,
  materialization: StructureMaterialization,
  confirmedReceipt: CanonicalChunkReceipt,
): StructureObservationReceipt {
  const unsigned = {
    schema: "aurion.structure-observation-receipt.v1" as const,
    observationKey: key,
    worldId: identity.worldId,
    epoch: identity.epoch,
    chunkCoordinate: identity.chunkCoordinate,
    structureId: identity.structureId,
    anchorId: identity.anchorId,
    grammarId: identity.grammarId,
    grammarVersion: identity.grammarVersion,
    sourceRevision: identity.sourceRevision,
    sourceCausalRoot: identity.sourceCausalRoot,
    confirmedChunkHash: confirmedReceipt.authorityStateHash,
    recipeHash: compilation.deterministicFingerprint,
    materializationHash: materialization.materializationHash,
    previousReceiptHash: null,
  };
  return Object.freeze(structureObservationReceiptSchema.parse({
    ...unsigned,
    receiptHash: canonicalSha256({
      domain: "aurion.structure-observation-receipt.v1",
      receipt: unsigned,
    }),
  }));
}

export function materializeConfirmedStructure(input: {
  request: StructureObservationRequest;
  confirmedChunk: ConfirmedChunkReadback;
  confirmedDeltas: readonly WorldChunkDelta[];
}): StructureObservationResult {
  const identity = structureObservationIdentity(input);
  const key = observationKey(identity);
  const latestDelta = latestStructureDelta(input.confirmedDeltas, input.request.structureId);

  if (latestDelta?.kind === "structure_removed") {
    return Object.freeze({
      status: "REMOVED",
      identity,
      observationKey: key,
      reason: "CONFIRMED_STRUCTURE_REMOVED",
      sourceDeltaId: latestDelta.id,
    });
  }

  const compilation = compileDeterministicStructureGrammar({
    worldId: identity.worldId,
    worldSeedHash: identity.worldSeedHash,
    grammar: input.request.grammar,
    chunkCoordinate: identity.chunkCoordinate,
    anchorId: identity.anchorId,
    sourceCausalRoot: identity.sourceCausalRoot,
    sourceRevision: identity.sourceRevision,
  });
  const materialization = buildMaterialization(key, compilation, latestDelta);
  const receiptValue = receipt(
    identity,
    key,
    compilation,
    materialization,
    input.confirmedChunk.receipt,
  );

  return Object.freeze({
    status: "VERIFIED",
    identity,
    observationKey: key,
    recipe: compilation.recipe,
    recipeHash: compilation.deterministicFingerprint,
    materialization,
    receipt: receiptValue,
    cacheHit: false,
  });
}

export class StructureObservationRuntime {
  private readonly cache = new Map<string, CachedObservation>();
  private readonly readChunk: AurionWorldCausalRootService["readChunk"];
  private readonly readDeltas: DeltaPageReader;
  private readonly maxCacheEntries: number;

  public constructor(options: {
    causalRootService?: AurionWorldCausalRootService;
    deltaPageReader?: DeltaPageReader;
    maxCacheEntries?: number;
  } = {}) {
    this.readChunk = options.causalRootService?.readChunk.bind(options.causalRootService)
      ?? worldCausalRootService.readChunk.bind(worldCausalRootService);
    this.readDeltas = options.deltaPageReader ?? readChunkDeltaPage;
    this.maxCacheEntries = options.maxCacheEntries ?? STRUCTURE_OBSERVATION_CACHE_MAX_ENTRIES;
    if (!Number.isSafeInteger(this.maxCacheEntries) || this.maxCacheEntries < 1) {
      throw new Error("STRUCTURE_OBSERVATION_CACHE_CONFIGURATION_INVALID");
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public evict(observationKeyValue?: string): void {
    if (observationKeyValue) {
      this.cache.delete(observationKeyValue);
      return;
    }
    const first = this.cache.keys().next().value;
    if (first) this.cache.delete(first);
  }

  public async observe(request: StructureObservationRequest): Promise<StructureObservationResult> {
    const parsedRequest = structureObservationRequestSchema.parse(request);
    const confirmedChunk = await this.readChunk(
      parsedRequest.worldId,
      parsedRequest.epoch,
      parsedRequest.chunkCoordinate,
    );
    if (confirmedChunk.status !== "VERIFIED") {
      return Object.freeze({
        status: "UNPROVABLE",
        reason: confirmedChunk.reason,
      });
    }

    if (
      confirmedChunk.receipt.worldId !== parsedRequest.worldId ||
      confirmedChunk.receipt.epoch !== parsedRequest.epoch ||
      confirmedChunk.receipt.coordinate.x !== parsedRequest.chunkCoordinate.x ||
      confirmedChunk.receipt.coordinate.z !== parsedRequest.chunkCoordinate.z
    ) {
      return Object.freeze({ status: "UNPROVABLE", reason: "OBSERVATION_CONFIRMED_CHUNK_SCOPE_MISMATCH" });
    }
    const identity = structureObservationIdentity({ request: parsedRequest, confirmedChunk });
    const key = observationKey(identity);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Object.freeze({ ...cached, cacheHit: true });
    }

    let confirmedDeltas: readonly WorldChunkDelta[];
    try {
      confirmedDeltas = await readConfirmedDeltaPrefix(
        this.readDeltas,
        parsedRequest.worldId,
        parsedRequest.chunkCoordinate,
        confirmedChunk.state.universe.baseRevision,
        confirmedChunk.receipt.throughSequence,
      );
    } catch (error) {
      return Object.freeze({
        status: "UNPROVABLE",
        reason: error instanceof Error ? error.message : "OBSERVATION_DELTA_READ_FAILED",
      });
    }

    const result = materializeConfirmedStructure({
      request: parsedRequest,
      confirmedChunk,
      confirmedDeltas,
    });
    if (result.status === "VERIFIED") {
      this.cache.set(key, result);
      while (this.cache.size > this.maxCacheEntries) {
        const first = this.cache.keys().next().value;
        if (first) this.cache.delete(first);
      }
    }
    return result;
  }
}

export const structureObservationRuntime = new StructureObservationRuntime();
