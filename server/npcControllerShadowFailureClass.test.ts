import { afterEach, describe, expect, it, vi } from "vitest";

// The shadow controller is a diagnostic sidecar inside the canonical action
// transaction. A programming error in its evaluation must never block the NPC
// on every retry (the blocked-merchant family); only database/transport
// failures may abort the transaction.
const controller = vi.hoisted(() => ({ failure: null as unknown }));
vi.mock("./npcArchetypePersistence", async importOriginal => {
  const actual = await importOriginal<typeof import("./npcArchetypePersistence")>();
  return {
    ...actual,
    readBoundController: async () => {
      if (controller.failure) throw controller.failure;
      return { binding: { bindingHash: `sha256:${"b".repeat(64)}`, status: "BOUND_SHADOW", reason: "AUTHORITATIVE_ADMISSION_NOT_RELEASED" }, candidate: null };
    },
  };
});
vi.mock("./aurion/npc/multiMemory", async importOriginal => ({
  ...(await importOriginal<typeof import("./aurion/npc/multiMemory")>()),
  isConfirmedNpcDecision: () => true,
}));

const { appendNpcControllerShadowReceipt } = await import("./npcControllerShadowPersistence");
const { isNpcControllerDatabaseFailure } = await import("./npcArchetypePersistence");

const confirmed = { receiptId: "npc_source", receiptSha256: "a".repeat(64), snapshot: { npcId: "ax1_merchant_observatory_threshold" } } as never;
const receipt = { id: "nar_action", npcId: "ax1_merchant_observatory_threshold", receiptHash: "c".repeat(64), action: "trade", worldSeedSha256: "d".repeat(64),
  expectedEpoch: { npcResolutionIndex: 1, marketVersion: 1, polityVersion: 1 }, resolutionIndex: 2, sourceDecision: { receiptId: "npc_source" } } as never;
function transaction() {
  const inserted: unknown[] = [];
  return { inserted, tx: { insert: () => ({ values: async (row: unknown) => { inserted.push(row); } }) } as never };
}

describe("NPC controller failure classification", () => {
  afterEach(() => { controller.failure = null; });

  it("records a controller programming error as a fallback instead of aborting the canonical action", async () => {
    controller.failure = new TypeError("Cannot read properties of undefined (reading 'needs')");
    const { tx, inserted } = transaction();
    const shadow = await appendNpcControllerShadowReceipt(tx, confirmed, receipt);
    expect(shadow).toMatchObject({ reason: "CONTROLLER_VERIFICATION_FAILED", proposal: null, proposalDisposition: "CANONICAL_FALLBACK", mutationAuthority: "none" });
    expect(inserted).toHaveLength(1);
  });

  it("still aborts on database and transport failures, which leave nothing half-written", async () => {
    controller.failure = Object.assign(new Error("Lock wait timeout exceeded"), { code: "ER_LOCK_WAIT_TIMEOUT", errno: 1205, sqlState: "HY000" });
    const { tx, inserted } = transaction();
    await expect(appendNpcControllerShadowReceipt(tx, confirmed, receipt)).rejects.toThrow("Lock wait timeout");
    expect(inserted).toHaveLength(0);
  });

  it("classifies wrapped driver errors as database failures and everything else as recoverable", () => {
    expect(isNpcControllerDatabaseFailure(Object.assign(new Error("Failed query"), { name: "DrizzleQueryError" }))).toBe(true);
    expect(isNpcControllerDatabaseFailure(new Error("wrapped", { cause: { code: "PROTOCOL_CONNECTION_LOST" } }))).toBe(true);
    expect(isNpcControllerDatabaseFailure(new Error("NPC_CONTROLLER_ARTIFACT_HASH_MISMATCH"))).toBe(false);
    expect(isNpcControllerDatabaseFailure(new TypeError("x is undefined"))).toBe(false);
    expect(isNpcControllerDatabaseFailure(new RangeError("Invalid array length"))).toBe(false);
  });
});
