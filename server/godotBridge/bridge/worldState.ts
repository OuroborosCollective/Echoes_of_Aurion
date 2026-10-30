import { EventEmitter } from 'node:events';
import { diffEntities, entityEqual, stableStringify } from '../shared/diff.js';
import type { DeltaMsg, Entity, RegionInfo, SnapshotMsg } from '../shared/protocol.js';
import type { ProjectionIdentity } from '../shared/projectionIdentity.js';

/**
 * Spiegel des Live-Zustands. Reines Lesen/Verteilen – keine Spiellogik.
 * Events: 'delta' (DeltaMsg), 'snapshot' (SnapshotMsg, wenn sich Regionen ändern).
 */
export class WorldState extends EventEmitter {
  readonly entities = new Map<string, Entity>();
  regions: RegionInfo[] = [];
  tick = 0;
  seq = 0;
  worldId = 'aurion';
  loaded = false;
  identity?: ProjectionIdentity;
  // Transport invalidation clears visible data, never the accepted history fence.
  lastConfirmedIdentity?: ProjectionIdentity;

  invalidate(): void {
    this.loaded = false;
    this.identity = undefined;
    this.entities.clear();
    this.regions = [];
    this.tick = 0;
  }

  applySnapshot(
    tick: number,
    entities: Entity[],
    regions?: RegionInfo[],
    scopeKinds?: ReadonlySet<string>,
  ): DeltaMsg | null {
    const { upsert, remove } = diffEntities(this.entities, entities, scopeKinds);
    const regionsChanged =
      regions !== undefined && stableStringify(regions) !== stableStringify(this.regions);
    if (regionsChanged) this.regions = regions;
    const delta = this.commit(tick, upsert, remove);
    this.emit('snapshot', this.snapshotMsg());
    return delta;
  }

  applyDelta(tick: number, upsert: Entity[], remove: string[]): DeltaMsg | null {
    const realUpsert = upsert.filter((e) => {
      const p = this.entities.get(e.id);
      return !p || !entityEqual(p, e);
    });
    const realRemove = remove.filter((id) => this.entities.has(id));
    return this.commit(tick, realUpsert, realRemove);
  }

  snapshotMsg(): SnapshotMsg {
    return {
      t: 'snapshot',
      tick: this.tick,
      seq: this.seq,
      entities: [...this.entities.values()],
      regions: this.regions,
      ...(this.identity ? { identity: this.identity } : {}),
    };
  }

  private commit(tick: number, upsert: Entity[], remove: string[]): DeltaMsg | null {
    this.tick = tick;
    this.loaded = true;
    for (const e of upsert) this.entities.set(e.id, e);
    for (const id of remove) this.entities.delete(id);
    this.seq += 1;
    const msg: DeltaMsg = { t: 'delta', tick, seq: this.seq, upsert, remove, ...(this.identity ? { identity: this.identity } : {}) };
    this.emit('delta', msg);
    return msg;
  }
}

