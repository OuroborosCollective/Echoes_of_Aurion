export type AurionProductionReadbackFailureCategory =
  | "SOURCE_REVISION_INVALID"
  | "ENVIRONMENT_FILE_UNREADABLE"
  | "DATABASE_URL_MISSING"
  | "DATABASE_URL_INVALID"
  | "DATABASE_DNS_UNRESOLVED"
  | "DATABASE_CONNECTION_REFUSED"
  | "DATABASE_CONNECTION_TIMEOUT"
  | "DATABASE_CONNECTION_LOST"
  | "DATABASE_ACCESS_DENIED"
  | "DATABASE_UNKNOWN"
  | "DATABASE_TLS_FAILURE"
  | "DATABASE_CAPACITY_EXHAUSTED"
  | "DATABASE_QUERY_FAILED"
  | "RUNTIME_MODULE_MISSING"
  | "UNKNOWN_ERROR";

export type AurionProductionReadbackFailure = Readonly<{
  category: AurionProductionReadbackFailureCategory;
  driverCode: string | null;
}>;

const knownDriverCategories = new Map<string, AurionProductionReadbackFailureCategory>([
  ["ENOENT", "ENVIRONMENT_FILE_UNREADABLE"],
  ["ERR_INVALID_URL", "DATABASE_URL_INVALID"],
  ["ENOTFOUND", "DATABASE_DNS_UNRESOLVED"],
  ["EAI_AGAIN", "DATABASE_DNS_UNRESOLVED"],
  ["ECONNREFUSED", "DATABASE_CONNECTION_REFUSED"],
  ["ETIMEDOUT", "DATABASE_CONNECTION_TIMEOUT"],
  ["ECONNRESET", "DATABASE_CONNECTION_LOST"],
  ["PROTOCOL_CONNECTION_LOST", "DATABASE_CONNECTION_LOST"],
  ["ER_ACCESS_DENIED_ERROR", "DATABASE_ACCESS_DENIED"],
  ["ER_DBACCESS_DENIED_ERROR", "DATABASE_ACCESS_DENIED"],
  ["ER_TABLEACCESS_DENIED_ERROR", "DATABASE_ACCESS_DENIED"],
  ["ER_BAD_DB_ERROR", "DATABASE_UNKNOWN"],
  ["HANDSHAKE_SSL_ERROR", "DATABASE_TLS_FAILURE"],
  ["ERR_TLS_CERT_ALTNAME_INVALID", "DATABASE_TLS_FAILURE"],
  ["CERT_HAS_EXPIRED", "DATABASE_TLS_FAILURE"],
  ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DATABASE_TLS_FAILURE"],
  ["ER_CON_COUNT_ERROR", "DATABASE_CAPACITY_EXHAUSTED"],
  ["ER_TOO_MANY_USER_CONNECTIONS", "DATABASE_CAPACITY_EXHAUSTED"],
  ["ER_NO_SUCH_TABLE", "DATABASE_QUERY_FAILED"],
  ["ER_BAD_FIELD_ERROR", "DATABASE_QUERY_FAILED"],
  ["ER_PARSE_ERROR", "DATABASE_QUERY_FAILED"],
  ["MODULE_NOT_FOUND", "RUNTIME_MODULE_MISSING"],
  ["ERR_MODULE_NOT_FOUND", "RUNTIME_MODULE_MISSING"],
]);

function errorRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === "object" && error !== null ? error as Record<string, unknown> : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const record = errorRecord(error);
  return typeof record?.message === "string" ? record.message : "";
}

export function classifyAurionProductionReadbackFailure(error: unknown): AurionProductionReadbackFailure {
  const message = errorMessage(error);
  if (message === "DATABASE_URL is required for read-only schema reconciliation") {
    return { category: "DATABASE_URL_MISSING", driverCode: null };
  }
  if (message === "DATABASE_URL in reconciliation environment is invalid") {
    return { category: "DATABASE_URL_INVALID", driverCode: null };
  }
  if (message === "AURION_RECONCILIATION_SOURCE_SHA must be a 40-character lowercase Git SHA") {
    return { category: "SOURCE_REVISION_INVALID", driverCode: null };
  }

  const record = errorRecord(error);
  const rawCode = typeof record?.code === "string" ? record.code : "";
  const category = knownDriverCategories.get(rawCode);
  if (category) return { category, driverCode: rawCode };

  return { category: "UNKNOWN_ERROR", driverCode: null };
}
