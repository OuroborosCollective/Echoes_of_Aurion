import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AurionOpenWorldRuntime from "./AurionOpenWorldRuntime";
import type { ZonePresenceSnapshot } from "@/lib/zoneMovement";

const confirmedResources = {
  contractVersion: 1,
  contentSourceRevision: "286c575d3d0050ffa77b794d5b7a7e24858acee8",
  revision: 1,
  nodes: [
    { nodeId: "node_beast_1", remaining: 5, depleted: false, respawnAtTick: null },
    { nodeId: "node_copper_1", remaining: 5, depleted: false, respawnAtTick: null },
    { nodeId: "node_cotton_1", remaining: 5, depleted: false, respawnAtTick: null },
    { nodeId: "node_iron_1", remaining: 5, depleted: false, respawnAtTick: null },
    { nodeId: "node_steel_1", remaining: 5, depleted: false, respawnAtTick: null },
  ],
} as const;

const fixture = vi.hoisted(() => {
  const selectedUrl = `/api/assets/glb/${"a".repeat(64)}.glb`;
  const makeEngine = () => ({
    player: { equipGlbModel: vi.fn(async () => true), equipment: {}, inventory: [], stats: {}, currentClassId: "knight" },
    landscape: { chunkManager: {} }, setVirtualMovement: vi.fn(), releaseControlInput: vi.fn(),
    start: vi.fn(), stop: vi.fn(), observePlayerEquipment: () => vi.fn(),
    onRuntimeError: undefined as ((error: unknown) => void) | undefined,
  });
  type ZoneStatus = "connecting" | "connected" | "closed" | "rejected";
  return {
    selectedUrl,
    engines: [] as ReturnType<typeof makeEngine>[], makeEngine,
    snapshots: [] as Array<(snapshot: ZonePresenceSnapshot) => void>,
    statuses: [] as Array<(status: ZoneStatus) => void>,
    rejects: [] as Array<(code: string) => void>,
    tickets: [] as Array<{ onSuccess: (value: { ticket: string }) => void; onError: () => void }>,
    connections: [] as Array<{ connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; sendMovement: ReturnType<typeof vi.fn> }>,
    rendererRequests: [] as Array<{ resolve: (value: any) => void; signal: AbortSignal }>,
    deferRenderer: false,
    appearanceData: null as null | { assetId: string; displayName: string; storageUrl: string; visibility: "public" },
  };
});
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 }, isAuthenticated: true }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ gameplay: { openWorld: { fetch: vi.fn(async () => ({ globalWorld: { worldSeed: "refreshed-world", epoch: 7 } })) } }, worldAssets: { regionV2: { fetch: vi.fn() } } }),
  player: { ui: { useQuery: () => ({}) }, me: { useQuery: () => ({}) }, chooseClass: { useMutation: () => ({}) } },
  assetSubmissions: { characterAppearance: { useQuery: () => ({ data: fixture.appearanceData, refetch: vi.fn() }) } },
  gameplay: {
    openWorld: { useQuery: () => ({}) },
    issueZoneTicket: { useMutation: () => ({ mutate: (_: unknown, reply: typeof fixture.tickets[number]) => fixture.tickets.push(reply) }) },
    acceptQuest: { useMutation: () => ({}) },
  },
} }));
vi.mock("../components/PublicCharacterPicker", () => ({ PublicCharacterPicker: ({ onSelected }: { onSelected?: (selection: { assetId: string; displayName: string; storageUrl: string; visibility: "public" }) => void }) => <button type="button" onClick={() => onSelected?.({ assetId: "glb_standard_female", displayName: "Aurion Standard Female", storageUrl: fixture.selectedUrl, visibility: "public" })}>Standardfigur wählen</button> }));
vi.mock("../core/RendererFactory", () => ({ createRuntimeRenderer: vi.fn((_requested: string, signal: AbortSignal) => {
  const value = { handle: { dispose: vi.fn() }, evidence: { protocol: "ax1-renderer.v1", requested: "webgl2", backend: "webgl2", fallback: "disabled" } };
  return fixture.deferRenderer ? new Promise(resolve => fixture.rendererRequests.push({ resolve, signal })) : Promise.resolve(value);
}) }));
vi.mock("../core/MMOEngine", () => ({ MMOEngine: Object.assign(vi.fn(() => {
  const engine = fixture.makeEngine(); fixture.engines.push(engine); return engine;
}), { checkWebGLSupport: () => ({ supported: true }) }) }));
vi.mock("@/lib/zoneMovement", () => ({ ZoneMovementClient: vi.fn((options: {
  onStatus: (status: "connecting" | "connected" | "closed" | "rejected") => void;
  onSnapshot: (snapshot: ZonePresenceSnapshot) => void;
  onReject: (code: string) => void;
}) => {
  fixture.statuses.push(options.onStatus);
  fixture.snapshots.push(options.onSnapshot);
  fixture.rejects.push(options.onReject);
  const client = { connect: vi.fn(), close: vi.fn(), sendMovement: vi.fn() }; fixture.connections.push(client); return client;
}) }));
vi.mock("./aurionAuthorityAdapter", () => ({ bindAurionAuthorityProjection: vi.fn() }));
vi.mock("./ConfirmedPlayerMotion", () => ({ ConfirmedPlayerMotion: vi.fn(() => ({ project: vi.fn(), stop: vi.fn() })) }));
vi.mock("./WorldAssetProjection", () => ({ WorldAssetProjection: vi.fn(() => ({ dispose: vi.fn(), update: vi.fn() })) }));
vi.mock("./RemotePresenceProjection", () => ({ RemotePresenceProjection: vi.fn(() => ({ dispose: vi.fn(), clear: vi.fn(), apply: vi.fn(), presences: [] })) }));
vi.mock("../components/GameHUD", () => ({ GameHUD: () => <p>World controls</p> }));
vi.mock("./AurionAuthorityHud", () => ({ AurionAuthorityHud: () => <p>World controls</p> }));
vi.mock("../components/InventoryModal", () => ({ InventoryModal: () => null }));
vi.mock("../components/CharacterModal", () => ({ CharacterModal: () => null }));
vi.mock("../components/ClassSelectModal", () => ({ ClassSelectModal: () => null }));
vi.mock("../components/NPCDialogueModal", () => ({ NPCDialogueModal: () => null }));
vi.mock("../components/QuestLogModal", () => ({ QuestLogModal: () => null }));
vi.mock("../components/WorldMapModal", () => ({ WorldMapModal: () => null }));
vi.mock("../components/PartyModal", () => ({ PartyModal: () => null }));

