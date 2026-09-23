import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMovementController } from "./MobileMovementController";

vi.mock("./VirtualJoystick", () => ({ VirtualJoystick: () => <div data-testid="virtual-joystick" /> }));

describe("MobileMovementController", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="three-viewport"><canvas id="threejs-canvas"></canvas><button id="hud-action">HUD</button></div>';
  });

  it("owns either joystick or touch-to-move, never both", () => {
    const { rerender, queryByTestId } = render(
      <MobileMovementController mode="joystick" onMove={vi.fn()} onDestination={vi.fn()} />,
    );
    expect(queryByTestId("virtual-joystick")).toBeTruthy();
    expect(queryByTestId("ax1-touch-to-move")).toBeNull();
    rerender(<MobileMovementController mode="touch_to_move" onMove={vi.fn()} onDestination={vi.fn()} />);
    expect(queryByTestId("virtual-joystick")).toBeNull();
    expect(queryByTestId("ax1-touch-to-move")).toBeTruthy();
  });

  it("accepts a tap on the world canvas but ignores HUD descendants", () => {
    const onDestination = vi.fn();
    render(<MobileMovementController mode="touch_to_move" onMove={vi.fn()} onDestination={onDestination} />);
    const canvas = document.getElementById("threejs-canvas")!;
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: "touch", clientX: 100, clientY: 120, isPrimary: true });
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: "touch", clientX: 101, clientY: 121, isPrimary: true });
    expect(onDestination).toHaveBeenCalledWith({ screenX: 101, screenY: 121 });
    const button = document.getElementById("hud-action")!;
    fireEvent.pointerDown(button, { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 220, isPrimary: true });
    fireEvent.pointerUp(button, { pointerId: 2, pointerType: "touch", clientX: 200, clientY: 220, isPrimary: true });
    expect(onDestination).toHaveBeenCalledTimes(1);
  });
});
