import React, { useRef, useState } from "react";

/**
 * Virtual movement stick. Movement maths are unchanged from the previous minified version:
 * the knob is clamped to 34% of the base width and reports (forward, right) in [-1, 1].
 * Only presentation changed: the base now scales with the screen (see --ax-joy) and lights up
 * while a thumb is on it.
 */
export const VirtualJoystick: React.FC<{ onMove: (forward: number, right: number) => void }> = ({ onMove }) => {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [pressed, setPressed] = useState(false);

  const update = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    let x = clientX - (rect.left + rect.width / 2);
    let y = clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.34;
    const length = Math.hypot(x, y);
    if (length > max) {
      x = (x / length) * max;
      y = (y / length) * max;
    }
    setKnob({ x, y });
    onMove(-y / max, x / max);
  };

  const end = () => {
    active.current = false;
    setPressed(false);
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  };

  return (
    <div
      ref={ref}
      data-testid="ax1-movement-control"
      aria-label="Bewegungssteuerung"
      data-active={pressed}
      className="virtual-joystick ax-joy"
      onPointerDown={(event) => {
        active.current = true;
        setPressed(true);
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => active.current && update(event.clientX, event.clientY)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <i className="ax-joy__tick ax-joy__tick--n" aria-hidden />
      <i className="ax-joy__tick ax-joy__tick--s" aria-hidden />
      <i className="ax-joy__tick ax-joy__tick--w" aria-hidden />
      <i className="ax-joy__tick ax-joy__tick--e" aria-hidden />
      <div className="ax-joy__knob" style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
    </div>
  );
};
