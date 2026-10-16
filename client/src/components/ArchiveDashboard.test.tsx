import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ArchiveDashboard from "./ArchiveDashboard";

const queryFixture = vi.hoisted(() => ({ fetching: false, refetch: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    causality: {
      getArchives: {
        useQuery: () => ({
          data: [],
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
