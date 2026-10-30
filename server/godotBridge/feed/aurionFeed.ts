/**
 * Aurion-Feed – Server-seitiges Modul (läuft IM Game-Server-Prozess).
 *
 * Aufgabe: Nach jedem deterministischen Tick den Weltzustand als Delta an die
 * Bridge melden und Admin-Commands entgegennehmen. Das Modul hält selbst KEINEN
 * Spielzustand und verändert nichts – Commands gehen an host.applyAdminCommand(),
 * der sie in die Tick-Warteschlange des Servers einreiht (Anwendung im nächsten Tick).
 *
 * Einbindung (siehe README):
 *   const feed = attachAurionFeed({ host, token: process.env.AURION_FEED_TOKEN! });
 *   // am ENDE jedes Ticks:
 *   feed.onTick(world.tick);
 */
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { createHash, timingSafeEqual } from 'node:crypto';
import { diffEntities } from '../shared/diff.js';
import type { ProjectionIdentity } from '../shared/projectionIdentity.js';
import {
  BRIDGE_PROTO,
  isRecord,
  parseEditCommand,
  type EditCommand,
  type Entity,
  type FeedServerMsg,
  type RegionInfo,
} from '../shared/protocol.js';

export interface FeedCommandResult {
  ok: boolean;
  error?: string;
  /** Tick, ab dem der Command wirksam wird (Server-Warteschlange). */
  appliesAtTick?: number;
}

export interface FeedHost {
  worldId?: string;
  getTick(): number;
  /**
   * Aktueller Weltzustand in Bridge-Form (Entity[]). Reines Lesen; darf interne
   * Objekte zurückgeben – das Modul kopiert geänderte Entities tief.
   */
  getEntities(): readonly Entity[];
  getRegions?(): readonly RegionInfo[];
  /** Production adapter provides only a checked, committed Aurion tick. */
  getIdentity?(): ProjectionIdentity | undefined;
  /**
   * Optional. Ohne diese Methode ist die Welt für Godot read-only.
   * MUSS den Command validieren und in die Tick-Queue einreihen, nicht sofort anwenden.
   */
  applyAdminCommand?(cmd: EditCommand): FeedCommandResult | Promise<FeedCommandResult>;
}

export interface AurionFeedOptions {
  host: FeedHost;
  /** Gemeinsames Geheimnis, min. 16 Zeichen. */
  token: string;
  port?: number;
  /** Standard 127.0.0.1 – nur lokal erreichbar. */
  bind?: string;
  path?: string;
  log?: (message: string) => void;
}

export interface AurionFeed {
  invalidate(): void;
  /** Am Ende jedes Server-Ticks aufrufen. */
  onTick(tick: number): void;
  /** Resolved mit dem tatsächlichen Port, sobald der Feed lauscht. */
  ready: Promise<number>;
  clientCount(): number;
  close(): Promise<void>;
}

function sha(s: string): Buffer {
  return createHash('sha256').update(s).digest();
}

function rawToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

