import { isConfiguredDatabaseUrl } from "../db";

/**
 * A production Aurion process may never present an in-memory preview as the
 * canonical world authority. Local/test tooling may continue without MariaDB.
 */
export function assertProductionDatabaseConfigured(nodeEnv: string | undefined, url: string | undefined): void {
  if (nodeEnv !== "production") return;
  if (!isConfiguredDatabaseUrl(url)) {
    throw new Error("AURION_PRODUCTION_DATABASE_CONFIGURATION_REQUIRED");
  }
}

export function assertProductionDatabaseConnected(nodeEnv: string | undefined, connected: boolean): void {
  if (nodeEnv === "production" && !connected) {
    throw new Error("AURION_PRODUCTION_DATABASE_UNAVAILABLE");
  }
}
