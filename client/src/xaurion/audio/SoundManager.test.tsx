import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SoundManager } from "./SoundManager";

vi.mock("@/lib/soundscape", () => ({
  AurionSoundscape: class {
    setMasterVolume() {}
    dispose() {}
  },
}));
vi.mock("../core/AdminService", () => ({ useAdminStore: () => ({ isAdmin: false }) }));

afterEach(() => { cleanup(); localStorage.removeItem("aurion:audio:isMuted"); });

it("keeps mute functional when the mobile HUD owns its menu controls", async () => {
  localStorage.setItem("aurion:audio:isMuted", "false");
  const { rerender } = render(<SoundManager hideControls />);
  expect(screen.queryByTitle("Mute")).toBeNull();
  act(() => window.dispatchEvent(new Event("aurion:audio-toggle")));
  await waitFor(() => expect(localStorage.getItem("aurion:audio:isMuted")).toBe("true"));
  rerender(<SoundManager />);
  expect(screen.getByTitle("Unmute")).toBeTruthy();
});
