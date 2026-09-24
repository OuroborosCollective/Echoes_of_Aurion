import { createHash } from "node:crypto";
import {
  canonicalContextSourceSchema,
  type CanonicalContextSource,
} from "../../shared/aurionWorldContextContract";
import { hashCanonicalSource } from "../../shared/aurionWorldContextCanonicalHash";

export const AURION_ANN_SCHEMA_VERSION = "aurion.semantic-ann-retrieval.v1" as const;
const VECTOR_DOMAIN = "aurion.semantic.vector.v1";
const LEVEL_DOMAIN = "aurion.semantic.hnsw-level.v1";
const MAX_LEVEL = 8;

export type DeterministicAnnConfig = Readonly<{
  dimensions: number;
  maxNeighbors: number;
  efConstruction: number;
  efSearch: number;
  quantization: "symmetric-int8-v1";
}>;

export const DEFAULT_ANN_CONFIG: DeterministicAnnConfig = Object.freeze({
  dimensions: 96,
  maxNeighbors: 8,
  efConstruction: 64,
  efSearch: 64,
  quantization: "symmetric-int8-v1",
});

export type AnnSearchResult = Readonly<{
  rank: number;
  sourceId: string;
  sourceHash: string;
  approximateSimilarity: number;
  exactSimilarity: number;
}>;

export type AnnRetrievalReceipt = Readonly<{
  schemaVersion: typeof AURION_ANN_SCHEMA_VERSION;
  indexVersion: string;
  sourceRootHash: string;
  indexHash: string;
  queryHash: string;
  candidateSetHash: string;
  exactResultHash: string;
  requestedK: number;
  candidateCount: number;
  returnedCount: number;
  exactRescore: true;
  results: readonly AnnSearchResult[];
}>;

type FloatVector = readonly number[];

type Node = {
  id: string;
  sourceHash: string;
  vector: Float64Array;
  quantized: Int8Array;
  level: number;
  neighbors: string[][];
};

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return Object.fromEntries(
        Object.entries(current as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return current;
  });
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function tokenize(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const features = [...tokens];
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    features.push(`${tokens[index]}\0${tokens[index + 1]}`);
  }
  return features.length ? features : ["__empty__"];
}

export function deterministicTextVector(
  text: string,
  dimensions = DEFAULT_ANN_CONFIG.dimensions,
): Float64Array {
  if (!Number.isInteger(dimensions) || dimensions < 8 || dimensions > 4096) {
    throw new Error("AURION_ANN_VECTOR_DIMENSIONS_INVALID");
  }

  const vector = new Float64Array(dimensions);
  for (const feature of tokenize(text)) {
    const digest = createHash("sha256")
      .update(VECTOR_DOMAIN)
      .update("\0")
      .update(feature, "utf8")
      .digest();
    const first = digest.readUInt16BE(0) % dimensions;
    const second = digest.readUInt16BE(2) % dimensions;
    const sign = (digest[4]! & 1) === 0 ? 1 : -1;
    const weight = feature.includes("\0") ? 0.75 : 1;
    vector[first] += sign * weight;
    vector[second] += sign * weight * 0.5;
  }

  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
  return vector;
}

function cosineDistance(a: FloatVector, b: FloatVector): number {
  if (a.length !== b.length) throw new Error("AURION_ANN_DIMENSION_MISMATCH");
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!;
    an += a[index]! * a[index]!;
    bn += b[index]! * b[index]!;
  }
  if (an === 0 || bn === 0) return 1;
  return 1 - dot / Math.sqrt(an * bn);
}

function levelFor(id: string): number {
  const digest = createHash("sha256").update(LEVEL_DOMAIN).update("\0").update(id, "utf8").digest();
  const raw = (digest.readUInt32BE(0) + 1) / 0x1_0000_0000;
  return Math.min(MAX_LEVEL, Math.floor(-Math.log(raw) * 0.5));
}

function quantize(vector: FloatVector, scale: number): Int8Array {
  const result = new Int8Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    result[index] = Math.max(-127, Math.min(127, Math.round(vector[index]! * scale)));
  }
  return result;
}

function approxCosineDistance(a: Int8Array, b: Int8Array): number {
  if (a.length !== b.length) throw new Error("AURION_ANN_DIMENSION_MISMATCH");
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = a[index]!;
    const bv = b[index]!;
    dot += av * bv;
    an += av * av;
    bn += bv * bv;
  }
  if (an === 0 || bn === 0) return 1;
  return 1 - dot / Math.sqrt(an * bn);
}

