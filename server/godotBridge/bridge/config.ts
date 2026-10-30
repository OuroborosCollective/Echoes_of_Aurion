import type { CoordMode } from './mapping.js';
import { readFileSync } from 'node:fs';

export interface BridgeConfig {
  upstreamUrl: string;
  upstreamToken: string;
  upstreamProtocol: 'feed' | 'generic';
  coords: CoordMode;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  host: string;
  port: number;
  token: string;
  edit: boolean;
  editRate: number;
  auditLog: string;
  maxBuffer: number;
  requireCanonical?: boolean;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function int(env: NodeJS.ProcessEnv, key: string, def: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key} muss eine ganze Zahl zwischen ${min} und ${max} sein`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const protocol = env.UPSTREAM_PROTOCOL ?? 'feed';
  if (protocol !== 'feed' && protocol !== 'generic') throw new Error('UPSTREAM_PROTOCOL muss feed oder generic sein');
  const coords = env.UPSTREAM_COORDS ?? 'xz';
  if (coords !== 'xy' && coords !== 'xz' && coords !== 'xyz') throw new Error('UPSTREAM_COORDS muss xy, xz oder xyz sein');

  const token = env.BRIDGE_TOKEN_FILE ? readFileSync(env.BRIDGE_TOKEN_FILE, 'utf8').trim() : env.BRIDGE_TOKEN ?? '';
  if (token.length < 16) throw new Error('BRIDGE_TOKEN fehlt oder ist kürzer als 16 Zeichen');

  const host = env.BRIDGE_HOST ?? '127.0.0.1';
  if (!LOOPBACK.has(host) && env.BRIDGE_ALLOW_REMOTE !== '1') {
    throw new Error('BRIDGE_HOST ist nicht loopback. Zum bewussten Freigeben BRIDGE_ALLOW_REMOTE=1 setzen (besser: SSH-Tunnel).');
  }

  const upstreamToken = env.UPSTREAM_TOKEN_FILE ? readFileSync(env.UPSTREAM_TOKEN_FILE, 'utf8').trim() : env.UPSTREAM_TOKEN ?? '';
  if (protocol === 'feed' && upstreamToken.length < 16) throw new Error('UPSTREAM_TOKEN fehlt oder ist kürzer als 16 Zeichen');

  return {
    upstreamUrl: env.UPSTREAM_URL ?? 'ws://127.0.0.1:39220/feed',
    upstreamToken,
    upstreamProtocol: protocol,
    coords,
    reconnectMinMs: int(env, 'UPSTREAM_RECONNECT_MIN_MS', 1000, 50, 60000),
    reconnectMaxMs: int(env, 'UPSTREAM_RECONNECT_MAX_MS', 30000, 100, 300000),
    host,
    port: int(env, 'BRIDGE_PORT', 8765, 0, 65535),
    token,
    edit: env.BRIDGE_EDIT === '1',
    editRate: int(env, 'BRIDGE_EDIT_RATE', 20, 1, 1000),
    auditLog: env.BRIDGE_AUDIT_LOG ?? './logs/edit-audit.jsonl',
    maxBuffer: int(env, 'BRIDGE_MAX_BUFFER', 1_048_576, 4096, 64 * 1024 * 1024),
    requireCanonical: true,
  };
}
