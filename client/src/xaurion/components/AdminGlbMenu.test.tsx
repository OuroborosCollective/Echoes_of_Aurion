import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminGlbMenu } from "./AdminGlbMenu";
import { useAdminStore } from "../core/AdminService";

const fixture = vi.hoisted(() => ({
  query: { data: undefined as undefined | { id: string; displayName: string; assetType: string; bytes: number }[], isLoading: false, isError: false, isSuccess: false, refetch: vi.fn() },
  adminQuery: vi.fn(), publicQuery: vi.fn(),
  setWorldVisual: vi.fn(), revisions: {} as Record<string, number>,
}));
vi.mock("../../lib/trpc", () => ({ trpc: {
  admin: { assets: {
    list: { useQuery: (...args: unknown[]) => { fixture.adminQuery(...args); return fixture.query; } },
    assign: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    setWorldVisual: { useMutation: () => ({ mutateAsync: fixture.setWorldVisual, isPending: false }) },
    upload: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  } },
  worldAssets: { visualOverrides: { useQuery: () => ({ data: { revisions: fixture.revisions }, refetch: async () => ({ data: { revisions: fixture.revisions } }) }) } },
  assetSubmissions: { publicCatalog: { useQuery: () => { fixture.publicQuery(); return { data: [] }; } } },
} }));
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
    fixture.setWorldVisual.mockResolvedValue({ revision: 2 });
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_new_house", currentTarget: house });
    openInspection();
    fireEvent.click(screen.getByRole("button", { name: "Original wiederherstellen" }));
    await screen.findByText(/Original wiederhergestellt/);
    expect(fixture.setWorldVisual).toHaveBeenCalledWith({ placementRef: "uploaded:0:0:2", assetId: null, expectedRevision: 1 });
  });
  it("shows the server reason instead of failing silently", async () => {
    fixture.setWorldVisual.mockRejectedValue(new Error("WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET"));
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_sword", currentTarget: house });
    openInspection();
    fireEvent.click(screen.getByRole("button", { name: /Hier austauschen/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Nur Welt-Modelle");
  });
  it("explains a non-replaceable target instead of doing nothing", async () => {
    useAdminStore.setState({ inspectionMode: true, activeModelId: "glb_new_house", currentTarget: { type: "terrain", id: "unknown", name: "Unbekanntes Objekt", position: { x: 0, y: 0, z: 0 } } });
    openInspection();
    fireEvent.click(screen.getByRole("button", { name: /Integrate GLB Here/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("noch nicht austauschbar");
    expect(fixture.setWorldVisual).not.toHaveBeenCalled();
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
});
