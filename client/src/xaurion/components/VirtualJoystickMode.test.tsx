import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VirtualJoystick } from "./VirtualJoystick";

vi.mock("./LegacyVirtualJoystick", () => ({ VirtualJoystick: ({ onMove }: { onMove: (a: number, b: number) => void }) => <button onClick={() => onMove(1, 0)}>Desktop stick</button> }));
vi.mock("./MobileVirtualJoystick", () => ({ VirtualJoystick: ({ onMove }: { onMove: (a: number, b: number) => void }) => <button onClick={() => onMove(0, 1)}>Mobile stick</button> }));
const originalMatchMedia = window.matchMedia;
afterEach(() => Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia }));

it("releases a held movement when switching from desktop to touch controls", () => {
  let matches = true;
  let change: (() => void) | undefined;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    get matches() { return matches; }, media: query, onchange: null,
    addEventListener: (_: string, cb: () => void) => { change = cb; }, removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) });
  const onMove = vi.fn();
  render(<VirtualJoystick onMove={onMove} />);
  fireEvent.click(screen.getByRole("button", { name: "Desktop stick" }));
  expect(onMove).toHaveBeenLastCalledWith(1, 0);
  act(() => { matches = false; change?.(); });
  expect(onMove).toHaveBeenLastCalledWith(0, 0);
  expect(screen.getByRole("button", { name: "Mobile stick" })).toBeTruthy();
});
