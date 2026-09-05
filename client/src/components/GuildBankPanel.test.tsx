import { webcrypto } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GuildBankPanel from "./GuildBankPanel";
const fixtures = vi.hoisted(() => ({
  mine: {
    data: { guild: { id: "guild_1", name: "Sternwacht" } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  create: { mutateAsync: vi.fn(), isPending: false },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    guild: {
      mine: { useQuery: () => fixtures.mine },
      create: { useMutation: () => fixtures.create },
    },
  },
}));
const initial = {
  guildId: "guild_1",
  actorUserId: 7,
  role: "founder",
  revisionExact: "0",
  planningRevisionExact: "0",
  playerPointsExact: "100",
  treasuryBalanceExact: "0",
  allowedOperations: ["deposit_points", "withdraw_points"],
  heldItems: [],
  availableItems: [],
  resourceBalancesExact: { wood: "0", stone: "0", aether: "0" },
  buildingOptions: [],
};
const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
let bank = { ...initial },
  foreign = false,
  failApply = false;
const applied: string[] = [];
beforeEach(() => {
  bank = { ...initial };
  foreign = false;
  failApply = false;
  applied.length = 0;
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/plan")) {
        const input = JSON.parse(String(init?.body));
        return response({
          success: true,
          expiresAt: "2099-01-01T00:00:00.000Z",
          replay: false,
          plan: {
            schemaVersion: 1,
            actorUserId: foreign ? 8 : 7,
            guildId: "guild_1",
            operation: input.operation,
            expectedRevisionExact: input.expectedRevisionExact,
            idempotencyKey: input.idempotencyKey,
            payload: input.payload,
            confirmationHash: "a".repeat(64),
            ruleSetVersion: "aurion-guild-bank.v1",
            contentVersion: "aurion-guild-bank.d356881.v1",
          },
        });
      }
      if (url.endsWith("/apply")) {
        const input = JSON.parse(String(init?.body));
        applied.push(input.confirmationHash);
        bank = {
          ...initial,
          revisionExact: "1",
          planningRevisionExact: "1",
          playerPointsExact: "99",
          treasuryBalanceExact: "1",
        };
        if (failApply) {
          failApply = false;
          throw Error("lost response");
        }
        return response({
          success: true,
          receipt: {
            actorUserId: 7,
            guildId: "guild_1",
            operation: "deposit_points",
            confirmationHash: input.confirmationHash,
            expectedRevisionExact: "0",
            resultingRevisionExact: "1",
          },
          readback: bank,
        });
      }
      return response({ success: true, bank });
    })
  );
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GuildBankPanel userId={7} />
    </QueryClientProvider>
  );
}
describe("guild bank explicit confirmation", () => {
  it("previews first and retries only the same confirmed operation after a lost response", async () => {
    failApply = true;
    mount();
    const prepare = await screen.findByRole("button", {
      name: "AURION einzahlen prüfen",
    });
    await waitFor(() => expect(prepare.hasAttribute("disabled")).toBe(false));
    fireEvent.click(prepare);
    const confirm = await screen.findByRole("button", {
      name: "Verbindlich bestätigen",
    });
    expect(applied).toEqual([]);
    expect(screen.getByText("Betrag: 1 AURION")).toBeTruthy();
    fireEvent.click(confirm);
    await screen.findByText(
      "Die Bestätigung ist noch offen. Derselbe Vorgang kann erneut abgefragt werden."
    );
    fireEvent.click(screen.getByRole("button", { name: "Bank aktualisieren" }));
    await screen.findByText("99 AURION");
    await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(false));
    fireEvent.click(confirm);
    await screen.findByText("Die Bankänderung ist bestätigt.");
    expect(applied).toEqual(["a".repeat(64), "a".repeat(64)]);
    expect(screen.getByText("99 AURION")).toBeTruthy();
  });
  it("rejects a foreign preview and invalid decimal input before confirmation", async () => {
    foreign = true;
    mount();
    const prepare = await screen.findByRole("button", {
      name: "AURION einzahlen prüfen",
    });
    await waitFor(() => expect(prepare.hasAttribute("disabled")).toBe(false));
    fireEvent.change(screen.getByLabelText("Betrag in AURION"), {
      target: { value: "1e9" },
    });
    expect(prepare.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Betrag in AURION"), {
      target: { value: "1" },
    });
    fireEvent.click(prepare);
    await screen.findByText(
      "Die Vorschau wurde nicht bestätigt. Prüfe Guthaben, Rechte und Gegenstand und aktualisiere die Bank."
    );
    expect(
      screen.queryByRole("button", { name: "Verbindlich bestätigen" })
    ).toBeNull();
    expect(applied).toEqual([]);
  });
});