function compareDistance(
  left: { distance: number; id: string },
  right: { distance: number; id: string },
): number {
  const delta = left.distance - right.distance;
  if (Math.abs(delta) > 1e-12) return delta;
  return compareId(left.id, right.id);
}

export class DeterministicHnswIndex {
  private readonly nodes = new Map<string, Node>();
  private entryPoint: string | null = null;
  private maxLevel = 0;
  private readonly config: DeterministicAnnConfig;
  private readonly quantizationScale: number;

  public constructor(
    items: readonly { id: string; sourceHash: string; text: string }[],
    config: DeterministicAnnConfig = DEFAULT_ANN_CONFIG,
  ) {
    this.config = config;
    if (items.length === 0) throw new Error("AURION_ANN_INDEX_EMPTY");
    const vectors = items.map((item) => ({
      ...item,
      vector: deterministicTextVector(item.text, config.dimensions),
    }));
    let maxAbs = 0;
    for (const item of vectors) {
      for (const value of item.vector) maxAbs = Math.max(maxAbs, Math.abs(value));
    }
    this.quantizationScale = maxAbs > 0 ? 127 / maxAbs : 1;

    for (const item of [...vectors].sort((a, b) => compareId(a.id, b.id))) {
      this.insert(item.id, item.sourceHash, item.vector);
    }
  }

  public get size(): number {
    return this.nodes.size;
  }

  public getIndexMetadata(sourceRootHash: string): { indexVersion: string; indexHash: string } {
    const indexVersion = [
      AURION_ANN_SCHEMA_VERSION,
      this.config.dimensions,
      this.config.maxNeighbors,
      this.config.efConstruction,
      this.config.efSearch,
      this.config.quantization,
    ].join("/");
    const nodeIdentity = [...this.nodes.values()]
      .sort((a, b) => compareId(a.id, b.id))
      .map((node) => [node.id, node.sourceHash, node.level, node.neighbors.map((level) => [...level].sort(compareId))]);
    const indexHash = sha256(canonicalJson({
      indexVersion,
      sourceRootHash,
      quantizationScale: Number(this.quantizationScale.toFixed(12)),
      nodeIdentity,
    }));
    return { indexVersion, indexHash };
  }

  private insert(id: string, sourceHash: string, vector: Float64Array): void {
    const level = levelFor(id);
    const node: Node = {
      id,
      sourceHash,
      vector,
      quantized: quantize(vector, this.quantizationScale),
      level,
      neighbors: Array.from({ length: level + 1 }, () => []),
    };

    if (!this.entryPoint) {
      this.nodes.set(id, node);
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    let entry = this.entryPoint;
    for (let currentLevel = this.maxLevel; currentLevel > level; currentLevel -= 1) {
      entry = this.greedyNearest(node.quantized, entry, currentLevel);
    }

    for (let currentLevel = Math.min(level, this.maxLevel); currentLevel >= 0; currentLevel -= 1) {
      const candidates = this.searchLayer(node.quantized, entry, currentLevel, this.config.efConstruction);
      const selected = candidates
        .slice(0, this.config.maxNeighbors)
        .map((candidate) => candidate.id)
        .filter((candidateId) => candidateId !== id);
      node.neighbors[currentLevel] = selected;
      for (const candidateId of selected) this.connect(id, candidateId, currentLevel);
      entry = candidates[0]?.id ?? entry;
    }

    this.nodes.set(id, node);
    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPoint = id;
    }
  }

  private connect(leftId: string, rightId: string, level: number): void {
    const left = this.nodes.get(leftId);
    const right = this.nodes.get(rightId);
    if (!left || !right || level > left.level || level > right.level) return;

    if (!left.neighbors[level]!.includes(rightId)) left.neighbors[level]!.push(rightId);
    if (!right.neighbors[level]!.includes(leftId)) right.neighbors[level]!.push(leftId);
    this.trimNeighbors(left, level);
    this.trimNeighbors(right, level);
  }

