import type { AurionGameplayCommand } from "./aurionAuthorityAdapter";

export const WORLD_PANEL_SELECTOR = '[data-aurion-panel="open"], [role="dialog"][data-state="open"], .community-overlay[data-opened-from-world="true"]';
export type ActionOutcome = { confirmed: boolean; completed: boolean; message: string };
export type ActionCompletion = (outcome: ActionOutcome) => void;

/** A UI request carries no sequence or outcome. Only Home's real HTTP/readback path settles it. */
export function requestConfirmedAction(command: AurionGameplayCommand): Promise<ActionOutcome> {
  return new Promise(resolve => {
    let finished = false;
    const timeout = window.setTimeout(() => finish({ confirmed: false, completed: false, message: "Keine Bestätigung erhalten. Auto-Angriff wurde angehalten." }), 20_000);
    const finish: ActionCompletion = outcome => { if (!finished) { finished = true; window.clearTimeout(timeout); resolve(outcome); } };
    window.dispatchEvent(new CustomEvent("aurion:request-action", { detail: { command, source: "human", complete: finish } }));
  });
}

/** Timers schedule requests only. This controller cannot infer damage, issue receipts or retry a lost action. */
export class ConfirmedAutoAttack {
  private active = false;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private request: () => Promise<ActionOutcome>, private permitted: () => boolean, private changed: (active: boolean, message?: string) => void) {}
  start() {
    if (this.active || this.busy || !this.permitted()) return;
    this.active = true;
    this.changed(true);
    void this.step();
  }
  stop(message?: string) {
    this.active = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.changed(false, message);
  }
  private async step() {
    if (!this.active || this.busy || !this.permitted()) { this.stop(); return; }
    this.busy = true;
    try {
      const outcome = await this.request();
      if (!outcome.confirmed || outcome.completed) this.stop(outcome.message);
    } catch { this.stop("Auto-Angriff nach fehlender Bestätigung angehalten."); }
    finally {
      this.busy = false;
      if (this.active && this.permitted()) this.timer = setTimeout(() => { void this.step(); }, 1_100);
      else this.stop();
    }
  }
}
