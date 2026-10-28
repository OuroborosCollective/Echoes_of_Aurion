import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArchiveDashboard from "./ArchiveDashboard";

const queryFixture = vi.hoisted(() => ({ fetching: false, refetch: vi.fn(), archives: [] as Array<{ id: string; createdAt: string; startTick: number; endTick: number; receiptCount: number; archiveHash: string; payloadJson: string }> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    causality: {
      getArchives: {
        useQuery: () => ({
          data: queryFixture.archives,
          isLoading: false,
          isFetching: queryFixture.fetching,
          refetch: queryFixture.refetch,
        }),
      },
    },
  },
}));

describe("ArchiveDashboard authoritative archive readback refresh", () => {
  beforeEach(() => {
    queryFixture.fetching = false;
    queryFixture.refetch.mockReset();
  });

  it("allows a refresh when idle, but disables duplicate requests while fetching", () => {
    const view = render(<ArchiveDashboard />);
    const idle = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;

    expect(idle.disabled).toBe(false);
    expect(idle.getAttribute("aria-busy")).toBe("false");
    fireEvent.click(idle);
    expect(queryFixture.refetch).toHaveBeenCalledTimes(1);

    queryFixture.fetching = true;
    view.rerender(<ArchiveDashboard />);
    const busy = screen.getByRole("button", { name: "Refreshing..." }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.getAttribute("title")).toBe("Refreshing...");
    fireEvent.click(busy);
    expect(queryFixture.refetch).toHaveBeenCalledTimes(1);

    queryFixture.fetching = false;
    view.rerender(<ArchiveDashboard />);
    const again = screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    expect(again.getAttribute("aria-busy")).toBe("false");
  });
});


describe("ArchiveDashboard accessible archive selection (presentation-only fixtures)", () => {
  beforeEach(() => {
    queryFixture.fetching = false;
    queryFixture.archives = [{
      id: "test_archive_1",
      createdAt: "2026-01-02T00:00:00Z",
      startTick: 10,
      endTick: 20,
      receiptCount: 2,
      archiveHash: "a".repeat(64),
      payloadJson: "[]",
    }];
  });
  afterEach(() => { queryFixture.archives = []; });

  it("provides native keyboard selection and an honest non-interactive payload hint", async () => {
    const user = userEvent.setup();
    render(<ArchiveDashboard />);

    // RED on main: archive is a clickable div, not a semantic button.
    const select = screen.getByRole("button", { name: "Archiv test_archive_1 auswählen" });
    expect(select.tagName).toBe("BUTTON");
    expect(select.getAttribute("aria-pressed")).toBe("false");
    expect(within(select).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Inspect Payload" })).toBeNull();
    select.focus();
    expect(document.activeElement).toBe(select);
    await user.keyboard("{Enter}");
    expect(select.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("test_archive_1")).toHaveLength(2);
  });
});
