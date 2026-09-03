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

const serverReadback = {
  accepted: true as const,
  fileName: "starter-spider.glb",
  classification: {
    assetType: "enemy" as const,
    subcategory: "spider",
    confidence: "high" as const,
    animationNames: ["Idle", "Walk", "Attack", "Death"],
    skinCount: 1,
    socketCount: 0,
    lod: null,
  },
};

function mockSuccessfulFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 201,
    json: async () => serverReadback,
  } as Response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GLB upload website runtime", () => {
  beforeEach(() => {
    authState.user = { id: 7, role: "admin", name: "Aurion Admin", email: "admin@example.invalid" };
    vi.unstubAllGlobals();
  });

  it("uploads GLB bytes without a browser-authored asset type and renders the server classification", async () => {
    const fetchMock = mockSuccessfulFetch();
    render(<GlbUpload />);

    expect(screen.getByText("GLB automatisch einsortieren")).toBeTruthy();
    const input = document.querySelector<HTMLInputElement>("#smartGlbFile");
    expect(input).toBeTruthy();

    const file = new File(
      [new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0])],
      "starter-spider.glb",
      { type: "model/gltf-binary" },
    );
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/admin/glb-smart-upload");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });

    const requestBody = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      displayName: "starter spider",
      fileName: "starter-spider.glb",
    });
    expect(typeof requestBody.contentBase64).toBe("string");
    expect(String(requestBody.contentBase64).length).toBeGreaterThan(16);
    expect(requestBody).not.toHaveProperty("assetType");

    await waitFor(() => expect(screen.getByText("Server-Readback")).toBeTruthy());
    expect(screen.getByText("enemy")).toBeTruthy();
    expect(screen.getByText("spider")).toBeTruthy();
    expect(screen.getByText("Animationen: Idle, Walk, Attack, Death")).toBeTruthy();
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
