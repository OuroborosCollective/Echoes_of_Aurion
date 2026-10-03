import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminGlbMenu } from "./AdminGlbMenu";
import { useAdminStore } from "../core/AdminService";

const fixture = vi.hoisted(() => ({
  query: { data: undefined as undefined | { id: string; displayName: string; assetType: string; bytes: number }[], isLoading: false, isError: false, isSuccess: false, refetch: vi.fn() },
  adminQuery: vi.fn(), publicQuery: vi.fn(),
}));
vi.mock("../../lib/trpc", () => ({ trpc: {
  admin: { assets: {
    list: { useQuery: (...args: unknown[]) => { fixture.adminQuery(...args); return fixture.query; } },
    assign: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    upload: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  } },
  assetSubmissions: { publicCatalog: { useQuery: () => { fixture.publicQuery(); return { data: [] }; } } },
} }));
vi.mock("../audio/SoundSynthesizer", () => ({ soundSynth: { playUiOpen: vi.fn(), playUiClose: vi.fn(), playUiClick: vi.fn() } }));

function open() {
  render(<AdminGlbMenu />);
  fireEvent.click(screen.getByRole("button"));
}
beforeEach(() => {
  vi.clearAllMocks();
  useAdminStore.setState({ isAdmin: true, inspectionMode: false, activeModelId: null, currentTarget: null });
  Object.assign(fixture.query, { data: undefined, isLoading: false, isError: false, isSuccess: false });
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
