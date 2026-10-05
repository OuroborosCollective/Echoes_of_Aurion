// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicCharacterPicker } from "./PublicCharacterPicker";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const entry = {
  assetId: "glb_" + "a".repeat(48),
  sha256: "b".repeat(64),
  displayName: "Player Public · Starter Village Pilot Public Avatar",
  assetType: "character",
  storageUrl: "/api/assets/glb/" + "b".repeat(64) + ".glb",
  targetKey: null,
  purpose: "player-public",
  subcategory: "rigged-character",
  equipmentSlot: null,
};

function response(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body }) as Promise<Response>;
}

describe("PublicCharacterPicker", () => {
  it("keeps loading distinct while the canonical catalog request is unresolved", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    render(<PublicCharacterPicker />);
    expect(screen.getByTestId("public-character-picker").getAttribute("data-catalog-state")).toBe("loading");
    expect(screen.getByTestId("public-character-catalog-loading")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("renders the canonical empty state instead of inventing a selectable fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({
      version: "aurion.glb-import.v1",
      revision: "c".repeat(64),
      entries: [],
      selected: null,
      immutable: false,
    })));
    render(<PublicCharacterPicker />);
    expect((await screen.findByTestId("public-character-catalog-empty")).textContent).toContain(
      "Noch kein Charakter wurde vom Admin als öffentliche Spielerwahl freigegeben.",
    );
    expect(screen.getByTestId("public-character-picker").getAttribute("data-catalog-state")).toBe("empty");
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("surfaces a bounded catalog failure instead of leaving a permanent loading state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "unavailable" }, false, 503)));
    render(<PublicCharacterPicker />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Öffentliche Charaktermodelle konnten nicht geladen werden.",
    );
    expect(screen.getByTestId("public-character-picker").getAttribute("data-catalog-state")).toBe("failed");
    expect(screen.queryByText("Charaktermodelle werden geladen…")).toBeNull();
  });

  it("distinguishes an already permanent server selection and releases the gate from that readback", async () => {
    const onSelected = vi.fn();
    const selected = {
      assetId: entry.assetId,
      displayName: entry.displayName,
      storageUrl: entry.storageUrl,
      visibility: "public" as const,
    };
    vi.stubGlobal("fetch", vi.fn(() => response({
      version: "aurion.glb-import.v1",
      revision: "d".repeat(64),
      entries: [entry],
      selected,
      immutable: true,
    })));
    render(<PublicCharacterPicker onSelected={onSelected} />);
    expect(await screen.findByTestId("public-character-catalog-selected")).toBeTruthy();
    expect(screen.getByTestId("public-character-picker").getAttribute("data-catalog-state")).toBe("selected");
    expect(screen.queryByRole("radio")).toBeNull();
    await waitFor(() => expect(onSelected).toHaveBeenCalledWith(selected));
  });

  it("releases the gate only after the exact server-confirmed public selection readback", async () => {
    const onSelected = vi.fn();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({
        version: "aurion.glb-import.v1",
        revision: "e".repeat(64),
        entries: [entry],
        selected: null,
        immutable: false,
      }))
      .mockImplementationOnce(() => response({
        assetId: entry.assetId,
        displayName: entry.displayName,
        storageUrl: entry.storageUrl,
        visibility: "public",
        immutable: true,
      }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PublicCharacterPicker onSelected={onSelected} />);
    expect(await screen.findByTestId("public-character-catalog-ready")).toBeTruthy();
    expect(screen.getByTestId("public-character-picker").getAttribute("data-catalog-state")).toBe("ready");
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(entry.displayName) }));
    fireEvent.click(screen.getByRole("button", { name: "Dauerhaft wählen" }));
    await waitFor(() => expect(onSelected).toHaveBeenCalledWith(expect.objectContaining({
      assetId: entry.assetId,
      storageUrl: entry.storageUrl,
      visibility: "public",
    })));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/game/public-player-characters/select", expect.objectContaining({ method: "POST" }));
  });
});
