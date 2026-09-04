import { useEffect } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Compass, Radio } from "lucide-react";
import "./aim224OverlaySafety.css";

type OpenWorldHudProps = {
  displayName: string;
  narrative: string;
  zoneTier: number;
  activeEncounters: number;
  maximumVisible: number;
  worldEpoch: number | null;
  unlockedSectors: number | null;
  streamCenter: string;
  streamTier: string;
  zoneStatus: "idle" | "connecting" | "connected" | "closed" | "rejected";
  connecting: boolean;
  authenticated: boolean;
  onReturn: () => void;
  onConnectZone: () => void;
  onMove: (command: "W" | "A" | "S" | "D") => void;
  onInteract: () => void;
  onOpenDetails: () => void;
};

export default function OpenWorldHud({
  displayName,
  narrative,
  zoneTier,
  activeEncounters,
  maximumVisible,
  zoneStatus,
  connecting,
  authenticated,
  onReturn,
  onConnectZone,
  onMove,
  onInteract,
  onOpenDetails,
}: OpenWorldHudProps) {
  useEffect(() => {
    const returnFromXaurion = () => onReturn();
    window.addEventListener("aurion:xaurion-return-request", returnFromXaurion);
    return () => window.removeEventListener("aurion:xaurion-return-request", returnFromXaurion);
  }, [onReturn]);

  return (
    <section className="open-world-hud" aria-label="Aurion Open World">
      <div className="open-world-hud__identity" aria-label="Aktueller Weltstatus">
        <span><Compass size={14} /> AURION // FREIE WELT</span>
        <h2>{displayName}</h2>
        <p>{narrative}</p>
        <div className="open-world-hud__play-status" aria-label="Spielstatus">
          <span>ZONE <b>TIER {zoneTier}</b></span>
          <span>BEGEGNUNGEN <b>{activeEncounters}/{maximumVisible}</b></span>
        </div>
      </div>

      <nav className="open-world-hud__nav" aria-label="Open-World-Navigation">
        <button type="button" className="open-world-hud__return" onClick={onOpenDetails}>
          WELT / QUESTS
        </button>
        <button type="button" className="open-world-hud__return" onClick={onReturn}>
          ZUR STERNWARTE <ChevronRight size={16} />
        </button>
      </nav>

      <div className="open-world-hud__movement">
        <div>
          <span>EXPLORER</span>
          <div className="open-world-dpad" aria-label="Open-World-Touchsteuerung">
            <button type="button" onClick={() => onMove("W")} aria-label="Open World vorwärts"><ArrowUp size={21} /></button>
            <button type="button" onClick={() => onMove("A")} aria-label="Open World links"><ArrowLeft size={21} /></button>
            <button type="button" onClick={() => onMove("S")} aria-label="Open World rückwärts"><ArrowDown size={21} /></button>
            <button type="button" onClick={() => onMove("D")} aria-label="Open World rechts"><ArrowRight size={21} /></button>
          </div>
        </div>
        <div className="open-world-hud__actions">
          <button type="button" onClick={onInteract}>E // INTERAGIEREN</button>
          <button
            type="button"
            disabled={connecting || !authenticated || zoneStatus === "connecting" || zoneStatus === "connected"}
            onClick={onConnectZone}
          >
            <Radio size={15} />
            {zoneStatus === "connected" ? "POSITION LIVE" : zoneStatus === "connecting" ? "VERBINDET" : "WELTBEWEGUNG AKTIVIEREN"}
          </button>
        </div>
      </div>
    </section>
  );
}
