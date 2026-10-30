/**
 * Mock-Game-Server für lokale Tests ohne echtes Echoes of Aurion.
 * Deterministische 10-Hz-Simulation (seeded LCG) + Aurion-Feed + Edit-Queue.
 *
 *   node dist/dev/mockGame.js        (Port/Token über MOCK_PORT / MOCK_FEED_TOKEN)
 */
import { attachAurionFeed, type AurionFeed, type FeedCommandResult, type FeedHost } from '../feed/aurionFeed.js';
import type { EditCommand, Entity } from '../shared/protocol.js';

export interface MockGame {
  feed: AurionFeed;
  entities: Map<string, Entity>;
  tick(): number;
  close(): Promise<void>;
}

export function startMockGame(opts: { port: number; token: string; tickMs?: number }): MockGame {
  const entities = new Map<string, Entity>();
  let tick = 0;
  let spawnCounter = 0;
  let seed = 0x2545f491;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  for (let i = 0; i < 6; i++) {
    const id = `npc_${i + 1}`;
    entities.set(id, { id, kind: 'npc', defId: 'villager', name: `Dörfler ${i + 1}`, pos: { x: i * 4 - 10, y: 0, z: (i % 3) * 5 - 5 }, region: 'start' });
  }
  entities.set('board_1', { id: 'board_1', kind: 'board', name: 'Anschlagtafel', pos: { x: 0, y: 0, z: -8 }, region: 'start' });
  entities.set('board_2', { id: 'board_2', kind: 'board', name: 'Anschlagtafel Ost', pos: { x: 15, y: 0, z: 4 }, region: 'start' });
  entities.set('item_1', { id: 'item_1', kind: 'item', defId: 'wood_sword', name: 'Holzschwert', pos: { x: -3, y: 0, z: 6 }, region: 'start' });
  entities.set('player_1', { id: 'player_1', kind: 'player', name: 'Elp', pos: { x: 10, y: 0, z: 0 }, region: 'start' });

  const queue: EditCommand[] = [];

  const host: FeedHost = {
    worldId: 'mock-aurion',
    getTick: () => tick,
    getEntities: () => [...entities.values()],
    getRegions: () => [{ id: 'start', name: 'Startregion' }],
    applyAdminCommand(cmd): FeedCommandResult {
      if ((cmd.op === 'entity.move' || cmd.op === 'entity.remove' || cmd.op === 'entity.set') && !entities.has(cmd.id)) {
        return { ok: false, error: 'unknown_entity' };
      }
      if (cmd.op === 'quest.attach' && !entities.has(cmd.anchorId)) return { ok: false, error: 'unknown_anchor' };
      queue.push(cmd);
      return { ok: true, appliesAtTick: tick + 1 };
    },
  };

  const feed = attachAurionFeed({ host, token: opts.token, port: opts.port, log: () => undefined });

  function applyQueue(): void {
    for (const cmd of queue.splice(0)) {
      switch (cmd.op) {
        case 'entity.spawn': {
          const id = `edit_${++spawnCounter}`;
          entities.set(id, { id, kind: cmd.kind, defId: cmd.defId, name: cmd.defId ?? cmd.kind, pos: cmd.pos, rot: cmd.rot, props: cmd.props, region: 'start' });
          break;
        }
        case 'entity.move': {
          const e = entities.get(cmd.id);
          if (e) entities.set(cmd.id, { ...e, pos: cmd.pos, rot: cmd.rot ?? e.rot });
          break;
        }
        case 'entity.remove':
          entities.delete(cmd.id);
          break;
        case 'entity.set': {
          const e = entities.get(cmd.id);
          if (e) entities.set(cmd.id, { ...e, props: { ...e.props, [cmd.key]: cmd.value } });
          break;
        }
        case 'quest.attach': {
          const e = entities.get(cmd.anchorId);
          if (e) entities.set(cmd.anchorId, { ...e, props: { ...e.props, strandKey: cmd.strandKey } });
          break;
        }
      }
    }
  }

  function simulate(): void {
    // NPCs: Zufallsschritt (deterministisch durch Seed), Spieler: Kreisbahn
    for (const [id, e] of entities) {
      if (e.kind === 'npc' && !e.props?.frozen) {
        const nx = Math.max(-20, Math.min(20, e.pos.x + (rnd() - 0.5) * 0.4));
        const nz = Math.max(-20, Math.min(20, e.pos.z + (rnd() - 0.5) * 0.4));
        entities.set(id, { ...e, pos: { x: nx, y: 0, z: nz } });
      } else if (id === 'player_1') {
        entities.set(id, { ...e, pos: { x: Math.cos(tick / 20) * 10, y: 0, z: Math.sin(tick / 20) * 10 }, rot: tick / 20 });
      }
    }
  }

  const timer = setInterval(() => {
    tick++;
    applyQueue();
    simulate();
    feed.onTick(tick);
  }, opts.tickMs ?? 100);

  return {
    feed,
    entities,
    tick: () => tick,
    close: async () => {
      clearInterval(timer);
      await feed.close();
    },
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.MOCK_FEED_TOKEN ?? 'mock-feed-token-0123456789';
  const port = Number(process.env.MOCK_PORT ?? 8090);
  const game = startMockGame({ port, token });
  const p = await game.feed.ready;
  console.log(`[mock] aurion-feed lauscht auf ws://127.0.0.1:${p}/feed  (Token: ${token})`);
  const stop = (): void => void game.close().finally(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
