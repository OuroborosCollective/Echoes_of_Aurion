/**
 * Ende-zu-Ende-Selbsttest: Mock-Game ⇄ Feed ⇄ Bridge ⇄ simulierter Godot-Client.
 * Läuft ohne Netzwerk, ohne Godot.   pnpm test
 */
import assert from 'node:assert/strict';
import { operationalNow } from '../../../shared/operationalClock.js';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startBridge, type RunningBridge } from '../bridge/app.js';
import type { BridgeConfig } from '../bridge/config.js';
import { silentLogger } from '../bridge/log.js';
import { genericToSnapshot } from '../bridge/mapping.js';
import { diffEntities } from '../shared/diff.js';
import { parseEditCommand, type Entity } from '../shared/protocol.js';
import { startMockGame, type MockGame } from './mockGame.js';

const FEED_TOKEN = 'feed-token-0123456789abcdef';
const BRIDGE_TOKEN = 'bridge-token-0123456789abcdef';
let passed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    console.error(`  ✘ ${name}\n`, err);
    process.exitCode = 1;
    throw err;
  }
}

type Msg = Record<string, any>;

class FakeGodot {
  ws: WebSocket;
  msgs: Msg[] = [];
  closeCode?: number;
  private waiters: Array<() => void> = [];
  constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/godot`);
    this.ws.on('message', (d) => {
      this.msgs.push(JSON.parse(d.toString()));
      this.waiters.splice(0).forEach((w) => w());
    });
    this.ws.on('close', (code) => {
      this.closeCode = code;
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  opened(): Promise<void> {
    return new Promise((res, rej) => {
      this.ws.once('open', () => res());
      this.ws.once('error', rej);
    });
  }
  send(m: Msg): void {
    this.ws.send(JSON.stringify(m));
  }
  async waitFor(pred: (m: Msg) => boolean, ms = 3000, from = 0): Promise<Msg> {
    const end = operationalNow() + ms;
    for (;;) {
      const hit = this.msgs.slice(from).find(pred);
      if (hit) return hit;
      const left = end - operationalNow();
      if (left <= 0) throw new Error(`timeout; bisher: ${JSON.stringify(this.msgs.map((m) => m.t))}`);
      await new Promise<void>((r) => {
        const t = setTimeout(r, left);
        this.waiters.push(() => {
          clearTimeout(t);
          r();
        });
      });
    }
  }
  async waitClose(ms = 2000): Promise<number | undefined> {
    const end = operationalNow() + ms;
    while (this.closeCode === undefined && operationalNow() < end) await new Promise((r) => setTimeout(r, 20));
    return this.closeCode;
  }
  close(): void {
    this.ws.close();
  }
}

function cfg(over: Partial<BridgeConfig>): BridgeConfig {
  return {
    upstreamUrl: '',
    upstreamToken: FEED_TOKEN,
    upstreamProtocol: 'feed',
    coords: 'xz',
    reconnectMinMs: 100,
    reconnectMaxMs: 400,
    host: '127.0.0.1',
    port: 0,
    token: BRIDGE_TOKEN,
    edit: true,
    editRate: 50,
    auditLog: '',
    maxBuffer: 1_048_576,
    ...over,
  };
}

async function connectAuthed(port: number): Promise<FakeGodot> {
  const g = new FakeGodot(port);
  await g.opened();
  g.send({ t: 'auth', token: BRIDGE_TOKEN });
  await g.waitFor((m) => m.t === 'snapshot');
  return g;
}

console.log('Aurion-Godot-Bridge Selbsttest');

// ── Unit ──
await test('parseEditCommand: Allowlist, Grenzen, Prototype-Pollution', () => {
  assert.equal(parseEditCommand({ op: 'entity.move', id: 'npc_1', pos: { x: 1, y: 0, z: 2 } }).ok, true);
  assert.equal(parseEditCommand({ op: 'entity.move', id: 'npc_1', pos: { x: 'a', y: 0, z: 2 } }).ok, false);
  assert.equal(parseEditCommand({ op: 'entity.move', id: '../etc', pos: { x: 1, y: 0, z: 2 } }).ok, false);
  assert.equal(parseEditCommand({ op: 'entity.move', id: 'a', pos: { x: 1e9, y: 0, z: 0 } }).ok, false);
  assert.equal(parseEditCommand({ op: 'drop.database' }).ok, false);
  assert.equal(parseEditCommand(JSON.parse('{"op":"entity.set","id":"a","key":"__proto__","value":1}')).ok, false);
  assert.equal(parseEditCommand(JSON.parse('{"op":"entity.spawn","kind":"npc","pos":{"x":0,"y":0,"z":0},"props":{"__proto__":{"x":1}}}')).ok, false);
  assert.equal(parseEditCommand({ op: 'quest.attach', strandKey: 'eisenmangel', anchorId: 'board_1' }).ok, true);
});

await test('diffEntities: Upsert/Remove + Scope', () => {
  const mk = (id: string, kind: string, x: number): Entity => ({ id, kind, pos: { x, y: 0, z: 0 } });
  const prev = new Map<string, Entity>([['a', mk('a', 'npc', 0)], ['b', mk('b', 'player', 0)], ['c', mk('c', 'npc', 0)]]);
  const d = diffEntities(prev, [mk('a', 'npc', 1), mk('c', 'npc', 0), mk('d', 'npc', 5)]);
  assert.deepEqual(d.upsert.map((e) => e.id).sort(), ['a', 'd']);
  assert.deepEqual(d.remove, ['b']);
  const scoped = diffEntities(prev, [mk('a', 'npc', 0), mk('c', 'npc', 0)], new Set(['npc']));
  assert.deepEqual(scoped.remove, []);
});

await test('genericToSnapshot: Arrays, ID-Maps, Koordinatenmodi, Scope', () => {
  const s = genericToSnapshot(
    { tick: 7, state: { players: [{ id: 'p1', x: 1, y: 2, name: 'A' }], npcs: { n1: { position: { x: 3, y: 4 }, hp: 10 } } } },
    'xy',
  );
  assert.ok(s);
  assert.equal(s.tick, 7);
  assert.equal(s.entities.length, 2);
  assert.deepEqual(s.entities[0]?.pos, { x: 1, y: 0, z: 2 });
  assert.equal(s.entities[1]?.props?.hp, 10);
  assert.deepEqual([...(s.scopeKinds ?? [])].sort(), ['npc', 'player']);
  assert.equal(genericToSnapshot({ hello: 1 }, 'xz'), null);
});

// ── Integration ──
const dir = await mkdtemp(join(tmpdir(), 'aurion-bridge-'));
const auditPath = join(dir, 'audit.jsonl');
let game: MockGame = startMockGame({ port: 0, token: FEED_TOKEN });
const feedPort = await game.feed.ready;
const bridge: RunningBridge = await startBridge(cfg({ upstreamUrl: `ws://127.0.0.1:${feedPort}/feed`, auditLog: auditPath }), silentLogger);

try {
  await test('falsches Token wird abgewiesen (4003)', async () => {
    const g = new FakeGodot(bridge.port);
    await g.opened();
    g.send({ t: 'auth', token: 'falsch-falsch-falsch-falsch' });
    assert.equal(await g.waitClose(), 4003);
    assert.equal(g.msgs.length, 0);
  });

  const g = await connectAuthed(bridge.port);

  await test('hello + Snapshot nach Auth', async () => {
    const hello = g.msgs.find((m) => m.t === 'hello');
    assert.ok(hello);
    assert.equal(hello.edit, true);
    const snap = g.msgs.find((m) => m.t === 'snapshot');
    assert.ok(snap && snap.entities.length >= 10, 'mind. 10 Entities');
    assert.ok(snap.entities.some((e: Entity) => e.id === 'board_1'));
    assert.equal(snap.regions[0].id, 'start');
  });

  await test('Deltas kommen fortlaufend (seq lückenlos)', async () => {
    const snap = g.msgs.find((m) => m.t === 'snapshot')!;
    await g.waitFor((m) => m.t === 'delta' && m.seq >= snap.seq + 3, 4000);
    const deltas = g.msgs.filter((m) => m.t === 'delta' && m.seq > snap.seq);
    deltas.forEach((d, i) => assert.equal(d.seq, snap.seq + 1 + i));
  });

  await test('Edit: entity.move → ack → Delta mit neuer Position (Server ist autoritativ)', async () => {
    const from = g.msgs.length;
    g.send({ t: 'edit', cmdId: 'c1', cmd: { op: 'entity.set', id: 'npc_2', key: 'frozen', value: true } });
    await g.waitFor((m) => m.t === 'ack' && m.cmdId === 'c1' && m.ok === true, 2000, from);
    g.send({ t: 'edit', cmdId: 'c2', cmd: { op: 'entity.move', id: 'npc_2', pos: { x: 12.5, y: 0, z: -3.25 } } });
    const ack = await g.waitFor((m) => m.t === 'ack' && m.cmdId === 'c2', 2000, from);
    assert.equal(ack.ok, true);
    assert.ok(typeof ack.tick === 'number');
    await g.waitFor(
      (m) => m.t === 'delta' && m.upsert.some((e: Entity) => e.id === 'npc_2' && e.pos.x === 12.5 && e.pos.z === -3.25),
      2000,
      from,
    );
  });

  await test('Edit: Spawn + Remove + quest.attach', async () => {
    const from = g.msgs.length;
    g.send({ t: 'edit', cmdId: 's1', cmd: { op: 'entity.spawn', kind: 'item', defId: 'bronze_sword', pos: { x: 1, y: 0, z: 1 } } });
    await g.waitFor((m) => m.t === 'ack' && m.cmdId === 's1' && m.ok, 2000, from);
    await g.waitFor((m) => m.t === 'delta' && m.upsert.some((e: Entity) => e.id === 'edit_1' && e.defId === 'bronze_sword'), 2000, from);
    g.send({ t: 'edit', cmdId: 'q1', cmd: { op: 'quest.attach', strandKey: 'eisenmangel', anchorId: 'board_1' } });
    await g.waitFor((m) => m.t === 'delta' && m.upsert.some((e: Entity) => e.id === 'board_1' && e.props?.strandKey === 'eisenmangel'), 2000, from);
    g.send({ t: 'edit', cmdId: 'r1', cmd: { op: 'entity.remove', id: 'edit_1' } });
    await g.waitFor((m) => m.t === 'delta' && m.remove.includes('edit_1'), 2000, from);
  });

  await test('Edit: ungültige/unbekannte Commands werden abgelehnt', async () => {
    const from = g.msgs.length;
    g.send({ t: 'edit', cmdId: 'x1', cmd: { op: 'entity.move', id: 'npc_1', pos: { x: 'boom', y: 0, z: 0 } } });
    g.send({ t: 'edit', cmdId: 'x2', cmd: { op: 'entity.move', id: 'gibt_es_nicht', pos: { x: 1, y: 0, z: 0 } } });
    g.send({ t: 'edit', cmdId: 'x3', cmd: { op: 'server.shutdown' } });
    const a1 = await g.waitFor((m) => m.t === 'ack' && m.cmdId === 'x1', 2000, from);
    const a2 = await g.waitFor((m) => m.t === 'ack' && m.cmdId === 'x2', 2000, from);
    const a3 = await g.waitFor((m) => m.t === 'ack' && m.cmdId === 'x3', 2000, from);
    assert.deepEqual([a1.ok, a2.ok, a3.ok], [false, false, false]);
    assert.equal(a1.error, 'bad_pos');
    assert.equal(a2.error, 'unknown_entity');
    assert.equal(a3.error, 'unknown_op');
  });

  await test('Audit-Log enthält Edit-Versuche', async () => {
    await new Promise((r) => setTimeout(r, 100));
    const lines = (await readFile(auditPath, 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.cmd?.op === 'entity.move' && l.ok === true));
    assert.ok(lines.some((l) => l.ok === false && l.error === 'bad_pos'));
  });

  await test('Rate-Limit greift', async () => {
    const b2 = await startBridge(
      cfg({ upstreamUrl: `ws://127.0.0.1:${feedPort}/feed`, editRate: 1 }),
      silentLogger,
    );
    const g2 = await connectAuthed(b2.port);
    await g2.waitFor((m) => m.t === 'hello');
    for (let i = 0; i < 12; i++) g2.send({ t: 'edit', cmdId: `rl${i}`, cmd: { op: 'entity.set', id: 'npc_1', key: 'k', value: i } });
    await g2.waitFor((m) => m.t === 'ack' && m.cmdId === 'rl11', 3000);
    assert.ok(g2.msgs.some((m) => m.t === 'ack' && m.error === 'rate_limited'));
    g2.close();
    await b2.close();
  });

  await test('resync liefert frischen Snapshot', async () => {
    const from = g.msgs.length;
    g.send({ t: 'resync' });
    const s = await g.waitFor((m) => m.t === 'snapshot', 2000, from);
    assert.ok(s.entities.length >= 10);
  });

  await test('Upstream-Abbruch → status down; Wiederverbindung → status up, kein Datenverlust', async () => {
    const from = g.msgs.length;
    await game.close();
    await g.waitFor((m) => m.t === 'status' && m.upstream === 'down', 3000, from);
    // Edit während Ausfall
    g.send({ t: 'edit', cmdId: 'd1', cmd: { op: 'entity.remove', id: 'npc_1' } });
    const a = await g.waitFor((m) => m.t === 'ack' && m.cmdId === 'd1', 2000, from);
    assert.equal(a.error, 'upstream_unavailable');
    // Server kommt zurück (gleicher Port)
    game = startMockGame({ port: feedPort, token: FEED_TOKEN });
    await game.feed.ready;
    await g.waitFor((m) => m.t === 'status' && m.upstream === 'up', 5000, from);
    assert.equal(bridge.world.entities.has('board_1'), true);
  });

  g.close();

  await test('BRIDGE_EDIT=0 → edit_disabled, hello.edit=false', async () => {
    const b3 = await startBridge(cfg({ upstreamUrl: `ws://127.0.0.1:${feedPort}/feed`, edit: false }), silentLogger);
    const g3 = await connectAuthed(b3.port);
    assert.equal(g3.msgs.find((m) => m.t === 'hello')!.edit, false);
    g3.send({ t: 'edit', cmdId: 'e1', cmd: { op: 'entity.remove', id: 'npc_1' } });
    const a = await g3.waitFor((m) => m.t === 'ack' && m.cmdId === 'e1', 2000);
    assert.equal(a.error, 'edit_disabled');
    g3.close();
    await b3.close();
  });

  await test('/health liefert Status ohne Entity-Daten', async () => {
    const res = await fetch(`http://127.0.0.1:${bridge.port}/health`);
    const j = (await res.json()) as Record<string, unknown>;
    assert.equal(j.ok, true);
    assert.equal(j.upstream, 'up');
    assert.ok(typeof j.entities === 'number');
    assert.equal('pos' in j, false);
  });
} finally {
  await bridge.close();
  await game.close();
}

console.log(`\n${passed} Tests bestanden.`);
process.exit(process.exitCode ?? 0);
