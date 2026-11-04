import { operationalDate } from "../shared/operationalClock";

/**
 * Operational readback for live zone admission. Production 2026-11-04: every
 * handshake failed with ZONE_PRESENCE_RECOVERY_REQUIRED for 13 hours while
 * /healthz stayed green. This makes such a lock visible in health and logs.
 * Aggregated only: no user identity, ticket or connection id is retained.
 */
export type ZoneBootSettlement = "pending" | "settled" | "failed" | "timed_out" | "not_run";
export type ZoneJoinHealthReadback = Readonly<{
  schema: "aurion.zone-join-health.v1";
  status: "unknown" | "ok" | "failing";
  consecutiveFailures: number;
  failuresTotal: number;
  lastFailureCode: string | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  bootSettlement: ZoneBootSettlement;
  bootSettlementCode: string | null;
  orphanedLeasesReleased: number | null;
}>;

const CODE = /^[A-Z][A-Z0-9_:]{0,95}$/;
const add = (value: number) => Math.min(Number.MAX_SAFE_INTEGER, value + 1);

/** Only stable machine codes are reported; free-form messages could carry data. */
export function zoneFailureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return CODE.test(message) ? message : "UNCLASSIFIED";
}

export class ZoneJoinHealthMonitor {
  private consecutiveFailures = 0;
  private failuresTotal = 0;
  private lastFailureCode: string | null = null;
  private lastFailureAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private bootSettlement: ZoneBootSettlement = "not_run";
  private bootSettlementCode: string | null = null;
  private orphanedLeasesReleased: number | null = null;

  constructor(
    private readonly warn: (line: string) => void = line => console.error(line),
    private readonly info: (line: string) => void = line => console.info(line),
    private readonly now: () => Date = operationalDate,
  ) {}

  joined(): void {
    if (this.consecutiveFailures > 0) {
      this.info(`[Aurion Zone] JOIN_RECOVERED ${JSON.stringify({ afterFailures: this.consecutiveFailures, lastFailureCode: this.lastFailureCode })}`);
    }
    this.consecutiveFailures = 0;
    this.lastSuccessAt = this.now().toISOString();
  }

  /** Server-side admission failure (not an invalid ticket). Logged on the first failure and every 100th after. */
  failed(error: unknown): string {
    const code = zoneFailureCode(error);
    this.consecutiveFailures = add(this.consecutiveFailures);
    this.failuresTotal = add(this.failuresTotal);
    const changed = code !== this.lastFailureCode;
    this.lastFailureCode = code;
    this.lastFailureAt = this.now().toISOString();
    if (this.consecutiveFailures === 1 || changed || this.consecutiveFailures % 100 === 0) {
      this.warn(`[Aurion Zone] JOIN_FAILING ${JSON.stringify({ code, consecutiveFailures: this.consecutiveFailures })}`);
    }
    return code;
  }

  bootSettlementStarted(): void { this.bootSettlement = "pending"; this.bootSettlementCode = null; }
  bootSettlementFinished(result: { status: Exclude<ZoneBootSettlement, "pending" | "not_run">; code?: string | null; orphanedLeasesReleased?: number | null }): void {
    this.bootSettlement = result.status;
    this.bootSettlementCode = result.code ?? null;
    if (result.orphanedLeasesReleased !== undefined) this.orphanedLeasesReleased = result.orphanedLeasesReleased;
  }

  readback(): ZoneJoinHealthReadback {
    return Object.freeze({
      schema: "aurion.zone-join-health.v1",
      status: this.consecutiveFailures > 0 ? "failing" : this.lastSuccessAt ? "ok" : "unknown",
      consecutiveFailures: this.consecutiveFailures,
      failuresTotal: this.failuresTotal,
      lastFailureCode: this.lastFailureCode,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
      bootSettlement: this.bootSettlement,
      bootSettlementCode: this.bootSettlementCode,
      orphanedLeasesReleased: this.orphanedLeasesReleased,
    });
  }
}

export const globalZoneJoinHealth = new ZoneJoinHealthMonitor();