  private trimNeighbors(node: Node, level: number): void {
    const peers = node.neighbors[level]!;
    peers.sort((a, b) => compareDistance(
      { distance: approxCosineDistance(node.quantized, this.nodes.get(a)!.quantized), id: a },
      { distance: approxCosineDistance(node.quantized, this.nodes.get(b)!.quantized), id: b },
    ));
    peers.splice(this.config.maxNeighbors);
  }

  private greedyNearest(query: Int8Array, entry: string, level: number): string {
    let current = entry;
    let currentDistance = approxCosineDistance(query, this.nodes.get(current)!.quantized);
    let improved = true;
    while (improved) {
      improved = false;
      const node = this.nodes.get(current)!;
      for (const neighborId of [...node.neighbors[level]!.sort(compareId)]) {
        const distance = approxCosineDistance(query, this.nodes.get(neighborId)!.quantized);
        if (compareDistance({ distance, id: neighborId }, { distance: currentDistance, id: current }) < 0) {
          current = neighborId;
          currentDistance = distance;
          improved = true;
        }
      }
    }
    return current;
  }

  private searchLayer(
    query: Int8Array,
    entry: string,
    level: number,
    ef: number,
  ): Array<{ id: string; distance: number }> {
    const visited = new Set<string>([entry]);
    const candidates = [{ id: entry, distance: approxCosineDistance(query, this.nodes.get(entry)!.quantized) }];
    const best = [...candidates];

    while (candidates.length) {
      candidates.sort(compareDistance);
      const current = candidates.shift()!;
      best.sort(compareDistance);
      const worst = best[Math.min(best.length, ef) - 1]!;
      if (best.length >= ef && compareDistance(current, worst) > 0) break;

      const node = this.nodes.get(current.id)!;
      for (const neighborId of [...node.neighbors[level]!.sort(compareId)]) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const distance = approxCosineDistance(query, this.nodes.get(neighborId)!.quantized);
        if (best.length < ef || compareDistance({ distance, id: neighborId }, best[best.length - 1]!) < 0) {
          candidates.push({ id: neighborId, distance });
          best.push({ id: neighborId, distance });
          best.sort(compareDistance);
          if (best.length > ef) best.pop();
        }
      }
    }

    return best.sort(compareDistance);
  }

  private exactResults(query: Float64Array, ids: readonly string[], k: number): AnnSearchResult[] {
    return ids.map((sourceId) => {
      const node = this.nodes.get(sourceId)!;
      return {
        rank: 0,
        sourceId,
        sourceHash: node.sourceHash,
        approximateSimilarity: 1 - approxCosineDistance(quantize(query, this.quantizationScale), node.quantized),
        exactSimilarity: 1 - cosineDistance(query, node.vector),
      };
    })
      .sort((a, b) => {
        const delta = b.exactSimilarity - a.exactSimilarity;
        if (Math.abs(delta) > 1e-12) return delta;
        return compareId(a.sourceId, b.sourceId);
      })
      .slice(0, k)
      .map((item, index) => Object.freeze({ ...item, rank: index + 1 }));
  }

  public search(queryText: string, k: number): {
    candidates: readonly AnnSearchResult[];
    exact: readonly AnnSearchResult[];
  } {
    if (!Number.isInteger(k) || k < 1 || k > 128) throw new Error("AURION_ANN_K_INVALID");
    if (!this.entryPoint) throw new Error("AURION_ANN_INDEX_EMPTY");

    const query = deterministicTextVector(queryText, this.config.dimensions);
    const queryQuantized = quantize(query, this.quantizationScale);
    let entry = this.entryPoint;

    for (let level = this.maxLevel; level > 0; level -= 1) {
      entry = this.greedyNearest(queryQuantized, entry, level);
    }

    const candidates = this.searchLayer(queryQuantized, entry, 0, Math.max(k, this.config.efSearch));
    const candidateIds = candidates.map((candidate) => candidate.id);
    const candidateSet = candidates.map((candidate) => {
      const node = this.nodes.get(candidate.id)!;
      return Object.freeze({
        rank: 0,
        sourceId: candidate.id,
        sourceHash: node.sourceHash,
        approximateSimilarity: 1 - candidate.distance,
        exactSimilarity: 0,
      });
    });
    return {
      candidates: Object.freeze(candidateSet),
      exact: Object.freeze(this.exactResults(query, candidateIds, k)),
    };
  }
}

