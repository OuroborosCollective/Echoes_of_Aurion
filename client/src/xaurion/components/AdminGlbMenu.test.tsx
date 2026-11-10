import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminGlbMenu } from "./AdminGlbMenu";
import { useAdminStore } from "../core/AdminService";

const fixture = vi.hoisted(() => ({
  query: { data: undefined as undefined | { id: string; displayName: string; assetType: string; bytes: number }[], isLoading: false, isError: false, isSuccess: false, refetch: vi.fn() },
  adminQuery: vi.fn(), publicQuery: vi.fn(),
  setWorldVisual: vi.fn(), revisions: {} as Record<string, number>, overrides: [] as { placementRef: string; assetId: string }[],
  authoringCatalog: vi.fn(), plan: vi.fn(), apply: vi.fn(), retire: vi.fn(),
}));
vi.mock("../../lib/trpc", () => ({ trpc: {
  admin: { assets: {
    list: { useQuery: (...args: unknown[]) => { fixture.adminQuery(...args); return fixture.query; } },
    assign: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    setWorldVisual: { useMutation: () => ({ mutateAsync: fixture.setWorldVisual, isPending: false }) },
    upload: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  } },
  worldAssets: { visualOverrides: { useQuery: () => ({ data: { revisions: fixture.revisions, overrides: fixture.overrides }, refetch: async () => ({ data: { revisions: fixture.revisions, overrides: fixture.overrides } }) }) } },
  assetSubmissions: { publicCatalog: { useQuery: () => { fixture.publicQuery(); return { data: [] }; } } },
  useUtils: () => ({ aurionAuthoring: { catalog: { fetch: fixture.authoringCatalog } } }),
  aurionAuthoring: {
    worldPlan: { useMutation: () => ({ mutateAsync: fixture.plan }) },
    worldApply: { useMutation: () => ({ mutateAsync: fixture.apply }) },
    worldRetireAdminPlacements: { useMutation: () => ({ mutateAsync: fixture.retire }) },
  },
} }));
import { glbNormalizationTestFixture } from "../core/GlbNormalizationTestFixture.test";
vi.mock("../audio/SoundSynthesizer", () => ({ soundSynth: { playUiOpen: vi.fn(), playUiClose: vi.fn(), playUiClick: vi.fn(), playUiSuccess: vi.fn() } }));

function open() {
  render(<AdminGlbMenu />);
  fireEvent.click(screen.getByRole("button"));
}
beforeEach(() => {
  vi.clearAllMocks();
  useAdminStore.setState({ isAdmin: true, inspectionMode: false, activeModelId: null, currentTarget: null });
  Object.assign(fixture.query, { data: undefined, isLoading: false, isError: false, isSuccess: false });
  fixture.revisions = {};
  fixture.overrides = [];
});

