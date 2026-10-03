import React, { useRef, useState } from "react";

type KnobState = Readonly<{ x: number; y: number; intensity: number }>;

export const VirtualJoystick: React.FC<{ onMove: (forward: number, right: number) => void }> = ({ onMove }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<KnobState>({ x: 0, y: 0, intensity: 0 });
  const active = useRef(false);

  const update = (clientX: number, clientY: number) => {
    const bounds = ref.current?.getBoundingClientRect();
    if (!bounds) return;
    let x = clientX - (bounds.left + bounds.width / 2);
    let y = clientY - (bounds.top + bounds.height / 2);
    const max = bounds.width * 0.34;
    const length = Math.hypot(x, y);
    if (length > max) {
      x = x / length * max;
      y = y / length * max;
    }
    const intensity = Math.min(1, Math.hypot(x, y) / max);
    setKnob({ x, y, intensity });
    onMove(-y / max, x / max);
  };

  const end = () => {
    active.current = false;
    setKnob({ x: 0, y: 0, intensity: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={ref}
      data-testid="ax1-movement-control"
      data-active={knob.intensity > 0.02 ? "true" : "false"}
      aria-label="Bewegungssteuerung"
      className="virtual-joystick relative h-28 w-28 rounded-full border border-cyan-300/30 bg-black/45 backdrop-blur-md touch-none"
      style={{ "--joystick-intensity": knob.intensity } as React.CSSProperties}
      onPointerDown={event => {
        active.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={event => active.current && update(event.clientX, event.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className="virtual-joystick__halo" aria-hidden="true" />
      <span className="virtual-joystick__axis virtual-joystick__axis--north" aria-hidden="true">▲</span>
      <span className="virtual-joystick__axis virtual-joystick__axis--east" aria-hidden="true">▶</span>
      <span className="virtual-joystick__axis virtual-joystick__axis--south" aria-hidden="true">▼</span>
      <span className="virtual-joystick__axis virtual-joystick__axis--west" aria-hidden="true">◀</span>
      <div
        className="virtual-joystick__knob absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-300/60 bg-slate-950/80 shadow-[0_0_18px_rgba(34,211,238,.25)]"
        style={{ transform: `translate(calc(-50% + ${knob.x}px),calc(-50% + ${knob.y}px))` }}
      >
        <span aria-hidden="true">✦</span>
      </div>
    </div>
  );
};