export function attachAurionFeed(opts: AurionFeedOptions): AurionFeed {
  if (typeof opts.token !== 'string' || opts.token.length < 16) {
    throw new Error('aurion-feed: token muss mindestens 16 Zeichen haben');
  }
  const { host } = opts;
  const log = opts.log ?? (() => undefined);
  const tokenHash = sha(opts.token);

  const wss = new WebSocketServer({
    host: opts.bind ?? '127.0.0.1',
    port: opts.port ?? 8090,
    path: opts.path ?? '/feed',
    maxPayload: 64 * 1024,
  });

  const ready = new Promise<number>((resolve, reject) => {
    wss.once('listening', () => {
      const a = wss.address();
      resolve(typeof a === 'object' && a ? a.port : 0);
    });
    wss.once('error', reject);
  });

  const authed = new Set<WebSocket>();
  /** Zuletzt gemeldeter Zustand (tiefe Kopien), Basis für Deltas. */
  let last: Map<string, Entity> | null = null;
  let lastTick = -1;
  let hasCommittedSnapshot = false;

  const send = (ws: WebSocket, msg: FeedServerMsg): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };
  const broadcast = (msg: FeedServerMsg): void => {
    const text = JSON.stringify(msg);
    for (const ws of authed) if (ws.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 4 * 1024 * 1024) ws.close(1013, 'slow_observer');
      else ws.send(text);
    }
  };
  const cloneMap = (list: readonly Entity[]): Map<string, Entity> => {
    const m = new Map<string, Entity>();
    for (const e of list) m.set(e.id, structuredClone(e));
    return m;
  };

  function flush(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick === lastTick) return;
    const identity = host.getIdentity?.();
    if (host.getIdentity && (!identity || identity.tick !== tick)) return;
    if (authed.size === 0) {
      last = null;
      hasCommittedSnapshot = false;
      return;
    }
    const now = host.getEntities();
    if (identity && !hasCommittedSnapshot) {
      last = cloneMap(now);
      lastTick = tick;
      hasCommittedSnapshot = true;
      broadcast({ t: 'feed.snapshot', tick, entities: [...now], regions: [...(host.getRegions?.() ?? [])], identity });
      return;
    }
    if (last === null) {
      last = cloneMap(now);
      return;
    }
    const { upsert, remove } = diffEntities(last, now);
    const upsertCopies = upsert.map((e) => structuredClone(e));
    for (const e of upsertCopies) last.set(e.id, e);
    for (const id of remove) last.delete(id);
    lastTick = tick;
    broadcast({ t: 'feed.delta', tick, upsert: upsertCopies, remove, ...(identity ? { identity } : {}) });
  }

  wss.on('connection', (ws) => {
    const authTimer = setTimeout(() => ws.close(4001, 'auth_timeout'), 5000);
    let isAuthed = false;

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        ws.close(4002, 'binary_not_supported');
        return;
      }
      let msg: unknown;
      try {
        msg = JSON.parse(rawToString(data));
      } catch {
        ws.close(4002, 'bad_json');
        return;
      }
      if (!isRecord(msg) || typeof msg.t !== 'string') return;

      if (!isAuthed) {
        const ok =
          msg.t === 'feed.auth' &&
          typeof msg.token === 'string' &&
          timingSafeEqual(sha(msg.token), tokenHash);
        if (!ok) {
          ws.close(4003, 'auth_failed');
          return;
        }
        isAuthed = true;
        clearTimeout(authTimer);
        const tick = host.getTick();
        flush(tick); // bestehende Clients erst auf Stand bringen
        if (last === null) last = cloneMap(host.getEntities());
        send(ws, { t: 'feed.hello', proto: BRIDGE_PROTO, tick, worldId: host.worldId ?? 'aurion', edit: Boolean(host.applyAdminCommand) });
        const identity = host.getIdentity?.();
        if (!host.getIdentity || identity) {
          send(ws, {
          t: 'feed.snapshot',
          tick,
          entities: [...host.getEntities()],
          regions: host.getRegions ? [...host.getRegions()] : [],
          ...(identity ? { identity } : {}),
          });
          hasCommittedSnapshot = true;
        }
        authed.add(ws);
        log(`feed: bridge verbunden (${authed.size} Client(s))`);
        return;
      }

      if (msg.t === 'feed.cmd') {
        const id = typeof msg.id === 'string' && msg.id.length <= 64 ? msg.id : '';
        const ack = (r: FeedCommandResult): void =>
          send(ws, { t: 'feed.ack', id, ok: r.ok, error: r.error, appliesAtTick: r.appliesAtTick });
        if (!id) return ack({ ok: false, error: 'bad_cmd_id' });
        if (!host.applyAdminCommand) return ack({ ok: false, error: 'not_supported' });
        const parsed = parseEditCommand(msg.cmd); // zweite Prüfung, serverseitig
        if (!parsed.ok) return ack({ ok: false, error: parsed.error });
        Promise.resolve()
          .then(() => host.applyAdminCommand!(parsed.cmd))
          .then(ack)
          .catch((err: unknown) => {
            log(`feed: applyAdminCommand fehlgeschlagen: ${String(err)}`);
            ack({ ok: false, error: 'host_error' });
          });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      authed.delete(ws);
    });
    ws.on('error', (err) => log(`feed: socket-fehler: ${err.message}`));
  });

  return {
    invalidate: () => {
      last = null;
      lastTick = -1;
      hasCommittedSnapshot = false;
      for (const ws of authed) ws.close(4000, 'canonical_observation_invalid');
    },
    onTick: (tick) => flush(tick),
    ready,
    clientCount: () => authed.size,
    close: () =>
      new Promise<void>((resolve) => {
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => resolve());
      }),
  };
}
