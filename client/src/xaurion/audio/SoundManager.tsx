import React, { useEffect, useRef, useState } from "react";
import { AurionSoundscape } from "@/lib/soundscape";
import { aurionAssets } from "@/lib/aurionAssets";
import { useAdminStore } from "../core/AdminService";
import { Volume2, VolumeX, Sliders, Music, Activity, ShieldCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const SoundManager: React.FC = () => {
  const soundscapeRef = useRef<AurionSoundscape | null>(null);
  const { isAdmin } = useAdminStore();
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem("aurion:audio:isMuted");
    return saved ? JSON.parse(saved) : false;
  });
  const [masterVolume, setMasterVolume] = useState(() => {
    const saved = localStorage.getItem("aurion:audio:masterVolume");
    return saved ? parseFloat(saved) : 0.78;
  });
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [activeAmbient, setActiveAmbient] = useState<string | null>(null);
  const ambientVolumeRef = useRef(0.4);
  const activeAmbientRef = useRef<string | null>(null);
  const duckingTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    localStorage.setItem("aurion:audio:isMuted", JSON.stringify(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem("aurion:audio:masterVolume", masterVolume.toString());
  }, [masterVolume]);


  useEffect(() => {
    // Initialize soundscape with asset mapping
    const soundscape = new AurionSoundscape(aurionAssets.audio.sfx);
    soundscapeRef.current = soundscape;

    const applyDucking = (duration: number) => {
      const currentAmbient = activeAmbientRef.current;
      if (!soundscapeRef.current || !currentAmbient) return;

      // Attenuate to 30% of original ambient volume
      const duckedVolume = ambientVolumeRef.current * 0.3;
      void soundscapeRef.current.playAmbient(currentAmbient, duckedVolume);

      if (duckingTimeoutRef.current) clearTimeout(duckingTimeoutRef.current);
      
      duckingTimeoutRef.current = setTimeout(() => {
        const latestAmbient = activeAmbientRef.current;
        if (soundscapeRef.current && latestAmbient) {
          void soundscapeRef.current.playAmbient(latestAmbient, ambientVolumeRef.current);
        }
        duckingTimeoutRef.current = null;
      }, duration);
    };

    const handleAudioCue = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        soundscape.emit(customEvent.detail);

        // Duck music for important cues (interactions, level ups, etc.)
        const importantCategories = ["interaction", "progression"];
        if (importantCategories.includes(customEvent.detail.category)) {
          applyDucking(2000); // Duck for 2 seconds
        }
      }
    };

    const handleAmbientChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.url) {
        const { url, volume } = customEvent.detail;
        ambientVolumeRef.current = volume || 0.4;
        activeAmbientRef.current = url;
        void soundscape.playAmbient(url, ambientVolumeRef.current);
        setActiveAmbient(url);
      } else if (customEvent.detail && customEvent.detail.stop) {
        soundscape.stopAmbient();
        activeAmbientRef.current = null;
        setActiveAmbient(null);
      }
    };

    const handleUnlock = () => {
      soundscape.unlock();
      window.removeEventListener("click", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
    };

    window.addEventListener("aurion:audio-cue", handleAudioCue);
    window.addEventListener("aurion:ambient-change", handleAmbientChange);
    window.addEventListener("click", handleUnlock);
    window.addEventListener("keydown", handleUnlock);

    return () => {
      window.removeEventListener("aurion:audio-cue", handleAudioCue);
      window.removeEventListener("aurion:ambient-change", handleAmbientChange);
      window.removeEventListener("click", handleUnlock);
      window.removeEventListener("keydown", handleUnlock);
      soundscape.dispose();
    };
  }, []);

  useEffect(() => {
    if (soundscapeRef.current) {
      soundscapeRef.current.setMasterVolume(isMuted ? 0 : masterVolume);
    }
  }, [isMuted, masterVolume]);

  const toggleMute = () => setIsMuted(!isMuted);

  return (
    <>
      {/* Basic Controls (Visible for everyone or just Admin? User said manageable for admins, but usually volume is for everyone) */}
      <div className="fixed bottom-4 right-4 z-[1000] flex gap-2">
        {isAdmin && (
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500 bg-black/80 text-amber-400 shadow-lg hover:bg-amber-500 hover:text-white transition-all"
            title="Audio Admin Panel"
          >
            <Sliders size={20} />
          </button>
        )}
        <button
          onClick={toggleMute}
          className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all shadow-lg ${
            isMuted 
              ? "border-red-500 bg-red-500/20 text-red-400" 
              : "border-sky-500 bg-black/80 text-sky-400 hover:bg-sky-500 hover:text-white"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>

      {/* Admin Audio Panel */}
      <AnimatePresence>
        {isAdmin && showAdminPanel && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-16 right-4 z-[1001] w-80 rounded-2xl border border-amber-900/50 bg-black/90 p-6 backdrop-blur-xl shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <ShieldCheck size={20} />
                <h3 className="font-serif font-bold uppercase tracking-wider">Audio Authority</h3>
              </div>
              <button onClick={() => setShowAdminPanel(false)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Master Volume */}
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  <span>Master Volume</span>
                  <span>{Math.round(masterVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={masterVolume}
                  onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                  className="h-1.5 w-full appearance-none rounded-full bg-gray-800 accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Status Section */}
              <div className="rounded-lg bg-white/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-500/80">
                  <Activity size={12} />
                  <span>Runtime Status</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Ambient Track</span>
                  <span className="text-[11px] text-sky-400 font-mono truncate max-w-[140px]">
                    {activeAmbient ? activeAmbient.split('/').pop() : "None"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Audio Context</span>
                  <span className="flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${soundscapeRef.current ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-[11px] text-gray-300 uppercase tracking-tighter">
                      {soundscapeRef.current ? "Active" : "Ready"}
                    </span>
                  </span>
                </div>
              </div>

              {/* Quick Cues (For testing) */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Diagnostic Cues</span>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent("aurion:audio-cue", { detail: { cue: "progression.level_up", category: "progression", level: 1 } }))}
                    className="rounded bg-amber-500/10 border border-amber-500/20 py-1.5 text-[9px] font-bold text-amber-400 hover:bg-amber-500/20 transition-all"
                  >
                    LEVEL UP
                  </button>
                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent("aurion:audio-cue", { detail: { cue: "combat.spell.heal", category: "combat", spell: "heal" } }))}
                    className="rounded bg-sky-500/10 border border-sky-500/20 py-1.5 text-[9px] font-bold text-sky-400 hover:bg-sky-500/20 transition-all"
                  >
                    HEAL
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
