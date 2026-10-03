import { useEffect, useRef, useState } from "react";
import type { MovementMode } from "@shared/playerUiProtocol";
import { VirtualJoystick } from "./VirtualJoystick";

type TouchDestination = { screenX: number; screenY: number };
type DestinationMarker = TouchDestination & { sequence: number };

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
  const markerTimer = useRef<number | null>(null);
  const markerSequence = useRef(0);
  const [destinationMarker, setDestinationMarker] = useState<DestinationMarker | null>(null);
  onDestinationRef.current = onDestination;

  useEffect(() => () => {
    if (markerTimer.current !== null) window.clearTimeout(markerTimer.current);
  }, []);

  useEffect(() => {
    if (mode !== "touch_to_move" || !enabled) {
      onMove(0, 0);
      setDestinationMarker(null);
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
        const marker = { screenX: event.clientX, screenY: event.clientY, sequence: ++markerSequence.current };
        setDestinationMarker(marker);
        if (markerTimer.current !== null) window.clearTimeout(markerTimer.current);
        markerTimer.current = window.setTimeout(() => setDestinationMarker(null), 720);
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
  return <>
    <output data-testid="ax1-touch-to-move" aria-label="Touch-to-Move aktiv" className="sr-only">Touch-to-Move</output>
    {destinationMarker && <span
      key={destinationMarker.sequence}
      data-testid="ax1-touch-destination-marker"
      className="ax1-touch-destination-marker"
      style={{ left: destinationMarker.screenX, top: destinationMarker.screenY }}
      aria-hidden="true"
    ><i /><b>✦</b></span>}
  </>;
}
