import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Award, ChevronDown, ChevronUp, Compass, Crown, Package, UserRound, ScrollText, Map, Sparkles, Users, MessageSquare, Coins, Hammer, Menu, Hand, Swords, Gamepad2, Repeat, ShieldCheck } from "lucide-react";
import { z } from "zod";
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
import { AurionGroupFinder } from "./AurionGroupFinder";
import { projectPlayerReadback, projectReadback, readbackLabels, worldReadbackSchema } from "./authoritativeHudProjection";
import { ConfirmedAutoAttack, WORLD_PANEL_SELECTOR, type ActionOutcome } from "./confirmedActionRequest";
import type { AurionGameplayCommand } from "./aurionAuthorityAdapter";
import "./ax1AuthorityHud.css";

type Panel = "inventory" | "character" | "quests" | "map" | "crafting" | "controls" | null;
const explorerView = { name: "Explorer", icon: "✦", color: "#fbbf24" } as const;
const roleLabels = { tank: "Tank", healer: "Heiler", dps: "Schaden" } as const;
const panelHotkeys: Record<string, Panel> = { i: "inventory", b: "inventory", c: "character", m: "map", j: "quests", q: "quests" };
const community = (panel: "chat" | "market" | "guild") => window.dispatchEvent(new CustomEvent("aurion:open-community", { detail: { panel } }));
const ax1WorldHudSchema = worldReadbackSchema.extend({
  revision: z.literal(1),
  zoneId: z.enum(["observatory_threshold", "windhollow", "emberfall", "cinder_vault"]),
  displayName: z.string().min(1).max(160),
  primaryEncounter: z.object({
    id: z.string().min(1).max(160),
    label: z.string().min(1).max(160),
    encounterKey: z.string().min(1).max(160),
    narrative: z.string().min(1).max(600),
  }).nullable(),
  pointsOfInterest: z.array(z.object({
    id: z.string().min(1).max(160),
    kind: z.enum(["portal", "npc", "encounter", "landmark"]),
    state: z.enum(["locked", "available", "completed"]),
    label: z.string().min(1).max(160),
  })).max(64),
});

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
  const [autoActive, setAutoActive] = useState(false);
  const [startAfterClose, setStartAfterClose] = useState(false);
  const [objectivesCollapsed, setObjectivesCollapsed] = useState(false);
  const [partyCollapsed, setPartyCollapsed] = useState(false);
  const busy = useRef(false);
  const utils = trpc.useUtils();
  const options = { enabled: userId > 0, staleTime: 15_000, refetchInterval: 10_000 };
  const playerQuery = trpc.player.me.useQuery(undefined, options);
  const worldQuery = trpc.gameplay.openWorld.useQuery(undefined, options);
  const uiQuery = trpc.player.ui.useQuery(undefined, options);
  const groupQuery = trpc.groups.read.useQuery(undefined, options);
  const craftingQuery = trpc.crafting.read.useQuery(undefined, { ...options, enabled: panel === "crafting" });
  const player = projectPlayerReadback(playerQuery, userId);
  const world = projectReadback(ax1WorldHudSchema, worldQuery);
  const ui = projectReadback(playerUiReadbackSchema.refine(v => v.userId === userId), uiQuery);
  const group = projectReadback(groupReadmodelSchema.refine(v => v.player.userId === userId), groupQuery);
  const saveControls = trpc.player.saveControls.useMutation();
  const collect = trpc.player.collectLoot.useMutation();
  const equip = trpc.player.equipItem.useMutation();
  const unequip = trpc.player.unequipItem.useMutation();
  const groupCommand = trpc.groups.command.useMutation();
  const craft = trpc.crafting.craft.useMutation();
  const bonus = trpc.crafting.materializeBonus.useMutation();
  const uiFresh = connected && ui.state === "live" && !pending;
  const groupFresh = connected && group.state === "live" && !pending;
  const fresh = uiFresh && player.state === "live";
  const permitted = useRef(false);
  permitted.current = connected && panel === null && !groupOpen && !expandedMenu && !pending;
  const action = useRef(onAction); action.current = onAction;
  const auto = useMemo(() => new ConfirmedAutoAttack(() => action.current("F", true), () => permitted.current && !document.hidden && !document.querySelector(WORLD_PANEL_SELECTOR), (active, note) => { setAutoActive(active); if (note) setMessage(note); }), [userId]);
  const openPanel = useCallback((value: Panel) => { auto.stop(); onMove(0, 0); setExpandedMenu(false); setMessage(""); setPanel(value); }, [auto, onMove]);
  const refresh = useCallback(async () => {
    const results = await Promise.all([playerQuery.refetch(), uiQuery.refetch(), groupQuery.refetch(), craftingQuery.refetch()]);
    if (results.some(r => r.isError)) throw new Error("UI_READBACK_UNAVAILABLE");
    const parsed = playerUiReadbackSchema.parse(results[1].data);
    if (parsed.userId !== userId) throw new Error("UI_READBACK_OWNER_MISMATCH");
    await utils.gameplay.relationshipStanding.invalidate();
  }, [playerQuery.refetch, uiQuery.refetch, groupQuery.refetch, craftingQuery.refetch, utils, userId]);
  const act = async (operation: () => Promise<unknown>, ready = fresh) => {
    if (!ready || busy.current) return;
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
    void act(() => saveControls.mutateAsync({ ...settings, hotbar }), uiFresh);
  };
  const toggleLoot = () => { if (ui.data) void act(() => saveControls.mutateAsync({ ...ui.data!.settings, autoLoot: !ui.data!.settings.autoLoot }), uiFresh); };
  useEffect(() => {
    if (!permitted.current) auto.stop();
    if (startAfterClose && permitted.current) { setStartAfterClose(false); auto.start(); }
  }, [connected, panel, groupOpen, expandedMenu, pending, startAfterClose, auto]);
  useEffect(() => {
    const update = () => { void refresh().catch(() => setMessage("Aktuelle Daten sind nicht verfügbar.")); };
    const contacts = () => { setQuestTab("contacts"); openPanel("quests"); };
    const crafting = () => openPanel("crafting");
    const controls = () => openPanel("controls");
    const shortcut = (e: Event) => { const next = (e as CustomEvent<{ panel?: Panel }>).detail?.panel; if (next && ["inventory", "character", "quests", "map"].includes(next)) openPanel(next); };
    const toggle = () => { if (autoActive) auto.stop(); else auto.start(); };
    const stop = () => auto.stop();
    const events = [["aurion:authoritative-action", update], ["aurion:open-world-contacts", contacts], ["aurion:open-world-crafting", crafting], ["aurion:open-world-controls", controls], ["aurion:open-world-panel", shortcut], ["aurion:toggle-auto-attack", toggle], ["blur", stop]] as const;
    events.forEach(([name, handler]) => window.addEventListener(name, handler));
    document.addEventListener("visibilitychange", stop);
    return () => { events.forEach(([name, handler]) => window.removeEventListener(name, handler)); document.removeEventListener("visibilitychange", stop); };
  }, [refresh, openPanel, auto, autoActive]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (active instanceof HTMLElement && (active.isContentEditable || active.closest('input, textarea, select, [contenteditable="true"]'))) return;
      if (groupOpen || (panel === null && document.querySelector(WORLD_PANEL_SELECTOR))) return;
      const next = panelHotkeys[event.key.toLowerCase()];
      if (!next) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openPanel(panel === next ? null : next);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [openPanel, panel, groupOpen]);
  useEffect(() => {
    const observer = new MutationObserver(() => { if (document.querySelector(WORLD_PANEL_SELECTOR)) auto.stop(); });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "data-aurion-panel", "data-opened-from-world"] });
    return () => { observer.disconnect(); auto.stop(); };
  }, [auto]);

  const profile = player.data?.profile;
  const mastery = player.data?.progression.tracks.find(value => value.trackKind === "weapon");
  const party = group.data?.party ?? null;
  const partyMaxHp = group.data?.ticket?.playerMaxHp ?? null;
  const objectiveItems = world.data?.pointsOfInterest.filter(value => value.state === "available").slice(0, 3) ?? [];
  const actionDisabled = !connected || panel !== null || groupOpen || expandedMenu || pending;
  const openGroup = () => { auto.stop(); onMove(0, 0); setExpandedMenu(false); setGroupOpen(true); };

  return <div className="aurion-authority-hud xaurion-game-hud ax1-authority-shell" data-testid="authoritative-world-hud">
    <div className="ax1-hud-top-left">
      <section className="aurion-authority-hud__profile ax1-player-frame" aria-label="Serverbestätigter Charakter" data-state={player.state}>
        <button type="button" className="ax1-unit-portrait" aria-label="Charakter öffnen" onClick={() => openPanel("character")} style={{ borderColor: explorerView.color }}>
          <span className="ax1-unit-icon" aria-hidden="true">{explorerView.icon}</span>
        </button>
        <div className="ax1-unit-values">
          {profile ? <>
            <div className="ax1-unit-heading"><b>{explorerView.name}</b><strong>◆ {profile.aurionPoints}</strong></div>
            <div className="ax1-confirmed-bar" data-live={player.state === "live"}><i /><span>{player.data?.progression.tracks.length ?? 0} bestätigte Progressionspfade · {profile.victories} Siege</span></div>
            <div className="ax1-mastery-line">{mastery ? <><span>{mastery.trackId}</span><b>Stufe {mastery.levelExact}</b><em>Receipt verifiziert</em></> : <span>Waffenpfad wartet auf verifizierte Receipts</span>}</div>
          </> : <b>Charakterdaten ausstehend</b>}
          <small role="status" className={player.state === "live" ? "sr-only" : undefined}>{readbackLabels[player.state]}</small>
          <span data-testid="confirmed-remote-player-count" className="sr-only">{connected ? remotePlayers.length + " andere Explorer verbunden" : "Mitspieler werden verbunden"}</span>
        </div>
      </section>
      <div className="ax1-zone-strip">
        <Compass size={12} /><b>{world.data?.displayName ?? "Aurion Open World"}</b>
        {position && connected ? <span>[{(position.x / 1000).toFixed(0)}, {(position.z / 1000).toFixed(0)}]</span> : <span>{readbackLabels[world.state]}</span>}
      </div>

      {party && <section className="ax1-party-frames" aria-label="Serverbestätigte Gruppe">
        <button type="button" className="ax1-party-heading" onClick={() => setPartyCollapsed(value => !value)}>
          <span><Users size={13} /> Gruppe ({party.roster.length})</span><span>{partyCollapsed ? "▾" : "▴"}</span>
        </button>
        {!partyCollapsed && <div className="ax1-party-list">
          {party.roster.map(member => {
            const health = party.health.find(value => value.userId === member.userId)?.hp;
            const hpPercent = health !== undefined && partyMaxHp ? Math.max(0, Math.min(100, health / partyMaxHp * 100)) : null;
            const ready = group.data?.readyUserIds.includes(member.userId);
            return <button type="button" className="ax1-party-member" key={member.userId} onClick={openGroup}>
              <div><b>{member.name}</b><span>{roleLabels[member.role]}{ready ? " · bereit" : ""}</span></div>
              {hpPercent !== null ? <div className="ax1-party-hp"><i style={{ width: `${hpPercent}%` }} /><span>{health}/{partyMaxHp}</span></div> : <small>{member.weaponTrack ?? "ohne Waffenbindung"}</small>}
            </button>;
          })}
        </div>}
      </section>}
    </div>

    <div className="ax1-hud-top-right">
      <nav className="aurion-authority-hud__menu ax1-micro-menu" aria-label="Weltmenü" data-expanded={expandedMenu}>
        <button type="button" title="Charakter [C]" aria-label="Charakter" aria-keyshortcuts="C" onClick={() => openPanel("character")}><UserRound size={18} /></button>
        <button type="button" title="Inventar [I/B]" aria-label="Inventar" aria-keyshortcuts="I B" onClick={() => openPanel("inventory")}><Package size={18} /></button>
        <button type="button" title="Handwerk" aria-label="Handwerk" onClick={() => openPanel("crafting")}><Hammer size={18} /></button>
        <button type="button" title="Aufträge [J]" aria-label="Aufträge & Kontakte" aria-keyshortcuts="J" onClick={() => openPanel("quests")}><ScrollText size={18} /></button>
        <button type="button" title="Gruppe" aria-label="Gruppe" onClick={openGroup}><Users size={18} />{party && <span className="ax1-menu-badge">{party.roster.length}</span>}</button>
        <button type="button" title="Weltatlas [M]" aria-label="Weltatlas" aria-keyshortcuts="M" onClick={() => openPanel("map")}><Map size={18} /></button>
        <button type="button" className="ax1-menu-more" title="Weitere Menüs" aria-label="Weitere Menüs" aria-expanded={expandedMenu} onClick={() => { auto.stop(); setExpandedMenu(value => !value); }}><Menu size={18} /></button>
        <div className="ax1-secondary-menu">
          <button type="button" aria-label="Steuerung & Skills" title="Steuerung & Skills" onClick={() => openPanel("controls")}><Gamepad2 size={18} /></button>
          <button type="button" title="Companion" aria-label="Companion" onClick={() => { auto.stop(); setExpandedMenu(false); window.dispatchEvent(new Event("aurion:open-companion")); }}><Sparkles size={18} /></button>
          <button type="button" title="Chat" aria-label="Chat" onClick={() => { auto.stop(); setExpandedMenu(false); community("chat"); }}><MessageSquare size={18} /></button>
          <button type="button" title="Gilde" aria-label="Gilde öffnen" onClick={() => { auto.stop(); setExpandedMenu(false); community("guild"); }}><Crown size={18} /></button>
          <button type="button" title="Handel" aria-label="Handel" onClick={() => { auto.stop(); setExpandedMenu(false); community("market"); }}><Coins size={18} /></button>
        </div>
      </nav>

      <section className="ax1-objective-tracker" data-state={world.state}>
        <button type="button" className="ax1-objective-heading" onClick={() => setObjectivesCollapsed(value => !value)}>
          <span><Award size={13} /> Ziele ({objectiveItems.length + (world.data?.primaryEncounter ? 1 : 0)})</span>
          {objectivesCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
        {!objectivesCollapsed && <div className="ax1-objective-list">
          {world.data?.primaryEncounter && <button type="button" className="ax1-objective-card ax1-objective-primary" onClick={() => openPanel("quests")}>
            <b>{world.data.primaryEncounter.label}</b><span>{world.data.primaryEncounter.narrative}</span>
          </button>}
          {objectiveItems.map(item => <button type="button" className="ax1-objective-card" key={item.id} onClick={() => { if (item.kind === "npc") { setQuestTab("contacts"); openPanel("quests"); } else openPanel("map"); }}>
            <b>{item.label}</b><span>{item.kind === "npc" ? "Kontakt" : item.kind === "encounter" ? "Begegnung" : item.kind === "portal" ? "Portal" : "Landmarke"} · serverbestätigt</span>
          </button>)}
          {!world.data?.primaryEncounter && objectiveItems.length === 0 && <p>{world.state === "live" ? "Keine bestätigten aktiven Ziele." : readbackLabels[world.state]}</p>}
        </div>}
      </section>
    </div>

    {groupOpen && <AurionGroupFinder open onClose={() => setGroupOpen(false)} />}
    <div className="ax1-hud-bottom">
      <div className="ax1-hud-bottom-left">
        <button type="button" className="ax1-realm-chat" onClick={() => community("chat")}><MessageSquare size={15} /> Realm-Chat</button>
        <div className="aurion-authority-hud__move"><VirtualJoystick onMove={onMove} /></div>
      </div>

      <div className="ax1-hud-bottom-right">
        <div className="ax1-utility-actions" aria-label="Schnellaktionen">
          <button type="button" disabled={!uiFresh} aria-label="Auto-Loot" aria-pressed={ui.data?.settings.autoLoot ?? false} onClick={toggleLoot}><Sparkles size={17} /><span>A-LOOT</span></button>
          <button type="button" disabled={actionDisabled} onClick={() => onInteract ? onInteract() : void onAction("E")} aria-label="Interaktion" title="Interaktion [F]"><Hand size={17} /><span>ACTION</span></button>
          <button type="button" disabled={!connected || panel !== null || groupOpen || pending} onClick={() => autoActive ? auto.stop() : auto.start()} aria-label="Auto-Angriff" title="Auto-Angriff [T]" aria-pressed={autoActive}><Repeat size={17} /><span>{autoActive ? "AUTO AN" : "AUTO"}</span></button>
          <button type="button" onClick={() => openPanel("controls")} aria-label="Steuerung & Skills"><Gamepad2 size={17} /><span>CTRL</span></button>
          <button type="button" onClick={openGroup} aria-label="Gruppenverwaltung"><ShieldCheck size={17} /><span>GROUP</span></button>
        </div>

        <div className="aurion-authority-hud__actions ax1-hotbar" aria-label="Aktionen">
          <button type="button" className="ax1-action-primary" disabled={actionDisabled} onClick={() => { void onAction("F"); }} aria-label="Angriff" title="Angriff [R]"><Swords size={25} /><kbd>R</kbd><span>ANGRIFF</span></button>
          {(ui.data?.settings.hotbar ?? []).map((command, index) => {
            const skill = aurionControlSkills.find(value => value.command === command);
            if (!skill) return null;
            return <button type="button" key={`${command}:${index}`} disabled={actionDisabled || ui.state !== "live"} onClick={() => { void onAction(command); }} aria-label={`Aktion ${index + 1}: ${skill.name}`} title={skill.name}>
              <span className="ax1-skill-icon" style={{ color: skill.color }}>{skill.icon}</span><kbd>{index + 1}</kbd><small>{skill.name}</small>
            </button>;
          })}
        </div>
        <div className="ax1-progress-line" data-connected={connected}><i /></div>
      </div>
    </div>

    {panel === null && message && <p className="aurion-ui-feedback" role="status">{message}</p>}
    {ui.state === "error" && <p className="aurion-ui-feedback" role="alert">Inventardaten sind nicht verfügbar.</p>}
    <InventoryModal isOpen={panel === "inventory"} onClose={() => openPanel(null)} readback={ui.data} points={profile?.aurionPoints} pending={!uiFresh} message={message || (ui.state !== "live" ? readbackLabels[ui.state] : "")} onEquip={item => { const previous = ui.data?.equipment.find(e => e.slot === item.slot); void act(() => equip.mutateAsync({ id: item.id, version: item.version, expectedItem: previous ? { id: previous.id, version: previous.version } : null }), uiFresh); }} onUnequip={item => { void act(() => unequip.mutateAsync({ id: item.id, version: item.version }), uiFresh); }} onCollect={item => { void act(() => collect.mutateAsync({ id: item.id, version: item.version }), uiFresh); }} onToggleAutoLoot={toggleLoot} onCraft={() => openPanel("crafting")} />
    <CharacterModal isOpen={panel === "character"} onClose={() => openPanel(null)} player={player.data} settings={ui.data?.settings} uiPending={!uiFresh} groupPending={!groupFresh} message={message} group={group.state === "live" ? group.data : undefined} onBind={bind} onRoleSkill={(skill, equipped) => { const current = group.data?.player; if (current) void act(() => groupCommand.mutateAsync({ expectedRevision: current.revision, action: { kind: "equip", skills: equipped ? [...new Set([...current.skills, skill])] : current.skills.filter(s => s !== skill) } }), groupFresh); }} onInventory={() => openPanel("inventory")} />
    {panel === "quests" && <QuestLogModal key={questTab} isOpen onClose={() => openPanel(null)} pending={false} message={message} initialTab={questTab} contacts={<><NpcStandingPanel userId={userId} /><NpcDecisionPanel userId={userId} /></>} />}
    <CraftingModal isOpen={panel === "crafting"} onClose={() => openPanel(null)} inventory={ui.data} readback={!craftingQuery.isError ? craftingQuery.data : undefined} pending={!fresh || craftingQuery.isFetching || craftingQuery.isError} message={message} onCraft={inputItemId => { void act(() => craft.mutateAsync({ recipeKey: "temper_aurion_spear", inputItemId })); }} onBonus={batch => { void act(() => bonus.mutateAsync({ receiptId: batch.receiptId, expectedOutputIndexExact: batch.nextOutputIndexExact, count: Math.min(10, Number(batch.remainingQuantityExact)) })); }} />
    <ControlsModal open={panel === "controls"} onClose={() => openPanel(null)} settings={ui.data?.settings} pending={!uiFresh} message={message} onBind={bind} onAutoLoot={toggleLoot} onAnalytics={() => { if (ui.data) void act(() => saveControls.mutateAsync({ ...ui.data!.settings, analyticsConsent: !ui.data!.settings.analyticsConsent }), uiFresh); }} onStartAuto={() => { openPanel(null); setStartAfterClose(true); }} />
    <Dialog open={panel === "map"} onOpenChange={open => { if (!open) openPanel(null); }}><DialogContent className="aurion-authority-hud__dialog" overlayClassName="aurion-authority-hud__backdrop"><DialogTitle>Weltatlas</DialogTitle><DialogDescription>Die Welt und deine bestätigte Position.</DialogDescription><div data-state={world.state}><p role="status">{readbackLabels[world.state]}</p>{world.data && <><p>Weltepoche {world.data.globalWorld.epoch}</p><p className="aurion-authority-hud__hash">Welt-Hash: {world.data.globalWorld.deterministicHash}</p></>}{position && connected ? <p>Bestätigte Position: {(position.x / 1000).toFixed(2)} / {(position.z / 1000).toFixed(2)}</p> : <p>Position wartet auf die Zonenverbindung.</p>}{connected && remotePlayers.map(p => <p key={p.userId}>Explorer {p.userId}: {(p.position.x / 1000).toFixed(2)} / {(p.position.z / 1000).toFixed(2)}</p>)}</div></DialogContent></Dialog>
  </div>;
}