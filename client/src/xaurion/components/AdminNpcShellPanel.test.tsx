import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { useAdminStore } from "../core/AdminService";
import type { NpcShellTarget } from "../integration/NpcShellProjection";
import { AdminNpcShellPanel, openNearestNpcShell } from "./AdminNpcShellPanel";

const fixture = vi.hoisted(() => ({ catalog: vi.fn(), plan: vi.fn(), apply: vi.fn(), retire: vi.fn(), draft: vi.fn(), confirm: vi.fn(), purposes: vi.fn() }));
vi.mock("../../lib/trpc", () => ({ trpc: {
  useUtils: () => ({ aurionAuthoring: { catalog: { fetch: fixture.catalog }, npcPurposes: { fetch: fixture.purposes } } }),
  aurionAuthoring: {
    worldPlan: { useMutation: () => ({ mutateAsync: fixture.plan }) },
    worldApply: { useMutation: () => ({ mutateAsync: fixture.apply }) },
    worldRetireAdminPlacements: { useMutation: () => ({ mutateAsync: fixture.retire }) },
    npcPurposeDraft: { useMutation: () => ({ mutateAsync: fixture.draft, isPending: false }) },
    npcPurposeConfirm: { useMutation: () => ({ mutateAsync: fixture.confirm, isPending: false }) },
  },
} }));
vi.mock("../audio/SoundSynthesizer", () => ({ soundSynth: { playUiOpen: vi.fn(), playUiClick: vi.fn(), playUiSuccess: vi.fn() } }));

const shell: NpcShellTarget = { shellRef: "authored:npc.shells.1a2b3c4d:p.000000000001", designKey: "npc.shells.1a2b3c4d", placementKey: "p.000000000001",
  assetId: "glb_ranger", displayName: "Waldläuferin", position: { x: 2, y: 0, z: 1 } };
function engineWithShell(player: THREE.Vector3) {
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  holder.userData.npcShell = shell;
  scene.add(holder);
  return { scene, player: { position: player } };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  useAdminStore.setState({ isAdmin: true, shellTarget: null, placementAsset: null });
  fixture.catalog.mockResolvedValue({ glbCatalogRevision: "a".repeat(64), assets: [], world: { schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [
    { designKey: shell.designKey, version: 1, title: "NPC-Hüllen", designHash: "d".repeat(64), expectedCatalogRevision: "a".repeat(64),
      placements: [{ placementKey: shell.placementKey, assetId: "glb_ranger", chunkX: 0, chunkZ: 0, xMm: 34_000, zMm: 33_000, rotationQuarterTurns: 0, scalePermille: 1000 }] },
  ] } });
  fixture.retire.mockResolvedValue({ receipt: { receiptId: "authoring:world:x" } });
});
afterEach(() => { vi.useRealTimers(); useAdminStore.setState({ isAdmin: false, shellTarget: null }); });

