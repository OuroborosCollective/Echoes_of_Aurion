export function isExplicitIsolatedWorldE2eEnvironment(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.NODE_ENV !== "test" || environment.AURION_WORLD_EPOCH_E2E !== "1" || environment.AURION_WORLD_CHUNK_E2E !== "1" || environment.AURION_WORLD_E2E_ISOLATED !== "1") return false;
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) return false;
  try {
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname).replace(/^\/+/, "").toLowerCase();
    return /(^|[_-])(e2e|test)([_-]|$)/.test(databaseName);
  } catch {
    return false;
  }
}

export function assertExplicitIsolatedWorldE2eEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  if (!isExplicitIsolatedWorldE2eEnvironment(environment)) {
    throw new Error("World E2E requires NODE_ENV=test, both world E2E flags, AURION_WORLD_E2E_ISOLATED=1, and a database name containing _e2e_ or _test_.");
  }
}
