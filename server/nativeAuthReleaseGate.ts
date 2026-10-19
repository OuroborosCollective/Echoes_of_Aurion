/**
 * Explicit operator release gate for Aurion-native browser authentication.
 * Never infer approval from a green CI run or a present database URL.
 */
export function nativeAuthProductionReady(
  env: Record<string, string | undefined>,
  databaseReady: boolean,
): boolean {
  if (env.NATIVE_AUTH_RELEASE_ENABLED !== "true" || !databaseReady) return false;
  const encoded = env.NATIVE_AUTH_STATE_SEAL_KEY;
  if (!encoded || !/^[A-Za-z0-9_-]{43}$/.test(encoded)) return false;
  const key = Buffer.from(encoded, "base64url");
  return key.length === 32 && key.toString("base64url") === encoded;
}
