import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Ax1HpMeter } from "./Ax1HpMeter";
import {
  Activity,
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Coins,
  Compass,
  Crown,
  Gamepad2,
  Hand,
  Hammer,
  Landmark,
  Languages,
  Map as MapIcon,
  Menu,
  MessageSquare,
  Package,
  Repeat,
  History,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRound,
  Users,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type Ax1HudPartyMember = Readonly<{
  id: string;
  name: string;
  role: string;
  ready: boolean;
  hp?: number;
  maxHp?: number;
  weaponTrack?: string;
}>;

export type Ax1HudObjective = Readonly<{
  id: string;
  label: string;
  detail: string;
  kind: "primary" | "npc" | "encounter" | "portal" | "landmark";
  progress?: number;
  subtasks?: string[];
  lore?: string;
  completed?: boolean;
}>;

export type Ax1HudSkill = Readonly<{
  command: string;
  name: string;
  icon: string;
  color: string;
}>;

export type Ax1HudCombatLog = Readonly<{
  id: string;
  tick: number | string;
  text: string;
  value: number | string;
}>;

export interface GameHUDProps {
  playerName: string;
  playerIcon: string;
  playerColor: string;
  points?: number;
  victories?: number;
  progressionCount?: number;
  mastery?: Readonly<{ name: string; level: number | string; xpPercent?: number }>;
  playerState: string;
  playerStateLabel: string;
  connected: boolean;
  remotePlayerCount: number;
  zoneName: string;
  coordinates?: string;
  worldState: string;
  worldStateLabel: string;
  party?: readonly Ax1HudPartyMember[];
  objectives: readonly Ax1HudObjective[];
  hotbar: readonly Ax1HudSkill[];
  autoLoot: boolean;
  autoAttack: boolean;
  actionsDisabled: boolean;
  controlsDisabled: boolean;
  combat: Readonly<{
    eventCount: number;
    currentDps: number | string;
    peakDps: number | string;
    currentDtps: number | string;
    logs: readonly Ax1HudCombatLog[];
  }>;
  miniMap: ReactNode;
  movementControl: ReactNode;
  feedback?: string;
  onMenuOpenChange?: (open: boolean) => void;
  onOpenCharacter: () => void;
  onOpenInventory: () => void;
  onOpenCrafting: () => void;
  onOpenQuests: () => void;
  onOpenContacts: () => void;
  onOpenParty: () => void;
  onOpenDungeonFinder: () => void;
  onOpenMap: () => void;
  onOpenControls: () => void;
  onOpenDisciplines: () => void;
  onOpenCompanion: () => void;
  onOpenChat: () => void;
  onOpenGuild: () => void;
  onOpenEconomy: () => void;
  onOpenDialogue: () => void;
  onOpenTerritory: () => void;
  onOpenHomestead: () => void;
  onOpenDeterminism: () => void;
  onOpenResearch: () => void;
  onToggleAutoLoot: () => void;
  onInteract: () => void;
  onToggleAutoAttack: () => void;
  onAttack: () => void;
  onCastSkill: (command: string) => void;
}

const iconButton = "group relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-[5px] border border-slate-700/80 bg-black/75 px-1.5 text-amber-200 shadow-lg backdrop-blur-md transition-colors hover:border-amber-300/70 hover:bg-black/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";
const utilityButton = "flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-[5px] border px-2 text-[9px] font-mono font-bold shadow-lg backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";

export function GameHUD(props: GameHUDProps) {
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [partyCollapsed, setPartyCollapsed] = useState(false);
  const [objectivesCollapsed, setObjectivesCollapsed] = useState(false);
  const [combatOpen, setCombatOpen] = useState(false);
  const prevObjectivesRef = useRef<readonly Ax1HudObjective[]>([]);
  const [activeEffects, setActiveEffects] = useState<Map<string, 'shake' | 'pulse'>>(new Map());
  const [completedLedger, setCompletedLedger] = useState<Ax1HudObjective[]>([]);

  useEffect(() => {
    const nextEffects = new Map<string, 'shake' | 'pulse'>();
    const newlyCompleted: Ax1HudObjective[] = [];

    props.objectives.forEach(obj => {
      const prev = prevObjectivesRef.current.find(p => p.id === obj.id);
      
      // Sound trigger
      if (obj.completed && (!prev || !prev.completed)) {
        window.dispatchEvent(new CustomEvent("aurion:audio-cue", { detail: { cue: "progression.quest_complete", category: "progression" } }));
        newlyCompleted.push(obj);
      }

      if (!prev) {
        nextEffects.set(obj.id, 'shake'); // NEW - SHAKE
        if (obj.kind === "primary") toast.success(`Neues Hauptziel: ${obj.label}`);
      } else if (prev.label !== obj.label || prev.detail !== obj.detail) {
        nextEffects.set(obj.id, 'pulse'); // UPDATED - PULSE
        if (obj.kind === "primary") toast.success(`Hauptziel aktualisiert: ${obj.label}`);
      }
    });

    if (newlyCompleted.length > 0) {
        setCompletedLedger(prev => [...newlyCompleted, ...prev].slice(0, 5));
    }

    if (nextEffects.size > 0) {
      setActiveEffects(nextEffects);
      const timer = setTimeout(() => setActiveEffects(new Map()), 1500);
      return () => clearTimeout(timer);
    }
    prevObjectivesRef.current = props.objectives;
  }, [props.objectives]);

  useEffect(() => {
    props.onMenuOpenChange?.(menuExpanded);
  }, [menuExpanded, props.onMenuOpenChange]);

  const closeMenu = (action: () => void) => {
    setMenuExpanded(false);
    action();
  };

  const playerProjectionState =
    props.playerState === "live" ? "Confirmed" :
    props.playerState === "stale" ? "Stale" :
    props.playerState === "error" ? "Unavailable" :
    "Waiting";

  const worldProjectionState =
    props.worldState === "live" ? "Confirmed" :
    props.worldState === "stale" ? "Stale" :
    props.worldState === "error" ? "Unavailable" :
    "Waiting";

  const primaryObjective = props.objectives.find(objective => objective.kind === "primary");
  const nearbyObjectives = props.objectives.filter(objective => objective.kind !== "primary");


  return (
    <div
      id="game-hud-root"
      data-testid="ax1-game-hud"
      data-source="ax1-f24-visible-shell"
      className="xaurion-game-hud absolute inset-0 z-20 pointer-events-none select-none overflow-hidden text-white sm:opacity-100 opacity-95 transition-opacity duration-500"
    >
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-4">
        <div className="pointer-events-auto flex min-w-0 flex-col gap-1.5">
          <section
            id="player-unit-frame"
            aria-label="Serverbestätigter Charakter"
            data-state={props.playerState}
            className="flex max-w-[85vw] sm:max-w-[72vw] items-center gap-1.5 sm:gap-3 rounded-2xl border border-[#b8860b]/50 bg-black/85 p-1 sm:p-2.5 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
          >
            <button
              type="button"
              onClick={props.onOpenCharacter}
              aria-label="Charakter öffnen"
              className="relative h-9 w-9 sm:h-14 sm:w-14 shrink-0 rounded-xl border-2 bg-black/60 text-lg sm:text-3xl shadow-inner"
              style={{ borderColor: props.playerColor }}
            >
              {props.playerIcon}
            </button>
            <div className="w-32 sm:w-52 min-w-0 space-y-0.5 sm:space-y-1">
              <div className="flex items-center justify-between gap-2 text-[10px] sm:text-sm">
                <b className="truncate font-serif">{props.playerName}</b>
                <strong className="shrink-0 text-[8px] sm:text-[10px] font-mono text-[#fbbf24]">◆ {props.points ?? "—"}</strong>
              </div>
              <div className="relative h-2.5 sm:h-4 overflow-hidden rounded-md border border-emerald-950 bg-black/80 p-0.5">
                <div className="h-full rounded bg-gradient-to-r from-emerald-800 via-emerald-600 to-emerald-300" style={{ width: props.playerState === "live" ? "100%" : "12%" }} />
                <span className="absolute inset-0 grid place-items-center text-[7px] sm:text-[9px] font-mono font-bold">
                  {props.progressionCount ?? "—"} bestätigte Pfade · {props.victories ?? "—"} Siege
                </span>
              </div>
              <div className="relative h-2.5 sm:h-3 overflow-hidden rounded-[3px] border border-amber-900/60 bg-black/90">
                <span className="absolute inset-0 flex items-center justify-between gap-2 px-1 text-[5px] sm:text-[8px] font-mono font-bold text-amber-200">
                  <span className="truncate">{props.mastery?.name ?? "Waffenpfad ausstehend"}</span>
                  <span className="shrink-0">{props.mastery ? `Stufe ${props.mastery.level}` : props.playerStateLabel}</span>
                </span>
              </div>
              <span data-testid="confirmed-remote-player-count" className="sr-only">
                {props.connected ? `${props.remotePlayerCount} andere Explorer verbunden` : "Mitspieler werden verbunden"}
              </span>
            </div>
          </section>

          <div className="flex max-w-[88vw] flex-wrap items-center gap-1" aria-label="Projection state">
            <span className="inline-flex min-h-6 items-center gap-1 rounded-[3px] border border-emerald-300/25 bg-emerald-950/30 px-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-emerald-200">
              <CheckCircle2 className="h-3 w-3" aria-hidden /> Player · {playerProjectionState}
            </span>
            <span className="inline-flex min-h-6 items-center gap-1 rounded-[3px] border border-cyan-300/20 bg-cyan-950/25 px-1.5 font-mono text-[8px] uppercase tracking-[0.08em] text-cyan-200">
              {props.worldState === "live" ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : props.worldState === "stale" ? <History className="h-3 w-3" aria-hidden /> : <Clock3 className="h-3 w-3" aria-hidden />}
              World · {worldProjectionState}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex w-fit items-center gap-1 sm:gap-1.5 rounded-lg border border-gray-800 bg-black/70 px-1.5 sm:px-2.5 py-0.5 text-[9px] sm:text-[10px] font-mono text-gray-300 backdrop-blur-sm">
              <Compass className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-[#b8860b]" />
              <b className="max-w-[100px] sm:max-w-[150px] truncate font-serif text-[#fbbf24]">{props.zoneName}</b>
              <span className="text-gray-500">·</span>
              <span>{props.coordinates ?? props.worldStateLabel}</span>
            </div>
            <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-mono backdrop-blur-sm ${props.connected ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-300" : "border-amber-500/50 bg-amber-950/40 text-amber-300"}`}>
              <span className={`h-2 w-2 rounded-full ${props.connected ? "bg-cyan-400" : "bg-amber-400"}`} />
              <b>{props.connected ? "Realm verbunden" : "Verbinde Realm"}</b>
              {props.connected && <span>👥 {props.remotePlayerCount + 1}</span>}
            </div>
          </div>

          {props.party && props.party.length > 0 && (
            <section className="w-40 sm:w-52 rounded-xl border border-sky-900/60 bg-black/80 p-1.5 backdrop-blur-md shadow-lg">
              <button type="button" onClick={() => setPartyCollapsed(value => !value)} className="flex min-h-11 w-full items-center justify-between border-b border-gray-800/80 pb-1 text-[9px] font-serif font-bold uppercase tracking-wider text-sky-400" aria-expanded={!partyCollapsed} aria-label={partyCollapsed ? "Party öffnen" : "Party schließen"}>
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Party ({props.party.length})</span>
                {partyCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </button>
              {!partyCollapsed && <div className="space-y-1 pt-1">
                {props.party.map(member => {
                  const hpPct = member.hp !== undefined && member.maxHp ? Math.max(0, Math.min(100, member.hp / member.maxHp * 100)) : null;
                  return <button type="button" key={member.id} onClick={props.onOpenParty} className="block w-full rounded-lg border border-gray-800/80 bg-black/60 p-1 text-left hover:border-sky-500/50">
                    <div className="flex items-center justify-between gap-1 text-[8px] font-mono"><b className="truncate text-gray-200">{member.name}</b><span className="shrink-0 text-gray-400">{member.role}{member.ready ? " · bereit" : ""}</span></div>
                    {member.hp !== undefined && member.maxHp !== undefined ? (
                      <Ax1HpMeter hp={member.hp} maxHp={member.maxHp} className="mt-1" />
                    ) : (
                      <small className="text-[7px] text-gray-500">
                        {member.weaponTrack ?? "Bestätigte Werte ausstehend"}
                      </small>
                    )}
                  </button>;
                })}
              </div>}
            </section>
          )}
        </div>

        <div className="pointer-events-auto min-w-0 max-w-none flex flex-col items-end gap-1.5">
          <nav aria-label="Schnellnavigation" className="flex max-w-[94vw] flex-wrap justify-end gap-1.5 rounded-[6px] border border-slate-700/80 bg-black/72 p-1.5 shadow-xl backdrop-blur-xl">
            <HudNavButton label="Char" shortcut="C" title="Charakter [C]" ariaLabel="Charakter" onClick={() => closeMenu(props.onOpenCharacter)}><UserRound /></HudNavButton>
            <HudNavButton label="Inventar" shortcut="I" title="Inventar [I/B]" ariaLabel="Inventar" onClick={() => closeMenu(props.onOpenInventory)}><Package /></HudNavButton>
            <HudNavButton label="Craft" title="Handwerk" ariaLabel="Handwerk" onClick={() => closeMenu(props.onOpenCrafting)}><Hammer /></HudNavButton>
            <HudNavButton label="Quests" shortcut="J" title="Aufträge [J]" ariaLabel="Aufträge" onClick={() => closeMenu(props.onOpenQuests)}><ScrollText /></HudNavButton>
            <HudNavButton label="Party" title="Gruppe" ariaLabel="Gruppe" badge={props.party?.length} onClick={() => closeMenu(props.onOpenParty)}><Users /></HudNavButton>
            <HudNavButton label="Map" shortcut="M" title="Weltatlas [M]" ariaLabel="Weltatlas" onClick={() => closeMenu(props.onOpenMap)}><MapIcon /></HudNavButton>
            <HudNavButton label={menuExpanded ? "Schließen" : "Mehr"} shortcut="/" title="Weitere Menüs" active={menuExpanded} ariaLabel="Weitere Menüs" onClick={() => setMenuExpanded(value => !value)}><Menu /></HudNavButton>
          </nav>

          {menuExpanded && (
            <section
              role="dialog"
              aria-label="Weitere Menüs"
              className="ax1-command-deck w-[min(460px,94vw)] rounded-[6px] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(9,14,18,.98),rgba(3,7,10,.98))] p-2 shadow-2xl backdrop-blur-2xl"
            >
              <div className="mb-2 flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <p className="font-serif text-base font-semibold text-stone-100">Aurion Command Deck</p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-stone-500">UI focus · World input held</p>
                </div>
                <span className="rounded-[3px] border border-cyan-300/20 px-1.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-cyan-200">Expanded</span>
              </div>

              <CommandSection title="Character & Progression">
                <MenuButton title="Steuerung" onClick={() => closeMenu(props.onOpenControls)}><Gamepad2 /></MenuButton>
                <MenuButton title="Disziplinen" onClick={() => closeMenu(props.onOpenDisciplines)}><Swords /></MenuButton>
                <MenuButton title="Companion" onClick={() => closeMenu(props.onOpenCompanion)}><Sparkles /></MenuButton>
              </CommandSection>

              <CommandSection title="World & Adventure">
                <MenuButton title="Dungeons" onClick={() => closeMenu(props.onOpenDungeonFinder)}><ShieldCheck /></MenuButton>
                <MenuButton title="NPC" onClick={() => closeMenu(props.onOpenDialogue)}><Languages /></MenuButton>
                <MenuButton title="Territorium" onClick={() => closeMenu(props.onOpenTerritory)}><Landmark /></MenuButton>
                <MenuButton title="Homestead" onClick={() => closeMenu(props.onOpenHomestead)}><Hammer /></MenuButton>
                <MenuButton title="Research" onClick={() => closeMenu(props.onOpenResearch)}><Sparkles /></MenuButton>
              </CommandSection>

              <CommandSection title="Social & Holdings">
                <MenuButton title="Chat" onClick={() => closeMenu(props.onOpenChat)}><MessageSquare /></MenuButton>
                <MenuButton title="Kontakte" onClick={() => closeMenu(props.onOpenContacts)}><Users /></MenuButton>
                <MenuButton title="Gilde" onClick={() => closeMenu(props.onOpenGuild)}><Crown /></MenuButton>
                <MenuButton title="Ökonomie" onClick={() => closeMenu(props.onOpenEconomy)}><Coins /></MenuButton>
              </CommandSection>

              <CommandSection title="Evidence">
                <MenuButton title="Evidence" onClick={() => closeMenu(props.onOpenDeterminism)}><Activity /></MenuButton>
              </CommandSection>

              <p className="mt-2 border-t border-slate-800 pt-2 text-[8px] leading-relaxed text-stone-600">
                Menü geöffnet · World-Actions gesperrt · Mutationen bleiben bis zum bestätigten Readback Pending.
              </p>
            </section>
          )}

          <div className="origin-top-right scale-[.72] sm:scale-100">{props.miniMap}</div>

          <section className="ax1-objective-tracker w-[min(340px,78vw)] rounded-[6px] border border-amber-300/20 bg-black/72 p-1.5 shadow-xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5">
                <Award className="h-3.5 w-3.5 text-amber-200" aria-hidden />
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">World Objectives</span>
              </div>
              <button
                type="button"
                onClick={() => setObjectivesCollapsed(value => !value)}
                className="flex min-h-9 min-w-9 items-center justify-center rounded-[4px] text-stone-400 hover:bg-white/5 hover:text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                aria-label={objectivesCollapsed ? "Ziele öffnen" : "Ziele schließen"}
                aria-expanded={!objectivesCollapsed}
              >
                {objectivesCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
            </div>

            {!objectivesCollapsed && (
              <div className="pt-1.5">
                {primaryObjective ? (
                  <section
                    className={`rounded-[5px] border border-amber-300/35 bg-amber-950/20 p-3 ${activeEffects.get(primaryObjective.id) ? "pulse-highlight" : ""}`}
                    aria-label="Hauptziel"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-amber-300">PRIMARY · SERVER PROJECTION</span>
                      {primaryObjective.completed ? (
                        <span className="inline-flex items-center gap-1 rounded-[3px] border border-emerald-300/25 px-1.5 py-1 font-mono text-[8px] uppercase text-emerald-200">
                          <CheckCircle2 className="h-3 w-3" aria-hidden /> Confirmed
                        </span>
                      ) : (
                        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-stone-600">Active</span>
                      )}
                    </div>
                    <h2 className="mt-1 font-serif text-[18px] font-semibold leading-tight text-stone-100">{primaryObjective.label}</h2>
                    <p className="mt-1 text-[10px] leading-relaxed text-stone-400">{primaryObjective.detail}</p>
                    {primaryObjective.progress !== undefined ? (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-[2px] bg-black/70">
                          <div className="h-full bg-gradient-to-r from-amber-700 to-amber-300" style={{ width: `${primaryObjective.progress * 100}%` }} />
                        </div>
                        <span className="font-mono text-[9px] text-amber-200">{Math.round(primaryObjective.progress * 100)}%</span>
                      </div>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[8px] text-stone-600">World state · {worldProjectionState}</span>
                      <button
                        type="button"
                        onClick={props.onOpenQuests}
                        className="min-h-9 rounded-[4px] px-2 text-[9px] font-semibold text-stone-300 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                      >
                        Journal <kbd className="ml-1 rounded border border-slate-700 px-1 py-0.5 font-mono text-[8px] text-stone-500">J</kbd>
                      </button>
                    </div>
                  </section>
                ) : (
                  <div className="rounded-[5px] border border-dashed border-slate-700 bg-black/35 p-3 text-[10px] text-stone-500">
                    {props.worldState === "live" ? "Keine bestätigten aktiven Hauptziele." : props.worldStateLabel}
                  </div>
                )}

                {nearbyObjectives.length > 0 ? (
                  <section className="mt-1.5 rounded-[5px] border border-slate-800 bg-black/45" aria-label="Nearby objectives">
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                      <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-stone-500">Nearby · {nearbyObjectives.length}</span>
                      <span className="font-mono text-[8px] text-stone-700">POI</span>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {nearbyObjectives.slice(0, 4).map(objective => {
                        const effectClass = activeEffects.get(objective.id) === "shake"
                          ? "shake-highlight"
                          : activeEffects.get(objective.id) === "pulse"
                            ? "pulse-highlight"
                            : "";
                        return (
                          <Collapsible key={objective.id}>
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                                className={`flex min-h-10 w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-amber-300 ${effectClass}`}
                                aria-label={`${objective.label} · ${objective.kind}`}
                              >
                                <span className="h-1.5 w-1.5 shrink-0 rotate-45 border border-stone-600" aria-hidden />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[10px] font-medium text-stone-200">{objective.label}</span>
                                  <span className="block truncate text-[9px] text-stone-600">{objective.detail}</span>
                                </span>
                                {objective.completed ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-stone-700" aria-hidden />}
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="px-2.5 pb-2 text-[9px] text-stone-400">
                              {objective.subtasks?.length ? (
                                <ul className="list-disc space-y-0.5 pl-4">{objective.subtasks.map((task, i) => <li key={i}>{task}</li>)}</ul>
                              ) : null}
                              {objective.lore ? <p className="mt-1 italic">{objective.lore}</p> : null}
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                {completedLedger.length > 0 ? (
                  <section className="mt-1.5 border-t border-slate-800 pt-1.5" aria-label="Recently confirmed objectives">
                    <p className="mb-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-stone-600">Recently confirmed</p>
                    {completedLedger.slice(0, 3).map(obj => (
                      <div key={obj.id} className="flex items-center gap-1 text-[9px] text-emerald-300">
                        <ShieldCheck className="h-3 w-3" aria-hidden />
                        <span className="truncate">{obj.label}</span>
                      </div>
                    ))}
                  </section>
                ) : null}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-2 left-2 sm:bottom-4 sm:left-4 flex flex-col items-start gap-2">
        <button type="button" onClick={props.onOpenChat} className="flex items-center gap-1.5 rounded-full border border-gray-800 bg-black/80 px-2.5 py-1.5 text-xs font-mono text-[#fbbf24] backdrop-blur-md shadow hover:border-[#b8860b]"><MessageSquare className="h-3.5 w-3.5" /> Realm Chat</button>
        <div>{props.movementControl}</div>
      </div>

      <div className="ax1-combat-lane pointer-events-auto absolute bottom-2 right-2 sm:bottom-4 sm:right-4 flex max-w-[72vw] flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-1.5">
          <button type="button" disabled={props.controlsDisabled} onClick={props.onToggleAutoLoot} aria-pressed={props.autoLoot} className={`${utilityButton} ${props.autoLoot ? "border-emerald-400 bg-emerald-950/80 text-emerald-300" : "border-gray-700 bg-black/80 text-gray-500"}`} title="Auto-Loot"><Sparkles className="h-4 w-4" /><span>A-LOOT</span></button>
          <button type="button" disabled={props.actionsDisabled} onClick={props.onInteract} className={`${utilityButton} border-amber-400/70 bg-black/85 text-amber-300`} title="Interaktion [F]"><Hand className="h-4 w-4" /><span>ACTION</span></button>
          <button type="button" disabled={props.actionsDisabled} onClick={props.onToggleAutoAttack} aria-pressed={props.autoAttack} className={`${utilityButton} ${props.autoAttack ? "border-red-400 bg-red-950/80 text-red-300" : "border-gray-700 bg-black/80 text-gray-300"}`} title="Auto-Angriff"><Repeat className="h-4 w-4" /><span>{props.autoAttack ? "AUTO AN" : "AUTO"}</span></button>
          <button type="button" onClick={props.onOpenControls} className={`${utilityButton} border-cyan-500/60 bg-black/85 text-cyan-300`} title="Steuerung"><Gamepad2 className="h-4 w-4" /><span>CTRL</span></button>
          <button type="button" onClick={props.onOpenParty} className={`${utilityButton} border-sky-500/60 bg-black/85 text-sky-300`} title="Gruppe"><ShieldCheck className="h-4 w-4" /><span>GROUP</span></button>
        </div>

        <div className="ax1-combat-cluster ax1-combat-cluster-phone flex max-w-full flex-wrap items-center justify-end gap-1.5 rounded-[6px] border border-amber-300/25 bg-black/78 p-1.5 shadow-2xl backdrop-blur-xl">
          <button type="button" disabled={props.actionsDisabled} onClick={props.onAttack} className="relative min-h-14 min-w-14 h-14 w-14 sm:h-16 sm:w-16 rounded-[6px] border border-amber-400 bg-gradient-to-br from-amber-600/30 to-black text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.3)] active:scale-90" title="Angriff [R]" aria-label="Angriff [R]">
            <Swords className="mx-auto h-6 w-6" /><kbd className="absolute -left-1 -top-1 rounded bg-black px-1 text-[8px] text-amber-300">R</kbd><span className="block text-[7px] font-bold">ANGRIFF</span>
          </button>
          {props.hotbar.map((skill, index) => <button type="button" key={`${skill.command}:${index}`} disabled={props.actionsDisabled} onClick={() => props.onCastSkill(skill.command)} className="relative min-h-11 min-w-11 h-11 w-11 sm:h-12 sm:w-12 rounded-[5px] border border-gray-700 bg-black/70 hover:border-[#fbbf24] active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" title={skill.name} aria-label={`${skill.name} · Hotbar ${index + 1}`}>
            <span className="text-lg sm:text-xl" style={{ color: skill.color }}>{skill.icon}</span><kbd className="absolute -left-1 -top-1 rounded bg-black px-1 text-[8px] text-[#fbbf24]">{index + 1}</kbd><small className="sr-only">{skill.name}</small>
          </button>)}
        </div>
        <div className="h-1 w-full max-w-xs overflow-hidden rounded-full border border-gray-800 bg-black/90"><div className={`h-full ${props.connected ? "bg-gradient-to-r from-amber-600 to-yellow-400" : "bg-gray-700"}`} style={{ width: typeof props.mastery?.xpPercent === "number" ? `${props.mastery.xpPercent * 100}%` : (props.connected ? "100%" : "15%") }} /></div>
      </div>

      <button type="button" onClick={() => setCombatOpen(value => !value)} className="ax1-combat-metrics pointer-events-auto absolute right-2 top-[42%] sm:right-4 rounded-[5px] border border-cyan-300/25 bg-black/78 px-2.5 py-2 text-[9px] font-mono text-cyan-200 backdrop-blur-xl shadow-xl" aria-expanded={combatOpen}>
        <Swords className="mx-auto mb-0.5 h-4 w-4" /> DPS {props.combat.eventCount ? props.combat.currentDps : "—"}
      </button>
      {combatOpen && <section id="dps-meter-modal" role="dialog" aria-label="Bestätigte Combat Metrics" className="pointer-events-auto absolute right-14 top-[24%] z-30 w-72 sm:w-80 max-w-[calc(100vw-72px)] rounded-[6px] border border-amber-500/40 bg-black/92 p-3 shadow-2xl backdrop-blur-xl font-mono">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2"><b className="text-[10px] tracking-wider text-amber-200">BESTÄTIGTE COMBAT METRICS</b><button type="button" onClick={() => setCombatOpen(false)} aria-label="Combat Metrics schließen" className="flex h-10 w-10 items-center justify-center rounded-[4px] text-gray-400 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">✕</button></div>
        <div className="grid grid-cols-3 gap-1.5 py-2 text-center"><Metric label="DPS" value={props.combat.eventCount ? props.combat.currentDps : "—"} /><Metric label="PEAK" value={props.combat.eventCount ? props.combat.peakDps : "—"} /><Metric label="DTPS" value={props.combat.eventCount ? props.combat.currentDtps : "—"} /></div>
        <div className="max-h-36 space-y-1 overflow-y-auto text-[8px]">{props.combat.logs.length ? props.combat.logs.slice(0, 8).map(log => <div key={log.id} className="flex gap-1 rounded border border-stone-800 bg-black/60 px-2 py-1"><i className="shrink-0 text-gray-500">T{log.tick}</i><span className="flex-1 text-gray-300">{log.text}</span><b className="text-amber-300">{log.value}</b></div>) : <p className="py-3 text-center italic text-gray-600">Noch keine bestätigten Combat-Events.</p>}</div>
      </section>}

      {props.feedback && <p className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-cyan-500/30 bg-black/85 px-3 py-1.5 text-xs text-cyan-100 shadow-xl" role="status">{props.feedback}</p>}
    </div>
  );
}

function HudNavButton({
  label,
  shortcut,
  title,
  onClick,
  children,
  active = false,
  badge,
  ariaLabel
}: {
  label: string;
  shortcut?: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  badge?: number;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-current={active ? "page" : undefined}
      className={`${iconButton} ${active ? "border-cyan-200/60 bg-cyan-950/35 text-cyan-100" : ""}`}
    >
      <span className="relative"><span className="[&_svg]:h-4 [&_svg]:w-4">{children}</span>{typeof badge === "number" && badge > 0 ? <span className="absolute -right-3 -top-2 min-w-4 rounded-full bg-sky-300 px-1 text-center font-mono text-[8px] font-bold text-slate-950">{badge}</span> : null}</span>
      <span className="text-[8px] font-semibold leading-none text-stone-300">{label}</span>
      {shortcut ? <kbd className="absolute right-1 top-0.5 font-mono text-[7px] text-stone-500">{shortcut}</kbd> : null}
    </button>
  );
}

function CommandSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-2 last:mb-0" aria-label={title}>
      <h3 className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[0.15em] text-stone-600">{title}</h3>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">{children}</div>
    </section>
  );
}

function MenuButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-[4px] border border-slate-800 bg-black/65 px-2 text-cyan-200 transition-colors hover:border-cyan-300/50 hover:bg-slate-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 [&_svg]:h-4 [&_svg]:w-4"
    >
      {children}
      <span className="truncate text-[8px] font-semibold text-stone-300">{title}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg border border-stone-800 bg-stone-950/80 p-1.5"><small className="block text-[7px] text-gray-500">{label}</small><b className="text-sm text-amber-300">{value}</b></div>;
}
