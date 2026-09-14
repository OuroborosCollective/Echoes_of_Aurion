import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navigateBrowser } from "@/lib/browserNavigation";
import { RealClientHarness } from "@/test/realClientHarness";
import LocalAuthPanel from "./LocalAuthPanel";

vi.mock("@/lib/browserNavigation", () => ({ navigateBrowser: vi.fn() }));

describe("LocalAuthPanel OIDC redirect state", () => {
  beforeEach(() => {
    vi.mocked(navigateBrowser).mockReset();
  });

  it("keeps the redirect control focusable and blocks duplicate navigation while busy", async () => {
    const user = userEvent.setup();
    render(<RealClientHarness><LocalAuthPanel /></RealClientHarness>);

    act(() => {
      window.dispatchEvent(new Event("aurion:open-local-auth"));
    });

    const button = screen.getByRole("button", { name: "Mit FusionAuth anmelden" });
    button.focus();
    expect(document.activeElement).toBe(button);

    await user.click(button);

    expect(navigateBrowser).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.textContent).toContain("WIRD GELADEN");
    expect(document.activeElement).toBe(button);

    await user.click(button);
    expect(navigateBrowser).toHaveBeenCalledTimes(1);
  });
});
