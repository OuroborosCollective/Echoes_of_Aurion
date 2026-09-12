import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Community from "./Community";

const auth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => auth }));

function openPanel(button: RegExp): unknown[] {
  const seen: unknown[] = [];
  const listener = (event: Event) => seen.push((event as CustomEvent).detail);
  window.addEventListener("aurion:open-community", listener);
  try { fireEvent.click(screen.getByRole("button", { name: button })); }
  finally { window.removeEventListener("aurion:open-community", listener); }
  return seen;
}

describe("productive community navigation", () => {
  beforeEach(() => { auth.isAuthenticated = false; });

  it("opens the public asset catalog through the existing community bridge", () => {
    render(<Community />);
    expect(openPanel(/Asset-Katalog/)).toEqual([{ panel: "assets" }]);
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("explains guest restrictions visibly and keeps protected navigation disabled", () => {
    render(<Community />);
    const explanation = screen.getByText("Melde dich an, um Signalraum und Gildenzugehörigkeit zu öffnen.");
    for (const name of [/Signalraum/, /Gildenzugehörigkeit/]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-describedby")).toBe(explanation.id);
      expect(button.className).toContain("disabled:motion-safe:hover:translate-y-0");
      expect(button.className).toContain("disabled:motion-safe:active:scale-100");
      expect(openPanel(name)).toEqual([]);
    }
  });

  it("gates tactile transforms behind the user's reduced-motion preference", () => {
    render(<Community />);
    const forum = screen.getByRole("button", { name: /^Forum/ });
    expect(forum.className).toContain("motion-safe:hover:-translate-y-0.5");
    expect(forum.className).toContain("motion-safe:active:scale-95");
    expect(forum.className).not.toContain(" hover:-translate-y-0.5");
    expect(forum.className).not.toContain(" active:scale-95");
  });

  it("opens authenticated chat and read-only guild panels exactly once", () => {
    auth.isAuthenticated = true;
    render(<Community />);
    expect(openPanel(/Signalraum/)).toEqual([{ panel: "chat" }]);
    expect(openPanel(/Gildenzugehörigkeit/)).toEqual([{ panel: "guild" }]);
    expect(screen.queryByText("Melde dich an, um Signalraum und Gildenzugehörigkeit zu öffnen.")).toBeNull();
  });

  it("preserves public forum and event navigation", () => {
    render(<Community />);
    expect(openPanel(/^Forum/)).toEqual([{ panel: "forum" }]);
    expect(openPanel(/^Events/)).toEqual([{ panel: "events" }]);
  });
});
