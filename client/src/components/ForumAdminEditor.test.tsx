import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForumAdminEditor from "./ForumAdminEditor";

// Isolated component fixtures; no claim about production data or persistence.
const fixture = vi.hoisted(() => ({ pending: false, mutate: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { community: { listEditorialThreads: { invalidate: fixture.invalidate } } }, community: { forum: { list: { invalidate: fixture.invalidate } } } }),
    admin: { community: {
      listEditorialThreads: { useQuery: () => ({ data: [{ id: "t1", title: "Observatorium", category: "events", body: "Sternenfest", pinned: true }] }) },
      updateForumThread: { useMutation: () => ({ isPending: fixture.pending, mutate: fixture.mutate, error: null }) },
    } },
  },
}));

afterEach(() => { fixture.pending = false; vi.clearAllMocks(); });
describe("editorial thread accessibility", () => {
  it("preserves the visible category in the accessible name and exposes selection", () => {
    render(<ForumAdminEditor />);
    const thread = screen.getByRole("button", { name: /Observatorium.*events.*angeheftet/i });
    expect(thread.getAttribute("aria-pressed")).toBe("false");
    expect(thread.className).toContain("focus-visible:ring-2");
    fireEvent.click(thread);
    expect(thread.getAttribute("aria-pressed")).toBe("true");
  });
  it("announces the pending state while preventing duplicate submission", () => {
    const { rerender } = render(<ForumAdminEditor />);
    fireEvent.click(screen.getByRole("button", { name: /Observatorium.*events.*angeheftet/i }));
    const save = screen.getByRole("button", { name: "Redaktionseintrag speichern" });
    expect(save.getAttribute("aria-busy")).toBe("false");
    fixture.pending = true;
    rerender(<ForumAdminEditor />);
    const pending = screen.getByRole("button", { name: "Bearbeitung wird bestätigt…" });
    expect(pending.getAttribute("aria-busy")).toBe("true");
    expect(pending).toHaveProperty("disabled", true);
  });
});
