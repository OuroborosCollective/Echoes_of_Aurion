import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GlbCatalogEntry } from "@shared/glbImportContract";
import { WorldDesignDraftSchema } from "@shared/aurionAuthoringContract";
import { useAdminStore } from "../core/AdminService";
import { glbManager } from "../core/GLBModelManager";
import { ADMIN_PLACEMENT_KEYS, AdminPlacementController, nextPlacementScale } from "./AdminPlacement";

const fixture = vi.hoisted(() => ({
  catalog: vi.fn(), plan: vi.fn(), apply: vi.fn(), retire: vi.fn(),
}));
vi.mock("../../lib/trpc", () => ({ trpc: {
  useUtils: () => ({ aurionAuthoring: { catalog: { fetch: fixture.catalog } } }),
  aurionAuthoring: {
    worldPlan: { useMutation: () => ({ mutateAsync: fixture.plan }) },
    worldApply: { useMutation: () => ({ mutateAsync: fixture.apply }) },
    worldRetireAdminPlacements: { useMutation: () => ({ mutateAsync: fixture.retire }) },
  },
} }));
vi.mock("../audio/SoundSynthesizer", () => ({ soundSynth: { playUiClick: vi.fn(), playUiSuccess: vi.fn() } }));

const sha = "e".repeat(64);
const tower = { assetId: "glb_tower", sha256: sha, displayName: "Turm", purpose: "world-environment", assetType: "arena", targetKey: null,
  subcategory: "building", equipmentSlot: null, storageUrl: `/api/assets/glb/${sha}.glb` } as GlbCatalogEntry;

function fakeEngine(hit: { x: number; z: number } | null = { x: 2.1, z: -6.2 }) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 6, 8); camera.lookAt(0, 1.5, 0); camera.updateMatrixWorld(true);
  return { scene: new THREE.Scene(), camera, player: { position: new THREE.Vector3() }, landscape: { chunkManager: { getElevationAt: () => 0 } },
    projectTouchDestination: vi.fn(() => (hit ? { x: hit.x, y: 0, z: hit.z } : null)) };
}

function mount(engine = fakeEngine()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const engineRef = { current: engine as never };
  const containerRef = { current: container };
  const view = render(<AdminPlacementController engineRef={engineRef} containerRef={containerRef} />);
  return { ...view, container, engine };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => {
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    return { scene, animations: [], lodLevels: [0] };
  });
  fixture.catalog.mockResolvedValue({ glbCatalogRevision: "a".repeat(64), assets: [tower], world: { schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [] } });
  fixture.plan.mockResolvedValue({ planHash: "c".repeat(64) });
  fixture.apply.mockResolvedValue({ receipt: { receiptId: "authoring:world:abc" } });
  useAdminStore.setState({ isAdmin: true, placementAsset: null, inspectionMode: false, currentTarget: null });
});
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

async function ghostReady() {
  // The preview has loaded and aims at the ground (it is part of the engine scene).
  await waitFor(() => expect(screen.getByTestId("admin-placement-hud")).toBeTruthy());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
}

