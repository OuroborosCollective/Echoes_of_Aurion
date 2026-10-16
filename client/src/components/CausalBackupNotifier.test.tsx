// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "sonner";
import { CausalBackupNotifier } from "./CausalBackupNotifier";

vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({}) } }));
afterEach(() => { toast.dismiss(); cleanup(); });

describe("passive backup notification", () => {
  it("passes pointer input through the rendered confirmation while action toasts remain interactive", async () => {
    const action = vi.fn();
    render(<><Toaster /><CausalBackupNotifier /></>);
    act(() => {
      window.dispatchEvent(new CustomEvent("aurion:causal-backup-confirmed", { detail: { message: "Sitzung serverseitig gesichert" } }));
      toast("Separate interactive notice", { action: { label: "Inspect receipt", onClick: action } });
    });
    const confirmation = await screen.findByText("Sitzung serverseitig gesichert");
    const passiveToast = confirmation.closest<HTMLElement>("[data-sonner-toast]")!;
    expect(window.getComputedStyle(passiveToast).pointerEvents).toBe("none");
    expect(window.getComputedStyle(confirmation).pointerEvents).toBe("none");
    const button = await screen.findByRole("button", { name: "Inspect receipt" });
    expect(window.getComputedStyle(button.closest<HTMLElement>("[data-sonner-toast]")!).pointerEvents).not.toBe("none");
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