const enter = async () => { await act(async () => { fireEvent(window, new CustomEvent("aurion:load-open-world", { detail: { displayName: "Aurion", globalWorld: { epoch: 0, worldSeed: "fixture" } } })); }); };
describe("open world session ownership", () => {
  beforeEach(() => {
    fixture.deferRenderer = false; fixture.rendererRequests = [];
    fixture.engines = []; fixture.tickets = []; fixture.connections = []; fixture.snapshots = []; fixture.statuses = []; fixture.rejects = [];
    fixture.appearanceData = { assetId: "glb_standard_male", displayName: "Aurion Standard Male", storageUrl: fixture.selectedUrl, visibility: "public" };
  });

  it("does not start the renderer or zone before a confirmed standard character and then loads exactly that GLB", async () => {
    fixture.appearanceData = null;
    render(<AurionOpenWorldRuntime />); await enter();
    expect(fixture.engines).toHaveLength(0);
    expect(fixture.tickets).toHaveLength(0);
    expect(screen.getByTestId("player-character-selection-gate")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Standardfigur wählen" })); });
    expect(fixture.engines).toHaveLength(1);
    expect(fixture.engines[0].player.equipGlbModel).toHaveBeenCalledWith(fixture.selectedUrl);
    expect(fixture.tickets).toHaveLength(1);
  });

  it("forwards confirmed active-runtime positions to the shared stream and retires the callback on return", async () => {
    const received: unknown[] = [];
    const listener = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener("aurion:zone-snapshot", listener);
    try {
      render(<AurionOpenWorldRuntime />); await enter();
      act(() => fixture.tickets[0].onSuccess({ticket:"current-fixture"}));
      const snapshot: ZonePresenceSnapshot={type:"snapshot",zoneId:"observatory_threshold",snapshotSeq:2,tick:95,presences:[{entityId:"player:1",userId:1,position:{x:0,z:-32300},lastAcceptedClientSeq:1}],mobs:[],combatants:[],resources:confirmedResources};
      act(() => fixture.snapshots[0](snapshot));
      expect(received).toEqual([{userId:1,position:{x:0,z:-32300}}]);
      expect(fixture.connections).toHaveLength(1);
      fireEvent(window,new Event("aurion:return-to-tower"));
      act(() => fixture.snapshots[0]({...snapshot,snapshotSeq:3,tick:96}));
      expect(received).toHaveLength(1);
    } finally { window.removeEventListener("aurion:zone-snapshot",listener); }
  });
  it("ignores a late ticket after return, and obtains a fresh ticket on reentry", async () => {
    render(<AurionOpenWorldRuntime />); await enter();
    expect(fixture.tickets).toHaveLength(1);
    fireEvent(window, new Event("aurion:return-to-tower"));
    act(() => fixture.tickets[0].onSuccess({ ticket: "retired-fixture" }));
    expect(fixture.connections).toHaveLength(0);
    await enter();
    expect(fixture.tickets).toHaveLength(2);
    act(() => fixture.tickets[1].onSuccess({ ticket: "current-fixture" }));
    expect(fixture.connections[0].connect).toHaveBeenCalledWith("current-fixture");
  });

  it("requests a fresh one-time ticket after a transient pre-welcome zone rejection", async () => {
    vi.useFakeTimers();
    try {
      render(<AurionOpenWorldRuntime />); await enter();
      expect(fixture.tickets).toHaveLength(1);
      act(() => fixture.tickets[0].onSuccess({ ticket: "first-fixture" }));
      expect(fixture.connections).toHaveLength(1);

      act(() => fixture.statuses[0]("rejected"));
      act(() => { vi.advanceTimersByTime(10_000); });

      expect(fixture.tickets).toHaveLength(2);
      act(() => fixture.tickets[1].onSuccess({ ticket: "retry-fixture" }));
      expect(fixture.connections).toHaveLength(2);
      expect(fixture.connections[1].connect).toHaveBeenCalledWith("retry-fixture");
    } finally { vi.useRealTimers(); }
  });

  it("does not retry a zone transport after an explicit fatal protocol rejection", async () => {
    vi.useFakeTimers();
    try {
      render(<AurionOpenWorldRuntime />); await enter();
      act(() => fixture.tickets[0].onSuccess({ ticket: "first-fixture" }));
      act(() => fixture.rejects[0]("PROTOCOL_VERSION_UNSUPPORTED"));
      act(() => fixture.statuses[0]("rejected"));
      act(() => { vi.advanceTimersByTime(30_000); });
      expect(fixture.tickets).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it("closes the active session and removes controls after a late renderer error", async () => {
    render(<AurionOpenWorldRuntime />); await enter();
    act(() => fixture.tickets[0].onSuccess({ ticket: "current-fixture" }));
    act(() => fixture.engines[0].onRuntimeError?.(new Error("private renderer diagnostics")));
    expect(fixture.engines[0].stop).toHaveBeenCalled();
    expect(fixture.connections[0].close).toHaveBeenCalled();
    expect(screen.queryByText("World controls")).toBeNull();
    expect(screen.getByRole("alert").textContent).not.toContain("private renderer diagnostics");
    expect(screen.getByRole("button", { name: "ZUR STERNWARTE" })).toBeTruthy();
  });
  it("retires late initialization before it can attach an engine or obtain a zone ticket", async () => {
    fixture.deferRenderer = true;
    render(<AurionOpenWorldRuntime />); await enter();
    expect(fixture.rendererRequests).toHaveLength(1);
    fireEvent(window, new Event("aurion:return-to-tower"));
    expect(fixture.rendererRequests[0].signal.aborted).toBe(true);
    const dispose = vi.fn();
    await act(async () => fixture.rendererRequests[0].resolve({ handle: { dispose }, evidence: {} }));
    expect(dispose).toHaveBeenCalledOnce();
    expect(fixture.engines).toHaveLength(0);
    expect(fixture.tickets).toHaveLength(0);
  });

  it("rebuilds after loss with a fresh world and ticket, rejecting the old generation", async () => {
    render(<AurionOpenWorldRuntime />); await enter();
    act(() => fixture.tickets[0].onSuccess({ ticket: "before-loss" }));
    const oldSnapshot = fixture.snapshots[0];
    await act(async () => fixture.engines[0].onRuntimeError?.(new Error("WEBGL_CONTEXT_LOST")));
    expect(fixture.engines[0].stop).toHaveBeenCalled();
    expect(fixture.connections[0].close).toHaveBeenCalled();
    expect(fixture.engines).toHaveLength(2);
    expect(fixture.tickets).toHaveLength(2);
    expect(JSON.parse(screen.getByTestId("renderer-evidence").textContent!)).toMatchObject({ worldSeed: "refreshed-world", epoch: 7, recoveryAttempt: 1, status: "awaiting_snapshot" });
    act(() => oldSnapshot({ type: "snapshot", zoneId: "observatory_threshold", snapshotSeq: 2, tick: 95, presences: [{ entityId: "player:1", userId: 1, position: { x: 0, z: -32300 }, lastAcceptedClientSeq: 1 }], mobs: [], combatants: [], resources: confirmedResources }));
    expect(fixture.engines[1].start).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => fixture.tickets[1].onSuccess({ ticket: "after-loss" }));
    act(() => fixture.snapshots[1]({ type: "snapshot", zoneId: "observatory_threshold", snapshotSeq: 3, tick: 96, presences: [{ entityId: "player:1", userId: 1, position: { x: 1000, z: -32300 }, lastAcceptedClientSeq: 2 }], mobs: [], combatants: [], resources: confirmedResources }));
    expect(fixture.engines[1].start).toHaveBeenCalledOnce();
    await act(async () => fixture.engines[1].onRuntimeError?.(new Error("WEBGPU_DEVICE_LOST")));
    expect(fixture.engines).toHaveLength(3);
    expect(JSON.parse(screen.getByTestId("renderer-evidence").textContent!)).toMatchObject({ recoveryAttempt: 2, status: "awaiting_snapshot" });
    await act(async () => fixture.engines[2].onRuntimeError?.(new Error("WEBGL_CONTEXT_LOST")));
    expect(fixture.engines).toHaveLength(3);
    expect(fixture.engines[2].stop).toHaveBeenCalled();
    expect(screen.queryByText("World controls")).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

});