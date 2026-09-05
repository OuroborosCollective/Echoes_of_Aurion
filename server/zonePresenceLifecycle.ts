import type { WorldPresenceSink } from "./zoneGateway";
import { splitWorldChunkPositionMm } from "@shared/worldChunkProtocol";

/** One write in flight; release runs after that write and cannot be undone by a late refresh. */
export class ZonePresenceLifecycle {
  private pending?: Promise<unknown>;
  private closing?: Promise<unknown>;
  private closed = false;
  private queued?: { x: number; z: number };
  private observed?: { x: number; z: number };
  private wasMoving = false;
  constructor(private readonly sink: WorldPresenceSink, private readonly identity: { userId: number; connectionId: string; zoneId: "observatory_threshold" }) {}
  /** Observe each authoritative tick; crossing and stopping must not wait for the lease heartbeat. */
  observe(position: { x: number; z: number }): Promise<unknown> | undefined {
    const previous = this.observed;
    this.observed = { ...position };
    if (!previous || this.closed) return;
    const moving = position.x !== previous.x || position.z !== previous.z;
    const before = splitWorldChunkPositionMm(previous).coordinate;
    const after = splitWorldChunkPositionMm(position).coordinate;
    const needsWrite = before.x !== after.x || before.z !== after.z || (!moving && this.wasMoving);
    this.wasMoving = moving;
    if (needsWrite) return this.refresh(position);
  }
  async refresh(position: { x: number; z: number }): Promise<void> {
    if (this.closed) return;
    this.observed ??= { ...position };
    this.queued = { ...position };
    if (this.pending) { await this.pending; return; }
    const pending = Promise.resolve().then(async () => {
      while (!this.closed && this.queued) {
        const captured = this.queued;
        this.queued = undefined;
        await this.sink.upsert({ ...this.identity, position: captured });
      }
    });
    this.pending = pending;
    try { await pending; } finally { if (this.pending === pending) this.pending = undefined; }
  }
  close(): Promise<unknown> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.queued = undefined;
    this.closing = (this.pending ?? Promise.resolve()).catch(() => undefined).then(() => this.sink.release({ connectionId: this.identity.connectionId }));
    return this.closing;
  }
}
