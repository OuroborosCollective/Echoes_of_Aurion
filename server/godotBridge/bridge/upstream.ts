import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import {
  BRIDGE_PROTO,
  isRecord,
  sanitizeEntity,
  sanitizeRegion,
  type EditCommand,
  type Entity,
  type FeedClientMsg,
  type RegionInfo,
} from '../shared/protocol.js';
import { genericToSnapshot, type CoordMode } from './mapping.js';
import type { Logger } from './log.js';
import type { WorldState } from './worldState.js';
import { isProjectionIdentity, projectionHash } from '../shared/projectionIdentity.js';

export type UpstreamState = 'up' | 'down';

export interface UpstreamOptions {
  url: string;
  token: string;
  protocol: 'feed' | 'generic';
  coords: CoordMode;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  requireCanonical?: boolean;
}

export interface CmdResult {
  ok: boolean;
  error?: string;
  appliesAtTick?: number;
}

interface Pending {
  resolve: (r: CmdResult) => void;
  timer: NodeJS.Timeout;
}

/** Verbindung zum Live-Game-Server mit Auto-Reconnect (exponentielles Backoff + Jitter). */
export class UpstreamClient extends EventEmitter {
  state: UpstreamState = 'down';
  private ws?: WebSocket;
  private stopped = false;
  private backoff: number;
  private retryTimer?: NodeJS.Timeout;
  private pingTimer?: NodeJS.Timeout;
  private freshnessTimer?: NodeJS.Timeout;
  private lastFrameAt = 0;
  private hostAllowsEdit = false;
  private alive = true;
  private cmdCounter = 0;
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly world: WorldState,
    private readonly opts: UpstreamOptions,
    private readonly log: Logger,
  ) {
    super();
    this.backoff = opts.reconnectMinMs;
  }

  /** Protokoll unterstützt Editing (nur feed). */
  get supportsEdit(): boolean {
    return this.opts.protocol === 'feed' && this.hostAllowsEdit;
  }

  get canEdit(): boolean {
    return this.supportsEdit && this.state === 'up';
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.pingTimer);
    clearInterval(this.freshnessTimer);
    this.ws?.terminate();
    this.failPending('bridge_stopping');
  }

  sendCommand(cmd: EditCommand): Promise<CmdResult> {
    if (!this.canEdit || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, error: 'upstream_unavailable' });
    }
    const id = `b${Date.now().toString(36)}-${++this.cmdCounter}`;
    return new Promise<CmdResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'OUTCOME_UNKNOWN' });
      }, 5000);
      this.pending.set(id, { resolve, timer });
      this.sendRaw({ t: 'feed.cmd', id, cmd });
    });
  }

  private sendRaw(msg: FeedClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private setState(s: UpstreamState): void {
    if (this.state === s) return;
    this.state = s;
    this.log('info', `upstream ${s}`);
    this.emit('state', s);
  }

  private failPending(error: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ ok: false, error });
      this.pending.delete(id);
    }
  }

  private connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.opts.url, { handshakeTimeout: 5000, maxPayload: 32 * 1024 * 1024 });
    this.ws = ws;

    ws.on('open', () => {
      this.alive = true;
      if (this.opts.protocol === 'feed') this.sendRaw({ t: 'feed.auth', token: this.opts.token });
      else {
        this.backoff = this.opts.reconnectMinMs;
        this.setState('up');
      }
      clearInterval(this.pingTimer);
      clearInterval(this.freshnessTimer);
      this.freshnessTimer = setInterval(() => {
        if (this.state === 'up' && Date.now() - this.lastFrameAt > 1500) {
          this.world.invalidate();
          this.setState('down');
          ws.close(4000, 'stale_canonical_feed');
        }
      }, 250);
      this.pingTimer = setInterval(() => {
        if (!this.alive) {
          this.log('warn', 'upstream antwortet nicht – trenne');
          ws.terminate();
          return;
        }
        this.alive = false;
        ws.ping();
      }, 10_000);
    });

    ws.on('pong', () => {
      this.alive = true;
    });

    ws.on('message', (data, isBinary) => {
      this.alive = true;
      if (isBinary) return;
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (this.opts.protocol === 'feed') this.onFeed(msg);
      else this.onGeneric(msg);
    });

    ws.on('error', (err) => this.log('warn', `upstream-fehler: ${err.message}`));

    ws.on('close', (code) => {
      clearInterval(this.pingTimer);
      clearInterval(this.freshnessTimer);
      this.world.invalidate();
      this.hostAllowsEdit = false;
      this.setState('down');
      this.failPending('OUTCOME_UNKNOWN');
      if (this.stopped) return;
      if (code === 4003) this.log('error', 'upstream hat das Token abgelehnt (UPSTREAM_TOKEN prüfen)');
      const delay = Math.round(this.backoff * (0.5 + Math.random() * 0.5));
      this.backoff = Math.min(this.backoff * 2, this.opts.reconnectMaxMs);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    });
  }

  private onFeed(msg: unknown): void {
    if (!isRecord(msg) || typeof msg.t !== 'string') return;
    switch (msg.t) {
      case 'feed.hello': {
        if (msg.proto !== BRIDGE_PROTO) {
          this.log('error', `upstream-Protokoll ${String(msg.proto)} nicht unterstützt (erwartet ${BRIDGE_PROTO})`);
          this.ws?.close(4004, 'proto_mismatch');
          return;
        }
        if (typeof msg.worldId === 'string') this.world.worldId = msg.worldId.slice(0, 64);
        this.hostAllowsEdit = msg.edit === true;
        this.backoff = this.opts.reconnectMinMs;
        if (!this.opts.requireCanonical) this.setState('up');
        break;
      }
      case 'feed.snapshot': {
        const tick = typeof msg.tick === 'number' ? msg.tick : this.world.tick;
        const entities = this.entitiesOf(msg.entities);
        const regions = Array.isArray(msg.regions) ? this.regionsOf(msg.regions) : undefined;
        if (!this.acceptCanonicalFrame(msg, entities, regions ?? [])) break;
        this.world.applySnapshot(tick, entities, regions);
        this.setState('up');
        break;
      }
      case 'feed.delta': {
        const tick = typeof msg.tick === 'number' ? msg.tick : this.world.tick;
        const upsert = this.entitiesOf(msg.upsert);
        const remove = Array.isArray(msg.remove) ? msg.remove.filter((x): x is string => typeof x === 'string') : [];
        const next = new Map(this.world.entities);
        for (const entity of upsert) next.set(entity.id, entity);
        for (const id of remove) next.delete(id);
        if (!this.world.loaded && this.opts.requireCanonical) { this.ws?.close(4002, 'snapshot_required'); break; }
        if (!this.acceptCanonicalFrame(msg, [...next.values()], this.world.regions)) break;
        this.world.applyDelta(tick, upsert, remove);
        this.setState('up');
        break;
      }
      case 'feed.ack': {
        const id = typeof msg.id === 'string' ? msg.id : '';
        const p = this.pending.get(id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.resolve({
          ok: msg.ok === true,
          error: typeof msg.error === 'string' ? msg.error : undefined,
          appliesAtTick: typeof msg.appliesAtTick === 'number' ? msg.appliesAtTick : undefined,
        });
        break;
      }
    }
  }

  private onGeneric(msg: unknown): void {
    if (this.opts.requireCanonical) { this.ws?.close(4002, 'canonical_feed_required'); return; }
    const snap = genericToSnapshot(msg, this.opts.coords);
    if (!snap) return;
    this.world.applySnapshot(snap.tick || this.world.tick, snap.entities, undefined, snap.scopeKinds);
    this.lastFrameAt = Date.now();
  }

  private acceptCanonicalFrame(msg: Record<string, unknown>, entities: Entity[], regions: RegionInfo[]): boolean {
    this.lastFrameAt = Date.now();
    if (!this.opts.requireCanonical) return true; // Explicit isolated test/legacy caller, not loadConfig().
    const identity = msg.identity;
    const previous = this.world.lastConfirmedIdentity;
    const sameStream = isProjectionIdentity(identity) && previous?.streamInstance === identity.streamInstance;
    if (!isProjectionIdentity(identity) || identity.tick !== msg.tick || identity.worldId !== this.world.worldId
      || entities.length > 2048 || new Set(entities.map(e => e.id)).size !== entities.length
      || (previous && (identity.worldId !== previous.worldId || identity.zoneId !== previous.zoneId || identity.tick < previous.tick))
      || (previous && identity.tick === previous.tick && (identity.receiptHash !== previous.receiptHash
        || identity.stateHash !== previous.stateHash || identity.projectionHash !== previous.projectionHash))
      || (previous && !sameStream && msg.t !== 'feed.snapshot')
      || projectionHash(identity.tick, entities, regions) !== identity.projectionHash) {
      this.world.invalidate();
      this.setState('down');
      this.ws?.close(4002, 'unverified_canonical_projection');
      return false;
    }
    this.world.identity = structuredClone(identity);
    this.world.lastConfirmedIdentity = structuredClone(identity);
    return true;
  }

  private entitiesOf(raw: unknown): Entity[] {
    if (!Array.isArray(raw)) return [];
    const out: Entity[] = [];
    for (const item of raw) {
      const e = sanitizeEntity(item);
      if (e) out.push(e);
    }
    return out;
  }

  private regionsOf(raw: unknown[]): RegionInfo[] {
    const out: RegionInfo[] = [];
    for (const item of raw) {
      const r = sanitizeRegion(item);
      if (r) out.push(r);
    }
    return out;
  }
}

