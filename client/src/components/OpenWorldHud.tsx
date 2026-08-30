import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Compass, Radio } from "lucide-react";

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
};

export default function OpenWorldHud({
  displayName,
  narrative,
  zoneTier,
  activeEncounters,
  maximumVisible,
  worldEpoch,
  unlockedSectors,
  streamCenter,
  streamTier,
  zoneStatus,
  connecting,
  authenticated,
  onReturn,
  onConnectZone,
  onMove,
  onInteract,
}: OpenWorldHudProps) {
  return (
    <section className="open-world-hud" aria-label="Aurion Open World">
      <header className="open-world-hud__header">
        <div>
          <span><Compass size={14} /> OPEN WORLD // SERVERBESTÄTIGT</span>
          <h2>{displayName}</h2>
          <p>{narrative}</p>
        </div>
        <button type="button" className="open-world-hud__return" onClick={onReturn}>
          ZUR STERNWARTE <ChevronRight size={16} />
        </button>
      </header>

      <div className="open-world-hud__metrics" aria-label="Bestätigte Weltdaten">
        <span>ZONE <b>TIER {zoneTier}</b></span>
        <span>BEGEGNUNGEN <b>{activeEncounters}/{maximumVisible}</b></span>
        <span>WELTEPOCHE <b>{worldEpoch ?? "—"}</b></span>
        <span>SEKTOREN <b>{unlockedSectors ?? "—"}</b></span>
        <span>STREAM <b>{streamCenter}</b></span>
        <span>GERÄTETIER <b>{streamTier.toUpperCase()}</b></span>
      </div>

      <div className="open-world-hud__movement">
        <div>
          <span>EXPLORER // FREIE BEWEGUNG</span>
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
            {zoneStatus === "connected" ? "ZONENPOSITION BESTÄTIGT" : zoneStatus === "connecting" ? "ZONENTICKET WIRD VERBUNDEN" : "ZONENBEWEGUNG VERBINDEN"}
          </button>
        </div>
      </div>
    </section>
  );
}
