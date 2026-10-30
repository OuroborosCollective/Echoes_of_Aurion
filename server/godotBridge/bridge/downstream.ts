import http from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { BRIDGE_PROTO, isRecord, parseEditCommand, type DeltaMsg, type ServerMsg, type SnapshotMsg } from '../shared/protocol.js';
import type { BridgeConfig } from './config.js';
import type { CommandGate } from './commands.js';
import type { Logger } from './log.js';
import type { UpstreamClient } from './upstream.js';
import type { WorldState } from './worldState.js';

interface Client {
  id: string;
  ws: WebSocket;
  remote: string;
  authed: boolean;
  alive: boolean;
  needsResync: boolean;
  authTimer: NodeJS.Timeout;
}

const sha = (s: string): Buffer => createHash('sha256').update(s).digest();

function rawToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

/** WebSocket-Server für Godot (Pfad /godot) + GET /health. */
export class DownstreamServer {
  private readonly httpServer: http.Server;
  private readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();
  private readonly tokenHash: Buffer;
  private pingTimer?: NodeJS.Timeout;
  private drainTimer?: NodeJS.Timeout;

  constructor(
    private readonly cfg: BridgeConfig,
    private readonly world: WorldState,
    private readonly upstream: UpstreamClient,
    private readonly gate: CommandGate,
    private readonly log: Logger,
  ) {
    this.tokenHash = sha(cfg.token);
    this.httpServer = http.createServer((req, res) => this.onHttp(req, res));
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/godot', maxPayload: 256 * 1024 });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));

    world.on('delta', (m: DeltaMsg) => this.broadcastDelta(m));
    world.on('snapshot', (m: SnapshotMsg) => {
      for (const c of this.clients) if (c.authed) this.send(c, m);
    });
    upstream.on('state', (s: 'up' | 'down') => {
      for (const c of this.clients) if (c.authed) {
        this.send(c, { t: 'status', upstream: s, edit: cfg.edit && upstream.supportsEdit });
        if (s === 'up' && world.loaded) this.send(c, world.snapshotMsg());
      }
    });
  }

  listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.httpServer.once('error', reject);
      this.httpServer.listen(this.cfg.port, this.cfg.host, () => {
        this.httpServer.off('error', reject);
        this.pingTimer = setInterval(() => this.heartbeat(), 15_000);
        this.drainTimer = setInterval(() => this.retryResyncs(), 1000);
        resolve((this.httpServer.address() as AddressInfo).port);
      });
    });
  }

  close(): Promise<void> {
    clearInterval(this.pingTimer);
    clearInterval(this.drainTimer);
    return new Promise((resolve) => {
      for (const c of this.clients) c.ws.terminate();
      this.wss.close(() => this.httpServer.close(() => resolve()));
    });
  }

  clientCount(): number {
    let n = 0;
    for (const c of this.clients) if (c.authed) n++;
    return n;
  }

  private onHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'GET' && req.url === '/health') {
      const healthy = this.upstream.state === 'up' && this.world.loaded;
      const body = JSON.stringify({
        ok: healthy,
        upstream: this.upstream.state,
        worldId: this.world.worldId,
        tick: this.world.tick,
        seq: this.world.seq,
        entities: this.world.entities.size,
        clients: this.clientCount(),
        edit: this.cfg.edit && this.upstream.supportsEdit,
        identity: this.world.identity ?? null,
      });
      res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(body);
      return;
    }
    res.writeHead(404).end();
  }

  private onConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const client: Client = {
      id: randomUUID(),
      ws,
      remote: req.socket.remoteAddress ?? '?',
      authed: false,
      alive: true,
      needsResync: false,
      authTimer: setTimeout(() => ws.close(4001, 'auth_timeout'), 5000),
    };
    this.clients.add(client);

    ws.on('pong', () => {
      client.alive = true;
    });
    ws.on('message', (data, isBinary) => {
      client.alive = true;
      if (isBinary) {
        ws.close(4002, 'binary_not_supported');
        return;
      }
      this.onMessage(client, rawToString(data));
    });
    ws.on('close', () => {
      clearTimeout(client.authTimer);
      this.clients.delete(client);
      this.gate.forget(client.id);
      if (client.authed) this.log('info', 'godot-client getrennt', { id: client.id });
    });
    ws.on('error', (err) => this.log('warn', `client-fehler: ${err.message}`, { id: client.id }));
  }

  private onMessage(c: Client, text: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      c.ws.close(4002, 'bad_json');
      return;
    }
    if (!isRecord(msg) || typeof msg.t !== 'string') return;

    if (!c.authed) {
      const ok = msg.t === 'auth' && typeof msg.token === 'string' && timingSafeEqual(sha(msg.token), this.tokenHash);
      if (!ok) {
        this.log('warn', 'auth fehlgeschlagen', { remote: c.remote });
        c.ws.close(4003, 'auth_failed');
        return;
      }
      c.authed = true;
      clearTimeout(c.authTimer);
      this.log('info', 'godot-client verbunden', { id: c.id, remote: c.remote });
      this.send(c, {
        t: 'hello',
        proto: BRIDGE_PROTO,
        tick: this.world.tick,
        seq: this.world.seq,
        worldId: this.world.worldId,
        edit: this.cfg.edit && this.upstream.supportsEdit,
        upstream: this.upstream.state,
      });
      if (this.world.loaded) this.send(c, this.world.snapshotMsg());
      return;
    }

    switch (msg.t) {
      case 'resync':
        if (this.world.loaded) this.send(c, this.world.snapshotMsg());
        break;
      case 'ping':
        this.send(c, { t: 'pong' });
        break;
      case 'edit':
        void this.onEdit(c, msg);
        break;
    }
  }

  private async onEdit(c: Client, msg: Record<string, unknown>): Promise<void> {
    const cmdId = typeof msg.cmdId === 'string' && msg.cmdId.length > 0 && msg.cmdId.length <= 64 ? msg.cmdId : '';
    const ack = (ok: boolean, error?: string, tick?: number): void =>
      this.send(c, { t: 'ack', cmdId, ok, error, tick });

    if (!cmdId) return ack(false, 'bad_cmd_id');
    if (!this.cfg.edit || this.cfg.upstreamProtocol !== 'feed') return ack(false, 'edit_disabled');
    if (this.upstream.state !== 'up') return ack(false, 'upstream_unavailable');
    if (!this.upstream.supportsEdit) return ack(false, 'edit_disabled');
    if (!this.gate.allow(c.id)) return ack(false, 'rate_limited');

    const parsed = parseEditCommand(msg.cmd);
    if (!parsed.ok) {
      this.gate.audit({ client: c.id, remote: c.remote, cmdId, ok: false, error: parsed.error });
      return ack(false, parsed.error);
    }
    const res = await this.upstream.sendCommand(parsed.cmd);
    this.gate.audit({ client: c.id, remote: c.remote, cmdId, cmd: parsed.cmd, ok: res.ok, error: res.error, tick: res.appliesAtTick });
    ack(res.ok, res.error, res.appliesAtTick);
  }

  private send(c: Client, msg: ServerMsg): void {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
  }

  private broadcastDelta(m: DeltaMsg): void {
    const text = JSON.stringify(m);
    for (const c of this.clients) {
      if (!c.authed || c.ws.readyState !== WebSocket.OPEN) continue;
      if (c.ws.bufferedAmount > this.cfg.maxBuffer) {
        c.needsResync = true; // langsamer Client: Deltas verwerfen, später Snapshot
        continue;
      }
      if (c.needsResync) {
        if (c.ws.bufferedAmount < this.cfg.maxBuffer / 4) {
          c.needsResync = false;
          this.send(c, this.world.snapshotMsg());
        }
        continue;
      }
      c.ws.send(text);
    }
  }

  private retryResyncs(): void {
    for (const c of this.clients) {
      if (c.authed && c.needsResync && c.ws.bufferedAmount < this.cfg.maxBuffer / 4) {
        c.needsResync = false;
        this.send(c, this.world.snapshotMsg());
      }
    }
  }

  private heartbeat(): void {
    for (const c of this.clients) {
      if (!c.alive) {
        c.ws.terminate();
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }
}
