import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import GuildGovernancePanel from "./GuildGovernancePanel";

const view = { guildId: "guild_1", actorUserId: 7, role: "founder", revisionExact: "7", kingdom: { id: "kingdom_1", name: "Sternwacht", rulerUserId: 7, capitalTerritoryId: "world:0:0", territoryDigest: "a".repeat(64), revisionExact: "0" }, territories: [{ territoryId: "world:0:0", worldId: "world", chunkX: 0, chunkZ: 0, guildId: "guild_1", state: "contested" }], grants: [] };
const response = (governance: unknown) => new Response(JSON.stringify({ success: true, governance }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const node = (userId: number) => <QueryClientProvider client={client}><GuildGovernancePanel userId={userId} guildId="guild_1" /></QueryClientProvider>;
  return { ...render(node(7)), node, client };
}
describe("guild politics projection", () => {
  it("renders confirmed kingdom and territory with only credentialed GET requests", async () => {
    const request = vi.fn(async () => response(view)); vi.stubGlobal("fetch", request);
    mount();
    expect(await screen.findByText("Sternwacht")).toBeTruthy();
    expect(screen.getByText("world · Chunk 0, 0 · Umkämpft")).toBeTruthy();
    expect(request).toHaveBeenCalledWith("/api/guild/governance", expect.objectContaining({ credentials: "include", signal: expect.any(AbortSignal) }));
  });
  it("does not turn a failed or foreign response into an empty kingdom and recovers by readback", async () => {
    let value = { ...view, actorUserId: 8 }; vi.stubGlobal("fetch", vi.fn(async () => response(value)));
    mount();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Sternwacht")).toBeNull();
    expect(screen.queryByText("Kein bestätigtes Königreich.")).toBeNull();
    value = view;
    fireEvent.click(screen.getByRole("button", { name: "Gildenpolitik aktualisieren" }));
    expect(await screen.findByText("Sternwacht")).toBeTruthy();
  });
  it("hides cached politics after a failed refresh and isolates changed users", async () => {
    let failed = false;
    vi.stubGlobal("fetch", vi.fn(async () => { if (failed) throw Error("offline"); return response(view); }));
    const { rerender, node } = mount();
    await screen.findByText("Sternwacht");
    failed = true;
    fireEvent.click(screen.getByRole("button", { name: "Gildenpolitik aktualisieren" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Sternwacht")).toBeNull();
    rerender(node(8));
    await waitFor(() => expect(screen.queryByText("Sternwacht")).toBeNull());
  });
  it("shows empty territory and kingdom only from a confirmed response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ...view, territories: [], kingdom: null })));
    mount();
    expect(await screen.findByText("Keine bestätigten Territorien.")).toBeTruthy();
    expect(screen.getByText("Kein bestätigtes Königreich.")).toBeTruthy();
  });
});
