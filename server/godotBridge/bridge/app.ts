import type { BridgeConfig } from './config.js';
import { CommandGate } from './commands.js';
import { DownstreamServer } from './downstream.js';
import { createLogger, type Logger } from './log.js';
import { hostOperationalClock, type OperationalClock } from '../../../shared/operationalClock.js';
import { UpstreamClient } from './upstream.js';
import { WorldState } from './worldState.js';

export interface RunningBridge {
  world: WorldState;
  upstream: UpstreamClient;
  downstream: DownstreamServer;
  port: number;
  close(): Promise<void>;
}

export async function startBridge(cfg: BridgeConfig, log?: Logger, clock: OperationalClock = hostOperationalClock): Promise<RunningBridge> {
  const logger = log ?? createLogger(clock);
  const world = new WorldState();
  const upstream = new UpstreamClient(
    world,
    {
      url: cfg.upstreamUrl,
      token: cfg.upstreamToken,
      protocol: cfg.upstreamProtocol,
      coords: cfg.coords,
      reconnectMinMs: cfg.reconnectMinMs,
      reconnectMaxMs: cfg.reconnectMaxMs,
      requireCanonical: cfg.requireCanonical,
    },
    logger,
    clock,
  );
  const gate = new CommandGate({ ratePerSec: cfg.editRate, auditPath: cfg.edit ? cfg.auditLog : undefined }, logger, clock);
  const downstream = new DownstreamServer(cfg, world, upstream, gate, logger);

  const port = await downstream.listen();
  logger('info', 'bridge lauscht', { host: cfg.host, port, edit: cfg.edit && upstream.supportsEdit, upstream: cfg.upstreamUrl });
  upstream.start();

  return {
    world,
    upstream,
    downstream,
    port,
    close: async () => {
      upstream.stop();
      await downstream.close();
    },
  };
}