describe("admin NPC shell window", () => {
  it("shows the E prompt only to the admin and only near a shell", () => {
    const near = { current: engineWithShell(new THREE.Vector3(1, 0, 1)) as never };
    const view = render(<AdminNpcShellPanel engineRef={near} />);
    expect(screen.getByTestId("admin-npc-shell-prompt").textContent).toContain("NPC-Hülle bearbeiten");
    view.unmount();
    render(<AdminNpcShellPanel engineRef={{ current: engineWithShell(new THREE.Vector3(30, 0, 30)) as never }} />);
    expect(screen.queryByTestId("admin-npc-shell-prompt")).toBeNull();
    act(() => useAdminStore.setState({ isAdmin: false }));
    expect(openNearestNpcShell(engineWithShell(new THREE.Vector3(1, 0, 1)) as never)).toBeNull();
    expect(useAdminStore.getState().shellTarget).toBeNull();
  });

  it("opens with E (or the prompt), closes with E again or Escape", () => {
    const engine = engineWithShell(new THREE.Vector3(1, 0, 1));
    render(<AdminNpcShellPanel engineRef={{ current: engine as never }} />);
    act(() => { openNearestNpcShell(engine as never); });
    expect(screen.getByTestId("admin-npc-shell-panel").textContent).toContain("Waldläuferin");
    expect(screen.getByTestId("admin-npc-shell-purpose").textContent).toContain("Noch kein Zweck bestätigt");
    act(() => { openNearestNpcShell(engine as never); });
    expect(screen.queryByTestId("admin-npc-shell-panel")).toBeNull();
    fireEvent.click(screen.getByTestId("admin-npc-shell-prompt"));
    expect(screen.getByTestId("admin-npc-shell-panel")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("admin-npc-shell-panel")).toBeNull();
  });

  it("closes when the admin walks away, so it never edits a shell left behind", async () => {
    const engine = engineWithShell(new THREE.Vector3(1, 0, 1));
    render(<AdminNpcShellPanel engineRef={{ current: engine as never }} />);
    act(() => { openNearestNpcShell(engine as never); });
    engine.player.position.set(40, 0, 40);
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(useAdminStore.getState().shellTarget).toBeNull();
  });

  it("removes the last shell of a group by retiring the group, after a confirming second click", async () => {
    const engine = engineWithShell(new THREE.Vector3(1, 0, 1));
    render(<AdminNpcShellPanel engineRef={{ current: engine as never }} />);
    act(() => { openNearestNpcShell(engine as never); });
    fireEvent.click(screen.getByTestId("admin-glb-remove-placement"));
    expect(fixture.retire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("admin-glb-remove-placement"));
    await waitFor(() => expect(fixture.retire).toHaveBeenCalledWith({ designKey: shell.designKey, expectedDesignHash: "d".repeat(64), confirmation: "RETIRE_ADMIN_PLACEMENTS" }));
    await waitFor(() => expect(useAdminStore.getState().shellTarget).toBeNull());
  });

  it("stays out of the way while the admin is placing", () => {
    useAdminStore.setState({ placementAsset: { assetId: "glb_ranger" } as never });
    render(<AdminNpcShellPanel engineRef={{ current: engineWithShell(new THREE.Vector3(1, 0, 1)) as never }} />);
    expect(screen.queryByTestId("admin-npc-shell-prompt")).toBeNull();
  });

  it("tolerates an engine that is not ready yet", () => {
    render(<AdminNpcShellPanel engineRef={{ current: { scene: undefined, player: undefined } as never }} />);
    expect(screen.queryByTestId("admin-npc-shell-prompt")).toBeNull();
    expect(openNearestNpcShell({ scene: undefined, player: undefined } as never)).toBeNull();
  });

  // Stage C: brief → LLM draft (preview) → one-tap confirmation with receipt.
  const draft = { schemaVersion: "aurion.npc-purpose.v1", shellRef: shell.shellRef, displayName: "Mira Kräuterhand", role: "Kräuterhändlerin",
    persona: "Ruhig und neugierig, kennt jede Pflanze.", greeting: "Willkommen, Wanderer.",
    topics: [{ topic: "Kräuter", line: "Silberblatt wächst im Nebel." }], routine: [{ label: "Beet", offsetXMm: 2000, offsetZMm: 0, dwellSeconds: 120 }],
    questIdeas: [{ title: "Silberblatt", summary: "Drei Silberblätter für einen Trank.", objective: "Sammle drei Silberblätter." }] };

  it("turns a typed brief into a previewed LLM draft and confirms exactly that draft with one tap", async () => {
    const engine = engineWithShell(new THREE.Vector3(1, 0, 1));
    fixture.draft.mockResolvedValue({ status: "AI_DRAFT", draft, draftHash: "e".repeat(64), model: "unit/free:free", failures: [] });
    fixture.purposes.mockResolvedValue({ purposes: [] });
    fixture.confirm.mockResolvedValue({ receipt: { receiptId: "authoring:npc:1" } });
    const changed = vi.fn(); window.addEventListener("aurion:world-visuals-changed", changed);
    render(<AdminNpcShellPanel engineRef={{ current: engine as never }} />);
    act(() => { openNearestNpcShell(engine as never); });
    const button = screen.getByTestId("npc-purpose-draft") as HTMLButtonElement;
    fireEvent.change(screen.getByTestId("npc-purpose-brief"), { target: { value: "kurz" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("npc-purpose-brief"), { target: { value: "Eine Kräuterhändlerin, die Reisenden Heilkräuter verkauft." } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId("npc-purpose-preview").textContent).toContain("Mira Kräuterhand"));
    expect(fixture.draft).toHaveBeenCalledWith({ shellRef: shell.shellRef, brief: "Eine Kräuterhändlerin, die Reisenden Heilkräuter verkauft.", mode: "auto" });
    expect(screen.getByTestId("npc-purpose-preview").textContent).toContain("noch nicht gespeichert");
    expect(fixture.confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("npc-purpose-confirm"));
    await waitFor(() => expect(screen.getByTestId("npc-purpose-status").textContent).toContain("Bestätigt und mit Beleg gespeichert"));
    expect(fixture.confirm).toHaveBeenCalledWith({ draft, expectedDraftHash: "e".repeat(64), expectedPreviousPurposeHash: null, confirmation: "CONFIRM_NPC_PURPOSE" });
    expect(changed).toHaveBeenCalled();
    window.removeEventListener("aurion:world-visuals-changed", changed);
  });

  it("explains why no draft came back instead of failing silently, and never confirms", async () => {
    const engine = engineWithShell(new THREE.Vector3(1, 0, 1));
    fixture.draft.mockResolvedValue({ status: "UNRESOLVED", failures: [{ route: "local", code: "OFFLINE" }, { route: "free", code: "FREE_RATE_LIMIT" }] });
    render(<AdminNpcShellPanel engineRef={{ current: engine as never }} />);
    act(() => { openNearestNpcShell(engine as never); });
    fireEvent.change(screen.getByTestId("npc-purpose-brief"), { target: { value: "Ein alter Wächter, der den Pass bewacht." } });
    fireEvent.click(screen.getByTestId("npc-purpose-draft"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Tageslimit");
    expect(screen.queryByTestId("npc-purpose-confirm")).toBeNull();
  });

  it("passes the current confirmed purpose as predecessor when revising, and shows it", async () => {
    const confirmedShell = { ...shell, purpose: { purposeHash: "f".repeat(64), displayName: "Mira", role: "Händlerin", greeting: "Hallo!", topics: [] } };
    const scene = new THREE.Scene(); const holder = new THREE.Group(); holder.userData.npcShell = confirmedShell; scene.add(holder);
    const engine = { scene, player: { position: new THREE.Vector3(1, 0, 1) } };
    fixture.draft.mockResolvedValue({ status: "AI_DRAFT", draft, draftHash: "e".repeat(64), model: "unit/free:free", failures: [] });
    fixture.purposes.mockResolvedValue({ purposes: [{ shellRef: shell.shellRef, purposeHash: "f".repeat(64) }] });
    fixture.confirm.mockResolvedValue({ receipt: { receiptId: "authoring:npc:2" } });
    render(<AdminNpcShellPanel engineRef={{ current: engine as never }} />);
    act(() => { openNearestNpcShell(engine as never); });
    expect(screen.getByTestId("admin-npc-shell-purpose").textContent).toContain("Mira");
    fireEvent.change(screen.getByTestId("npc-purpose-brief"), { target: { value: "Sie soll jetzt auch Tränke brauen." } });
    fireEvent.click(screen.getByTestId("npc-purpose-draft"));
    await waitFor(() => expect(screen.getByTestId("npc-purpose-confirm")).toBeTruthy());
    fireEvent.click(screen.getByTestId("npc-purpose-confirm"));
    await waitFor(() => expect(fixture.confirm).toHaveBeenCalledWith(expect.objectContaining({ expectedPreviousPurposeHash: "f".repeat(64) })));
  });
});
