import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VirtualJoystick } from "./VirtualJoystick";

const originalMatchMedia = window.matchMedia;
const originalPointerEvent = window.PointerEvent;
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}
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
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });
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
  expect(stick.getAttribute("data-active")).toBe("false");
  expect(stick.querySelector(".ax-joy__knob")?.getAttribute("style")).toContain("0px");
});

it("keeps the first touch in control and releases it when capture is lost", () => {
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });
  const onMove = vi.fn();
  render(<VirtualJoystick onMove={onMove} />);
  const stick = screen.getByTestId("ax1-movement-control");
  Object.defineProperty(stick, "setPointerCapture", { configurable: true, value: vi.fn() });
  Object.defineProperty(stick, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 100, height: 100 }) });

  fireEvent.pointerDown(stick, { clientX: 50, clientY: 16, pointerId: 1 });
  expect(onMove).toHaveBeenLastCalledWith(1, 0);
  const firstTouchCalls = onMove.mock.calls.length;
  fireEvent.pointerDown(stick, { clientX: 84, clientY: 50, pointerId: 2 });
  fireEvent.pointerMove(stick, { clientX: 84, clientY: 50, pointerId: 2 });
  fireEvent.pointerUp(stick, { pointerId: 2 });
  expect(onMove).toHaveBeenCalledTimes(firstTouchCalls);
  expect(stick.getAttribute("data-active")).toBe("true");

  fireEvent.pointerMove(stick, { clientX: 84, clientY: 50, pointerId: 1 });
  expect(onMove).toHaveBeenLastCalledWith(-0, 1);
  fireEvent(stick, new TestPointerEvent("lostpointercapture", { bubbles: true, pointerId: 1 }));
  expect(onMove).toHaveBeenLastCalledWith(0, 0);
  expect(stick.getAttribute("data-active")).toBe("false");
});
