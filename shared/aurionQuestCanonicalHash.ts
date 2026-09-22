import { createHash } from 'node:crypto';

/**
 * AIM-298: Aurion Canonical Serializer & Domain-Separated SHA-256 Hash Engine.
 * Guarantees 100% deterministic hash outputs regardless of object insertion order or ambient platform differences.
 */

export type HashDomain =
  | 'aurion.quest.template.v1'
  | 'aurion.quest.seed.v1'
  | 'aurion.quest.plan.v1'
  | 'aurion.quest.instance.v1'
  | 'aurion.quest.instance-state.v1'
  | 'aurion.quest.event.v1'
  | 'aurion.quest.replay.v1'
  | 'aurion.world.fact.v1'
  | 'aurion.world.event.v1'
  | 'aurion.quest.proposal.identity.v1'
  | 'aurion.quest.receipt.identity.v1'
  | 'aurion.quest.command.v1';

/**
 * Deterministically serializes any JS object or primitive into a stable canonical JSON string
 * with recursively sorted key-value pairs.
 */
export function canonicalSerialize(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj === 'number' || typeof obj === 'boolean' || typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalSerialize(item)).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
    const keyValues = sortedKeys.map(
      key => `${JSON.stringify(key)}:${canonicalSerialize((obj as Record<string, unknown>)[key])}`
    );
    return '{' + keyValues.join(',') + '}';
  }
  return JSON.stringify(String(obj));
}

/**
 * Computes a domain-separated SHA-256 hash string for data using canonical serialization.
 */
export function computeCanonicalHash(domain: HashDomain, payload: unknown): string {
  const serialized = canonicalSerialize(payload);
  const hashInput = `${domain}::${serialized}`;
  return createHash('sha256').update(hashInput, 'utf-8').digest('hex');
}

/**
 * Computes a deterministic seed digest tuple from world state, compiler, and candidate inputs.
 */
/**
 * Canonical logical quest-state identity. Temporal metadata is intentionally excluded
 * so retries/replays of the same logical state remain identical across wall-clock time.
 */
export function computeQuestStateHash(instance: unknown): string {
  if (!instance || typeof instance !== 'object' || Array.isArray(instance)) {
    throw new Error('AURION_QUEST_STATE_INVALID');
  }
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...logicalState } = instance as Record<string, unknown>;
  return computeCanonicalHash('aurion.quest.instance-state.v1', logicalState);
}

export function computeSeedDigest(inputs: {
  worldId: string;
  worldStateRevision: number;
  triggerEventId: string;
  compilerVersion: string;
  templateSetHash: string;
  candidateSetHash: string;
}): string {
  return computeCanonicalHash('aurion.quest.seed.v1', {
    worldId: inputs.worldId,
    worldStateRevision: inputs.worldStateRevision,
    triggerEventId: inputs.triggerEventId,
    compilerVersion: inputs.compilerVersion,
    templateSetHash: inputs.templateSetHash,
    candidateSetHash: inputs.candidateSetHash,
  });
}
