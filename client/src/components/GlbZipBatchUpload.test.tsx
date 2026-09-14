import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GlbZipBatchUpload from "./GlbZipBatchUpload";

function successfulReadback() {
  return {
    accepted: true,
    archiveSha256: "a".repeat(64),
    fileCount: 2,
    familyCount: 1,
    compressedBytes: 512,
    uncompressedBytes: 1024,
    fallbackPurpose: "auto",
    catalogRevision: "b".repeat(64),
    catalogCount: 42,
    entries: [
      {
        archivePath: "npc-fallback/Female_Ranger_LOD0.glb",
        fileName: "Female_Ranger_LOD0.glb",
        displayName: "Female Ranger LOD0",
        purpose: "npc-fallback",
        familyName: "Female Ranger",
        lodLevel: 0,
        classification: { assetType: "character", subcategory: "universal-humanoid", equipmentSlot: null },
        receipt: { assetId: "glb_1", sha256: "c".repeat(64), deduplicated: false },
      },
      {
        archivePath: "npc-fallback/Female_Ranger_LOD1.glb",
        fileName: "Female_Ranger_LOD1.glb",
        displayName: "Female Ranger LOD1",
        purpose: "npc-fallback",
        familyName: "Female Ranger",
        lodLevel: 1,
        classification: { assetType: "character", subcategory: "universal-humanoid", equipmentSlot: null },
        receipt: { assetId: "glb_2", sha256: "d".repeat(64), deduplicated: true },
      },
    ],
  };
}

describe("GLB ZIP batch upload UI", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("sends the ZIP as raw bytes with the selected fallback purpose and renders server receipts", async () => {
    const onComplete = vi.fn();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 201,
      json: async () => successfulReadback(),
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    render(<GlbZipBatchUpload fallbackPurpose="world-nature" onComplete={onComplete} />);

    expect(screen.getByText("ZIP-Batch · viele GLBs in einem Upload")).toBeTruthy();
    const input = document.querySelector<HTMLInputElement>("#glbZipFile");
    expect(input).toBeTruthy();
    const archive = new File([new Uint8Array(22)], "aurion-assets.zip", { type: "application/zip" });
    fireEvent.change(input!, { target: { files: [archive] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/glb-zip-upload?purpose=world-nature");
    expect(init).toMatchObject({ method: "POST", credentials: "include", headers: { "Content-Type": "application/zip" }, body: archive });
    await waitFor(() => expect(screen.getByText("2 GLBs · 1 logische Familien aufgenommen")).toBeTruthy());
    expect(screen.getByText("npc-fallback/Female_Ranger_LOD0.glb")).toBeTruthy();
    expect(screen.getByText("npc-fallback/Female_Ranger_LOD1.glb")).toBeTruthy();
    expect(screen.getByText("bereits vorhanden", { exact: false })).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-ZIP file in the browser before any request", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<GlbZipBatchUpload fallbackPurpose="auto" onComplete={() => undefined} />);
    const input = document.querySelector<HTMLInputElement>("#glbZipFile");
    fireEvent.change(input!, { target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });
    expect(screen.getByRole("alert").textContent).toContain("Bitte ein ZIP-Archiv auswählen.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
