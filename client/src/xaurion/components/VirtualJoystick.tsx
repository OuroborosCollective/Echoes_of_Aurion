import React, { useRef, useState } from 'react';

export const VirtualJoystick: React.FC<{ onMove: (forward: number, right: number) => void }> = ({ onMove }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);

  const update = (cx: number, cy: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    let x = cx - (r.left + r.width / 2);
    let y = cy - (r.top + r.height / 2);
    const max = r.width * 0.34;
    const len = Math.hypot(x, y);
    if (len > max) {
      x = (x / len) * max;
      y = (y / len) * max;
    }
    setKnob({ x, y });
    onMove(-y / max, x / max);
  };

  const end = () => {
    active.current = false;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={ref}
      data-testid="ax1-movement-control"
      aria-label="Bewegungssteuerung"
      className="virtual-joystick relative h-24 w-24 sm:h-28 sm:w-28 rounded-full border border-cyan-400/30 bg-black/50 backdrop-blur-md touch-none shadow-lg select-none"
      onPointerDown={(e) => {
        active.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active.current && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="absolute left-1/2 top-1/2 h-10 w-10 sm:h-12 sm:w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/70 bg-slate-950/85 shadow-[0_0_14px_rgba(34,211,238,0.3)] transition-transform duration-75"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
};

