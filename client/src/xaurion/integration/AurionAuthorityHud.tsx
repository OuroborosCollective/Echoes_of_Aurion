import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Package, UserRound, ScrollText, Map, Sparkles, Users, MessageSquare, Coins, Hammer, Menu, Hand, Swords, Gamepad2, Repeat } from "lucide-react";
import { playerUiReadbackSchema, aurionControlSkills, type SkillCommand } from "@shared/playerUiProtocol";
import { groupReadmodelSchema } from "@shared/groupInstanceProtocol";
import type { ConfirmedZonePresence } from "@shared/zonePresenceContract";
import { InventoryModal } from "../components/InventoryModal";
import { CharacterModal } from "../components/CharacterModal";
import { QuestLogModal } from "../components/QuestLogModal";
import { CraftingModal } from "../components/CraftingModal";
import { ControlsModal } from "../components/ControlsModal";
import { VirtualJoystick } from "../components/VirtualJoystick";
import { NpcDecisionPanel } from "./NpcDecisionPanel";
import { NpcStandingPanel } from "./NpcStandingPanel";
import { AurionEncounterPanel } from "./AurionEncounterPanel";
import { AurionGroupFinder } from "./AurionGroupFinder";
import { projectPlayerReadback, projectReadback, questReadbackSchema, readbackLabels, worldReadbackSchema } from "./authoritativeHudProjection";
import { ConfirmedAutoAttack, WORLD_PANEL_SELECTOR, type ActionOutcome } from "./confirmedActionRequest";
import type { AurionGameplayCommand } from "./aurionAuthorityAdapter";

type Panel = "inventory" | "character" | "quests" | "map" | "crafting" | "controls" | null;
const classes = { unbound: "Reisender", vanguard: "Vorhut", seer: "Seher", warden: "Hüter" } as const;
const menu = [["inventory", "Inventar", Package], ["character", "Charakter", UserRound], ["quests", "Aufträge & Kontakte", ScrollText], ["map", "Weltatlas", Map]] as const;
const community = (panel: "chat" | "market" | "guild") => window.dispatchEvent(new CustomEvent("aurion:open-community", { detail: { panel } }));