describe("block-game style admin placement session", () => {
  it("shows nothing for players and nothing while no model is being placed", () => {
    useAdminStore.setState({ isAdmin: false, placementAsset: tower });
    const first = mount();
    expect(screen.queryByTestId("admin-placement-hud")).toBeNull();
    first.unmount();
    useAdminStore.setState({ isAdmin: true, placementAsset: null });
    mount();
    expect(screen.queryByTestId("admin-placement-hud")).toBeNull();
  });

  it("rotates with R, resizes with +/−, places with Enter at the mouse position and keeps placing", async () => {
    useAdminStore.setState({ placementAsset: tower });
    const { container } = mount();
    await ghostReady();
    fireEvent.pointerMove(container, { clientX: 10, clientY: 10, pointerType: "mouse" });
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.keyDown(window, { key: "+" });
    fireEvent.keyDown(window, { key: "+" });
    expect(screen.getByTestId("admin-placement-transform").textContent).toContain("90° · 150 %");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("admin-placement-status").textContent).toContain("Platziert und gespeichert"));
    const draft = WorldDesignDraftSchema.parse(fixture.plan.mock.calls[0]![0].draft);
    expect(draft.placements[0]).toMatchObject({ assetId: "glb_tower", rotationQuarterTurns: 1, scalePermille: 1_500 });
    expect(fixture.apply.mock.calls[0]![0]).toMatchObject({ expectedPlanHash: "c".repeat(64), confirmation: "APPLY_WORLD_DESIGN" });
    // Still placing: the admin can set the next copy right away.
    expect(useAdminStore.getState().placementAsset?.assetId).toBe("glb_tower");
    expect(screen.getByTestId("admin-placement-transform").textContent).toContain("1 gesetzt");
  });

  it("places with a mouse click, but never on a camera drag or a touch tap", async () => {
    useAdminStore.setState({ placementAsset: tower });
    const { container } = mount();
    await ghostReady();
    fireEvent.pointerDown(container, { clientX: 10, clientY: 10, pointerType: "mouse", button: 0 });
    fireEvent.click(container, { clientX: 60, clientY: 10 });
    fireEvent.pointerDown(container, { clientX: 10, clientY: 10, pointerType: "touch", button: 0 });
    fireEvent.click(container, { clientX: 10, clientY: 10 });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(fixture.plan).not.toHaveBeenCalled();
    fireEvent.pointerDown(container, { clientX: 10, clientY: 10, pointerType: "mouse", button: 0 });
    fireEvent.click(container, { clientX: 12, clientY: 11 });
    await waitFor(() => expect(fixture.apply).toHaveBeenCalledTimes(1));
  });

  it("places through the touch button and ignores a second press while saving", async () => {
    useAdminStore.setState({ placementAsset: tower });
    let finish: (value: unknown) => void = () => undefined;
    fixture.apply.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    mount();
    await ghostReady();
    fireEvent.click(screen.getByTestId("admin-placement-confirm"));
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(fixture.apply).toHaveBeenCalledTimes(1));
    await act(async () => { finish({ receipt: { receiptId: "authoring:world:abc" } }); });
    await waitFor(() => expect(screen.getByTestId("admin-placement-status").textContent).toContain("Platziert"));
    expect(fixture.plan).toHaveBeenCalledTimes(1);
  });

  it("explains a refused placement and ends the session with Escape, removing the preview", async () => {
    useAdminStore.setState({ placementAsset: tower });
    fixture.apply.mockRejectedValueOnce(new Error("AUTHORING_WORLD_ACTIVE_LIMIT"));
    const { engine } = mount();
    await ghostReady();
    expect(engine.scene.getObjectByName("aurion-admin-placement-ghost")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("64"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useAdminStore.getState().placementAsset).toBeNull();
    expect(screen.queryByTestId("admin-placement-hud")).toBeNull();
    expect(engine.scene.getObjectByName("aurion-admin-placement-ghost")).toBeUndefined();
  });

  it("reports when nothing valid is aimed at instead of saving a wrong position", async () => {
    useAdminStore.setState({ placementAsset: tower });
    const { container } = mount(fakeEngine({ x: 500, z: 0 }));
    await ghostReady();
    fireEvent.pointerMove(container, { clientX: 10, clientY: 10, pointerType: "mouse" });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("Kein gültiger Platz");
    expect(fixture.plan).not.toHaveBeenCalled();
  });

  it("owns only keys the game does not need while placing (Q stays the quest log, WASD stays movement)", () => {
    expect([...ADMIN_PLACEMENT_KEYS].sort()).toEqual(["+", "-", "=", "_", "enter", "escape", "r"]);
    for (const key of ["q", "w", "a", "s", "d", "f", "i", "m"]) expect(ADMIN_PLACEMENT_KEYS.has(key)).toBe(false);
  });

  it("steps through the allowed sizes and clamps at both ends", () => {
    expect(nextPlacementScale(1_000, 1)).toBe(1_250);
    expect(nextPlacementScale(1_000, -1)).toBe(750);
    expect(nextPlacementScale(4_000, 1)).toBe(4_000);
    expect(nextPlacementScale(250, -1)).toBe(250);
    expect(nextPlacementScale(1_100, 1)).toBe(1_250);
    expect(nextPlacementScale(1_100, -1)).toBe(1_000);
  });

  // Owner plays only on a touchscreen tablet: tap on the ground, adjust with buttons, "Setzen".
  it("puts the preview where the admin taps on a tablet and places it there with the Setzen button", async () => {
    useAdminStore.setState({ placementAsset: tower });
    const { container, engine } = mount(fakeEngine({ x: 6.6, z: -3.1 }));
    await ghostReady();
    fireEvent.pointerDown(container, { clientX: 200, clientY: 300, pointerType: "touch" });
    fireEvent.pointerUp(container, { clientX: 203, clientY: 302, pointerType: "touch" });
    expect(engine.projectTouchDestination).toHaveBeenLastCalledWith(203, 302);
    expect(screen.getByTestId("admin-placement-status").textContent).toContain("Vorschau steht hier");
    expect(fixture.plan).not.toHaveBeenCalled(); // a tap never places by itself
    fireEvent.click(screen.getByRole("button", { name: /Drehen/ }));
    fireEvent.click(screen.getByTestId("admin-placement-confirm"));
    await waitFor(() => expect(fixture.apply).toHaveBeenCalledTimes(1));
    const draft = WorldDesignDraftSchema.parse(fixture.plan.mock.calls[0]![0].draft);
    const [p] = draft.placements;
    const { joinWorldChunkPositionMm } = await import("@shared/worldChunkProtocol");
    expect(joinWorldChunkPositionMm({ coordinate: { x: p!.chunkX, z: p!.chunkZ }, localPositionMm: { x: p!.xMm, z: p!.zMm } })).toEqual({ x: 6_500, z: -3_000 });
    expect(p!.rotationQuarterTurns).toBe(1);
  });

  it("treats a touch drag as camera movement and refuses a tap beyond reach", async () => {
    useAdminStore.setState({ placementAsset: tower });
    const { container, engine } = mount(fakeEngine({ x: 90, z: 0 }));
    await ghostReady();
    engine.projectTouchDestination.mockClear();
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100, pointerType: "touch" });
    fireEvent.pointerUp(container, { clientX: 160, clientY: 100, pointerType: "touch" });
    expect(engine.projectTouchDestination).not.toHaveBeenCalled();
    fireEvent.pointerDown(container, { clientX: 100, clientY: 100, pointerType: "touch" });
    fireEvent.pointerUp(container, { clientX: 100, clientY: 100, pointerType: "touch" });
    expect(screen.getByRole("alert").textContent).toContain("Zu weit weg");
  });

  it("keeps every control reachable by touch: buttons for rotate, size, place and finish, at least 44 px", async () => {
    useAdminStore.setState({ placementAsset: tower });
    mount();
    await ghostReady();
    const toolbar = screen.getByTestId("admin-placement-hud");
    const buttons = [...toolbar.querySelectorAll("button")];
    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual(["Drehen (R)", "Kleiner (−)", "Größer (+)", "Hier platzieren (Enter)", "Platzieren beenden (Esc)"]);
    expect(buttons.every(button => button.className.includes("min-h-11"))).toBe(true);
    // Above the touch movement pad and action buttons (the game's prompt lane).
    expect(toolbar.className).toContain("bottom-[168px]");
  });
});
