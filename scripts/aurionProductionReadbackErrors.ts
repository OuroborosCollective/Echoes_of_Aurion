export type ReconciliationFailureStage =
  | "INITIALIZE"
  | "READ_ENVIRONMENT"
  | "READ_EXPECTED_MIGRATIONS"
  | "CONNECT_DATABASE"
  | "READ_SCHEMA_COLUMNS"
  | "READ_SCHEMA_INDEXES"
  | "READ_DRIZZLE_JOURNAL"
  | "CLOSE_DATABASE";

export type ReconciliationErrorClass =
  | "DATABASE_URL_MISSING"
  | "DATABASE_URL_INVALID"
  | "ENVIRONMENT_FILE_NOT_FOUND"
  | "ENVIRONMENT_FILE_PERMISSION_DENIED"
  | "DATABASE_HOST_UNRESOLVABLE"
  | "DATABASE_CONNECTION_REFUSED"
  | "DATABASE_CONNECTION_TIMEOUT"
  | "DATABASE_CONNECTION_LOST"
  | "DATABASE_AUTH_DENIED"
  | "DATABASE_UNKNOWN"
  | "DATABASE_ACCESS_DENIED"
  | "DATABASE_METADATA_ACCESS_DENIED"
  | "DATABASE_TLS_FAILURE"
  | "DATABASE_QUERY_CONTRACT_FAILURE"
  | "OBSERVED_IDENTIFIER_UNSAFE"
  | "RUNTIME_DEPENDENCY_MISSING"
  | "UNCLASSIFIED_READ_FAILURE";

export type SafeReconciliationFailure = {
  failureStage: ReconciliationFailureStage;
  errorClass: ReconciliationErrorClass;
  retryable: boolean;
};

export class ReconciliationBoundaryError extends Error {
  readonly errorClass: ReconciliationErrorClass;
  readonly retryable: boolean;

  constructor(errorClass: ReconciliationErrorClass, retryable = false) {
    super(errorClass);
    this.name = "ReconciliationBoundaryError";
    this.errorClass = errorClass;
    this.retryable = retryable;
  }
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const value = String((error as { code?: unknown }).code ?? "").trim();
  return /^[A-Z0-9_]{1,80}$/.test(value) ? value : "";
}

export function classifyReconciliationFailure(
  error: unknown,
  failureStage: ReconciliationFailureStage,
): SafeReconciliationFailure {
  if (error instanceof ReconciliationBoundaryError) {
    return {
      failureStage,
      errorClass: error.errorClass,
      retryable: error.retryable,
    };
  }

  const code = errorCode(error);
  if (failureStage === "READ_ENVIRONMENT") {
    if (code === "ENOENT") {
      return { failureStage, errorClass: "ENVIRONMENT_FILE_NOT_FOUND", retryable: false };
    }
    if (code === "EACCES" || code === "EPERM") {
      return {
        failureStage,
        errorClass: "ENVIRONMENT_FILE_PERMISSION_DENIED",
        retryable: false,
      };
    }
  }

  const mapped: Partial<Record<string, Omit<SafeReconciliationFailure, "failureStage">>> = {
    ENOTFOUND: { errorClass: "DATABASE_HOST_UNRESOLVABLE", retryable: true },
    EAI_AGAIN: { errorClass: "DATABASE_HOST_UNRESOLVABLE", retryable: true },
    ECONNREFUSED: { errorClass: "DATABASE_CONNECTION_REFUSED", retryable: true },
    ETIMEDOUT: { errorClass: "DATABASE_CONNECTION_TIMEOUT", retryable: true },
    PROTOCOL_SEQUENCE_TIMEOUT: { errorClass: "DATABASE_CONNECTION_TIMEOUT", retryable: true },
    PROTOCOL_CONNECTION_LOST: { errorClass: "DATABASE_CONNECTION_LOST", retryable: true },
    ECONNRESET: { errorClass: "DATABASE_CONNECTION_LOST", retryable: true },
    ER_ACCESS_DENIED_ERROR: { errorClass: "DATABASE_AUTH_DENIED", retryable: false },
    ER_BAD_DB_ERROR: { errorClass: "DATABASE_UNKNOWN", retryable: false },
    ER_DBACCESS_DENIED_ERROR: { errorClass: "DATABASE_ACCESS_DENIED", retryable: false },
    ER_TABLEACCESS_DENIED_ERROR: {
      errorClass: "DATABASE_METADATA_ACCESS_DENIED",
      retryable: false,
    },
    ER_SPECIFIC_ACCESS_DENIED_ERROR: {
      errorClass: "DATABASE_METADATA_ACCESS_DENIED",
      retryable: false,
    },
    ER_PARSE_ERROR: { errorClass: "DATABASE_QUERY_CONTRACT_FAILURE", retryable: false },
    ERR_INVALID_URL: { errorClass: "DATABASE_URL_INVALID", retryable: false },
    ERR_INVALID_ARG_TYPE: { errorClass: "DATABASE_URL_INVALID", retryable: false },
    CERT_HAS_EXPIRED: { errorClass: "DATABASE_TLS_FAILURE", retryable: false },
    DEPTH_ZERO_SELF_SIGNED_CERT: { errorClass: "DATABASE_TLS_FAILURE", retryable: false },
    SELF_SIGNED_CERT_IN_CHAIN: { errorClass: "DATABASE_TLS_FAILURE", retryable: false },
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: {
      errorClass: "DATABASE_TLS_FAILURE",
      retryable: false,
    },
    MODULE_NOT_FOUND: { errorClass: "RUNTIME_DEPENDENCY_MISSING", retryable: false },
    ERR_MODULE_NOT_FOUND: { errorClass: "RUNTIME_DEPENDENCY_MISSING", retryable: false },
  };
  const classified = mapped[code];
  if (classified) return { failureStage, ...classified };

  return {
    failureStage,
    errorClass: "UNCLASSIFIED_READ_FAILURE",
    retryable: false,
  };
}
