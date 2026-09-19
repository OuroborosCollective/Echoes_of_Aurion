import { describe, expect, it } from "vitest";
import {
  causalCheckpointPersistenceId,
  causalReceiptPersistenceId,
} from "./persistence";

describe("causal persistence identities", () => {
  it("keeps receipt IDs deterministic and within varchar(64) for maximum persisted identities", () => {
    const identity = {
      worldId: "w".repeat(64),
      zoneId: "z".repeat(64),
      tick: 2_147_483_647,
    };
    const first = causalReceiptPersistenceId(identity as any);
    const second = causalReceiptPersistenceId(identity as any);
    expect(first).toBe(second);
    expect(first).toMatch(/^rcpt_[a-f0-9]{56}$/);
    expect(first.length).toBeLessThanOrEqual(64);
  });

  it("keeps checkpoint IDs deterministic and within varchar(64)", () => {
    const id = causalCheckpointPersistenceId(
      "w".repeat(64),
      "z".repeat(64),
      2_147_483_647,
    );
    expect(id).toMatch(/^chk_[a-f0-9]{56}$/);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("changes the persistence identity when any canonical natural-key component changes", () => {
    const base = { worldId: "echoes-of-aurion-global", zoneId: "observatory_threshold:causal-chain", tick: 1 };
    const ids = new Set([
      causalReceiptPersistenceId(base as any),
      causalReceiptPersistenceId({ ...base, tick: 2 } as any),
      causalReceiptPersistenceId({ ...base, zoneId: base.zoneId + ":other" } as any),
      causalReceiptPersistenceId({ ...base, worldId: base.worldId + ":other" } as any),
    ]);
    expect(ids.size).toBe(4);
  });
});
