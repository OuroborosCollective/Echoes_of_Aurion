import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixedOperationalClock } from '../../shared/operationalClock';
import { CommandGate } from './bridge/commands';
import { createLogger, silentLogger } from './bridge/log';

afterEach(() => vi.restoreAllMocks());

describe('Godot bridge operational I/O boundary (not simulation time)', () => {
  it('replays token-bucket decisions from explicit samples without a host clock', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('ambient clock forbidden'); });
    const replay = () => {
      let now = 1_800_000_000_000;
      const gate = new CommandGate({ ratePerSec: 2 }, silentLogger, { now: () => now });
      const decisions = Array.from({ length: 6 }, () => gate.allow('fixture-client'));
      now += 1000;
      decisions.push(gate.allow('fixture-client'), gate.allow('fixture-client'), gate.allow('fixture-client'));
      return decisions;
    };
    const expected = [true, true, true, true, true, false, true, true, false];
    expect(replay()).toEqual(expected);
    expect(replay()).toEqual(expected);
  });

  it('writes logger timestamps from the injected sample without a host clock', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('ambient clock forbidden'); });
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    createLogger(fixedOperationalClock(0))('info', 'isolated operational fixture');
    expect(JSON.parse(output.mock.calls[0][0])).toEqual({
      ts: '1970-01-01T00:00:00.000Z', level: 'info', msg: 'isolated operational fixture',
    });
  });

  it('persists the supplied operational audit timestamp to a real temporary file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aurion-bridge-clock-test-'));
    try {
      const path = join(dir, 'audit.jsonl');
      const gate = new CommandGate({ ratePerSec: 2, auditPath: path }, silentLogger, fixedOperationalClock(0));
      gate.audit({ fixture: 'operational-only' });
      await vi.waitFor(async () => expect(JSON.parse((await readFile(path, 'utf8')).trim())).toEqual({
        ts: '1970-01-01T00:00:00.000Z', fixture: 'operational-only',
      }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
