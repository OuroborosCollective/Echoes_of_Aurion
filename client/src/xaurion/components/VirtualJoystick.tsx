import React, { useEffect, useRef, useState } from "react";
import { usePcHud } from "./hud/usePcHud";

/** One movement owner with presentation selected for desktop or touch. */
export const VirtualJoystick: React.FC<{ onMove: (forward: number, right: number) => void }> = ({ onMove }) => {
  const pc = usePcHud();
  const ref = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const moving = useRef(false);
  const callback = useRef(onMove);
  callback.current = onMove;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    // A presentation switch releases the old pointer and recentres its visual.
    setPressed(false);
    setKnob({ x: 0, y: 0 });
    return () => {
      activePointer.current = null;
      if (moving.current) {
        moving.current = false;
        callback.current(0, 0);
      }
    };
  }, [pc]);

  const update = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    let x = clientX - (rect.left + rect.width / 2);
    let y = clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.34;
    const length = Math.hypot(x, y);
    if (length > max) { x = (x / length) * max; y = (y / length) * max; }
    const forward = -y / max;
    const right = x / max;
    moving.current = forward !== 0 || right !== 0;
    setKnob({ x, y });
    callback.current(forward, right);
  };
  const end = () => {
    activePointer.current = null;
    moving.current = false;
    setPressed(false);
    setKnob({ x: 0, y: 0 });
    callback.current(0, 0);
  };
  return (
    <div ref={ref} data-testid="ax1-movement-control" aria-label="Bewegungssteuerung"
      data-active={pressed}
      className={pc ? "virtual-joystick relative h-28 w-28 rounded-full border border-cyan-300/30 bg-black/45 backdrop-blur-md touch-none" : "virtual-joystick ax-joy"}
      onPointerDown={(event) => {
        if (activePointer.current !== null) return;
        activePointer.current = event.pointerId;
        setPressed(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => { if (activePointer.current === event.pointerId) update(event.clientX, event.clientY); }}
      onPointerUp={(event) => { if (activePointer.current === event.pointerId) end(); }}
      onPointerCancel={(event) => { if (activePointer.current === event.pointerId) end(); }}
      onLostPointerCapture={(event) => { if (activePointer.current === event.pointerId) end(); }}>
      {!pc && <><i className="ax-joy__tick ax-joy__tick--n" aria-hidden /><i className="ax-joy__tick ax-joy__tick--s" aria-hidden /><i className="ax-joy__tick ax-joy__tick--w" aria-hidden /><i className="ax-joy__tick ax-joy__tick--e" aria-hidden /></>}
      <div className={pc ? "absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/60 bg-slate-950/80 shadow-[0_0_18px_rgba(34,211,238,.25)]" : "ax-joy__knob"}
        style={{ transform: `translate(calc(-50% + ${knob.x}px),calc(-50% + ${knob.y}px))` }} />
    </div>
  );
};
