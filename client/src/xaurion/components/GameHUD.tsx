import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Ax1HpMeter } from "./Ax1HpMeter";
import {
  Activity,
  Award,
  ChevronDown,
  ChevronUp,
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

const iconButton = "w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-black/85 border border-gray-800 hover:border-[#b8860b] text-[#fbbf24] flex items-center justify-center transition-all cursor-pointer backdrop-blur-md active:scale-95 shadow relative shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5 sm:[&_svg]:h-4 sm:[&_svg]:w-4";
const utilityButton = "w-8 h-8 sm:w-10 sm:h-10 rounded-full border flex flex-col items-center justify-center text-[7px] sm:text-[9px] font-mono font-bold backdrop-blur-md shadow-lg active:scale-90 transition-transform cursor-pointer shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5 sm:[&_svg]:h-4 sm:[&_svg]:w-4";

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

  return (
    <div
      id="game-hud-root"
      data-testid="ax1-game-hud"
      data-source="ax1-f24-visible-shell"
      className="xaurion-game-hud absolute inset-0 z-20 pointer-events-none select-none overflow-hidden text-white sm:opacity-100 opacity-95 transition-opacity duration-500"
    >
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1.5 p-1.5 sm:p-4">
        <div className="pointer-events-auto flex min-w-0 max-w-[50vw] sm:max-w-[45vw] flex-col gap-1">
          <section
            id="player-unit-frame"
            aria-label="Serverbestätigter Charakter"
            data-state={props.playerState}
            className="flex w-fit max-w-full items-center gap-1.5 sm:gap-2.5 rounded-xl sm:rounded-2xl border border-[#b8860b]/50 bg-black/85 p-1 sm:p-2 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
          >
            <button
              type="button"
              onClick={props.onOpenCharacter}
              aria-label="Charakter öffnen"
              className="relative h-8 w-8 sm:h-12 sm:w-12 shrink-0 rounded-lg sm:rounded-xl border-2 bg-black/60 text-sm sm:text-2xl shadow-inner flex items-center justify-center"
              style={{ borderColor: props.playerColor }}
            >
              {props.playerIcon}
            </button>
            <div className="w-24 sm:w-44 min-w-0 space-y-0.5 sm:space-y-1">
              <div className="flex items-center justify-between gap-1.5 text-[9px] sm:text-xs">
                <b className="truncate font-serif">{props.playerName}</b>
                <strong className="shrink-0 text-[7px] sm:text-[9px] font-mono text-[#fbbf24]">◆ {props.points ?? "—"}</strong>
              </div>
              <div className="relative h-2 sm:h-3.5 overflow-hidden rounded border border-emerald-950 bg-black/80 p-0.5">
                <div className="h-full rounded bg-gradient-to-r from-emerald-800 via-emerald-600 to-emerald-300" style={{ width: props.playerState === "live" ? "100%" : "12%" }} />
                <span className="absolute inset-0 grid place-items-center text-[6px] sm:text-[8px] font-mono font-bold leading-none">
                  {props.progressionCount ?? "—"} Pfade · {props.victories ?? "—"} Siege
                </span>
              </div>
              <div className="relative h-2 sm:h-3 overflow-hidden rounded border border-amber-900/60 bg-black/90">
                <span className="absolute inset-0 flex items-center justify-between gap-1 px-1 text-[5px] sm:text-[7px] font-mono font-bold text-amber-200 leading-none">
                  <span className="truncate">{props.mastery?.name ?? "Waffenpfad ausstehend"}</span>
                  <span className="shrink-0">{props.mastery ? `Stufe ${props.mastery.level}` : props.playerStateLabel}</span>
                </span>
              </div>
              <span data-testid="confirmed-remote-player-count" className="sr-only">
                {props.connected ? `${props.remotePlayerCount} andere Explorer verbunden` : "Mitspieler werden verbunden"}
              </span>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-1">
            <div className="flex w-fit items-center gap-1 rounded-md sm:rounded-lg border border-gray-800 bg-black/70 px-1 sm:px-2 py-0.5 text-[8px] sm:text-[9px] font-mono text-gray-300 backdrop-blur-sm">
              <Compass className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-[#b8860b] shrink-0" />
              <b className="max-w-[70px] sm:max-w-[130px] truncate font-serif text-[#fbbf24]">{props.zoneName}</b>
              <span className="text-gray-500">·</span>
              <span className="truncate max-w-[60px] sm:max-w-none">{props.coordinates ?? props.worldStateLabel}</span>
            </div>
            <div className={`flex items-center gap-1 rounded-md sm:rounded-lg border px-1.5 py-0.5 text-[8px] sm:text-[9px] font-mono backdrop-blur-sm ${props.connected ? "border-cyan-500/50 bg-cyan-950/40 text-cyan-300" : "border-amber-500/50 bg-amber-950/40 text-amber-300"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${props.connected ? "bg-cyan-400" : "bg-amber-400"}`} />
              <b className="truncate">{props.connected ? "Realm online" : "Verbinde..."}</b>
              {props.connected && <span>👥{props.remotePlayerCount + 1}</span>}
            </div>
          </div>

          {props.party && props.party.length > 0 && (
            <section className="w-32 sm:w-48 rounded-lg sm:rounded-xl border border-sky-900/60 bg-black/85 p-1 backdrop-blur-md shadow-lg">
              <button type="button" onClick={() => setPartyCollapsed(value => !value)} className="flex w-full items-center justify-between border-b border-gray-800/80 pb-0.5 text-[8px] sm:text-[9px] font-serif font-bold uppercase tracking-wider text-sky-400">
                <span className="flex items-center gap-1"><Users className="h-2.5 w-2.5" /> Party ({props.party.length})</span>
                {partyCollapsed ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronUp className="h-2.5 w-2.5" />}
              </button>
              {!partyCollapsed && <div className="space-y-1 pt-1">
                {props.party.map(member => {
                  return <button type="button" key={member.id} onClick={props.onOpenParty} className="block w-full rounded-md border border-gray-800/80 bg-black/60 p-1 text-left hover:border-sky-500/50">
                    <div className="flex items-center justify-between gap-1 text-[7px] sm:text-[8px] font-mono"><b className="truncate text-gray-200">{member.name}</b><span className="shrink-0 text-gray-400">{member.role}</span></div>
                    {member.hp !== undefined && member.maxHp !== undefined ? (
                      <Ax1HpMeter hp={member.hp} maxHp={member.maxHp} className="mt-0.5" />
                    ) : (
                      <small className="text-[6px] text-gray-500">
                        {member.weaponTrack ?? "Werte ausstehend"}
                      </small>
                    )}
                  </button>;
                })}
              </div>}
            </section>
          )}
        </div>

        <div className="pointer-events-auto flex max-w-[48vw] sm:max-w-[50vw] flex-col items-end gap-1">
          <div className="flex max-w-full flex-wrap justify-end gap-1">
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenCharacter)} title="Charakter [C]" aria-label="Charakter"><UserRound /></button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenInventory)} title="Inventar [I/B]" aria-label="Inventar"><Package /></button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenCrafting)} title="Handwerk" aria-label="Handwerk"><Hammer /></button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenQuests)} title="Aufträge [J]" aria-label="Aufträge"><ScrollText /></button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenParty)} title="Gruppe" aria-label="Gruppe"><Users />{props.party?.length ? <span className="absolute -right-1 -top-1 rounded-full bg-sky-500 px-1 text-[7px] font-bold text-black">{props.party.length}</span> : null}</button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenMap)} title="Weltatlas [M]" aria-label="Weltatlas"><MapIcon /></button>
            <button type="button" className={`${iconButton} ${menuExpanded ? "border-cyan-400 text-cyan-300" : ""}`} onClick={() => setMenuExpanded(value => !value)} aria-expanded={menuExpanded} aria-label="Weitere Menüs"><Menu /></button>
          </div>

          {menuExpanded && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 rounded-xl border border-cyan-500/30 bg-black/95 p-1.5 backdrop-blur-xl shadow-2xl z-30">
              <MenuButton title="Steuerung" onClick={() => closeMenu(props.onOpenControls)}><Gamepad2 /></MenuButton>
              <MenuButton title="Disziplinen" onClick={() => closeMenu(props.onOpenDisciplines)}><Swords /></MenuButton>
              <MenuButton title="Dungeons" onClick={() => closeMenu(props.onOpenDungeonFinder)}><ShieldCheck /></MenuButton>
              <MenuButton title="Companion" onClick={() => closeMenu(props.onOpenCompanion)}><Sparkles /></MenuButton>
              <MenuButton title="Chat" onClick={() => closeMenu(props.onOpenChat)}><MessageSquare /></MenuButton>
              <MenuButton title="Gilde" onClick={() => closeMenu(props.onOpenGuild)}><Crown /></MenuButton>
              <MenuButton title="Ökonomie" onClick={() => closeMenu(props.onOpenEconomy)}><Coins /></MenuButton>
              <MenuButton title="NPC" onClick={() => closeMenu(props.onOpenDialogue)}><Languages /></MenuButton>
              <MenuButton title="Territorium" onClick={() => closeMenu(props.onOpenTerritory)}><Landmark /></MenuButton>
              <MenuButton title="Homestead" onClick={() => closeMenu(props.onOpenHomestead)}><Hammer /></MenuButton>
              <MenuButton title="Evidence" onClick={() => closeMenu(props.onOpenDeterminism)}><Activity /></MenuButton>
              <MenuButton title="Research" onClick={() => closeMenu(props.onOpenResearch)}><Sparkles /></MenuButton>
            </div>
          )}

          <div className="origin-top-right scale-[.62] sm:scale-100">{props.miniMap}</div>

          <section className="w-32 sm:w-56 rounded-lg sm:rounded-xl border border-[#b8860b]/40 bg-black/85 p-1 sm:p-1.5 backdrop-blur-md shadow-xl">
            <button type="button" onClick={() => setObjectivesCollapsed(value => !value)} className="flex w-full items-center justify-between border-b border-gray-800/80 pb-0.5 text-[8px] sm:text-[9px] font-serif font-bold uppercase tracking-wider text-[#b8860b]">
              <span className="flex items-center gap-1"><Award className="h-2.5 w-2.5 text-[#fbbf24]" /> Ziele ({props.objectives.length})</span>
              {objectivesCollapsed ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronUp className="h-2.5 w-2.5" />}
            </button>
            {!objectivesCollapsed && <div className="max-h-36 sm:max-h-56 space-y-1 overflow-y-auto pt-1">
              {props.objectives.length ? props.objectives.map(objective => {
                const effectClass = activeEffects.get(objective.id) === 'shake' ? 'shake-highlight' : activeEffects.get(objective.id) === 'pulse' ? 'pulse-highlight' : '';
                return (
                <Collapsible key={objective.id}>
                  <CollapsibleTrigger asChild>
                    <button type="button" className={`block w-full rounded-md border p-1 text-left transition-all ${objective.kind === "primary" ? "border-purple-500/40 bg-purple-950/20" : "border-gray-800/80 bg-black/60 hover:border-amber-500/40"} ${effectClass}`}>
                      <b className="block truncate text-[9px] text-gray-100">{objective.label}</b>
                      <span className="block line-clamp-2 text-[7px] text-gray-400">{objective.detail}</span>
                      {objective.progress !== undefined && (
                          <div className="mt-1 flex items-center gap-1.5">
                             <div className="h-1 flex-1 rounded-full bg-stone-900">
                                <div className={`h-full rounded-full bg-amber-500 transition-all duration-500 ease-out ${activeEffects.get(objective.id) === 'pulse' ? 'flash-meter' : ''}`} style={{ width: `${objective.progress * 100}%` }} />
                             </div>
                             <span className="text-[7px] text-amber-500 font-mono">{Math.round(objective.progress * 100)}%</span>
                          </div>
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-1 py-0.5 text-[8px] text-gray-300">
                    {objective.subtasks && objective.subtasks.length > 0 && (
                        <ul className="list-disc pl-2.5 space-y-0.5">
                            {objective.subtasks.map((task, i) => <li key={i}>{task}</li>)}
                        </ul>
                    )}
                    {objective.lore && <p className="italic text-gray-400 mt-0.5">{objective.lore}</p>}
                  </CollapsibleContent>
                </Collapsible>
              )}) : <p className="p-1 text-[8px] italic text-gray-500">{props.worldState === "live" ? "Keine aktiven Ziele." : props.worldStateLabel}</p>}
            </div>}
            
            {completedLedger.length > 0 && (
                <div className="mt-1.5 border-t border-gray-800 pt-1">
                    <p className="text-[7px] font-bold uppercase text-gray-500 mb-0.5">Zuletzt bestätigt:</p>
                    <div className="max-h-16 overflow-y-auto space-y-0.5">
                        {completedLedger.map(obj => (
                            <div key={obj.id} className="text-[7px] text-emerald-500 flex items-center gap-1 truncate">
                                <ShieldCheck className="h-2.5 w-2.5 shrink-0" /> <span className="truncate">{obj.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </section>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-2 left-2 sm:bottom-4 sm:left-4 flex flex-col items-start gap-1.5 z-20">
        <button type="button" onClick={props.onOpenChat} className="flex items-center gap-1 rounded-full border border-gray-800 bg-black/85 px-2 py-1 text-[9px] sm:text-xs font-mono text-[#fbbf24] backdrop-blur-md shadow hover:border-[#b8860b] active:scale-95 transition-transform"><MessageSquare className="h-3 w-3" /> Realm Chat</button>
        <div>{props.movementControl}</div>
      </div>

      <div className="pointer-events-auto absolute bottom-2 right-2 sm:bottom-4 sm:right-4 flex max-w-[56vw] sm:max-w-none flex-col items-end gap-1.5 z-20">
        <div className="flex flex-wrap justify-end gap-1">
          <button type="button" disabled={props.controlsDisabled} onClick={props.onToggleAutoLoot} aria-pressed={props.autoLoot} className={`${utilityButton} ${props.autoLoot ? "border-emerald-400 bg-emerald-950/80 text-emerald-300" : "border-gray-700 bg-black/80 text-gray-500"}`} title="Auto-Loot"><Sparkles /><span>A-LOOT</span></button>
          <button type="button" disabled={props.actionsDisabled} onClick={props.onInteract} className={`${utilityButton} border-amber-400/70 bg-black/85 text-amber-300`} title="Interaktion [F]"><Hand /><span>ACTION</span></button>
          <button type="button" disabled={props.actionsDisabled} onClick={props.onToggleAutoAttack} aria-pressed={props.autoAttack} className={`${utilityButton} ${props.autoAttack ? "border-red-400 bg-red-950/80 text-red-300" : "border-gray-700 bg-black/80 text-gray-300"}`} title="Auto-Angriff"><Repeat /><span>{props.autoAttack ? "AUTO AN" : "AUTO"}</span></button>
          <button type="button" onClick={props.onOpenControls} className={`${utilityButton} border-cyan-500/60 bg-black/85 text-cyan-300`} title="Steuerung"><Gamepad2 /><span>CTRL</span></button>
          <button type="button" onClick={props.onOpenParty} className={`${utilityButton} border-sky-500/60 bg-black/85 text-sky-300`} title="Gruppe"><ShieldCheck /><span>GROUP</span></button>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 rounded-xl sm:rounded-2xl border border-[#b8860b]/40 bg-black/85 p-1 sm:p-1.5 backdrop-blur-md shadow-2xl">
          <button type="button" disabled={props.actionsDisabled} onClick={props.onAttack} className="relative h-11 w-11 sm:h-14 sm:w-14 rounded-lg sm:rounded-xl border border-amber-400 bg-gradient-to-br from-amber-600/30 to-black text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.3)] active:scale-90 shrink-0" title="Angriff [R]">
            <Swords className="mx-auto h-4 w-4 sm:h-6 sm:w-6" /><kbd className="absolute -left-1 -top-1 rounded bg-black px-0.5 text-[6px] sm:text-[8px] text-amber-300">R</kbd><span className="block text-[6px] sm:text-[7px] font-bold leading-none">ANGRIFF</span>
          </button>
          {props.hotbar.map((skill, index) => <button type="button" key={`${skill.command}:${index}`} disabled={props.actionsDisabled} onClick={() => props.onCastSkill(skill.command)} className="relative h-8 w-8 sm:h-11 sm:w-11 rounded-lg sm:rounded-xl border border-gray-700 bg-black/70 hover:border-[#fbbf24] active:scale-90 shrink-0 flex items-center justify-center" title={skill.name}>
            <span className="text-sm sm:text-lg leading-none" style={{ color: skill.color }}>{skill.icon}</span><kbd className="absolute -left-1 -top-1 rounded bg-black px-0.5 text-[6px] sm:text-[8px] text-[#fbbf24]">{index + 1}</kbd><small className="sr-only">{skill.name}</small>
          </button>)}
        </div>
        <div className="h-1 w-full max-w-[160px] sm:max-w-xs overflow-hidden rounded-full border border-gray-800 bg-black/90"><div className={`h-full ${props.connected ? "bg-gradient-to-r from-amber-600 to-yellow-400" : "bg-gray-700"}`} style={{ width: typeof props.mastery?.xpPercent === "number" ? `${props.mastery.xpPercent * 100}%` : (props.connected ? "100%" : "15%") }} /></div>
      </div>

      <button type="button" onClick={() => setCombatOpen(value => !value)} className="pointer-events-auto absolute right-1.5 top-[40%] sm:right-4 rounded-lg sm:rounded-xl border border-amber-500/40 bg-black/85 px-1.5 sm:px-2.5 py-1 sm:py-2 text-[8px] sm:text-[9px] font-mono text-amber-300 backdrop-blur-md shadow-xl" aria-expanded={combatOpen}>
        <Swords className="mx-auto mb-0.5 h-3 w-3 sm:h-4 sm:w-4" /> DPS {props.combat.eventCount ? props.combat.currentDps : "—"}
      </button>
      {combatOpen && <section id="dps-meter-modal" className="pointer-events-auto absolute right-2 sm:right-14 top-[22%] sm:top-[28%] z-30 w-64 sm:w-80 max-w-[calc(100vw-20px)] rounded-xl sm:rounded-2xl border border-amber-500/40 bg-black/95 p-2.5 sm:p-3 shadow-2xl backdrop-blur-xl font-mono">
        <div className="flex items-center justify-between border-b border-gray-800 pb-1.5"><b className="text-[9px] sm:text-[10px] tracking-wider text-amber-200">BESTÄTIGTE COMBAT METRICS</b><button type="button" onClick={() => setCombatOpen(false)} className="text-gray-400 text-xs px-1">✕</button></div>
        <div className="grid grid-cols-3 gap-1 py-1.5 text-center"><Metric label="DPS" value={props.combat.eventCount ? props.combat.currentDps : "—"} /><Metric label="PEAK" value={props.combat.eventCount ? props.combat.peakDps : "—"} /><Metric label="DTPS" value={props.combat.eventCount ? props.combat.currentDtps : "—"} /></div>
        <div className="max-h-32 sm:max-h-36 space-y-1 overflow-y-auto text-[7px] sm:text-[8px]">{props.combat.logs.length ? props.combat.logs.slice(0, 8).map(log => <div key={log.id} className="flex gap-1 rounded border border-stone-800 bg-black/60 px-1.5 py-0.5"><i className="shrink-0 text-gray-500">T{log.tick}</i><span className="flex-1 text-gray-300 truncate">{log.text}</span><b className="text-amber-300">{log.value}</b></div>) : <p className="py-2 text-center italic text-gray-600">Noch keine bestätigten Combat-Events.</p>}</div>
      </section>}

      {props.feedback && <p className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-cyan-500/30 bg-black/85 px-3 py-1.5 text-xs text-cyan-100 shadow-xl" role="status">{props.feedback}</p>}
    </div>
  );
}

function MenuButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} title={title} aria-label={title} className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg border border-gray-800 bg-black/80 text-cyan-300 hover:border-cyan-400 [&_svg]:h-3.5 [&_svg]:w-3.5 sm:[&_svg]:h-4 sm:[&_svg]:w-4 shrink-0 transition-colors">{children}</button>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg border border-stone-800 bg-stone-950/80 p-1.5"><small className="block text-[7px] text-gray-500">{label}</small><b className="text-sm text-amber-300">{value}</b></div>;
}
