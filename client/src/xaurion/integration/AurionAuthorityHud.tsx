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

type Panel = "inventory" | "character" | "quests" | "map" | null;
const classes = { unbound: "Noch keine Klasse", vanguard: "Vorhut", seer: "Seher", warden: "Hüter" } as const;
const titles = { inventory: "Inventar", character: "Charakter", quests: "Aufträge & Kontakte", map: "Weltatlas" } as const;
const community = (panel: "chat" | "partners" | "market" | "crafting" | "guild") => window.dispatchEvent(new CustomEvent("aurion:open-community", { detail: { panel } }));

export function AurionAuthorityHud({ userId, connected, position, remotePlayers = [], onMove, onAction }: {
  userId: number; connected: boolean; position?: { x: number; z: number };
  remotePlayers?: readonly ConfirmedZonePresence[];
  onMove: (forward: number, right: number) => void; onAction: (command: AurionGameplayCommand) => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
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
    const open = () => setPanel("quests");
    window.addEventListener("aurion:authoritative-action", refresh);
    window.addEventListener("aurion:open-world-contacts", open);
    return () => { window.removeEventListener("aurion:authoritative-action", refresh); window.removeEventListener("aurion:open-world-contacts", open); };
  }, [playerQuery.refetch, questQuery.refetch]);
  const profile = player.data?.profile;
  const inventory = player.data?.inventory;

  return <div className="aurion-authority-hud" data-testid="authoritative-world-hud">
    <section className="aurion-authority-hud__profile" aria-label="Serverbestätigter Charakter" data-state={player.state}>
      <small role="status">{readbackLabels[player.state]}</small>
      {profile ? <><b>{classes[profile.selectedClass]} · Stufe {profile.level}</b><span>{profile.totalXp} EP · {profile.aurionPoints} AURION</span><span>{profile.victories} Siege</span></> : <b>Charakterdaten ausstehend</b>}
      <span data-testid="confirmed-remote-player-count">{connected ? `${remotePlayers.length} andere Explorer verbunden` : "Mitspieler werden verbunden"}</span>
    </section>
    <nav className="aurion-authority-hud__menu" aria-label="Weltmenü">
      {(Object.keys(titles) as Exclude<Panel, null>[]).map(key => <button type="button" key={key} onClick={() => setPanel(key)}>{titles[key]}</button>)}
      <button type="button" onClick={() => window.dispatchEvent(new Event("aurion:open-companion"))}>Companion</button>
      <button type="button" onClick={() => community("partners")}>Gruppe</button><button type="button" onClick={() => community("chat")}>Chat</button>
      <button type="button" onClick={() => community("market")}>Handel</button><button type="button" onClick={() => community("crafting")}>Handwerk</button>
    </nav>
    <AurionEncounterPanel userId={userId} connected={connected} onAttack={() => onAction("F")} />
    <div className="aurion-authority-hud__move"><VirtualJoystick onMove={onMove} /></div>
    <div className="aurion-authority-hud__actions" aria-label="Aktionen">
      {[1, 2, 3, 4, 5].map(slot => <button type="button" key={slot} disabled={!connected || panel !== null} onClick={() => onAction(String(slot) as AurionGameplayCommand)} aria-label={`Aktion ${slot}`}>{slot}</button>)}
      <button type="button" disabled={!connected || panel !== null} onClick={() => onAction("E")}>Interaktion</button>
    </div>
    <Dialog open={panel !== null} onOpenChange={open => { if (!open) setPanel(null); }}>
      <DialogContent className="aurion-authority-hud__dialog" overlayClassName="aurion-authority-hud__backdrop">
        <DialogTitle>{panel ? titles[panel] : "Aurion"}</DialogTitle>
        <DialogDescription>Deine gespeicherten Fortschritte und bestätigten Weltinformationen.</DialogDescription>
        {message && <p role="status">{message}</p>}
        {panel === "inventory" && <div data-state={player.state}>
          <p role="status">{readbackLabels[player.state]}</p>
          {inventory?.length === 0 && <p>Dein Inventar ist leer.</p>}
          {inventory?.map(item => <article key={item.id} className="aurion-authority-hud__card"><b>{item.baseItemKey.replaceAll("_", " ")}</b><p>{item.quality} · Stufe {item.itemLevel}</p>{item.affixes.map(affix => <p key={`${affix.slot}:${affix.key}`}>{affix.key}: {Object.entries(affix.stats).map(([key, value]) => `${key} ${value}`).join(", ")}</p>)}</article>)}
          <p>Gegenstände handeln und herstellen:</p><button type="button" onClick={() => { setPanel(null); community("market"); }}>Handel öffnen</button><button type="button" onClick={() => { setPanel(null); community("crafting"); }}>Handwerk öffnen</button>
        </div>}
        {panel === "character" && <div data-state={player.state}>
          <p role="status">{readbackLabels[player.state]}</p>
          {profile && <><p>Klasse: {classes[profile.selectedClass]}</p><p>Stufe {profile.level} · Gesamt-EP {profile.totalXp}</p><p>{profile.aurionPoints} AURION · {profile.victories} Siege</p>
            <p>Klassenwahl ab Stufe {player.data!.capabilities.classUnlockLevel}; die Wahl ist dauerhaft.</p>
            <fieldset disabled={!fresh || !player.data?.capabilities.canChooseClass}><legend>Klasse wählen</legend>{(["vanguard", "seer", "warden"] as const).map(playerClass => <button type="button" key={playerClass} aria-pressed={profile.selectedClass === playerClass} onClick={() => { if (player.data?.capabilities.canChooseClass) void act(() => chooseClass.mutateAsync({ playerClass })); }}>{classes[playerClass]}</button>)}</fieldset>
            <fieldset disabled={!fresh}><legend>Waffendisziplin</legend>{(["blade", "staff", "spear", "focus"] as const).map(weaponTrack => <button type="button" key={weaponTrack} aria-pressed={player.data?.weaponLoadout?.weaponTrack === weaponTrack} onClick={() => void act(() => setWeapon.mutateAsync({ weaponTrack }))}>{weaponTrack}</button>)}</fieldset>
            <button type="button" onClick={()=>{setPanel(null);community("guild");}}>Gilde öffnen</button><h3>Waffenmeisterschaft</h3>{player.data?.weaponMasteries.length === 0 && <p>Noch keine Meisterschaft erworben.</p>}{player.data?.weaponMasteries.map(item => <p key={item.weaponTrack}>{item.weaponTrack} · Stufe {item.level} · {item.xp} EP</p>)}</>}
        </div>}
        {panel === "quests" && <div data-state={quests.state}>
          <NpcStandingPanel userId={userId} />
          <NpcDecisionPanel userId={userId} />
          <p role="status">{readbackLabels[quests.state]}</p>
          {quests.data?.quests.map(quest => <article key={quest.key} className="aurion-authority-hud__card"><b>{quest.title}</b><p>{quest.giver} · ab Stufe {quest.requiredLevel}</p><p>{quest.objective}</p><p>{quest.readyToTurnIn ? "Bereit zur Abgabe" : ({ locked: "Gesperrt", available: "Verfügbar", active: "Aktiv", completed: "Abgeschlossen" } as const)[quest.state]}</p>
            {quest.state === "available" && <button type="button" disabled={!fresh || quests.state !== "live"} onClick={() => void act(() => accept.mutateAsync({ questKey: quest.key }))}>Bei {quest.giver} annehmen</button>}
            {quest.readyToTurnIn && <button type="button" disabled={!fresh || quests.state !== "live"} onClick={() => void act(() => complete.mutateAsync({ questKey: quest.key, giver: quest.giver }))}>Bei {quest.giver} abgeben</button>}
          </article>)}
          {quests.data && <p>Schlüssel: {quests.data.keys.length ? quests.data.keys.join(", ") : "Keine"}</p>}
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
