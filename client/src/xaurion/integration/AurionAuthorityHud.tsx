import { NpcDecisionPanel } from "./NpcDecisionPanel";
import { NpcStandingPanel } from "./NpcStandingPanel";
import { AurionEncounterPanel } from "./AurionEncounterPanel";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { VirtualJoystick } from "../components/VirtualJoystick";
import { projectPlayerReadback, projectReadback, questReadbackSchema, readbackLabels, worldReadbackSchema } from "./authoritativeHudProjection";
import type { AurionGameplayCommand } from "./aurionAuthorityAdapter";
import type { ConfirmedZonePresence } from "@shared/zonePresenceContract";
import { Package, UserRound, ScrollText, Map, Sparkles, Users, MessageSquare, Coins, Hammer, Menu, Hand, Swords, Shield, Wind, Zap, Crosshair } from "lucide-react";

type Panel = "inventory" | "character" | "quests" | "map" | null;
const classes = { unbound: "Reisender", vanguard: "Vorhut", seer: "Seher", warden: "Hüter" } as const;
const titles = { inventory: "Inventar", character: "Charakter", quests: "Aufträge & Kontakte", map: "Weltatlas" } as const;
const panelIcons = { inventory: Package, character: UserRound, quests: ScrollText, map: Map };
const actionIcons = [Swords, Zap, Shield, Wind, Crosshair];
const community = (panel: "chat" | "partners" | "market" | "crafting" | "guild") => window.dispatchEvent(new CustomEvent("aurion:open-community", { detail: { panel } }));

