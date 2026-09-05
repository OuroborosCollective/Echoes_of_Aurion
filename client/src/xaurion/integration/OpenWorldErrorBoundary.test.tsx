import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { OpenWorldErrorBoundary } from "./OpenWorldErrorBoundary";

describe("open world error isolation", () => {
  it("unmounts a failed world while keeping the tower and its return handler alive", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const stop = vi.fn();
    const returnToTower = vi.fn();
    window.addEventListener("aurion:xaurion-return-request", returnToTower);
    function World({ fail }: { fail: boolean }) {
      useEffect(() => stop, []);
      if (fail) throw new Error("private internal failure details");
      return <p>World running</p>;
    }
    const content = (fail: boolean) => <><p>Tower remains available</p><OpenWorldErrorBoundary><World fail={fail} /></OpenWorldErrorBoundary></>;
    try {
      const view = render(content(false));
      view.rerender(content(true));
      expect(stop).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Tower remains available")).toBeTruthy();
      expect(screen.getByRole("alert").textContent).not.toContain("private internal failure details");
      fireEvent.click(screen.getByRole("button", { name: "ZUR STERNWARTE" }));
      expect(returnToTower).toHaveBeenCalledTimes(1);
      view.rerender(content(false));
      fireEvent(window, new Event("aurion:return-to-tower"));
      expect(screen.getByText("World running")).toBeTruthy();
    } finally {
      window.removeEventListener("aurion:xaurion-return-request", returnToTower);
      errors.mockRestore();
    }
  });
});