export function buildSourceRootHash(sources: readonly CanonicalContextSource[]): string {
  return sha256(canonicalJson(
    [...sources]
      .sort((a, b) => compareId(a.sourceId, b.sourceId) || compareId(a.sourceHash, b.sourceHash))
      .map((source) => [source.sourceId, source.sourceHash]),
  ));
}

export function verifyCanonicalSources(sources: readonly CanonicalContextSource[]): readonly CanonicalContextSource[] {
  const verified = sources.map((source) => {
    canonicalContextSourceSchema.parse(source);
    const { sourceHash: claimed, ...sourceWithoutHash } = source;
    const observed = hashCanonicalSource(sourceWithoutHash);
    if (claimed !== observed) throw new Error(`AURION_ANN_SOURCE_HASH_MISMATCH:${source.sourceId}`);
    return source;
  });
  const unique = new Set(verified.map((source) => source.sourceId));
  if (unique.size !== verified.length) throw new Error("AURION_ANN_DUPLICATE_SOURCE_ID");
  return Object.freeze([...verified].sort((a, b) => compareId(a.sourceId, b.sourceId)));
}

export function searchCanonicalContextSources(
  sources: readonly CanonicalContextSource[],
  queryText: string,
  requestedK = 8,
  config: DeterministicAnnConfig = DEFAULT_ANN_CONFIG,
): { receipt: AnnRetrievalReceipt; sources: readonly CanonicalContextSource[] } {
  if (!queryText.trim()) throw new Error("AURION_ANN_QUERY_EMPTY");
  if (!Number.isInteger(requestedK) || requestedK < 1 || requestedK > 32) {
    throw new Error("AURION_ANN_K_INVALID");
  }

  const verifiedSources = verifyCanonicalSources(sources);
  if (verifiedSources.length === 0) {
    const emptyHash = sha256("aurion.semantic-ann.empty");
    return {
      receipt: Object.freeze({
        schemaVersion: AURION_ANN_SCHEMA_VERSION,
        indexVersion: "empty",
        sourceRootHash: emptyHash,
        indexHash: emptyHash,
        queryHash: sha256(queryText.normalize("NFKC")),
        candidateSetHash: emptyHash,
        exactResultHash: emptyHash,
        requestedK,
        candidateCount: 0,
        returnedCount: 0,
        exactRescore: true,
        results: Object.freeze([]),
      }),
      sources: Object.freeze([]),
    };
  }

  const sourceRootHash = buildSourceRootHash(verifiedSources);
  const index = new DeterministicHnswIndex(
    verifiedSources.map((source) => ({ id: source.sourceId, sourceHash: source.sourceHash, text: source.canonicalText })),
    config,
  );
  const { indexVersion, indexHash } = index.getIndexMetadata(sourceRootHash);
  const { candidates, exact } = index.search(queryText, Math.min(config.efSearch, Math.max(requestedK, 8)));

  const exactById = new Map(exact.map((item) => [item.sourceId, item]));
  const results = exact.slice(0, requestedK);
  const candidateSetHash = sha256(canonicalJson(candidates.map((item) => [
    item.sourceId,
    item.sourceHash,
    Number(item.approximateSimilarity.toFixed(12)),
  ])));
  const exactResultHash = sha256(canonicalJson(results.map((item) => [
    item.rank,
    item.sourceId,
    item.sourceHash,
    Number(item.exactSimilarity.toFixed(12)),
  ])));
  const queryHash = sha256(canonicalJson({
    schemaVersion: AURION_ANN_SCHEMA_VERSION,
    queryText: queryText.normalize("NFKC"),
    dimensions: config.dimensions,
    quantization: config.quantization,
  }));

  const resultSources = results.map((result) => {
    const source = verifiedSources.find((candidate) => candidate.sourceId === result.sourceId);
    if (!source || source.sourceHash !== exactById.get(result.sourceId)!.sourceHash) {
      throw new Error(`AURION_ANN_SOURCE_READBACK_MISMATCH:${result.sourceId}`);
    }
    return source;
  });

  return {
    receipt: Object.freeze({
      schemaVersion: AURION_ANN_SCHEMA_VERSION,
      indexVersion,
      sourceRootHash,
      indexHash,
      queryHash,
      candidateSetHash,
      exactResultHash,
      requestedK,
      candidateCount: candidates.length,
      returnedCount: results.length,
      exactRescore: true,
      results: Object.freeze(results),
    }),
    sources: Object.freeze(resultSources),
  };
}
