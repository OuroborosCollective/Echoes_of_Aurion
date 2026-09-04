import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GlbUpload from "./GlbUpload";

const authState = vi.hoisted(() => ({
  user: { id: 7, role: "admin", name: "Aurion Admin", email: "admin@example.invalid" } as { id: number; role: "admin" | "user"; name: string; email: string },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ loading: false, user: authState.user }),
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: unknown }) => <>{children}</>,
}));

function serverReadback(fileName: string) {
  const isPlayer = fileName.includes("player");
  return {
    accepted: true as const,
    fileName,
    classification: {
      assetType: isPlayer ? "character" as const : "enemy" as const,
      subcategory: isPlayer ? "standard_player" : "spider",
      confidence: "high" as const,
      animationNames: isPlayer ? ["Idle", "Walk", "Run"] : ["Idle", "Walk", "Attack", "Death"],
      skinCount: 1,
      socketCount: isPlayer ? 14 : 0,
      lod: null,
    },
  };
}

function mockSuccessfulFetch() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { fileName: string };
    return {
      ok: true,
      status: 201,
      json: async () => serverReadback(body.fileName),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function glbFile(name: string) {
  return new File(
    [new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 0])],
    name,
    { type: "model/gltf-binary" },
  );
}

describe("GLB upload website runtime", () => {
  beforeEach(() => {
    authState.user = { id: 7, role: "admin", name: "Aurion Admin", email: "admin@example.invalid" };
    vi.unstubAllGlobals();
  });

  it("uploads multiple GLBs sequentially without browser-authored asset types and renders each server readback", async () => {
    const fetchMock = mockSuccessfulFetch();
    render(<GlbUpload />);

    expect(screen.getByText("GLB automatisch einsortieren")).toBeTruthy();
    const input = document.querySelector<HTMLInputElement>("#smartGlbFile");
    expect(input).toBeTruthy();
    expect(input?.multiple).toBe(true);

    const player = glbFile("aurion-player-standard.glb");
    const spider = glbFile("starter-spider.glb");
    fireEvent.change(input!, { target: { files: [player, spider] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe("/api/admin/glb-smart-upload");
      expect(call[1]).toMatchObject({ method: "POST", credentials: "include" });
      const requestBody = JSON.parse(String(call[1]?.body)) as Record<string, unknown>;
      expect(typeof requestBody.contentBase64).toBe("string");
      expect(requestBody).not.toHaveProperty("assetType");
    }

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(firstBody).toMatchObject({ displayName: "aurion player standard", fileName: "aurion-player-standard.glb" });
    expect(secondBody).toMatchObject({ displayName: "starter spider", fileName: "starter-spider.glb" });

    await waitFor(() => expect(screen.getByText("2/2 Dateien wurden angenommen. Jede Datei besitzt einen eigenen serverseitigen Klassifikationsnachweis.")).toBeTruthy());
    expect(screen.getByText("aurion-player-standard.glb")).toBeTruthy();
    expect(screen.getByText("starter-spider.glb")).toBeTruthy();
    expect(screen.getByText("character")).toBeTruthy();
    expect(screen.getByText("enemy")).toBeTruthy();
  });

  it("continues the batch when one file is invalid", async () => {
    const fetchMock = mockSuccessfulFetch();
    render(<GlbUpload />);
    const input = document.querySelector<HTMLInputElement>("#smartGlbFile");
    fireEvent.change(input!, { target: { files: [new File(["bad"], "notes.txt"), glbFile("starter-spider.glb")] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText("notes.txt")).toBeTruthy();
    expect(screen.getByText("Nur binäre GLB-Dateien (.glb) werden akzeptiert.")).toBeTruthy();
    expect(screen.getByText("starter-spider.glb")).toBeTruthy();
  });

  it("does not expose the upload control to a non-admin user", () => {
    authState.user = { id: 9, role: "user", name: "Explorer", email: "explorer@example.invalid" };
    const fetchMock = mockSuccessfulFetch();
    render(<GlbUpload />);

    expect(screen.getByText("Nur für Aurion-Admins")).toBeTruthy();
    expect(document.querySelector("#smartGlbFile")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
