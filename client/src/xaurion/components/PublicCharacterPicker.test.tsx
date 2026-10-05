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
  it("renders the canonical empty state instead of inventing a selectable fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({
      version: "aurion.glb-import.v1",
      revision: "c".repeat(64),
      entries: [],
      selected: null,
      immutable: false,
    })));
    render(<PublicCharacterPicker />);
    expect(await screen.findByTestId("public-character-catalog-empty")).toHaveTextContent(
      "Noch kein Charakter wurde vom Admin als öffentliche Spielerwahl freigegeben.",
    );
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("surfaces a bounded catalog failure instead of leaving a permanent loading state", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response({ error: "unavailable" }, false, 503)));
    render(<PublicCharacterPicker />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Öffentliche Charaktermodelle konnten nicht geladen werden.",
    );
    expect(screen.queryByText("Charaktermodelle werden geladen…")).toBeNull();
  });

  it("releases the gate only after the exact server-confirmed public selection readback", async () => {
    const onSelected = vi.fn();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({
        version: "aurion.glb-import.v1",
        revision: "d".repeat(64),
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
    fireEvent.click(await screen.findByRole("radio", { name: new RegExp(entry.displayName) }));
    fireEvent.click(screen.getByRole("button", { name: "Dauerhaft wählen" }));
    await waitFor(() => expect(onSelected).toHaveBeenCalledWith(expect.objectContaining({
      assetId: entry.assetId,
      storageUrl: entry.storageUrl,
      visibility: "public",
    })));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/game/public-player-characters/select", expect.objectContaining({ method: "POST" }));
  });
});
