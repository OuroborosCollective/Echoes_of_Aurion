/** Owns one render loop. A failed or retired generation cannot schedule more work. */
export class RuntimeFrameLoop {
  private frame: number | null = null;
  private generation = 0;
  private running = false;

  constructor(
    private readonly step: (deltaSeconds: number) => void,
    private readonly onError: (error: unknown) => void,
    // Projection-only bound: short visible actions must span several actual render
    // frames even when software WebGL stalls. Server movement/gameplay authority is
    // independent from this client interpolation clock.
    private readonly maxDeltaSeconds = 0.05,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    let previous = performance.now();
    const tick = (time: number) => {
      if (!this.running || generation !== this.generation) return;
      this.frame = null;
      try {
        this.step(Math.max(0, Math.min((time - previous) / 1000, this.maxDeltaSeconds)));
        previous = time;
      } catch (error) {
        this.stop();
        this.onError(error);
        return;
      }
      if (this.running && generation === this.generation) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    this.generation++;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }
}
