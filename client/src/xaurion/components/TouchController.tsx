import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Package, Map as MapIcon, UserRound, ScrollText, Swords, Hand } from "lucide-react";

export type TouchMode = "idle" | "moving" | "dwelling" | "menu";

interface AX1TouchDirectorProps {
  onMove: (forward: number, right: number) => void;
  onOpenPanel: (panel: "inventory" | "map" | "character" | "quests") => void;
  enabled?: boolean;
}

/**
 * AX1TouchDirector manages the advanced touch interaction model for mobile devices.
 * - Swipe anywhere to move.
 * - Long-hold (2s) to activate Radial Quick Menu.
 * - Directional swipes in Menu mode to open panels.
 */
export const AX1TouchDirector: React.FC<AX1TouchDirectorProps> = ({
  onMove,
  onOpenPanel,
  enabled = true
}) => {
  const [mode, setMode] = useState<TouchMode>("idle");
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [menuActive, setMenuActive] = useState(false);
  const [selectedPanel, setSelectedPanel] = useState<"inventory" | "map" | "character" | "quests" | null>(null);
  
  // Dynamic scaling factors
  const [metrics, setMetrics] = useState({
    deadZone: 12,
    moveThreshold: 20,
    maxDist: 80,
    radialThreshold: 40
  });

  useEffect(() => {
    const updateMetrics = () => {
      const dpr = window.devicePixelRatio || 1;
      const isMobile = window.innerWidth < 768;
      const isLandscape = window.innerWidth > window.innerHeight;
      
      // Base scale factors: slightly larger on high-density mobile screens
      const scale = isMobile ? Math.max(1, dpr * 0.8) : 1;
      
      setMetrics({
        deadZone: 12 * scale,
        moveThreshold: 20 * scale,
        maxDist: 80 * scale,
        radialThreshold: 40 * scale
      });
    };

    updateMetrics();
    window.addEventListener("resize", updateMetrics);
    return () => window.removeEventListener("resize", updateMetrics);
  }, []);

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const dwellTimer = useRef<NodeJS.Timeout | null>(null);
  const moveRequest = useRef<{ f: number; r: number }>({ f: 0, r: 0 });

  const DWELL_DELAY = 400; // Ring appears after 400ms
  const DWELL_DURATION = 1600; // Takes 1.6s to fill (Total 2s)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enabled) return;
    
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"], .virtual-joystick')) {
      return;
    }

    const touch = e.touches[0];
    const pos = { x: touch.clientX, y: touch.clientY };
    
    touchStart.current = { ...pos, time: performance.now() };
    setTouchPos(pos);
    setMode("idle");
    setDwellProgress(0);
    setSelectedPanel(null);

    // Start dwell sequence
    dwellTimer.current = setTimeout(() => {
      setMode("dwelling");
      const startTime = performance.now();
      const interval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / DWELL_DURATION);
        setDwellProgress(progress);
        
        if (progress >= 1) {
          clearInterval(interval);
          setMode("menu");
          setMenuActive(true);
          if ("vibrate" in navigator) navigator.vibrate([40, 30, 40]);
        }
      }, 16);
      
      (dwellTimer.current as any)._interval = interval;
    }, DWELL_DELAY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    
    const touch = e.touches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const dist = Math.hypot(dx, dy);

    if (mode === "menu") {
      // Swipe-to-highlight logic
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      if (Math.max(absX, absY) > metrics.radialThreshold) {
        if (absX > absY) {
          setSelectedPanel(dx > 0 ? "quests" : "inventory");
        } else {
          setSelectedPanel(dy > 0 ? "character" : "map");
        }
      } else {
        setSelectedPanel(null);
      }
      return;
    }

    // Intelligent Dead-Zone: Ignore micro-jitters
    if (dist < metrics.deadZone) {
      return;
    }

    // If moving exceeds threshold and we were dwelling, cancel dwell
    if (dist > metrics.moveThreshold) {
      if (dwellTimer.current) {
        clearTimeout(dwellTimer.current);
        if ((dwellTimer.current as any)._interval) clearInterval((dwellTimer.current as any)._interval);
      }
      setDwellProgress(0);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current);
      if ((dwellTimer.current as any)._interval) clearInterval((dwellTimer.current as any)._interval);
    }

    if (mode === "menu") {
      if (selectedPanel) {
        onOpenPanel(selectedPanel);
        setMenuActive(false);
      }
      if (!selectedPanel) {
        setMode("menu");
      } else {
        setMode("idle");
        setTouchPos(null);
      }
    } else {
      setMode("idle");
      setTouchPos(null);
    }

    touchStart.current = null;
  };

  return (
    <div 
      className="fixed inset-0 z-10 touch-none pointer-events-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence>
        {touchPos && mode !== "idle" && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="pointer-events-none absolute"
            style={{ left: touchPos.x, top: touchPos.y }}
          >
            {/* Dwell Progress Ring */}
            {mode === "dwelling" && dwellProgress > 0 && (
              <div className="relative -translate-x-1/2 -translate-y-1/2">
                <svg className="h-20 w-20 transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="rgba(251, 191, 36, 0.1)"
                    strokeWidth="3"
                  />
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="3"
                    strokeDasharray="213.6"
                    strokeDashoffset={213.6 * (1 - dwellProgress)}
                    strokeLinecap="round"
                    animate={{ stroke: dwellProgress === 1 ? "#22d3ee" : "#fbbf24" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                </div>
              </div>
            )}

            {/* Radial Menu UI */}
            {(mode === "menu" || menuActive) && (
              <motion.div 
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative -translate-x-1/2 -translate-y-1/2"
              >
                {/* Background Ring */}
                <div 
                  className="absolute inset-0 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-400/20 bg-black/70 backdrop-blur-xl shadow-[0_0_40px_rgba(34,211,238,0.1)]" 
                  style={{ width: metrics.maxDist * 2.2, height: metrics.maxDist * 2.2 }}
                />
                
                <RadialItem icon={<MapIcon />} label="ATLAS" x={0} y={-metrics.maxDist * 0.85} active={selectedPanel === "map"} scale={metrics.deadZone / 12} />
                <RadialItem icon={<UserRound />} label="HERO" x={0} y={metrics.maxDist * 0.85} active={selectedPanel === "character"} scale={metrics.deadZone / 12} />
                <RadialItem icon={<Package />} label="BAGS" x={-metrics.maxDist * 0.85} y={0} active={selectedPanel === "inventory"} scale={metrics.deadZone / 12} />
                <RadialItem icon={<ScrollText />} label="LOG" x={metrics.maxDist * 0.85} y={0} active={selectedPanel === "quests"} scale={metrics.deadZone / 12} />
                
                <div className="absolute inset-0 flex items-center justify-center">
                  <div 
                    className={`rounded-full border-2 transition-all duration-300 ${selectedPanel ? 'border-cyan-400 bg-cyan-400/20 scale-110 shadow-[0_0_20px_rgba(34,211,238,0.5)]' : 'border-amber-400 bg-amber-400/10'}`}
                    style={{ width: metrics.deadZone * 4.5, height: metrics.deadZone * 4.5 }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Swords 
                        className={`transition-transform ${selectedPanel ? 'scale-125 text-white' : 'text-amber-400'}`} 
                        style={{ width: metrics.deadZone * 2, height: metrics.deadZone * 2 }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RadialItem: React.FC<{ icon: React.ReactNode; label: string; x: number; y: number; active: boolean; scale: number }> = ({ icon, label, x, y, active, scale }) => (
  <div 
    className={`absolute flex flex-col items-center justify-center transition-all duration-200 ${active ? 'scale-125 z-10' : 'scale-100 opacity-60'}`}
    style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
  >
    <div 
      className={`flex items-center justify-center rounded-full border-2 transition-colors ${active ? 'border-cyan-400 bg-cyan-950 text-white shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'border-gray-800 bg-black text-gray-500'}`}
      style={{ width: 48 * scale, height: 48 * scale }}
    >
      {React.cloneElement(icon as React.ReactElement<any>, { size: 24 * scale })}
    </div>
    <span 
      className={`mt-1 font-bold tracking-widest transition-colors ${active ? 'text-cyan-300' : 'text-gray-600'}`}
      style={{ fontSize: 9 * scale }}
    >
      {label}
    </span>
  </div>
);
