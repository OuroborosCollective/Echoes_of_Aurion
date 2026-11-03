/** Diagnostic projection only: preserves exact historical receipt equality. */
export const RECEIPT_COMPARISON_FIELDS = [
  "worldId", "zoneId", "tick", "revision", "rulesetVersion", "receiptSchema",
  "preStateHash", "inputHash", "inputJson", "stageReceiptsJson", "transitionHash",
  "rngRootHash", "postStateHash", "previousReceiptHash", "receiptHash",
] as const;
type Field = typeof RECEIPT_COMPARISON_FIELDS[number];
export type ReceiptComparison = Readonly<Record<Field, string | number | null>>;

export function receiptMismatchFields(stored: ReceiptComparison, attempted: ReceiptComparison): readonly Field[] {
  return Object.freeze(RECEIPT_COMPARISON_FIELDS.filter(field => stored[field] !== attempted[field]));
}

function databaseErrorCode(error: unknown): string {
  // Drizzle wraps the driver error. Never serialize SQL, parameters, messages or
  // arbitrary driver codes into the redacted diagnostic payload.
  let current = error;
  const allowed = new Set(["ER_DUP_ENTRY", "ER_LOCK_WAIT_TIMEOUT", "ER_LOCK_DEADLOCK", "ER_DATA_TOO_LONG"]);
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const value = current as { code?: unknown; cause?: unknown };
    if (typeof value.code === "string" && allowed.has(value.code)) return value.code;
    current = value.cause;
  }
  return "UNCLASSIFIED";
}

export class CausalReceiptConflictError extends Error {
  readonly diagnostics: Readonly<{ schema: "aurion.receipt-conflict-diagnostic.v1"; mismatchFields: readonly Field[]; insertErrorCode: string }>;
  constructor(id: string, mismatchFields: readonly Field[], insertError: unknown) {
    super(`CAUSAL_RECEIPT_CONFLICT:${id}`);
    this.name = "CausalReceiptConflictError";
    this.diagnostics = Object.freeze({ schema: "aurion.receipt-conflict-diagnostic.v1", mismatchFields: Object.freeze([...mismatchFields]), insertErrorCode: databaseErrorCode(insertError) });
  }
}
