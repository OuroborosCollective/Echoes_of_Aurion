import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AurionOpenWorldRuntime from "./AurionOpenWorldRuntime";

const fixture = vi.hoisted(() => {
  const makeEngine = () => ({
    player: { equipment: {}, inventory: [], stats: {}, currentClassId: "knight" },
    landscape: { chunkManager: {} }, setVirtualMovement: vi.fn(),
    start: vi.fn(), stop: vi.fn(), observePlayerEquipment: () => vi.fn(),
    onRuntimeError: undefined as ((error: unknown) => void) | undefined,
  });
  return {
    engines: [] as ReturnType<typeof makeEngine>[], makeEngine,
    tickets: [] as Array<{ onSuccess: (value: { ticket: string }) => void; onError: () => void }>,
    connections: [] as Array<{ connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; sendMovement: ReturnType<typeof vi.fn> }>,
  };
});
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 }, isAuthenticated: true }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  player: { me: { useQuery: () => ({}) }, chooseClass: { useMutation: () => ({}) } },
  assetSubmissions: { characterAppearance: { useQuery: () => ({}) } },
  gameplay: {
    issueZoneTicket: { useMutation: () => ({ mutate: (_: unknown, reply: typeof fixture.tickets[number]) => fixture.tickets.push(reply) }) },
    acceptQuest: { useMutation: () => ({}) },
  },
} }));
vi.mock("../core/MMOEngine", () => ({ MMOEngine: Object.assign(vi.fn(() => {
  const engine = fixture.makeEngine(); fixture.engines.push(engine); return engine;
}), { checkWebGLSupport: () => ({ supported: true }) }) }));
vi.mock("@/lib/zoneMovement", () => ({ ZoneMovementClient: vi.fn(() => {
  const client = { connect: vi.fn(), close: vi.fn(), sendMovement: vi.fn() }; fixture.connections.push(client); return client;
}) }));
vi.mock("./aurionAuthorityAdapter", () => ({ bindAurionAuthorityProjection: vi.fn() }));
vi.mock("../components/GameHUD", () => ({ GameHUD: () => <p>World controls</p> }));
vi.mock("../components/InventoryModal", () => ({ InventoryModal: () => null }));
vi.mock("../components/CharacterModal", () => ({ CharacterModal: () => null }));
vi.mock("../components/ClassSelectModal", () => ({ ClassSelectModal: () => null }));
vi.mock("../components/NPCDialogueModal", () => ({ NPCDialogueModal: () => null }));
vi.mock("../components/QuestLogModal", () => ({ QuestLogModal: () => null }));
vi.mock("../components/WorldMapModal", () => ({ WorldMapModal: () => null }));
vi.mock("../components/PartyModal", () => ({ PartyModal: () => null }));

const enter = () => fireEvent(window, new CustomEvent("aurion:load-open-world", { detail: { displayName: "Aurion", globalWorld: { epoch: 0, worldSeed: "fixture" } } }));
describe("open world session ownership", () => {
  beforeEach(() => { fixture.engines = []; fixture.tickets = []; fixture.connections = []; });
  it("ignores a late ticket after return, and obtains a fresh ticket on reentry", () => {
    render(<AurionOpenWorldRuntime />); enter();
    expect(fixture.tickets).toHaveLength(1);
    fireEvent(window, new Event("aurion:return-to-tower"));
    act(() => fixture.tickets[0].onSuccess({ ticket: "retired-fixture" }));
    expect(fixture.connections).toHaveLength(0);
    enter();
    expect(fixture.tickets).toHaveLength(2);
    act(() => fixture.tickets[1].onSuccess({ ticket: "current-fixture" }));
    expect(fixture.connections[0].connect).toHaveBeenCalledWith("current-fixture");
  });

  it("closes the active session and removes controls after a late renderer error", () => {
    render(<AurionOpenWorldRuntime />); enter();
    act(() => fixture.tickets[0].onSuccess({ ticket: "current-fixture" }));
    act(() => fixture.engines[0].onRuntimeError?.(new Error("private renderer diagnostics")));
    expect(fixture.engines[0].stop).toHaveBeenCalled();
    expect(fixture.connections[0].close).toHaveBeenCalled();
    expect(screen.queryByText("World controls")).toBeNull();
    expect(screen.getByRole("alert").textContent).not.toContain("private renderer diagnostics");
    expect(screen.getByRole("button", { name: "ZUR STERNWARTE" })).toBeTruthy();
  });
});
