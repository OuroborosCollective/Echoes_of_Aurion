/**
 * Gemeinsame Protokolldefinition.
 *
 *   Game-Server ──aurion-feed/1──▶ Bridge ──aurion-bridge/1──▶ Godot
 *
 * Grundregel (Determinismus): Weder Bridge noch Godot verändern jemals Weltzustand.
 * Bearbeitung = EditCommand an den Server. Der Server entscheidet, validiert und
 * wendet den Command in einem seiner Ticks an. Godot sieht das Ergebnis erst im
 * nächsten Delta.
 */

export const BRIDGE_PROTO = 1;
import type { ProjectionIdentity } from './projectionIdentity.js';

export interface Vec3 {
  x: number;
  /** Höhe (Godot-Y-up). Bei reinen 2D-Welten 0. */
  y: number;
  /** Bodentiefe. In 2D-Ansicht wird z auf die Bildschirm-Y-Achse abgebildet. */
  z: number;
}

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface Entity {
  id: string;
  /** player | npc | monster | item | board | object | … (frei, kleinbuchstabig empfohlen) */
  kind: string;
  defId?: string;
  name?: string;
  pos: Vec3;
  /** Blickrichtung (Yaw) in Radiant. */
  rot?: number;
  region?: string;
  props?: Record<string, Json>;
}

export interface RegionInfo {
  id: string;
  name?: string;
  props?: Record<string, Json>;
}

/* ───────────────────────── Edit-Commands ───────────────────────── */

export type EditCommand =
  | { op: 'entity.spawn'; kind: string; defId?: string; pos: Vec3; rot?: number; props?: Record<string, Json> }
  | { op: 'entity.move'; id: string; pos: Vec3; rot?: number }
  | { op: 'entity.remove'; id: string }
  | { op: 'entity.set'; id: string; key: string; value: Json }
  /** Fadenwerk-Kopplung: Questlinie (strandKey) an NPC/Anschlagtafel hängen. */
  | { op: 'quest.attach'; strandKey: string; anchorId: string };

/* ─────────────── Feed: Game-Server ⇄ Bridge (aurion-feed/1) ─────────────── */

export type FeedClientMsg =
  | { t: 'feed.auth'; token: string }
  | { t: 'feed.cmd'; id: string; cmd: EditCommand };

export type FeedServerMsg =
  | { t: 'feed.hello'; proto: number; tick: number; worldId: string; edit: boolean }
  | { t: 'feed.snapshot'; tick: number; entities: Entity[]; regions?: RegionInfo[]; identity?: ProjectionIdentity }
  | { t: 'feed.delta'; tick: number; upsert: Entity[]; remove: string[]; identity?: ProjectionIdentity }
  | { t: 'feed.ack'; id: string; ok: boolean; error?: string; appliesAtTick?: number };

/* ─────────────── Downstream: Bridge ⇄ Godot (aurion-bridge/1) ─────────────── */

export type ClientMsg =
  | { t: 'auth'; token: string }
  | { t: 'resync' }
  | { t: 'edit'; cmdId: string; cmd: unknown }
  | { t: 'ping' };

export interface SnapshotMsg {
  t: 'snapshot';
  tick: number;
  seq: number;
  entities: Entity[];
  regions: RegionInfo[];
  identity?: ProjectionIdentity;
}

export interface DeltaMsg {
  t: 'delta';
  tick: number;
  seq: number;
  upsert: Entity[];
  remove: string[];
  identity?: ProjectionIdentity;
}

export type ServerMsg =
  | { t: 'hello'; proto: number; tick: number; seq: number; worldId: string; edit: boolean; upstream: 'up' | 'down' }
  | SnapshotMsg
  | DeltaMsg
  | { t: 'status'; upstream: 'up' | 'down'; edit?: boolean }
  | { t: 'ack'; cmdId: string; ok: boolean; tick?: number; error?: string }
  | { t: 'pong' };

/* ───────────────────────── Validierung ───────────────────────── */

const ID_RE = /^[A-Za-z0-9_.:\-]{1,64}$/;
const KIND_RE = /^[A-Za-z][A-Za-z0-9_.\-]{0,31}$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.\-]{0,47}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const COORD_LIMIT = 1_000_000;
const MAX_JSON_BYTES = 4096;

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isValidId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

export function parseVec3(v: unknown): Vec3 | null {
  if (!isRecord(v)) return null;
  const { x, y, z } = v;
  if (!finite(x) || !finite(y) || !finite(z)) return null;
  if (Math.abs(x) > COORD_LIMIT || Math.abs(y) > COORD_LIMIT || Math.abs(z) > COORD_LIMIT) return null;
  return { x, y, z };
}

/** Prüft und klont einen JSON-kompatiblen Wert (Tiefe ≤ 6, begrenzte Größen). */
export function parseJson(v: unknown, depth = 0): Json | undefined {
  if (depth > 6) return undefined;
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.length <= 1024 ? v : undefined;
  if (Array.isArray(v)) {
    if (v.length > 64) return undefined;
    const out: Json[] = [];
    for (const item of v) {
      const p = parseJson(item, depth + 1);
      if (p === undefined) return undefined;
      out.push(p);
    }
    return out;
  }
  if (isRecord(v)) {
    const keys = Object.keys(v);
    if (keys.length > 32) return undefined;
    const out: { [k: string]: Json } = {};
    for (const k of keys) {
      if (FORBIDDEN_KEYS.has(k) || !KEY_RE.test(k)) return undefined;
      const p = parseJson(v[k], depth + 1);
      if (p === undefined) return undefined;
      out[k] = p;
    }
    return out;
  }
  return undefined;
}

