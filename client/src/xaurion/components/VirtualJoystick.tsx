// @ts-nocheck
// Vendored from owner-provided xaurion ZIP (SHA-256 739650d16dee85bb073e2c5af3c737f32573f328673c56edfe91d250719a030f).
import React, { useRef, useState, useCallback, useEffect } from 'react';

interface VirtualJoystickProps {
  onMove: (forward: number, right: number) => void;
  className?: string;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove, className = '' }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const activeTouchId = useRef<number | null>(null);
  const maxRadius = 48;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeTouchId.current !== null) return;
    const touch = e.changedTouches[0];
    activeTouchId.current = touch.identifier;
    setActive(true);
    updateJoystick(touch.clientX, touch.clientY);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (activeTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId.current) { updateJoystick(touch.clientX, touch.clientY); break; }
    }
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (activeTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId.current) {
        activeTouchId.current = null; setActive(false); setKnobPos({ x: 0, y: 0 }); onMove(0, 0); break;
      }
    }
  }, [onMove]);

  const updateJoystick = (clientX: number, clientY: number) => {
    if (!baseRef.current) return;
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX; const dy = clientY - centerY; const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius); const angle = Math.atan2(dy, dx);
    setKnobPos({ x: Math.cos(angle) * clampedDist, y: Math.sin(angle) * clampedDist });
    const normalizedForward = dist > 6 ? -Math.sin(angle) * (clampedDist / maxRadius) : 0;
    const normalizedRight = dist > 6 ? Math.cos(angle) * (clampedDist / maxRadius) : 0;
    onMove(normalizedForward, normalizedRight);
  };

  const isMouseDown = useRef(false);
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => { isMouseDown.current = true; setActive(true); updateJoystick(e.clientX, e.clientY); };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => { if (isMouseDown.current) updateJoystick(e.clientX, e.clientY); };
    const handleGlobalMouseUp = () => { if (isMouseDown.current) { isMouseDown.current = false; setActive(false); setKnobPos({ x: 0, y: 0 }); onMove(0, 0); } };
    window.addEventListener('mousemove', handleGlobalMouseMove); window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false }); window.addEventListener('touchend', handleTouchEnd); window.addEventListener('touchcancel', handleTouchEnd);
    return () => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); window.removeEventListener('touchmove', handleTouchMove); window.removeEventListener('touchend', handleTouchEnd); window.removeEventListener('touchcancel', handleTouchEnd); };
  }, [handleTouchMove, handleTouchEnd, onMove]);

  return <div ref={baseRef} onTouchStart={handleTouchStart} onMouseDown={handleMouseDown} className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center select-none touch-none cursor-pointer transition-all ${className}`} style={{ touchAction: 'none' }}>
    <div className={`absolute inset-0 rounded-full border-2 transition-all duration-150 ${active ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_25px_rgba(251,191,36,0.5)]' : 'border-white/20 bg-black/60 shadow-lg backdrop-blur-md hover:border-amber-400/50'}`} />
    <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-mono text-white/30 pointer-events-none"><span>◀</span><span>▶</span></div>
    <div className="absolute inset-0 flex flex-col items-center justify-between py-2 text-[10px] font-mono text-white/30 pointer-events-none"><span>▲</span><span>▼</span></div>
    <div className="w-4 h-4 rounded-full bg-white/10 border border-white/20 pointer-events-none" />
    <div className={`absolute w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 flex items-center justify-center font-bold text-xs pointer-events-none transition-transform shadow-2xl ${active ? 'border-amber-300 bg-gradient-to-br from-amber-500 to-yellow-600 text-black shadow-[0_0_18px_rgba(251,191,36,0.8)] scale-105' : 'border-white/40 bg-gradient-to-br from-gray-800 to-gray-950 text-gray-300 shadow-md'}`} style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)`, transition: active ? 'none' : 'transform 0.15s ease-out' }}><div className="w-4 h-4 rounded-full bg-white/30 border border-white/40" /></div>
  </div>;
};
