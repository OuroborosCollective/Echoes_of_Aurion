/**
 * Echoes of Aurion — Ledger layer
 * Design philosophy: A visible, locally persisted expedition log makes the LLM
 * partnership legible. It records only the game's own events in this browser.
 */

export type LedgerKind = "connection" | "system" | "command" | "combat" | "warning";

export type LedgerEntry = {
  id: string;
  at: string;
  kind: LedgerKind;
  title: string;
  detail: string;
};

const LEDGER_KEY = "echoes-of-aurion.memory-ledger.v1";

function safeRead(): LedgerEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? "[]") as LedgerEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readLedger(): LedgerEntry[] {
  return safeRead();
}

export function appendLedger(
  entry: Omit<LedgerEntry, "id" | "at">,
): LedgerEntry[] {
  const next: LedgerEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
  };
  const ledger = [...safeRead(), next].slice(-28);
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
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: safeRead(),
    },
    null,
    2,
  );
}
