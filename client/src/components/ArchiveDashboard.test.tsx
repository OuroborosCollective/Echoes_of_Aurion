import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ArchiveDashboard from "./ArchiveDashboard";

// Explicit presentation-only fixture; never canonical archive or runtime evidence.
const archive = {
  id: "test_archive_1", createdAt: "2026-01-02T00:00:00Z",
  startTick: 10, endTick: 20, receiptCount: 2, archiveHash: "a".repeat(64),
  payloadJson: "[]",
};
vi.mock("@/lib/trpc", () => ({
  trpc: { causality: { getArchives: { useQuery: () => ({
    data: [archive], isLoading: false, isFetching: false, refetch: vi.fn(),
  }) } } },
}));
afterEach(cleanup);

describe("ArchiveDashboard native archive selection accessibility", () => {
  it("uses a genuine labelled button, not a nested interactive div, and updates the selected archive", () => {
    render(<ArchiveDashboard />);
    const select = screen.getByRole("button", { name: "Archiv test_archive_1 auswählen" });
    expect(select.tagName).toBe("BUTTON");
    expect(select.getAttribute("aria-pressed")).toBe("false");
    expect(within(select).queryByRole("button")).toBeNull();
    fireEvent.click(select);
    expect(select.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("test_archive_1")).toHaveLength(2);
  });
});
