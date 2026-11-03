import { describe, expect, it } from "vitest";
import { CausalReceiptConflictError, RECEIPT_COMPARISON_FIELDS, receiptMismatchFields, type ReceiptComparison } from "./receiptConflictDiagnostics";

describe("redacted receipt conflict diagnostics", () => {
  const base = Object.fromEntries(RECEIPT_COMPARISON_FIELDS.map(field => [field, field === "tick" ? 1 : field === "inputJson" ? null : "original"])) as ReceiptComparison;
  it("retains strict equality across every field of the original persistence contract", () => {
    expect(receiptMismatchFields(base, { ...base })).toEqual([]);
    for (const field of RECEIPT_COMPARISON_FIELDS) expect(receiptMismatchFields(base, { ...base, [field]: "different" })).toEqual([field]);
    expect(receiptMismatchFields(base, { ...base, inputJson: "null" })).toEqual(["inputJson"]);
  });
  it("retains the conflict message but never includes raw rows, SQL, hashes or arbitrary driver text", () => {
    const driver = { cause: { code: "ER_DUP_ENTRY", sql: "PRIVATE SQL", message: "PRIVATE VALUES" } };
    const error = new CausalReceiptConflictError("receipt-id", ["revision", "receiptHash"], driver);
    expect(error.message).toBe("CAUSAL_RECEIPT_CONFLICT:receipt-id");
    expect(error.diagnostics.insertErrorCode).toBe("ER_DUP_ENTRY");
    expect(JSON.stringify(error)).not.toMatch(/PRIVATE|cause|sql/);
    expect(Object.isFrozen(error.diagnostics.mismatchFields)).toBe(true);
    expect(new CausalReceiptConflictError("id", [], { code: "PRIVATE" }).diagnostics.insertErrorCode).toBe("UNCLASSIFIED");
    const cyclic: any = {}; cyclic.cause = cyclic;
    expect(new CausalReceiptConflictError("id", [], cyclic).diagnostics.insertErrorCode).toBe("UNCLASSIFIED");
  });
});