// Production 2026-11-06: the inspection cursor never targeted houses and "Integrate GLB
// Here" silently did nothing. A targeted world visual must persist through the server.
const house = { type: "model" as const, id: "uploaded:0:0:2", name: "Fachwerkhaus", assetId: "glb_old_house", placementRef: "uploaded:0:0:2", worldTargetKind: "uploaded_anchor" as const, position: { x: 1, y: 0, z: 2 } };
function openInspection() {
  open();
  fireEvent.click(screen.getByText("Inspektion"));
}
describe("world visual replacement through the inspection cursor", () => {
  it("persists the selected catalog model at the targeted placement with the current revision", async () => {
    fixture.revisions = { "uploaded:0:0:2": 3 };
    fixture.setWorldVisual.mockResolvedValue({ revision: 4 });
    const changed = vi.fn(); window.addEventListener("aurion:world-visuals-changed", changed);
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_new_house", currentTarget: house });
    openInspection();
    fireEvent.click(screen.getByRole("button", { name: /Hier austauschen/ }));
    await screen.findByText(/Gespeichert \(Revision 4\)/);
    expect(fixture.setWorldVisual).toHaveBeenCalledWith({ placementRef: "uploaded:0:0:2", assetId: "glb_new_house", expectedRevision: 3 });
    expect(changed).toHaveBeenCalled();
    window.removeEventListener("aurion:world-visuals-changed", changed);
  });
  it("restores the original visual of an overridden placement", async () => {
    fixture.revisions = { "uploaded:0:0:2": 1 };
    fixture.overrides = [{ placementRef: "uploaded:0:0:2", assetId: "glb_new_house" }];
    fixture.setWorldVisual.mockResolvedValue({ revision: 2 });
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_new_house", currentTarget: house });
    openInspection();
    fireEvent.click(screen.getByRole("button", { name: "Original wiederherstellen" }));
    await screen.findByText(/Original wiederhergestellt/);
    expect(fixture.setWorldVisual).toHaveBeenCalledWith({ placementRef: "uploaded:0:0:2", assetId: null, expectedRevision: 1 });
  });
  it("does not offer a second restore when the latest revision already restored the original", () => {
    fixture.revisions = { "uploaded:0:0:2": 2 };
    fixture.overrides = []; // A restored placement retains a revision head but has no active override.
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_new_house", currentTarget: house });
    openInspection();
    expect(screen.queryByRole("button", { name: "Original wiederherstellen" })).toBeNull();
  });
  it("shows the server reason instead of failing silently", async () => {
    fixture.setWorldVisual.mockRejectedValue(new Error("WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET"));
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_sword", currentTarget: house });
    openInspection();
    fireEvent.click(screen.getByRole("button", { name: /Hier austauschen/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nur Welt-Modelle");
  });
  // Review (CodeRabbit, CWE-209): raw error text could carry SQL and parameters.
  it("never shows raw error text, only a stable code or a generic message", async () => {
    fixture.setWorldVisual.mockRejectedValueOnce(new Error("Failed query: insert into `aurionWorldVisualOverrides` values (?, ?) params: wvo_x,secret"));
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_new_house", currentTarget: house });
    openInspection();
    fireEvent.click(screen.getByRole("button", { name: /Hier austauschen/ }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Speichern fehlgeschlagen. Bitte später erneut versuchen.");
    fixture.setWorldVisual.mockRejectedValueOnce(new Error("WORLD_VISUAL_WRITE_FAILED"));
    fireEvent.click(screen.getByRole("button", { name: /Hier austauschen/ }));
    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Speichern fehlgeschlagen (WORLD_VISUAL_WRITE_FAILED)."));
  });
  it("explains a non-replaceable target instead of doing nothing", async () => {
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_new_house", currentTarget: { type: "terrain", id: "unknown", name: "Unbekanntes Objekt", position: { x: 0, y: 0, z: 0 } } });
    openInspection();
    fireEvent.click(screen.getByRole("button", { name: /Integrate GLB Here/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("noch nicht austauschbar");
    expect(fixture.setWorldVisual).not.toHaveBeenCalled();
  });
});
// Design brief 2026-11-10: the admin could not remove a tree, rock or house that the
// world plan had placed. Removal is a persisted server write and must be undoable.
describe("removing and restoring world objects through the inspection cursor", () => {
  const treeRef = "shipped:aurion-world-assets.v1:3:-2:5";
  const tree = { type: "model" as const, id: treeRef, name: "Eiche", assetId: undefined, placementRef: treeRef, worldTargetKind: "shipped_placement" as const, position: { x: 200, y: 0, z: -130 } };
  const removeButton = () => screen.queryByTestId("admin-glb-remove-world-visual");

  it("removes a procedural world model only after a second confirming tap, with the current revision", async () => {
    fixture.setWorldVisual.mockResolvedValue({ revision: 1 });
    const changed = vi.fn(); window.addEventListener("aurion:world-visuals-changed", changed);
    useAdminStore.setState({ inspectionMode: true, activeModelId: null, currentTarget: tree });
    openInspection();
    expect(removeButton()!.textContent).toBe("Objekt entfernen");
    fireEvent.click(removeButton()!);
    expect(fixture.setWorldVisual).not.toHaveBeenCalled(); // armed, nothing written yet
    expect(removeButton()!.textContent).toContain("Wirklich entfernen");
    fireEvent.click(removeButton()!);
    await screen.findByText(/Entfernt \(Revision 1\)/);
    expect(fixture.setWorldVisual).toHaveBeenCalledTimes(1);
    expect(fixture.setWorldVisual).toHaveBeenCalledWith({ placementRef: treeRef, assetId: "aurion.world-visual.removed", expectedRevision: 0 });
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener("aurion:world-visuals-changed", changed);
  });

  it("disarms the removal when the cursor moves to another object", () => {
    useAdminStore.setState({ inspectionMode: true, activeModelId: null, currentTarget: tree });
    openInspection();
    fireEvent.click(removeButton()!);
    expect(removeButton()!.textContent).toContain("Wirklich entfernen");
    act(() => useAdminStore.setState({ currentTarget: house }));
    expect(removeButton()!.textContent).toBe("Objekt entfernen");
    expect(fixture.setWorldVisual).not.toHaveBeenCalled();
  });

  it("offers removal for catalog objects but not for ground materials, admin-placed objects or non-world targets", () => {
    useAdminStore.setState({ inspectionMode: true, activeModelId: null, currentTarget: house });
    openInspection();
    expect(removeButton()).not.toBeNull();
    for (const currentTarget of [
      { type: "terrain" as const, id: "surface:grass", name: "Gras", placementRef: "surface:grass", worldTargetKind: "surface_texture" as const, position: { x: 0, y: 0, z: 0 } },
      // Admin-placed objects are removed through their own World Design path.
      { ...house, id: "authored:admin.placements.1a2b3c4d:p.000000000003", placementRef: "authored:admin.placements.1a2b3c4d:p.000000000003", worldTargetKind: "authored_placement" as const },
      { type: "terrain" as const, id: "unknown", name: "Unbekanntes Objekt", position: { x: 0, y: 0, z: 0 } },
    ]) {
      act(() => useAdminStore.setState({ currentTarget }));
      expect(removeButton()).toBeNull();
    }
  });

  it("lists removed and replaced objects and restores a removed one that can no longer be targeted", async () => {
    fixture.revisions = { [treeRef]: 1, "uploaded:0:0:2": 4 };
    fixture.overrides = [{ placementRef: treeRef, assetId: "aurion.world-visual.removed" }, { placementRef: "uploaded:0:0:2", assetId: "glb_new_house" }];
    fixture.setWorldVisual.mockResolvedValue({ revision: 2 });
    useAdminStore.setState({ inspectionMode: true, activeModelId: null, currentTarget: null });
    openInspection();
    const list = screen.getByTestId("admin-glb-changed-world-visuals");
    expect(list.textContent).toContain("Geänderte Welt-Objekte (2)");
    expect(list.textContent).toContain("Entfernt · Welt-Objekt");
    expect(list.textContent).toContain("Ausgetauscht · Katalog-Objekt");
    fireEvent.click(screen.getByRole("button", { name: `Wiederherstellen ${treeRef}` }));
    await screen.findByText(/Original wiederhergestellt \(Revision 2\)/);
    expect(fixture.setWorldVisual).toHaveBeenCalledWith({ placementRef: treeRef, assetId: null, expectedRevision: 1 });
  });

  it("does not offer to remove an already removed object twice and explains the new server refusals", async () => {
    fixture.revisions = { "uploaded:0:0:2": 1 };
    fixture.overrides = [{ placementRef: "uploaded:0:0:2", assetId: "aurion.world-visual.removed" }];
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_new_house", currentTarget: house });
    openInspection();
    expect(removeButton()).toBeNull();
    for (const [code, text] of [
      ["WORLD_VISUAL_PLACEMENT_UNKNOWN", "gehört nicht mehr zum Welt-Plan"],
      ["WORLD_VISUAL_REMOVAL_UNSUPPORTED", "nicht entfernt werden"],
      ["WORLD_VISUAL_WRITE_BUSY", "anderer Admin"],
    ] as const) {
      fixture.setWorldVisual.mockRejectedValueOnce(new Error(code));
      fireEvent.click(screen.getByRole("button", { name: /Hier austauschen/ }));
      await vi.waitFor(() => expect(screen.getByTestId("admin-glb-integration-status").textContent).toContain(text));
    }
  });
});
describe("in-game admin GLB catalog", () => {
  it("reads administrator-owned models and fallback assets without requiring community submissions", () => {
    Object.assign(fixture.query, { isSuccess: true, data: [
      { id: "glb_owned", displayName: "Aurion eigenes Modell", assetType: "arena", bytes: 1024 },
      { id: "glb_fallback", displayName: "Aurion NPC Fallback", assetType: "character", bytes: 2048 },
    ] });
    open();
    expect(fixture.adminQuery).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ enabled: true }));
    expect(fixture.publicQuery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Aurion NPC Fallback"));
    expect(useAdminStore.getState().activeModelId).toBe("glb_fallback");
    fireEvent.change(screen.getByPlaceholderText("Modelle suchen..."), { target: { value: "arena" } });
    expect(screen.getByText("Aurion eigenes Modell")).toBeTruthy();
    expect(screen.queryByText("Aurion NPC Fallback")).toBeNull();
  });
  it("shows a failed read with retry instead of a verified empty catalog", () => {
    Object.assign(fixture.query, { data: [], isError: true });
    open();
    expect(screen.getByRole("alert").textContent).toContain("Katalog konnte nicht geladen werden");
    expect(screen.queryByText("Keine Modelle gefunden")).toBeNull();
    expect(screen.queryByText("Online")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
    expect(fixture.query.refetch).toHaveBeenCalledOnce();
  });
  it("distinguishes loading and confirmed empty results", () => {
    fixture.query.isLoading = true;
    open();
    expect(screen.getByText("Lade Katalog...")).toBeTruthy();
    expect(screen.queryByText("Keine Modelle gefunden")).toBeNull();
    expect(screen.queryByText("Online")).toBeNull();
  });
  it("shows empty only after a successful read", () => {
    Object.assign(fixture.query, { isSuccess: true, data: [] });
    open();
    expect(screen.getByText("Keine Modelle gefunden")).toBeTruthy();
  });
  it("does not request the admin catalog for a non-admin or a closed panel", () => {
    useAdminStore.setState({ isAdmin: false });
    const view = render(<AdminGlbMenu />);
    expect(fixture.adminQuery).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ enabled: false }));
    expect(screen.queryByRole("button")).toBeNull();
    view.unmount();
    useAdminStore.setState({ isAdmin: true });
    render(<AdminGlbMenu />);
    expect(fixture.adminQuery).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ enabled: false }));
  });
  it("shows the menu when the admin role resolves after the first render", () => {
    // The role arrives after mount in the live game; the mounted menu must survive that.
    useAdminStore.setState({ isAdmin: false });
    render(<AdminGlbMenu />);
    expect(screen.queryByRole("button")).toBeNull();
    act(() => useAdminStore.setState({ isAdmin: true }));
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    act(() => useAdminStore.setState({ isAdmin: false }));
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("free placement and removal from the admin menu", () => {
  const sha = "7".repeat(64);
  const tower = { assetId: "glb_tower", sha256: sha, displayName: "Turm", purpose: "world-environment", assetType: "arena", targetKey: null,
    subcategory: "building", normalization: glbNormalizationTestFixture(sha, 0), storageUrl: `/api/assets/glb/${sha}.glb` };
  const sword = { ...tower, assetId: "glb_sword", assetType: "weapon", purpose: "auto" };
  const placement = (key: string) => ({ placementKey: key, assetId: "glb_tower", chunkX: 0, chunkZ: 0, xMm: 1000, zMm: 1000, rotationQuarterTurns: 0 as const, scalePermille: 1000 });
  const world = (count: number) => ({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [{ designKey: "admin.placements.1a2b3c4d", version: 3,
    title: "Admin-Platzierungen", designHash: "d".repeat(64), expectedCatalogRevision: "a".repeat(64), placements: Array.from({ length: count }, (_, i) => placement(`p.00000000000${i}`)) }] });
  beforeEach(() => {
    fixture.authoringCatalog.mockResolvedValue({ glbCatalogRevision: "a".repeat(64), assets: [tower, sword], world: world(2) });
    fixture.plan.mockResolvedValue({ planHash: "c".repeat(64), expectedPreviousHash: "d".repeat(64) });
    fixture.apply.mockResolvedValue({ receipt: { receiptId: "authoring:world:abc" } });
    fixture.retire.mockResolvedValue({ receipt: { receiptId: "authoring:world:def" } });
    useAdminStore.setState({ placementAsset: null });
  });

  it("starts the floating preview of the selected world model and closes the menu so the world is visible", async () => {
    Object.assign(fixture.query, { isSuccess: true, data: [{ id: "glb_tower", displayName: "Turm", assetType: "arena", bytes: 1024 }] });
    useAdminStore.setState({ activeModelId: "glb_tower" });
    open();
    fireEvent.click(screen.getByTestId("admin-glb-place"));
    await vi.waitFor(() => expect(useAdminStore.getState().placementAsset?.assetId).toBe("glb_tower"));
    expect(useAdminStore.getState().placementAsset).toMatchObject({ equipmentSlot: null, sha256: sha });
    await vi.waitFor(() => expect(screen.queryByText("GLB Core Admin")).toBeNull());
  });

  it("explains why a non-world model cannot be placed instead of starting a broken preview", async () => {
    useAdminStore.setState({ activeModelId: "glb_sword" });
    open();
    fireEvent.click(screen.getByTestId("admin-glb-place"));
    expect((await screen.findByTestId("admin-glb-place-status")).textContent).toContain("kann nicht frei platziert werden");
    expect(useAdminStore.getState().placementAsset).toBeNull();
  });

  it("removes an object the admin placed only after a second confirming click", async () => {
    const placed = { type: "model" as const, id: "authored:admin.placements.1a2b3c4d:p.000000000001", name: "Turm", assetId: "glb_tower",
      placementRef: "authored:admin.placements.1a2b3c4d:p.000000000001", worldTargetKind: "authored_placement" as const, position: { x: 1, y: 0, z: 1 } };
    useAdminStore.setState({ inspectionMode: true, currentTarget: placed });
    openInspection();
    fireEvent.click(screen.getByTestId("admin-glb-remove-placement"));
    expect(fixture.plan).not.toHaveBeenCalled();
    expect(screen.getByTestId("admin-glb-remove-placement").textContent).toContain("Wirklich entfernen?");
    fireEvent.click(screen.getByTestId("admin-glb-remove-placement"));
    expect((await screen.findByTestId("admin-glb-remove-status")).textContent).toContain("Entfernt und gespeichert");
    expect(fixture.plan.mock.calls[0]![0].draft.placements.map((p: { placementKey: string }) => p.placementKey)).toEqual(["p.000000000000"]);
  });

  it("offers removal only for admin-placed objects, never for village houses or World Design content", () => {
    useAdminStore.setState({ inspectionMode: true, currentTarget: house });
    openInspection();
    expect(screen.queryByTestId("admin-glb-remove-placement")).toBeNull();
  });
});

it("serializes repeated save actions and releases the guard after failure and success", async () => {
 let fail!:(error:Error)=>void;
 fixture.setWorldVisual.mockImplementationOnce(()=>new Promise((_,reject)=>{fail=reject;})).mockResolvedValue({revision:2});
 useAdminStore.setState({inspectionMode:true,activeModelId:"glb_new_house",currentTarget:house});
 openInspection();
 const save=screen.getByRole("button",{name:/Hier austauschen/});
 fireEvent.click(save); fireEvent.click(save);
 await vi.waitFor(()=>expect(fixture.setWorldVisual).toHaveBeenCalledTimes(1));
 fail(Error("WORLD_VISUAL_WRITE_FAILED"));
 await screen.findByText(/Speichern fehlgeschlagen/);
 fireEvent.click(save);
 await screen.findByText(/Gespeichert/);
 fireEvent.click(save);
 await vi.waitFor(()=>expect(fixture.setWorldVisual).toHaveBeenCalledTimes(3));
});
