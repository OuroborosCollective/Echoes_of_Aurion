import { createPool } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { GuildBankStore } from "./guildBankStore";

describe("guild bank runtime construction", () => {
  // Pools connect lazily: exercise the real production factory without a DB fixture.
  // The database suite separately proves plans, expiry, transactions and readback.
  const isolatedUrl = "mysql://aurion_test@127.0.0.1:1/aurion_clock_test";

  it("initializes the default host clock through the production factory", async () => {
    const store = GuildBankStore.fromDatabaseUrl(isolatedUrl);
    try {
      expect(store).toBeInstanceOf(GuildBankStore);
    } finally {
      await store.close();
    }
  });

  it("initializes the default host clock with a caller-owned pool", async () => {
    const pool = createPool(isolatedUrl);
    try {
      expect(new GuildBankStore(pool)).toBeInstanceOf(GuildBankStore);
    } finally {
      await pool.end();
    }
  });
});
