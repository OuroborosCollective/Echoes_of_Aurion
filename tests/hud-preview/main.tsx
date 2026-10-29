import { createRoot } from "react-dom/client";
import { useState } from "react";
import "./preview.css";
import "../../client/src/xaurion/integration/ax1AuthorityHud.css";
import { GameHUD, type GameHUDProps } from "../../client/src/xaurion/components/GameHUD";
import { VirtualJoystick } from "../../client/src/xaurion/components/VirtualJoystick";
import { MiniMap } from "../../client/src/xaurion/components/Ax1WorldSurfaces";
import { aurionControlSkills } from "../../shared/playerUiProtocol";

const q = new URLSearchParams(location.search);
const noop = () => {};

function App() {
  const [autoAttack, setAutoAttack] = useState(q.get("auto") !== "0");
  const [autoLoot, setAutoLoot] = useState(true);
  const props: GameHUDProps = {
    playerName: "Kaelen Voss", playerIcon: "⚔", playerColor: "#d8b45f", points: 1280, victories: 14, progressionCount: 6,
    mastery: { name: "Ruinenklinge", level: 7, xpPercent: 0.62 }, playerState: "live", playerStateLabel: "Bestätigt",
    selfHealth: { hp: Number(q.get("hp") ?? 742), maxHp: 1000 }, lifeStatus: "alive",
    connected: true, remotePlayerCount: 3, zoneName: "Aschenbruch-Ruinen", coordinates: "112 · 48", worldState: "live", worldStateLabel: "Weltzustand bestätigt",
    party: q.get("party") === "0" ? [] : [
      { id: "a", name: "Mirel", role: "Heilerin", ready: true, hp: 880, maxHp: 900 },
      { id: "b", name: "Torvan", role: "Wächter", ready: false, hp: 310, maxHp: 1200 },
      { id: "c", name: "Ilka", role: "Späher", ready: true },
    ],
    objectives: [
      { id: "p", kind: "primary", label: "Find the Observatory", detail: "Folge dem Sternenfaden zur Ruinenspitze.", progress: 0.4 },
      { id: "n1", kind: "npc", label: "Archivarin Selene", detail: "Spricht am Nordtor", subtasks: ["Sprich mit Selene", "Bringe 3 Kartenfragmente"], lore: "Sie hütet die letzten Sternkarten." },
      { id: "n2", kind: "encounter", label: "Aschenwächter", detail: "Elite · 120 m" },
    ],
    hotbar: aurionControlSkills.slice(0, 5).map(s => ({ command: s.command, name: s.name, icon: s.icon, color: s.color })),
    autoLoot, autoAttack, actionsDisabled: q.get("disabled") === "1", controlsDisabled: false,
    combat: { eventCount: 12, currentDps: 184, peakDps: 311, currentDtps: 42, logs: [{ id: "1", tick: 41, text: "Ruinenschnitt trifft Aschenwächter", value: 212 }, { id: "2", tick: 43, text: "Echoschild absorbiert", value: 64 }],
      dpsSeries: Array.from({ length: 12 }, (_, i) => ({ second: i, dps: 120 + ((i * 37) % 90), dtps: 20 + ((i * 17) % 40) })) },
    miniMap: <MiniMap world={{ displayName: "Aschenbruch", epoch: 3, deterministicHash: "x", primaryEncounter: null, pointsOfInterest: [
      { id: "1", kind: "npc", state: "available", label: "Selene" }, { id: "2", kind: "encounter", state: "available", label: "Wächter" }, { id: "3", kind: "portal", state: "locked", label: "Tor" }, { id: "4", kind: "landmark", state: "available", label: "Turm" } ] }} position={{ x: 112000, z: 48000 }} remotePlayers={[]} state="live" onOpen={noop} />,
    movementControl: <VirtualJoystick onMove={noop} />,
    feedback: q.get("fb") === "1" ? "Ziel außerhalb der bestätigten Aurion-Reichweite." : undefined,
    pending: q.get("pending") === "1", context: (q.get("ctx") as GameHUDProps["context"]) ?? "exploration",
    onOpenCharacter: noop, onOpenInventory: noop, onOpenCrafting: noop, onOpenQuests: noop, onOpenContacts: noop, onOpenParty: noop, onOpenDungeonFinder: noop, onOpenMap: noop,
    onOpenControls: noop, onOpenDisciplines: noop, onOpenCompanion: noop, onOpenChat: noop, onOpenGuild: noop, onOpenEconomy: noop, onOpenDialogue: noop, onOpenTerritory: noop,
    onOpenHomestead: noop, onOpenDeterminism: noop, onOpenResearch: noop, onToggleAutoLoot: () => setAutoLoot(v => !v), onInteract: noop,
    onToggleAutoAttack: () => setAutoAttack(v => !v), onAttack: noop, onCastSkill: noop,
  };
  return (
    <div className="stage xaurion-runtime">
      <i className="tree" style={{ left: "8%" }} /><i className="tree" style={{ left: "30%", bottom: "40%", height: "12vmin" }} /><i className="tree" style={{ left: "62%" }} /><i className="rock" />
      <div className="ax1-authority-shell"><GameHUD {...props} /></div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