export function AurionAuthorityHud({ userId, connected, position, remotePlayers = [], onMove, onAction, onInteract }: {
  userId: number; connected: boolean; position?: { x: number; z: number };
  remotePlayers?: readonly ConfirmedZonePresence[];
  onMove: (forward: number, right: number) => void; onAction: (command: AurionGameplayCommand) => void; onInteract?: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
  const [expandedMenu, setExpandedMenu] = useState(false);
  const [questTab, setQuestTab] = useState<"quests" | "contacts">("quests");
  const utils = trpc.useUtils();
  const options = { enabled: userId > 0, staleTime: 15_000, refetchInterval: 10_000 };
  const playerQuery = trpc.player.me.useQuery(undefined, options);
  const questQuery = trpc.gameplay.progress.useQuery(undefined, options);
  const worldQuery = trpc.gameplay.openWorld.useQuery(undefined, options);
  const player = projectPlayerReadback(playerQuery, userId);
  const quests = projectReadback(questReadbackSchema, questQuery, value => value.quests.length === 0);
  const world = projectReadback(worldReadbackSchema, worldQuery);
  const accept = trpc.gameplay.acceptQuest.useMutation();
  const complete = trpc.gameplay.completeQuest.useMutation();
  const chooseClass = trpc.player.chooseClass.useMutation();
  const setWeapon = trpc.player.setWeaponLoadout.useMutation();
  const pending = accept.isPending || complete.isPending || chooseClass.isPending || setWeapon.isPending;
  const fresh = connected && player.state === "live" && !pending;
  const act = async (operation: () => Promise<unknown>) => {
    if (!fresh) return;
    setMessage("");
    try {
      await operation();
      await Promise.all([playerQuery.refetch(), questQuery.refetch(), utils.gameplay.relationshipStanding.invalidate()]);
      setMessage("Änderung vom Server bestätigt.");
    } catch { setMessage("Änderung nicht bestätigt. Bitte aktualisieren und erneut versuchen."); }
  };
  useEffect(() => {
    const refresh = () => { void playerQuery.refetch(); void questQuery.refetch(); };
    const open = () => { setQuestTab("contacts"); setPanel("quests"); };
    window.addEventListener("aurion:authoritative-action", refresh);
    window.addEventListener("aurion:open-world-contacts", open);
    return () => { window.removeEventListener("aurion:authoritative-action", refresh); window.removeEventListener("aurion:open-world-contacts", open); };
  }, [playerQuery.refetch, questQuery.refetch]);
  const profile = player.data?.profile;
  const inventory = player.data?.inventory;

  // Visual structure adapted from -ax1@d356881 GameHUD (ff8d15d): unit frame,
  // gold crest, micro-menu, contextual action and skill cluster. Data and writes
  // remain the Aurion readback/mutation handlers above.
  return <div className="aurion-authority-hud xaurion-game-hud" data-testid="authoritative-world-hud">
    <section className="aurion-authority-hud__profile" aria-label="Serverbestätigter Charakter" data-state={player.state}>
      <div className="ax1-unit-portrait" aria-hidden="true"><UserRound size={27} />{profile && <span>{profile.level}</span>}</div>
      <div className="ax1-unit-values">
        {profile ? <><b>{classes[profile.selectedClass]} · Stufe {profile.level}</b><span>{profile.totalXp} EP · {profile.aurionPoints} AURION</span><span className="ax1-unit-detail">{profile.victories} Siege</span></> : <b>Charakterdaten ausstehend</b>}
        <small role="status" className={player.state === "live" ? "sr-only" : undefined}>{readbackLabels[player.state]}</small>
        <span data-testid="confirmed-remote-player-count" className="sr-only">{connected ? `${remotePlayers.length} andere Explorer verbunden` : "Mitspieler werden verbunden"}</span>
      </div>
    </section>
    <nav className="aurion-authority-hud__menu" aria-label="Weltmenü" data-expanded={expandedMenu}>
      {(Object.keys(titles) as Exclude<Panel, null>[]).map(key => { const Icon = panelIcons[key]; return <button key={key} title={titles[key]} aria-label={titles[key]} onClick={() => { setPanel(key); setExpandedMenu(false); }}><Icon size={19} /></button>; })}
      <button className="ax1-menu-more" title="Weitere Menüs" aria-label="Weitere Menüs" aria-expanded={expandedMenu} onClick={() => setExpandedMenu(value => !value)}><Menu size={19} /></button>
      <div className="ax1-secondary-menu">
        <button title="Companion" aria-label="Companion" onClick={() => { setExpandedMenu(false); window.dispatchEvent(new Event("aurion:open-companion")); }}><Sparkles size={19} /></button>
        <button title="Gruppe" aria-label="Gruppe" onClick={() => { setExpandedMenu(false); community("partners"); }}><Users size={19} /></button>
        <button title="Chat" aria-label="Chat" onClick={() => { setExpandedMenu(false); community("chat"); }}><MessageSquare size={19} /></button>
        <button title="Handel" aria-label="Handel" onClick={() => { setExpandedMenu(false); community("market"); }}><Coins size={19} /></button>
        <button title="Handwerk" aria-label="Handwerk" onClick={() => { setExpandedMenu(false); community("crafting"); }}><Hammer size={19} /></button>
      </div>
    </nav>
    <AurionEncounterPanel userId={userId} connected={connected} onAttack={() => onAction("F")} />
    <div className="aurion-authority-hud__move"><VirtualJoystick onMove={onMove} /></div>
    <div className="aurion-authority-hud__actions" aria-label="Aktionen">
      {[1, 2, 3, 4, 5].map(slot => { const Icon = actionIcons[slot - 1]!; return <button key={slot} className={slot === 1 ? "ax1-action-primary" : undefined} disabled={!connected || panel !== null} onClick={() => onAction(String(slot) as AurionGameplayCommand)} aria-label={`Aktion ${slot}`}><Icon size={22} /><kbd>{slot}</kbd></button>; })}
      <button disabled={!connected || panel !== null} onClick={() => onInteract ? onInteract() : onAction("E")} aria-label="Interaktion" title="Interaktion [F]"><Hand size={22} /><kbd>F</kbd></button>
    </div>
    <Dialog open={panel !== null} onOpenChange={open => { if (!open) setPanel(null); }}>
      <DialogContent className="aurion-authority-hud__dialog" overlayClassName="aurion-authority-hud__backdrop">
        <DialogTitle>{panel ? titles[panel] : "Aurion"}</DialogTitle>
        <DialogDescription className="sr-only">{panel === "inventory" ? "Dein Rucksack und deine Gegenstände." : panel === "character" ? "Dein Charakter, deine Waffe und deine Meisterschaften." : panel === "quests" ? "Aufträge, Kontakte und Ansehen." : "Die Welt und deine Position."}</DialogDescription>
        {message && <p role="status">{message}</p>}
        {panel === "inventory" && <div data-state={player.state}>
          <p role="status" className={player.state === "live" ? "sr-only" : undefined}>{readbackLabels[player.state]}</p>
          {inventory?.length === 0 && <div className="ax1-empty-inventory"><Package size={42} /><p>Dein Inventar ist leer.</p><small>Auf deinen Reisen findest du Waffen, Ausrüstung und Materialien.</small></div>}
          <div className="ax1-inventory-grid">{inventory?.map(item => <article key={item.id} className="aurion-authority-hud__card ax1-inventory-item"><Package size={28} /><b>{item.baseItemKey.replaceAll("_", " ")}</b><p>{item.quality} · Stufe {item.itemLevel}</p>{item.affixes.map(affix => <p key={`${affix.slot}:${affix.key}`}>{affix.key}: {Object.entries(affix.stats).map(([key, value]) => `${key} ${value}`).join(", ")}</p>)}</article>)}</div>
          <p>Gegenstände handeln und herstellen:</p><button onClick={() => { setPanel(null); community("market"); }}>Handel öffnen</button><button onClick={() => { setPanel(null); community("crafting"); }}>Handwerk öffnen</button>
        </div>}
        {panel === "character" && <div data-state={player.state}>
          <p role="status" className={player.state === "live" ? "sr-only" : undefined}>{readbackLabels[player.state]}</p>
          {profile && <><p>Klasse: {classes[profile.selectedClass]}</p><p>Stufe {profile.level} · Gesamt-EP {profile.totalXp}</p><p>{profile.aurionPoints} AURION · {profile.victories} Siege</p>
            <p>Klassenwahl ab Stufe {player.data!.capabilities.classUnlockLevel}; die Wahl ist dauerhaft.</p>
            <fieldset disabled={!fresh || !player.data?.capabilities.canChooseClass}><legend>Klasse wählen</legend>{(["vanguard", "seer", "warden"] as const).map(playerClass => <button key={playerClass} aria-pressed={profile.selectedClass === playerClass} onClick={() => { if (player.data?.capabilities.canChooseClass) void act(() => chooseClass.mutateAsync({ playerClass })); }}>{classes[playerClass]}</button>)}</fieldset>
            <fieldset disabled={!fresh}><legend>Waffendisziplin</legend>{(["blade", "staff", "spear", "focus"] as const).map(weaponTrack => <button key={weaponTrack} aria-pressed={player.data?.weaponLoadout?.weaponTrack === weaponTrack} onClick={() => void act(() => setWeapon.mutateAsync({ weaponTrack }))}>{weaponTrack}</button>)}</fieldset>
            <button onClick={()=>{setPanel(null);community("guild");}}>Gilde öffnen</button><h3>Waffenmeisterschaft</h3>{player.data?.weaponMasteries.length === 0 && <p>Noch keine Meisterschaft erworben.</p>}{player.data?.weaponMasteries.map(item => <p key={item.weaponTrack}>{item.weaponTrack} · Stufe {item.level} · {item.xp} EP</p>)}</>}
        </div>}
        {panel === "quests" && <div data-state={quests.state}>
          <div className="ax1-modal-tabs" role="tablist" aria-label="Aufträge und Kontakte">
            <button role="tab" aria-selected={questTab === "quests"} onClick={() => setQuestTab("quests")}>Aufträge</button>
            <button role="tab" aria-selected={questTab === "contacts"} onClick={() => setQuestTab("contacts")}>Kontakte</button>
          </div>
          {questTab === "contacts" ? <><NpcStandingPanel userId={userId} /><NpcDecisionPanel userId={userId} /></> : <>
          <p role="status" className={quests.state === "live" ? "sr-only" : undefined}>{readbackLabels[quests.state]}</p>
          {quests.data?.quests.map(quest => <article key={quest.key} className="aurion-authority-hud__card"><b>{quest.title}</b><p>{quest.giver} · ab Stufe {quest.requiredLevel}</p><p>{quest.objective}</p><p>{quest.readyToTurnIn ? "Bereit zur Abgabe" : ({ locked: "Gesperrt", available: "Verfügbar", active: "Aktiv", completed: "Abgeschlossen" } as const)[quest.state]}</p>
            {quest.state === "available" && <button disabled={!fresh || quests.state !== "live"} onClick={() => void act(() => accept.mutateAsync({ questKey: quest.key }))}>Bei {quest.giver} annehmen</button>}
            {quest.readyToTurnIn && <button disabled={!fresh || quests.state !== "live"} onClick={() => void act(() => complete.mutateAsync({ questKey: quest.key, giver: quest.giver }))}>Bei {quest.giver} abgeben</button>}
          </article>)}
          {quests.data && <p>Schlüssel: {quests.data.keys.length ? quests.data.keys.join(", ") : "Keine"}</p>}
          </>}
        </div>}
        {panel === "map" && <div data-state={world.state}>
          <p role="status">{readbackLabels[world.state]}</p>
          {world.data && <><p>Weltepoche {world.data.globalWorld.epoch}</p><p className="aurion-authority-hud__hash">Welt-Hash: {world.data.globalWorld.deterministicHash}</p></>}
          {position && connected ? <p>Bestätigte Position: {(position.x / 1000).toFixed(2)} / {(position.z / 1000).toFixed(2)}</p> : <p>Position wartet auf die Zonenverbindung.</p>}
          {connected && remotePlayers.map(player => <p key={player.userId}>Explorer {player.userId}: {(player.position.x / 1000).toFixed(2)} / {(player.position.z / 1000).toFixed(2)}</p>)}
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
