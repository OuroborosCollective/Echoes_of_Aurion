import { describe, expect, it } from "vitest";
import { classifyAurionProductionReadbackFailure } from "../scripts/aurionProductionReadbackFailure";

describe("Aurion production readback failure classification", () => {
  it("classifies repository-owned configuration failures without echoing values", () => {
    expect(classifyAurionProductionReadbackFailure(new Error("DATABASE_URL is required for read-only schema reconciliation"))).toEqual({
      category: "DATABASE_URL_MISSING",
      driverCode: null,
    });
    expect(classifyAurionProductionReadbackFailure(new Error("DATABASE_URL in reconciliation environment is invalid"))).toEqual({
      category: "DATABASE_URL_INVALID",
      driverCode: null,
    });
  });

  it.each([
    ["ENOTFOUND", "DATABASE_DNS_UNRESOLVED"],
    ["ECONNREFUSED", "DATABASE_CONNECTION_REFUSED"],
    ["ETIMEDOUT", "DATABASE_CONNECTION_TIMEOUT"],
    ["ER_ACCESS_DENIED_ERROR", "DATABASE_ACCESS_DENIED"],
    ["ER_BAD_DB_ERROR", "DATABASE_UNKNOWN"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "DATABASE_TLS_FAILURE"],
    ["ER_CON_COUNT_ERROR", "DATABASE_CAPACITY_EXHAUSTED"],
    ["ER_NO_SUCH_TABLE", "DATABASE_QUERY_FAILED"],
    ["MODULE_NOT_FOUND", "RUNTIME_MODULE_MISSING"],
  ])("maps allowlisted driver code %s to %s", (code, category) => {
    expect(classifyAurionProductionReadbackFailure(Object.assign(new Error("sensitive target and credential text"), { code }))).toEqual({
      category,
      driverCode: code,
    });
  });

  it("fails closed without returning unknown codes or messages", () => {
    const result = classifyAurionProductionReadbackFailure(Object.assign(new Error("mysql://user:password@private-host/database"), {
      code: "SOME_UNEXPECTED_DRIVER_CODE",
    }));
    expect(result).toEqual({ category: "UNKNOWN_ERROR", driverCode: null });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("private-host");
    expect(serialized).not.toContain("SOME_UNEXPECTED_DRIVER_CODE");
  });
});