export function AurionAuthorityHud({ userId, connected, position, remotePlayers = [], onMove, onAction, onInteract }: {
  userId: number; connected: boolean; position?: { x: number; z: number }; remotePlayers?: readonly ConfirmedZonePresence[];
  onMove: (forward: number, right: number) => void; onAction: (command: AurionGameplayCommand, automated?: boolean) => Promise<ActionOutcome>; onInteract?: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
  const [expandedMenu, setExpandedMenu] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [questTab, setQuestTab] = useState<"quests" | "contacts">("quests");
  const [pending, setPending] = useState(false);
  const [combatBusy, setCombatBusy] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const [startAfterClose, setStartAfterClose] = useState(false);
  const busy = useRef(false);
  const utils = trpc.useUtils();
  const options = { enabled: userId > 0, staleTime: 15_000, refetchInterval: 10_000 };
  const playerQuery = trpc.player.me.useQuery(undefined, options);
  const questQuery = trpc.gameplay.progress.useQuery(undefined, options);
  const worldQuery = trpc.gameplay.openWorld.useQuery(undefined, options);
  const uiQuery = trpc.player.ui.useQuery(undefined, options);
  const groupQuery = trpc.groups.read.useQuery(undefined, { ...options, enabled: panel === "character" || groupOpen });
  const craftingQuery = trpc.crafting.read.useQuery(undefined, { ...options, enabled: panel === "crafting" });
  const player = projectPlayerReadback(playerQuery, userId);
  const quests = projectReadback(questReadbackSchema, questQuery);
  const world = projectReadback(worldReadbackSchema, worldQuery);
  const ui = projectReadback(playerUiReadbackSchema.refine(v => v.userId === userId), uiQuery);
  const group = projectReadback(groupReadmodelSchema.refine(v => v.player.userId === userId), groupQuery);
  const accept = trpc.gameplay.acceptQuest.useMutation();
  const complete = trpc.gameplay.completeQuest.useMutation();
  const chooseClass = trpc.player.chooseClass.useMutation();
  const setWeapon = trpc.player.setWeaponLoadout.useMutation();
  const saveControls = trpc.player.saveControls.useMutation();
  const collect = trpc.player.collectLoot.useMutation();
  const equip = trpc.player.equipItem.useMutation();
  const unequip = trpc.player.unequipItem.useMutation();
  const groupCommand = trpc.groups.command.useMutation();
  const craft = trpc.crafting.craft.useMutation();
  const bonus = trpc.crafting.materializeBonus.useMutation();
  const fresh = connected && player.state === "live" && ui.state === "live" && !pending;
  const permitted = useRef(false);
  permitted.current = connected && panel === null && !groupOpen && !expandedMenu && !pending;
  const action = useRef(onAction); action.current = onAction;
  const auto = useMemo(() => new ConfirmedAutoAttack(() => action.current("F", true), () => permitted.current && !document.hidden && !document.querySelector(WORLD_PANEL_SELECTOR), (active, note) => { setAutoActive(active); if (note) setMessage(note); }), [userId]);
  const openPanel = useCallback((value: Panel) => { auto.stop(); onMove(0, 0); setExpandedMenu(false); setMessage(""); setPanel(value); }, [auto, onMove]);
  const refresh = useCallback(async () => {
    const results = await Promise.all([playerQuery.refetch(), questQuery.refetch(), uiQuery.refetch(), groupQuery.refetch(), craftingQuery.refetch()]);
    if (results.some(r => r.isError)) throw new Error("UI_READBACK_UNAVAILABLE");
    const parsed = playerUiReadbackSchema.parse(results[2].data);
    if (parsed.userId !== userId) throw new Error("UI_READBACK_OWNER_MISMATCH");
    await utils.gameplay.relationshipStanding.invalidate();
  }, [playerQuery.refetch, questQuery.refetch, uiQuery.refetch, groupQuery.refetch, craftingQuery.refetch, utils, userId]);
  const act = async (operation: () => Promise<unknown>) => {
    if (!fresh || busy.current) return;
    busy.current = true; setPending(true); auto.stop(); setMessage("");
    let applied = false;
    try { await operation(); applied = true; }
    catch { setMessage("Änderung nicht bestätigt. Prüfe den neu geladenen Stand vor einer weiteren Aktion."); }
    try { await refresh(); if (applied) setMessage("Änderung vom Server bestätigt."); }
    catch { setMessage("Aktualisierung nicht bestätigt. Der aktuelle Stand ist derzeit nicht verfügbar."); }
    finally { busy.current = false; setPending(false); }
  };
  const bind = (slot: number, command: SkillCommand) => {
    const settings = ui.data?.settings;
    if (!settings) return;
    const hotbar = [...settings.hotbar]; const previousSlot = hotbar.indexOf(command);
    if (previousSlot >= 0) hotbar[previousSlot] = hotbar[slot]!;
    hotbar[slot] = command;
    void act(() => saveControls.mutateAsync({ ...settings, hotbar }));
  };
  const toggleLoot = () => { if (ui.data) void act(() => saveControls.mutateAsync({ ...ui.data!.settings, autoLoot: !ui.data!.settings.autoLoot })); };
  useEffect(() => {
    if (!permitted.current) auto.stop();
    if (startAfterClose && permitted.current) { setStartAfterClose(false); auto.start(); }
  }, [connected, panel, groupOpen, expandedMenu, pending, startAfterClose, auto]);
  useEffect(() => {
    const update = () => { void refresh().catch(() => setMessage("Aktuelle Daten sind nicht verfügbar.")); };
    const contacts = () => { setQuestTab("contacts"); openPanel("quests"); };
    const crafting = () => openPanel("crafting");
    const controls = () => openPanel("controls");
    const shortcut = (e: Event) => { const next = (e as CustomEvent<{ panel?: Panel }>).detail?.panel; if (next && ["inventory", "character", "quests"].includes(next)) openPanel(next); };
    const toggle = () => { if (autoActive) auto.stop(); else auto.start(); };
    const status = (e: Event) => setCombatBusy(Boolean((e as CustomEvent<{ busy?: boolean }>).detail?.busy));
    const stop = () => auto.stop();
    const events = [["aurion:authoritative-action", update], ["aurion:open-world-contacts", contacts], ["aurion:open-world-crafting", crafting], ["aurion:open-world-controls", controls], ["aurion:open-world-panel", shortcut], ["aurion:toggle-auto-attack", toggle], ["aurion:encounter-status", status], ["blur", stop]] as const;
    events.forEach(([name, handler]) => window.addEventListener(name, handler));
    document.addEventListener("visibilitychange", stop);
    return () => { events.forEach(([name, handler]) => window.removeEventListener(name, handler)); document.removeEventListener("visibilitychange", stop); };
  }, [refresh, openPanel, auto, autoActive]);
  useEffect(() => {
    const observer = new MutationObserver(() => { if (document.querySelector(WORLD_PANEL_SELECTOR)) auto.stop(); });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "data-aurion-panel", "data-opened-from-world"] });
    return () => { observer.disconnect(); auto.stop(); };
  }, [auto]);
  const profile = player.data?.profile;
  const actionDisabled = !connected || panel !== null || groupOpen || expandedMenu || combatBusy || pending;
  return <div className="aurion-authority-hud xaurion-game-hud" data-testid="authoritative-world-hud">
    <section className="aurion-authority-hud__profile" aria-label="Serverbestätigter Charakter" data-state={player.state}>
      <div className="ax1-unit-portrait" aria-hidden="true"><UserRound size={27} />{profile && <span>{profile.level}</span>}</div><div className="ax1-unit-values">{profile ? <><b>{classes[profile.selectedClass]} · Stufe {profile.level}</b><span>{profile.totalXp} EP · {profile.aurionPoints} AURION</span><span className="ax1-unit-detail">{profile.victories} Siege</span></> : <b>Charakterdaten ausstehend</b>}<small role="status" className={player.state === "live" ? "sr-only" : undefined}>{readbackLabels[player.state]}</small><span data-testid="confirmed-remote-player-count" className="sr-only">{connected ? remotePlayers.length + " andere Explorer verbunden" : "Mitspieler werden verbunden"}</span></div>
    </section>
    <nav className="aurion-authority-hud__menu" aria-label="Weltmenü" data-expanded={expandedMenu}>{menu.map(([key, label, Icon]) => <button key={key} title={label} aria-label={label} onClick={() => openPanel(key)}><Icon size={19} /></button>)}<button className="ax1-menu-more" title="Weitere Menüs" aria-label="Weitere Menüs" aria-expanded={expandedMenu} onClick={() => { auto.stop(); setExpandedMenu(v => !v); }}><Menu size={19} /></button><div className="ax1-secondary-menu"><button aria-label="Steuerung & Skills" title="Steuerung & Skills" onClick={() => openPanel("controls")}><Gamepad2 size={19} /></button><button title="Companion" aria-label="Companion" onClick={() => { auto.stop(); setExpandedMenu(false); window.dispatchEvent(new Event("aurion:open-companion")); }}><Sparkles size={19} /></button><button title="Gruppe" aria-label="Gruppe" onClick={() => { auto.stop(); onMove(0, 0); setExpandedMenu(false); setGroupOpen(true); }}><Users size={19} /></button><button title="Chat" aria-label="Chat" onClick={() => { auto.stop(); setExpandedMenu(false); community("chat"); }}><MessageSquare size={19} /></button><button title="Gilde" aria-label="Gilde öffnen" onClick={() => { auto.stop(); setExpandedMenu(false); community("guild"); }}><Users size={19} /></button><button title="Handel" aria-label="Handel" onClick={() => { auto.stop(); setExpandedMenu(false); community("market"); }}><Coins size={19} /></button><button title="Handwerk" aria-label="Handwerk" onClick={() => openPanel("crafting")}><Hammer size={19} /></button></div></nav>
    <AurionEncounterPanel userId={userId} connected={connected} onAttack={() => { void onAction("F"); }} />
    {groupOpen && <AurionGroupFinder open onClose={() => setGroupOpen(false)} />}
    <div className="aurion-authority-hud__move"><VirtualJoystick onMove={onMove} /></div>
    <div className="aurion-authority-hud__actions" aria-label="Aktionen">
      <button className="ax1-action-primary" disabled={actionDisabled} onClick={() => { void onAction("F"); }} aria-label="Angriff" title="Angriff [R]"><Swords size={24} /><kbd>R</kbd></button>
      {(ui.data?.settings.hotbar ?? []).map((command, index) => { const skill = aurionControlSkills.find(s => s.command === command)!; return <button key={index} disabled={actionDisabled || ui.state !== "live"} onClick={() => { void onAction(command); }} aria-label={"Aktion " + (index + 1) + ": " + skill.name} title={skill.name}><span style={{ color: skill.color }}>{skill.icon}</span><kbd>{index + 1}</kbd></button>; })}
      <button disabled={actionDisabled} onClick={() => onInteract ? onInteract() : void onAction("E")} aria-label="Interaktion" title="Interaktion [F]"><Hand size={22} /><kbd>F</kbd></button>
      <button disabled={!connected || panel !== null || groupOpen || pending} onClick={() => autoActive ? auto.stop() : auto.start()} aria-label="Auto-Angriff" title="Auto-Angriff [T]" aria-pressed={autoActive}><Repeat size={20} /><kbd>{autoActive ? "AN" : "T"}</kbd></button>
    </div>
    {panel === null && message && <p className="aurion-ui-feedback" role="status">{message}</p>}
    {ui.state === "error" && <p className="aurion-ui-feedback" role="alert">Inventardaten sind nicht verfügbar.</p>}
    <InventoryModal isOpen={panel === "inventory"} onClose={() => openPanel(null)} readback={ui.data} points={profile?.aurionPoints} pending={!fresh} message={message || (ui.state !== "live" ? readbackLabels[ui.state] : "")} onEquip={item => { const previous = ui.data?.equipment.find(e => e.slot === item.slot); void act(() => equip.mutateAsync({ id: item.id, version: item.version, expectedItem: previous ? { id: previous.id, version: previous.version } : null })); }} onUnequip={item => { void act(() => unequip.mutateAsync({ id: item.id, version: item.version })); }} onCollect={item => { void act(() => collect.mutateAsync({ id: item.id, version: item.version })); }} onToggleAutoLoot={toggleLoot} onCraft={() => openPanel("crafting")} />
    <CharacterModal isOpen={panel === "character"} onClose={() => openPanel(null)} player={player.data} settings={ui.data?.settings} pending={!fresh} message={message} group={group.state === "live" ? group.data : undefined} onBind={bind} onClass={playerClass => { void act(() => chooseClass.mutateAsync({ playerClass })); }} onWeapon={weaponTrack => { void act(() => setWeapon.mutateAsync({ weaponTrack })); }} onRoleSkill={(skill, equipped) => { const current = group.data?.player; if (current) void act(() => groupCommand.mutateAsync({ expectedRevision: current.revision, action: { kind: "equip", skills: equipped ? [...new Set([...current.skills, skill])] : current.skills.filter(s => s !== skill) } })); }} onInventory={() => openPanel("inventory")} />
    {panel === "quests" && <QuestLogModal key={questTab} isOpen onClose={() => openPanel(null)} quests={quests.data?.quests} keys={quests.data?.keys} pending={!fresh || quests.state !== "live"} message={message} initialTab={questTab} contacts={<><NpcStandingPanel userId={userId} /><NpcDecisionPanel userId={userId} /></>} onAccept={q => { void act(() => accept.mutateAsync({ questKey: q.key })); }} onComplete={q => { void act(() => complete.mutateAsync({ questKey: q.key, giver: q.giver })); }} />}
    <CraftingModal isOpen={panel === "crafting"} onClose={() => openPanel(null)} inventory={ui.data} readback={!craftingQuery.isError ? craftingQuery.data : undefined} pending={!fresh || craftingQuery.isFetching || craftingQuery.isError} message={message} onCraft={inputItemId => { void act(() => craft.mutateAsync({ recipeKey: "temper_aurion_spear", inputItemId })); }} onBonus={batch => { void act(() => bonus.mutateAsync({ receiptId: batch.receiptId, expectedOutputIndexExact: batch.nextOutputIndexExact, count: Math.min(10, Number(batch.remainingQuantityExact)) })); }} />
    <ControlsModal open={panel === "controls"} onClose={() => openPanel(null)} settings={ui.data?.settings} pending={!fresh} message={message} onBind={bind} onAutoLoot={toggleLoot} onStartAuto={() => { openPanel(null); setStartAfterClose(true); }} />
    <Dialog open={panel === "map"} onOpenChange={open => { if (!open) openPanel(null); }}><DialogContent className="aurion-authority-hud__dialog" overlayClassName="aurion-authority-hud__backdrop"><DialogTitle>Weltatlas</DialogTitle><DialogDescription>Die Welt und deine bestätigte Position.</DialogDescription><div data-state={world.state}><p role="status">{readbackLabels[world.state]}</p>{world.data && <><p>Weltepoche {world.data.globalWorld.epoch}</p><p className="aurion-authority-hud__hash">Welt-Hash: {world.data.globalWorld.deterministicHash}</p></>}{position && connected ? <p>Bestätigte Position: {(position.x / 1000).toFixed(2)} / {(position.z / 1000).toFixed(2)}</p> : <p>Position wartet auf die Zonenverbindung.</p>}{connected && remotePlayers.map(p => <p key={p.userId}>Explorer {p.userId}: {(p.position.x / 1000).toFixed(2)} / {(p.position.z / 1000).toFixed(2)}</p>)}</div></DialogContent></Dialog>
  </div>;
}