function parseProps(v: unknown): Record<string, Json> | undefined | null {
  if (v === undefined) return undefined;
  const p = parseJson(v);
  if (p === undefined || p === null || typeof p !== 'object' || Array.isArray(p)) return null;
  if (JSON.stringify(p).length > MAX_JSON_BYTES) return null;
  return p;
}

/**
 * Bereinigt eine Entity aus unvertrauter Quelle (Feed/Generic-Mapping).
 * Gibt null zurück, wenn Pflichtfelder fehlen oder ungültig sind.
 * Ungültige optionale Felder werden verworfen, nicht die ganze Entity.
 */
export function sanitizeEntity(raw: unknown): Entity | null {
  if (!isRecord(raw)) return null;
  if (!isValidId(raw.id)) return null;
  if (typeof raw.kind !== 'string' || !KIND_RE.test(raw.kind)) return null;
  const pos = parseVec3(raw.pos);
  if (!pos) return null;
  const e: Entity = { id: raw.id, kind: raw.kind, pos };
  if (typeof raw.defId === 'string' && raw.defId.length <= 64) e.defId = raw.defId;
  if (typeof raw.name === 'string' && raw.name.length <= 64) e.name = raw.name;
  if (finite(raw.rot)) e.rot = raw.rot;
  if (typeof raw.region === 'string' && raw.region.length <= 64) e.region = raw.region;
  const props = parseProps(raw.props);
  if (props) e.props = props;
  return e;
}

export function sanitizeRegion(raw: unknown): RegionInfo | null {
  if (!isRecord(raw) || !isValidId(raw.id)) return null;
  const r: RegionInfo = { id: raw.id };
  if (typeof raw.name === 'string' && raw.name.length <= 64) r.name = raw.name;
  const props = parseProps(raw.props);
  if (props) r.props = props;
  return r;
}

export type ParsedCommand = { ok: true; cmd: EditCommand } | { ok: false; error: string };

/** Strikte Allowlist. Wird in der Bridge UND im Feed-Modul des Servers geprüft. */
export function parseEditCommand(raw: unknown): ParsedCommand {
  if (!isRecord(raw) || typeof raw.op !== 'string') return { ok: false, error: 'bad_command' };
  const fail = (error: string): ParsedCommand => ({ ok: false, error });

  switch (raw.op) {
    case 'entity.spawn': {
      if (typeof raw.kind !== 'string' || !KIND_RE.test(raw.kind)) return fail('bad_kind');
      const pos = parseVec3(raw.pos);
      if (!pos) return fail('bad_pos');
      const cmd: EditCommand = { op: 'entity.spawn', kind: raw.kind, pos };
      if (raw.defId !== undefined) {
        if (typeof raw.defId !== 'string' || !ID_RE.test(raw.defId)) return fail('bad_defId');
        cmd.defId = raw.defId;
      }
      if (raw.rot !== undefined) {
        if (!finite(raw.rot)) return fail('bad_rot');
        cmd.rot = raw.rot;
      }
      const props = parseProps(raw.props);
      if (props === null) return fail('bad_props');
      if (props) cmd.props = props;
      return { ok: true, cmd };
    }
    case 'entity.move': {
      if (!isValidId(raw.id)) return fail('bad_id');
      const pos = parseVec3(raw.pos);
      if (!pos) return fail('bad_pos');
      const cmd: EditCommand = { op: 'entity.move', id: raw.id, pos };
      if (raw.rot !== undefined) {
        if (!finite(raw.rot)) return fail('bad_rot');
        cmd.rot = raw.rot;
      }
      return { ok: true, cmd };
    }
    case 'entity.remove': {
      if (!isValidId(raw.id)) return fail('bad_id');
      return { ok: true, cmd: { op: 'entity.remove', id: raw.id } };
    }
    case 'entity.set': {
      if (!isValidId(raw.id)) return fail('bad_id');
      if (typeof raw.key !== 'string' || !KEY_RE.test(raw.key) || FORBIDDEN_KEYS.has(raw.key)) return fail('bad_key');
      const value = parseJson(raw.value);
      if (value === undefined || JSON.stringify(value).length > MAX_JSON_BYTES) return fail('bad_value');
      return { ok: true, cmd: { op: 'entity.set', id: raw.id, key: raw.key, value } };
    }
    case 'quest.attach': {
      if (typeof raw.strandKey !== 'string' || !KEY_RE.test(raw.strandKey)) return fail('bad_strandKey');
      if (!isValidId(raw.anchorId)) return fail('bad_anchorId');
      return { ok: true, cmd: { op: 'quest.attach', strandKey: raw.strandKey, anchorId: raw.anchorId } };
    }
    default:
      return fail('unknown_op');
  }
}
