import React, { useState, useEffect } from "react";
import { Bot, Sparkles, X } from "lucide-react";

export const Ax1CompanionOverlay: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"synced" | "active" | "idle">("synced");

  useEffect(() => {
    const handleOpen = () => setIsOpen(prev => !prev);
    window.addEventListener("aurion:open-companion-panel", handleOpen);
    return () => window.removeEventListener("aurion:open-companion-panel", handleOpen);
  }, []);

  if (!isOpen) return null;

  return (
    <div
      data-testid="ax1-companion-overlay"
      className="fixed bottom-24 right-4 z-40 w-80 max-w-[90vw] rounded-2xl border border-amber-500/40 bg-[#071322]/95 p-4 text-gray-100 shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-md animate-in fade-in zoom-in-95 duration-200"
    >
      <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-serif font-bold text-amber-200 uppercase tracking-wide">
              Echo Companion
            </h3>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Resonanz Synchron
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          aria-label="Companion Panel schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2.5 text-xs text-gray-300">
        <div className="rounded-xl border border-amber-500/10 bg-amber-950/20 p-2.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-amber-300">
            <span>Adaptive Synapse</span>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-400" /> 98.4%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/60">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300" style={{ width: "98.4%" }} />
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-gray-400">
          Der AI-Partner analysiert Umwelt-Resonanzen und projiziert taktische Hinweise bei Begegnungen im aktuellen Sektor.
        </p>
      </div>
    </div>
  );
};

export default Ax1CompanionOverlay;
