import { afterEach, describe, expect, it, vi } from "vitest";
import { MariaDBCausalPersistenceAdapter } from "./persistence";
import { restorePersistedZoneHead } from "./persistedZoneRecovery";
import { AurionTickRecorder } from "./tickRecorder";
import { ZoneRegistry } from "../zoneRuntime";

afterEach(() => vi.unstubAllEnvs());

describe("cold zone recovery when MariaDB is unavailable", () => {
  it("rejects instead of registering a fresh tick-zero zone when DATABASE_URL is missing", async () => {
    // No fake database or injected receipt: exercise the production adapter's
    // real unconfigured-DB path, isolated from any production DB.
    vi.stubEnv("DATABASE_URL", "");
    const registry = new ZoneRegistry();
    const adapter = new MariaDBCausalPersistenceAdapter();
    const recorder = new AurionTickRecorder(20, adapter);
    const zoneId = "observatory_threshold";

    const recover = (id: typeof zoneId) => restorePersistedZoneHead(id, adapter, recorder);
    await expect(registry.getOrRecover(zoneId, recover)).rejects.toThrow("CAUSAL_DATABASE_UNAVAILABLE");
    expect(registry.find(zoneId)).toBeUndefined();
  });
});
