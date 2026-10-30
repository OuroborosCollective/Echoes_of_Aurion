import type { Entity } from './protocol.js';

/** JSON mit sortierten Schlüsseln – stabil gegenüber Einfüge-Reihenfolge. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(o[k]))
      .join(',') +
    '}'
  );
}

export function entityEqual(a: Entity, b: Entity): boolean {
  return (
    a.kind === b.kind &&
    a.defId === b.defId &&
    a.name === b.name &&
    a.region === b.region &&
    a.rot === b.rot &&
    a.pos.x === b.pos.x &&
    a.pos.y === b.pos.y &&
    a.pos.z === b.pos.z &&
    stableStringify(a.props ?? null) === stableStringify(b.props ?? null)
  );
}

export interface EntityDiff {
  upsert: Entity[];
  remove: string[];
}

/**
 * Vergleicht den bekannten Zustand mit einem neuen Vollabbild.
 * scopeKinds: Wenn gesetzt, werden nur Entities dieser Arten als "entfernt" gewertet
 * (für Quellen, die nur Teilmengen senden, z. B. nur `players`).
 */
export function diffEntities(
  prev: ReadonlyMap<string, Entity>,
  next: readonly Entity[],
  scopeKinds?: ReadonlySet<string>,
): EntityDiff {
  const upsert: Entity[] = [];
  const seen = new Set<string>();
  for (const e of next) {
    seen.add(e.id);
    const p = prev.get(e.id);
    if (!p || !entityEqual(p, e)) upsert.push(e);
  }
  const remove: string[] = [];
  for (const [id, p] of prev) {
    if (seen.has(id)) continue;
    if (scopeKinds && !scopeKinds.has(p.kind)) continue;
    remove.push(id);
  }
  return { upsert, remove };
}
