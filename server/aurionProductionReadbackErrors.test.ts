import { describe, expect, it } from "vitest";
import {
  classifyReconciliationFailure,
  ReconciliationBoundaryError,
} from "../scripts/aurionProductionReadbackErrors";

describe("Aurion production readback error taxonomy", () => {
  it("reports an explicit missing database URL without exposing input", () => {
    const result = classifyReconciliationFailure(
      new ReconciliationBoundaryError("DATABASE_URL_MISSING"),
      "READ_ENVIRONMENT",
    );
    expect(result).toEqual({
      failureStage: "READ_ENVIRONMENT",
      errorClass: "DATABASE_URL_MISSING",
      retryable: false,
    });
  });

  it("maps connection refusal and excludes the raw message from the receipt surface", () => {
    const result = classifyReconciliationFailure(
      {
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED mysql://user:secret@private-host:3306/database",
        host: "private-host",
        user: "user",
      },
      "CONNECT_DATABASE",
    );
    expect(result).toEqual({
      failureStage: "CONNECT_DATABASE",
      errorClass: "DATABASE_CONNECTION_REFUSED",
      retryable: true,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("private-host");
    expect(serialized).not.toContain("mysql://");
  });

  it("distinguishes environment, DNS and authentication boundaries", () => {
    expect(classifyReconciliationFailure({ code: "ENOENT" }, "READ_ENVIRONMENT")).toEqual({
      failureStage: "READ_ENVIRONMENT",
      errorClass: "ENVIRONMENT_FILE_NOT_FOUND",
      retryable: false,
    });
    expect(classifyReconciliationFailure({ code: "ENOTFOUND" }, "CONNECT_DATABASE")).toEqual({
      failureStage: "CONNECT_DATABASE",
      errorClass: "DATABASE_HOST_UNRESOLVABLE",
      retryable: true,
    });
    expect(
      classifyReconciliationFailure({ code: "ER_ACCESS_DENIED_ERROR" }, "CONNECT_DATABASE"),
    ).toEqual({
      failureStage: "CONNECT_DATABASE",
      errorClass: "DATABASE_AUTH_DENIED",
      retryable: false,
    });
  });

  it("fails closed for unknown or unsafe driver codes", () => {
    expect(
      classifyReconciliationFailure(
        { code: "BAD-CODE; mysql://secret", message: "do not expose" },
        "READ_SCHEMA_COLUMNS",
      ),
    ).toEqual({
      failureStage: "READ_SCHEMA_COLUMNS",
      errorClass: "UNCLASSIFIED_READ_FAILURE",
      retryable: false,
    });
  });
});
