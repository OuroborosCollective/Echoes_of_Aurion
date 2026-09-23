import { useEffect, useRef } from "react";
import type { MovementMode } from "@shared/playerUiProtocol";
import { VirtualJoystick } from "./VirtualJoystick";

type TouchDestination = { screenX: number; screenY: number };

export function MobileMovementController({
  mode,
  enabled = true,
  onMove,
  onDestination,
}: {
  mode: MovementMode;
  enabled?: boolean;
  onMove: (forward: number, right: number) => void;
  onDestination: (destination: TouchDestination) => void;
}) {
  const onDestinationRef = useRef(onDestination);
  onDestinationRef.current = onDestination;

  useEffect(() => {
    if (mode !== "touch_to_move" || !enabled) {
      onMove(0, 0);
      return;
    }
    const canvas = document.getElementById("threejs-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;

    let started: { x: number; y: number; pointerId: number; time: number } | null = null;
    const TAP_MAX_DISTANCE = 14;
    const TAP_MAX_DURATION_MS = 550;

    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || event.isPrimary === false) return;
      if (event.pointerType === "touch") event.preventDefault();
      started = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, time: performance.now() };
    };
    const up = (event: PointerEvent) => {
      if (!started || event.pointerId !== started.pointerId) return;
      const distance = Math.hypot(event.clientX - started.x, event.clientY - started.y);
      const duration = performance.now() - started.time;
      if (distance <= TAP_MAX_DISTANCE && duration <= TAP_MAX_DURATION_MS) {
        onDestinationRef.current({ screenX: event.clientX, screenY: event.clientY });
      }
      started = null;
    };
    const cancel = () => { started = null; onMove(0, 0); };

    canvas.addEventListener("pointerdown", down, { passive: false });
    canvas.addEventListener("pointerup", up, { passive: false });
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      started = null;
      onMove(0, 0);
    };
  }, [enabled, mode, onMove]);

  if (mode === "joystick") return <VirtualJoystick onMove={onMove} />;
  return <output data-testid="ax1-touch-to-move" aria-label="Touch-to-Move aktiv" className="sr-only">Touch-to-Move</output>;
}
