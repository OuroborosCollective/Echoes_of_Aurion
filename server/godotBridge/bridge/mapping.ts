/**
 * Generic-Mapping: Heuristik, um bestehende Server-Nachrichten (die der Client
 * ohnehin bekommt) in Bridge-Entities zu übersetzen – ohne Server-Änderung.
 *
 * ACHTUNG: Das ist eine Best-Guess-Übersetzung. Passe KIND_KEYS / toEntity() an
 * die echten Nachrichtenformen von Echoes of Aurion an. Der robuste Weg ist das
 * Feed-Modul (src/feed/aurionFeed.ts).
 */
import { isRecord, sanitizeEntity, type Entity, type Json } from '../shared/protocol.js';

export type CoordMode = 'xy' | 'xz' | 'xyz';

const KIND_KEYS: Record<string, string> = {
  players: 'player',
  npcs: 'npc',
  monsters: 'monster',
  mobs: 'monster',
  enemies: 'monster',
  items: 'item',
  drops: 'item',
  objects: 'object',
  boards: 'board',
  entities: 'entity',
};

const KNOWN_FIELDS = new Set([
  'id', 'entityId', 'uid', 'playerId', 'npcId',
  'pos', 'position', 'x', 'y', 'z',
  'kind', 'defId', 'templateId', 'type', 'name', 'displayName',
  'rot', 'rotation', 'yaw', 'facing', 'region', 'regionId',
]);

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function idOf(item: Record<string, unknown>): string | undefined {
  for (const k of ['id', 'entityId', 'uid', 'playerId', 'npcId']) {
    const v = item[k];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function toEntity(item: unknown, defaultKind: string, coords: CoordMode): Entity | null {
  if (!isRecord(item)) return null;
  const id = idOf(item);
  const p = isRecord(item.pos) ? item.pos : isRecord(item.position) ? item.position : item;
  const x = num(p.x);
  const a = num(p.y);
  const b = num(p.z);
  if (id === undefined || x === undefined) return null;

  let pos;
  if (coords === 'xy') {
    if (a === undefined) return null;
    pos = { x, y: 0, z: a };
  } else if (coords === 'xz') {
    if (b === undefined) return null;
    pos = { x, y: 0, z: b };
  } else {
    if (a === undefined || b === undefined) return null;
    pos = { x, y: a, z: b };
  }

  const kind = defaultKind === 'entity' && typeof item.kind === 'string' ? item.kind : defaultKind;
  const props: Record<string, Json> = {};
  let count = 0;
  for (const [k, v] of Object.entries(item)) {
    if (KNOWN_FIELDS.has(k) || count >= 16) continue;
    if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) {
      props[k] = v;
      count++;
    }
  }
  const str = (...keys: string[]): string | undefined => {
    for (const k of keys) if (typeof item[k] === 'string') return item[k] as string;
    return undefined;
  };
  return sanitizeEntity({
    id,
    kind,
    defId: str('defId', 'templateId', 'type'),
    name: str('name', 'displayName'),
    pos,
    rot: num(item.rot) ?? num(item.rotation) ?? num(item.yaw) ?? num(item.facing),
    region: str('region', 'regionId'),
    props: count > 0 ? props : undefined,
  });
}

export interface GenericSnapshot {
  tick: number;
  entities: Entity[];
  /** undefined = Vollabbild der ganzen Welt, sonst nur diese Arten. */
  scopeKinds?: Set<string>;
}

export function genericToSnapshot(raw: unknown, coords: CoordMode): GenericSnapshot | null {
  if (!isRecord(raw)) return null;
  const roots = [raw, raw.state, raw.world, raw.data, raw.payload].filter(isRecord);
  const entities: Entity[] = [];
  const kinds = new Set<string>();
  let fullScope = false;
  let found = false;
  let tick = 0;

  for (const root of roots) {
    const t = num(root.tick);
    if (t !== undefined) tick = t;
    for (const [key, kind] of Object.entries(KIND_KEYS)) {
      const list = root[key];
      let arr: unknown[] | null = null;
      if (Array.isArray(list)) arr = list;
      else if (isRecord(list)) arr = Object.entries(list).map(([id, v]) => (isRecord(v) ? { id, ...v } : null));
      if (!arr) continue;
      found = true;
      if (kind === 'entity') fullScope = true;
      else kinds.add(kind);
      for (const item of arr) {
        const e = toEntity(item, kind, coords);
        if (e) entities.push(e);
      }
    }
  }
  if (!found) return null;
  return { tick, entities, scopeKinds: fullScope ? undefined : kinds };
}
