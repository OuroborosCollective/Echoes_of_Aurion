import type { RequestHandler } from "express";

/** Aggregated operational telemetry only: no peer identity, request data or decisions. */
export type GatewayObservation = Readonly<{
  schema: "aurion.gateway-observation.v1";
  windowStartedAt: string;
  windowEndedAt: string;
  http: Readonly<{ nativeAuth: number; browserAuth: number; admin: number }>;
  handshakes: Readonly<{ opened: number; completed: number; closed: number; pending: number; peakPending: number }>;
}>;
type Counts = { nativeAuth: number; browserAuth: number; admin: number };
const REPORT_MS = 60_000;
const add = (value: number) => Math.min(Number.MAX_SAFE_INTEGER, value + 1);

/** Classify only stable, public route families. Query strings and headers are never read. */
function category(path: string): keyof Counts | undefined {
  if (path === "/api/native-auth" || path.startsWith("/api/native-auth/")) return "nativeAuth";
  if (path === "/api/oauth" || path.startsWith("/api/oauth/") || /^\/api\/trpc\/auth\.(loginLocal|registerLocal)$/.test(path)) return "browserAuth";
  if (path === "/api/admin" || path.startsWith("/api/admin/")) return "admin";
  return undefined;
}

export class DefensiveGatewayObserver {
  private http: Counts = { nativeAuth: 0, browserAuth: 0, admin: 0 };
  private pending = 0;
  private peakPending = 0;
  private opened = 0;
  private completed = 0;
  private closed = 0;
  private windowStart = new Date();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly enabled: boolean, private readonly sink: (event: GatewayObservation) => void = event => console.info("[Aurion Gateway Observation]", JSON.stringify(event))) {}

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => this.flush(), REPORT_MS);
    this.timer.unref();
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  readonly httpMiddleware: RequestHandler = (req, _res, next) => {
    if (this.enabled) {
      // originalUrl can include user-supplied queries; req.path excludes them.
      try {
        const group = category(req.path);
        if (group) this.http[group] = add(this.http[group]);
      } catch { /* Request handling never depends on telemetry. */ }
    }
    next();
  };
  beginHandshake(): (result: "completed" | "closed") => void {
    if (!this.enabled) return () => {};
    this.opened = add(this.opened);
    this.pending = add(this.pending);
    this.peakPending = Math.max(this.peakPending, this.pending);
    let finished = false;
    return result => {
      if (finished) return;
      finished = true;
      this.pending = Math.max(0, this.pending - 1);
      if (result === "completed") this.completed = add(this.completed);
      else this.closed = add(this.closed);
    };
  }
  /** One bounded event per minute; sink failures never reach the request path. */
  flush(): void {
    if (!this.enabled) return;
    const now = new Date();
    const event: GatewayObservation = Object.freeze({ schema: "aurion.gateway-observation.v1", windowStartedAt: this.windowStart.toISOString(), windowEndedAt: now.toISOString(),
      http: Object.freeze({ ...this.http }), handshakes: Object.freeze({ opened: this.opened, completed: this.completed, closed: this.closed, pending: this.pending, peakPending: this.peakPending }) });
    this.http = { nativeAuth: 0, browserAuth: 0, admin: 0 };
    this.opened = 0; this.completed = 0; this.closed = 0; this.peakPending = this.pending; this.windowStart = now;
    try { this.sink(event); } catch { /* Observation must not influence service. */ }
  }
}

/** Explicit opt-in; deployment remains disabled until infrastructure review. */
export const defensiveGatewayObserver = new DefensiveGatewayObserver(process.env.AURION_GATEWAY_OBSERVE_ONLY === "true");
