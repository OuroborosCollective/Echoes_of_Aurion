import type { WorldPresenceSink } from "./zoneGateway";

/** One write in flight; release runs after that write and cannot be undone by a late refresh. */
export class ZonePresenceLifecycle {
  private pending?: Promise<unknown>;
  private closing?: Promise<unknown>;
  private closed = false;
  constructor(private readonly sink: WorldPresenceSink, private readonly identity: { userId: number; connectionId: string; zoneId: "observatory_threshold" }) {}
  async refresh(position: { x: number; z: number }): Promise<void> {
    if (this.closed || this.pending) return;
    const captured = { ...position };
    const pending = Promise.resolve().then(() => this.closed ? undefined : this.sink.upsert({ ...this.identity, position: captured }));
    this.pending = pending;
    try { await pending; } finally { if (this.pending === pending) this.pending = undefined; }
  }
  close(): Promise<unknown> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = (this.pending ?? Promise.resolve()).catch(() => undefined).then(() => this.sink.release({ connectionId: this.identity.connectionId }));
    return this.closing;
  }
}
