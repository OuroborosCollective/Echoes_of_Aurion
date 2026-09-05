/**
 * Echoes of Aurion — Ledger layer
 * Design philosophy: A visible, locally persisted expedition log makes the LLM
 * partnership legible. It records only the game's own events in this browser.
 */

export type LedgerKind = "connection" | "system" | "command" | "combat" | "warning";

export type LedgerEntry = {
  id: string;
  at: string;
  sequence?: number;
  timeBasis?: "event_sequence";
  kind: LedgerKind;
  title: string;
  detail: string;
};

const LEDGER_KEY = "echoes-of-aurion.memory-ledger.v1";

function safeRead(): LedgerEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is LedgerEntry => Boolean(value) && typeof value === "object" && ["id", "at", "title", "detail"].every(key => typeof value[key] === "string") && ["connection", "system", "command", "combat", "warning"].includes(value.kind)).slice(-28);
  } catch {
    return [];
  }
}

export function readLedger(): LedgerEntry[] {
  return safeRead();
}

export function appendLedger(
  entry: Omit<LedgerEntry, "id" | "at" | "sequence" | "timeBasis">,
): LedgerEntry[] {
  const prior = safeRead();
  const sequence = Math.max(prior.length, ...prior.map(value => Number.isSafeInteger(value.sequence) && value.sequence! > 0 ? value.sequence! : 0)) + 1;
  if (!Number.isSafeInteger(sequence)) throw new Error("LEDGER_SEQUENCE_OVERFLOW");
  const next: LedgerEntry = {
    ...entry,
    id: `ledger:${sequence}`,
    at: `event:${sequence}`,
    sequence,
    timeBasis: "event_sequence",
  };
  const ledger = [...prior, next].slice(-28);
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  window.dispatchEvent(new CustomEvent("aurion:ledger-updated", { detail: ledger }));
  return ledger;
}

export function resetLedger(): void {
  localStorage.removeItem(LEDGER_KEY);
  window.dispatchEvent(new CustomEvent("aurion:ledger-updated", { detail: [] }));
}

export function exportLedger(): string {
  return JSON.stringify(
    {
      format: "echoes-of-aurion-memory-ledger",
      version: 2,
      timeBasis: "event_sequence",
      entries: safeRead(),
    },
    null,
    2,
  );
}
