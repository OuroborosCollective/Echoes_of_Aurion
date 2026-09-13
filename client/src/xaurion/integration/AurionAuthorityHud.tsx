import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { z } from "zod";
import { playerUiReadbackSchema, aurionControlSkills, type SkillCommand } from "@shared/playerUiProtocol";
import { groupReadmodelSchema } from "@shared/groupInstanceProtocol";
import type { ConfirmedZonePresence } from "@shared/zonePresenceContract";
import { InventoryModal } from "../components/InventoryModal";
import { CharacterModal } from "../components/CharacterModal";
import { QuestLogModal } from "../components/QuestLogModal";
import { CraftingModal } from "../components/CraftingModal";
import { ControlsModal } from "../components/ControlsModal";
import { GameHUD } from "../components/GameHUD";
import { VirtualJoystick } from "../components/VirtualJoystick";
import { ClassSelectModal, DeterminismDebugOverlay, GuildManagementModal, HomesteadBuilderModal, MiniMap, NPCDialogueModal, NPCEconomyModal, ResearchModal, TerritoryPoliticsModal, WorldMapModal, type Ax1ConfirmedWorld } from "../components/Ax1WorldSurfaces";
import { NpcDecisionPanel } from "./NpcDecisionPanel";
import { NpcStandingPanel } from "./NpcStandingPanel";
import { AurionGroupFinder } from "./AurionGroupFinder";
import { projectPlayerReadback, projectReadback, readbackLabels, worldReadbackSchema } from "./authoritativeHudProjection";
import { ConfirmedAutoAttack, WORLD_PANEL_SELECTOR, type ActionOutcome } from "./confirmedActionRequest";
import type { AurionGameplayCommand } from "./aurionAuthorityAdapter";
import { CONFIRMED_COMBAT_PRESENTATION_EVENT, reduceConfirmedCombatMetrics, validConfirmedCombatPresentation, type ConfirmedCombatPresentationEvent } from "./combatPresentation";
import "./ax1AuthorityHud.css";

