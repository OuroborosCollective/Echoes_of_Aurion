import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VirtualJoystick } from "./VirtualJoystick";

const originalMatchMedia = window.matchMedia;
const originalPointerEvent = window.PointerEvent;
afterEach(() => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: originalPointerEvent });
});

it("releases held movement when switching from desktop to touch controls", () => {
  let matches = true;
  let change: (() => void) | undefined;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    get matches() { return matches; }, media: query, onchange: null,
    addEventListener: (_: string, cb: () => void) => { change = cb; }, removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) });
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: MouseEvent });
  const onMove = vi.fn();
  render(<VirtualJoystick onMove={onMove} />);
  const stick = screen.getByTestId("ax1-movement-control");
  expect(stick.classList.contains("ax-joy")).toBe(false);
  Object.defineProperty(stick, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(stick, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 100, height: 100 }) });
  fireEvent.pointerDown(stick, { clientX: 50, clientY: 16, pointerId: 1 });
  expect(onMove).toHaveBeenLastCalledWith(1, 0);
  act(() => { matches = false; change?.(); });
  expect(onMove).toHaveBeenLastCalledWith(0, 0);
  expect(screen.getByTestId("ax1-movement-control").classList.contains("ax-joy")).toBe(true);
});
