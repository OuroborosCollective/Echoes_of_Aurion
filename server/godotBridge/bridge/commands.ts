import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { operationalNow, operationalDate, hostOperationalClock, type OperationalClock } from '../../../shared/operationalClock.js';
import type { Logger } from './log.js';

interface Bucket {
  tokens: number;
  ts: number;
}

/** Rate-Limit (Token-Bucket pro Client) + Audit-Log (JSON-Lines) für Edit-Commands. */
export class CommandGate {
  private readonly buckets = new Map<string, Bucket>();
  private dirReady = false;

  constructor(
    private readonly opts: { ratePerSec: number; auditPath?: string },
    private readonly log: Logger,
    private readonly clock: OperationalClock = hostOperationalClock,
  ) {}

  allow(clientId: string): boolean {
    const now = operationalNow(this.clock);
    const burst = Math.max(5, this.opts.ratePerSec);
    const b = this.buckets.get(clientId) ?? { tokens: burst, ts: now };
    b.tokens = Math.min(burst, b.tokens + ((now - b.ts) / 1000) * this.opts.ratePerSec);
    b.ts = now;
    this.buckets.set(clientId, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  forget(clientId: string): void {
    this.buckets.delete(clientId);
  }

  audit(entry: Record<string, unknown>): void {
    const path = this.opts.auditPath;
    if (!path) return;
    void (async () => {
      try {
        if (!this.dirReady) {
          await mkdir(dirname(path), { recursive: true });
          this.dirReady = true;
        }
        await appendFile(path, JSON.stringify({ ts: operationalDate(this.clock).toISOString(), ...entry }) + '\n', 'utf8');
      } catch (err) {
        this.log('warn', `audit-log nicht schreibbar: ${String(err)}`);
      }
    })();
  }
}