type Panel = "inventory" | "character" | "disciplines" | "quests" | "map" | "crafting" | "controls" | "guild" | "economy" | "dialogue" | "territory" | "homestead" | "determinism" | "research" | null;
const explorerView = { name: "Explorer", icon: "✦", color: "#fbbf24" } as const;
const roleLabels = { tank: "Tank", healer: "Heiler", dps: "Schaden" } as const;
const panelHotkeys: Record<string, Panel> = { i: "inventory", b: "inventory", c: "character", k: "disciplines", m: "map", j: "quests", q: "quests", g: "guild" };
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
  userId: number;
  connected: boolean;
  position?: { x: number; z: number };
  remotePlayers?: readonly ConfirmedZonePresence[];
  onMove: (forward: number, right: number) => void;
  onAction: (command: AurionGameplayCommand, automated?: boolean) => Promise<ActionOutcome>;
  onInteract?: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
  const [expandedMenu, setExpandedMenu] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<"party" | "dungeon">("party");
  const [questTab, setQuestTab] = useState<"quests" | "contacts">("quests");
  const [pending, setPending] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const [startAfterClose, setStartAfterClose] = useState(false);
  const [combatEvents, setCombatEvents] = useState<readonly ConfirmedCombatPresentationEvent[]>([]);
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
  const ui = projectReadback(playerUiReadbackSchema.refine(value => value.userId === userId), uiQuery);
  const group = projectReadback(groupReadmodelSchema.refine(value => value.player.userId === userId), groupQuery);
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
  const action = useRef(onAction);
  action.current = onAction;
  const auto = useMemo(() => new ConfirmedAutoAttack(
    () => action.current("F", true),
    () => permitted.current && !document.hidden && !document.querySelector(WORLD_PANEL_SELECTOR),
    (active, note) => { setAutoActive(active); if (note) setMessage(note); },
  ), [userId]);
  const openPanel = useCallback((value: Panel) => {
    auto.stop();
    onMove(0, 0);
    setExpandedMenu(false);
    setMessage("");
    setPanel(value);
  }, [auto, onMove]);
  const refresh = useCallback(async () => {
    const results = await Promise.all([playerQuery.refetch(), uiQuery.refetch(), groupQuery.refetch(), craftingQuery.refetch()]);
    if (results.some(result => result.isError)) throw new Error("UI_READBACK_UNAVAILABLE");
    const parsed = playerUiReadbackSchema.parse(results[1].data);
    if (parsed.userId !== userId) throw new Error("UI_READBACK_OWNER_MISMATCH");
    await utils.gameplay.relationshipStanding.invalidate();
  }, [playerQuery.refetch, uiQuery.refetch, groupQuery.refetch, craftingQuery.refetch, utils, userId]);
  const act = async (operation: () => Promise<unknown>, ready = fresh) => {
    if (!ready || busy.current) return;
    busy.current = true;
    setPending(true);
    auto.stop();
    setMessage("");
    let applied = false;
    try {
      await operation();
      applied = true;
    } catch {
      setMessage("Änderung nicht bestätigt. Prüfe den neu geladenen Stand vor einer weiteren Aktion.");
    }
    try {
      await refresh();
      if (applied) setMessage("Änderung vom Server bestätigt.");
    } catch {
      setMessage("Aktualisierung nicht bestätigt. Der aktuelle Stand ist derzeit nicht verfügbar.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const bind = (slot: number, command: SkillCommand) => {
    const settings = ui.data?.settings;
    if (!settings) return;
    const hotbar = [...settings.hotbar];
    const previousSlot = hotbar.indexOf(command);
    if (previousSlot >= 0) hotbar[previousSlot] = hotbar[slot]!;
    hotbar[slot] = command;
    void act(() => saveControls.mutateAsync({ ...settings, hotbar }), uiFresh);
  };
  const toggleLoot = () => {
    const settings = ui.data?.settings;
    if (!settings) return;
    void act(() => saveControls.mutateAsync({ ...settings, autoLoot: !settings.autoLoot }), uiFresh);
  };
  useEffect(() => {
    if (!permitted.current) auto.stop();
    if (startAfterClose && permitted.current) {
      setStartAfterClose(false);
      auto.start();
    }
  }, [connected, panel, groupOpen, expandedMenu, pending, startAfterClose, auto]);
  useEffect(() => {
    const update = () => { void refresh().catch(() => setMessage("Aktuelle Daten sind nicht verfügbar.")); };
    const contacts = () => { setQuestTab("contacts"); openPanel("quests"); };
    const crafting = () => openPanel("crafting");
    const controls = () => openPanel("controls");
    const shortcut = (event: Event) => {
      const next = (event as CustomEvent<{ panel?: Panel }>).detail?.panel;
      if (next) openPanel(next);
    };
    const toggle = () => { if (autoActive) auto.stop(); else auto.start(); };
    const stop = () => auto.stop();
    const events = [["aurion:authoritative-action", update], ["aurion:open-world-contacts", contacts], ["aurion:open-world-crafting", crafting], ["aurion:open-world-controls", controls], ["aurion:open-world-panel", shortcut], ["aurion:toggle-auto-attack", toggle], ["blur", stop]] as const;
    events.forEach(([name, handler]) => window.addEventListener(name, handler));
    document.addEventListener("visibilitychange", stop);
    return () => {
      events.forEach(([name, handler]) => window.removeEventListener(name, handler));
      document.removeEventListener("visibilitychange", stop);
    };
  }, [refresh, openPanel, auto, autoActive]);
  useEffect(() => {
    const receive = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (!validConfirmedCombatPresentation(value)) return;
      setCombatEvents(current => Object.freeze([...current, value].slice(-100)));
    };
    window.addEventListener(CONFIRMED_COMBAT_PRESENTATION_EVENT, receive);
    return () => window.removeEventListener(CONFIRMED_COMBAT_PRESENTATION_EVENT, receive);
  }, []);
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
    const observer = new MutationObserver(() => {
      if (document.querySelector(WORLD_PANEL_SELECTOR)) auto.stop();
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "data-aurion-panel", "data-opened-from-world"] });
    return () => {
      observer.disconnect();
      auto.stop();
    };
  }, [auto]);

  const profile = player.data?.profile;
  const mastery = player.data?.progression.tracks.find(value => value.trackKind === "weapon");
  const party = group.data?.party ?? null;
  const partyMaxHp = group.data?.ticket?.playerMaxHp ?? null;
  const objectiveItems = world.data?.pointsOfInterest.filter(value => value.state === "available").slice(0, 3) ?? [];
  const combatMetrics = useMemo(() => reduceConfirmedCombatMetrics(combatEvents), [combatEvents]);
  const projectionState = player.state === "live" ? "confirmed" : player.state === "stale" ? "stale" : player.state === "waiting" ? "loading" : "unavailable";
  const worldProjection: Ax1ConfirmedWorld | undefined = world.data ? {
    displayName: world.data.displayName,
    epoch: world.data.globalWorld.epoch,
    deterministicHash: world.data.globalWorld.deterministicHash,
    pointsOfInterest: world.data.pointsOfInterest,
    primaryEncounter: world.data.primaryEncounter,
  } : undefined;
  const actionDisabled = !connected || panel !== null || groupOpen || expandedMenu || pending;
  const openGroup = (mode: "party" | "dungeon" = "party") => {
    auto.stop();
    onMove(0, 0);
    setExpandedMenu(false);
    setGroupMode(mode);
    setGroupOpen(true);
  };
  const hudParty = party?.roster.map(member => {
    const health = party.health.find(value => value.userId === member.userId)?.hp;
    return {
      id: String(member.userId),
      name: member.name,
      role: roleLabels[member.role],
      ready: group.data?.readyUserIds.includes(member.userId) ?? false,
      hp: health,
      maxHp: partyMaxHp ?? undefined,
      weaponTrack: member.weaponTrack ?? undefined,
    };
  });
  const hudObjectives = [
    ...(world.data?.primaryEncounter ? [{
      id: `primary:${world.data.primaryEncounter.id}`,
      label: world.data.primaryEncounter.label,
      detail: world.data.primaryEncounter.narrative,
      kind: "primary" as const,
    }] : []),
    ...objectiveItems.map(item => ({
      id: item.id,
      label: item.label,
      detail: `${item.kind === "npc" ? "Kontakt" : item.kind === "encounter" ? "Begegnung" : item.kind === "portal" ? "Portal" : "Landmarke"} · serverbestätigt`,
      kind: item.kind,
    })),
  ];
  const hudHotbar = (ui.data?.settings.hotbar ?? []).flatMap(command => {
    const skill = aurionControlSkills.find(value => value.command === command);
    return skill ? [{ command, name: skill.name, icon: skill.icon, color: skill.color }] : [];
  });

  return <div className="aurion-authority-hud ax1-authority-shell" data-testid="authoritative-world-hud">
    <GameHUD
      playerName={explorerView.name}
      playerIcon={explorerView.icon}
      playerColor={explorerView.color}
      points={profile?.aurionPoints}
      victories={profile?.victories}
      progressionCount={player.data?.progression.tracks.length}
      mastery={mastery ? { name: mastery.trackId, level: mastery.levelExact } : undefined}
      playerState={player.state}
      playerStateLabel={readbackLabels[player.state]}
      connected={connected}
      remotePlayerCount={remotePlayers.length}
      zoneName={world.data?.displayName ?? "Aurion Open World"}
      coordinates={position && connected ? `[${(position.x / 1000).toFixed(0)}, ${(position.z / 1000).toFixed(0)}]` : undefined}
      worldState={world.state}
      worldStateLabel={readbackLabels[world.state]}
      party={hudParty}
      objectives={hudObjectives}
      hotbar={hudHotbar}
      autoLoot={ui.data?.settings.autoLoot ?? false}
      autoAttack={autoActive}
      actionsDisabled={actionDisabled}
      controlsDisabled={!uiFresh}
      combat={{
        eventCount: combatMetrics.eventCount,
        currentDps: combatMetrics.currentDps,
        peakDps: combatMetrics.peakDps,
        currentDtps: combatMetrics.currentDtps,
        logs: combatMetrics.logs,
      }}
      miniMap={<MiniMap world={worldProjection} position={position} remotePlayers={remotePlayers} state={world.state} onOpen={() => openPanel("map")} />}
      movementControl={<VirtualJoystick onMove={onMove} />}
      feedback={panel === null ? message : undefined}
      onMenuOpenChange={setExpandedMenu}
      onOpenCharacter={() => openPanel("character")}
      onOpenInventory={() => openPanel("inventory")}
      onOpenCrafting={() => openPanel("crafting")}
      onOpenQuests={() => { setQuestTab("quests"); openPanel("quests"); }}
      onOpenContacts={() => { setQuestTab("contacts"); openPanel("quests"); }}
      onOpenParty={() => openGroup("party")}
      onOpenDungeonFinder={() => openGroup("dungeon")}
      onOpenMap={() => openPanel("map")}
      onOpenControls={() => openPanel("controls")}
      onOpenDisciplines={() => openPanel("disciplines")}
      onOpenCompanion={() => { auto.stop(); setExpandedMenu(false); window.dispatchEvent(new Event("aurion:open-companion")); }}
      onOpenChat={() => { auto.stop(); setExpandedMenu(false); community("chat"); }}
      onOpenGuild={() => openPanel("guild")}
      onOpenEconomy={() => openPanel("economy")}
      onOpenDialogue={() => openPanel("dialogue")}
      onOpenTerritory={() => openPanel("territory")}
      onOpenHomestead={() => openPanel("homestead")}
      onOpenDeterminism={() => openPanel("determinism")}
      onOpenResearch={() => openPanel("research")}
      onToggleAutoLoot={toggleLoot}
      onInteract={() => { if (onInteract) onInteract(); else void onAction("E"); }}
      onToggleAutoAttack={() => { if (autoActive) auto.stop(); else auto.start(); }}
      onAttack={() => { void onAction("F"); }}
      onCastSkill={command => { void onAction(command as AurionGameplayCommand); }}
    />

    {groupOpen && <AurionGroupFinder open mode={groupMode} onClose={() => setGroupOpen(false)} />}
    {ui.state === "error" && <p className="aurion-ui-feedback" role="alert">Inventardaten sind nicht verfügbar.</p>}
    <InventoryModal
      isOpen={panel === "inventory"}
      onClose={() => openPanel(null)}
      readback={ui.data}
      points={profile?.aurionPoints}
      pending={!uiFresh}
      message={message || (ui.state !== "live" ? readbackLabels[ui.state] : "")}
      onEquip={item => {
        const previous = ui.data?.equipment.find(entry => entry.slot === item.slot);
        void act(() => equip.mutateAsync({ id: item.id, version: item.version, expectedItem: previous ? { id: previous.id, version: previous.version } : null }), uiFresh);
      }}
      onUnequip={item => { void act(() => unequip.mutateAsync({ id: item.id, version: item.version }), uiFresh); }}
      onCollect={item => { void act(() => collect.mutateAsync({ id: item.id, version: item.version }), uiFresh); }}
      onToggleAutoLoot={toggleLoot}
      onCraft={() => openPanel("crafting")}
    />
    <CharacterModal
      isOpen={panel === "character"}
      onClose={() => openPanel(null)}
      player={player.data}
      settings={ui.data?.settings}
      uiPending={!uiFresh}
      groupPending={!groupFresh}
      message={message}
      group={group.state === "live" ? group.data : undefined}
      onBind={bind}
      onRoleSkill={(skill, equipped) => {
        const current = group.data?.player;
        if (current) void act(() => groupCommand.mutateAsync({ expectedRevision: current.revision, action: { kind: "equip", skills: equipped ? [...new Set([...current.skills, skill])] : current.skills.filter(value => value !== skill) } }), groupFresh);
      }}
      onInventory={() => openPanel("inventory")}
    />
    <ClassSelectModal open={panel === "disciplines"} onClose={() => openPanel(null)} tracks={player.data?.progression.tracks} state={projectionState} />
    {panel === "quests" && <QuestLogModal key={questTab} isOpen onClose={() => openPanel(null)} pending={false} message={message} initialTab={questTab} contacts={<><NpcStandingPanel userId={userId} /><NpcDecisionPanel userId={userId} /></>} />}
    <CraftingModal
      isOpen={panel === "crafting"}
      onClose={() => openPanel(null)}
      inventory={ui.data}
      readback={!craftingQuery.isError ? craftingQuery.data : undefined}
      pending={!fresh || craftingQuery.isFetching || craftingQuery.isError}
      message={message}
      onCraft={inputItemId => { void act(() => craft.mutateAsync({ recipeKey: "temper_aurion_spear", inputItemId })); }}
      onBonus={batch => { void act(() => bonus.mutateAsync({ receiptId: batch.receiptId, expectedOutputIndexExact: batch.nextOutputIndexExact, count: Math.min(10, Number(batch.remainingQuantityExact)) })); }}
    />
    <ControlsModal
      open={panel === "controls"}
      onClose={() => openPanel(null)}
      settings={ui.data?.settings}
      pending={!uiFresh}
      message={message}
      onBind={bind}
      onAutoLoot={toggleLoot}
      onAnalytics={() => {
        const settings = ui.data?.settings;
        if (!settings) return;
        void act(() => saveControls.mutateAsync({ ...settings, analyticsConsent: !settings.analyticsConsent }), uiFresh);
      }}
      onStartAuto={() => { openPanel(null); setStartAfterClose(true); }}
    />
    <WorldMapModal open={panel === "map"} onClose={() => openPanel(null)} world={worldProjection} position={position} remotePlayers={remotePlayers} state={world.state} />
    <GuildManagementModal open={panel === "guild"} onClose={() => openPanel(null)} />
    <NPCEconomyModal open={panel === "economy"} onClose={() => openPanel(null)} />
    <NPCDialogueModal open={panel === "dialogue"} onClose={() => openPanel(null)} contacts={<><NpcStandingPanel userId={userId} /><NpcDecisionPanel userId={userId} /></>} state={projectionState} />
    <TerritoryPoliticsModal open={panel === "territory"} onClose={() => openPanel(null)} />
    <HomesteadBuilderModal open={panel === "homestead"} onClose={() => openPanel(null)} />
    <DeterminismDebugOverlay open={panel === "determinism"} onClose={() => openPanel(null)} world={worldProjection} metrics={combatMetrics} state={world.state === "live" ? "confirmed" : world.state === "stale" ? "stale" : world.state === "waiting" ? "loading" : "unavailable"} />
    <ResearchModal open={panel === "research"} onClose={() => openPanel(null)} onOpenCompanion={() => { openPanel(null); window.dispatchEvent(new Event("aurion:open-companion")); }} onOpenEvidence={() => openPanel("determinism")} />
  </div>;
}
