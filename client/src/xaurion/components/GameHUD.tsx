import { useEffect, useState, type ReactNode } from "react";
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
  mastery?: Readonly<{ name: string; level: number | string }>;
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

const iconButton = "w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-black/80 border border-gray-800 hover:border-[#b8860b] text-[#fbbf24] flex items-center justify-center transition-all cursor-pointer backdrop-blur-md active:scale-95 shadow relative";
const utilityButton = "w-10 h-10 sm:w-11 sm:h-11 rounded-full border flex flex-col items-center justify-center text-[9px] font-mono font-bold backdrop-blur-md shadow-lg active:scale-90 transition-transform cursor-pointer";

export function GameHUD(props: GameHUDProps) {
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [partyCollapsed, setPartyCollapsed] = useState(false);
  const [objectivesCollapsed, setObjectivesCollapsed] = useState(false);
  const [combatOpen, setCombatOpen] = useState(false);

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
      className="xaurion-game-hud absolute inset-0 z-20 pointer-events-none select-none overflow-hidden text-white"
    >
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-4">
        <div className="pointer-events-auto flex min-w-0 flex-col gap-1.5">
          <section
            id="player-unit-frame"
            aria-label="Serverbestätigter Charakter"
            data-state={props.playerState}
            className="flex max-w-[72vw] items-center gap-2 sm:gap-3 rounded-2xl border border-[#b8860b]/50 bg-black/85 p-1.5 sm:p-2.5 backdrop-blur-md shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
          >
            <button
              type="button"
              onClick={props.onOpenCharacter}
              aria-label="Charakter öffnen"
              className="relative h-10 w-10 sm:h-14 sm:w-14 shrink-0 rounded-xl border-2 bg-black/60 text-xl sm:text-3xl shadow-inner"
              style={{ borderColor: props.playerColor }}
            >
              {props.playerIcon}
            </button>
            <div className="w-36 sm:w-52 min-w-0 space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px] sm:text-sm">
                <b className="truncate font-serif">{props.playerName}</b>
                <strong className="shrink-0 text-[9px] sm:text-[10px] font-mono text-[#fbbf24]">◆ {props.points ?? "—"}</strong>
              </div>
              <div className="relative h-3.5 sm:h-4 overflow-hidden rounded-md border border-emerald-950 bg-black/80 p-0.5">
                <div className="h-full rounded bg-gradient-to-r from-emerald-800 via-emerald-600 to-emerald-300" style={{ width: props.playerState === "live" ? "100%" : "12%" }} />
                <span className="absolute inset-0 grid place-items-center text-[7px] sm:text-[9px] font-mono font-bold">
                  {props.progressionCount ?? "—"} bestätigte Pfade · {props.victories ?? "—"} Siege
                </span>
              </div>
              <div className="relative h-3 overflow-hidden rounded-md border border-amber-900/60 bg-black/90">
                <span className="absolute inset-0 flex items-center justify-between gap-2 px-1 text-[6px] sm:text-[8px] font-mono font-bold text-amber-200">
                  <span className="truncate">{props.mastery?.name ?? "Waffenpfad ausstehend"}</span>
                  <span className="shrink-0">{props.mastery ? `Stufe ${props.mastery.level}` : props.playerStateLabel}</span>
                </span>
              </div>
              <span data-testid="confirmed-remote-player-count" className="sr-only">
                {props.connected ? `${props.remotePlayerCount} andere Explorer verbunden` : "Mitspieler werden verbunden"}
              </span>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex w-fit items-center gap-1.5 rounded-lg border border-gray-800 bg-black/70 px-2.5 py-0.5 text-[10px] font-mono text-gray-300 backdrop-blur-sm">
              <Compass className="h-3 w-3 text-[#b8860b]" />
              <b className="max-w-[150px] truncate font-serif text-[#fbbf24]">{props.zoneName}</b>
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
              <button type="button" onClick={() => setPartyCollapsed(value => !value)} className="flex w-full items-center justify-between border-b border-gray-800/80 pb-1 text-[9px] font-serif font-bold uppercase tracking-wider text-sky-400">
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Party ({props.party.length})</span>
                {partyCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </button>
              {!partyCollapsed && <div className="space-y-1 pt-1">
                {props.party.map(member => {
                  const hpPct = member.hp !== undefined && member.maxHp ? Math.max(0, Math.min(100, member.hp / member.maxHp * 100)) : null;
                  return <button type="button" key={member.id} onClick={props.onOpenParty} className="block w-full rounded-lg border border-gray-800/80 bg-black/60 p-1 text-left hover:border-sky-500/50">
                    <div className="flex items-center justify-between gap-1 text-[8px] font-mono"><b className="truncate text-gray-200">{member.name}</b><span className="shrink-0 text-gray-400">{member.role}{member.ready ? " · bereit" : ""}</span></div>
                    {hpPct !== null ? <div className="relative mt-1 h-2 overflow-hidden rounded border border-emerald-950 bg-black/90"><div className="h-full bg-gradient-to-r from-emerald-700 to-green-400" style={{ width: `${hpPct}%` }} /><span className="absolute inset-0 grid place-items-center text-[6px] font-mono">{member.hp}/{member.maxHp}</span></div> : <small className="text-[7px] text-gray-500">{member.weaponTrack ?? "Bestätigte Werte ausstehend"}</small>}
                  </button>;
                })}
              </div>}
            </section>
          )}
        </div>

        <div className="pointer-events-auto flex max-w-[64vw] flex-col items-end gap-1.5">
          <div className="flex max-w-full flex-wrap justify-end gap-1">
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenCharacter)} title="Charakter [C]" aria-label="Charakter"><UserRound className="h-4 w-4" /></button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenInventory)} title="Inventar [I/B]" aria-label="Inventar"><Package className="h-4 w-4" /></button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenCrafting)} title="Handwerk" aria-label="Handwerk"><Hammer className="h-4 w-4" /></button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenQuests)} title="Aufträge [J]" aria-label="Aufträge"><ScrollText className="h-4 w-4" /></button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenParty)} title="Gruppe" aria-label="Gruppe"><Users className="h-4 w-4" />{props.party?.length ? <span className="absolute -right-1 -top-1 rounded-full bg-sky-500 px-1 text-[8px] font-bold text-black">{props.party.length}</span> : null}</button>
            <button type="button" className={iconButton} onClick={() => closeMenu(props.onOpenMap)} title="Weltatlas [M]" aria-label="Weltatlas"><MapIcon className="h-4 w-4" /></button>
            <button type="button" className={`${iconButton} ${menuExpanded ? "border-cyan-400 text-cyan-300" : ""}`} onClick={() => setMenuExpanded(value => !value)} aria-expanded={menuExpanded} aria-label="Weitere Menüs"><Menu className="h-4 w-4" /></button>
          </div>

          {menuExpanded && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 rounded-xl border border-cyan-500/30 bg-black/90 p-1.5 backdrop-blur-xl shadow-2xl">
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

          <div className="origin-top-right scale-[.82] sm:scale-100">{props.miniMap}</div>

          <section className="w-44 sm:w-64 rounded-xl border border-[#b8860b]/40 bg-black/85 p-1.5 sm:p-2 backdrop-blur-md shadow-2xl">
            <button type="button" onClick={() => setObjectivesCollapsed(value => !value)} className="flex w-full items-center justify-between border-b border-gray-800/80 pb-1 text-[10px] font-serif font-bold uppercase tracking-wider text-[#b8860b]">
              <span className="flex items-center gap-1"><Award className="h-3 w-3 text-[#fbbf24]" /> Ziele ({props.objectives.length})</span>
              {objectivesCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>
            {!objectivesCollapsed && <div className="max-h-40 space-y-1 overflow-y-auto pt-1.5">
              {props.objectives.length ? props.objectives.map(objective => <button type="button" key={objective.id} onClick={objective.kind === "npc" ? props.onOpenContacts : objective.kind === "primary" ? props.onOpenQuests : props.onOpenMap} className={`block w-full rounded-lg border p-1.5 text-left transition-all ${objective.kind === "primary" ? "border-purple-500/40 bg-purple-950/20" : "border-gray-800/80 bg-black/60 hover:border-amber-500/40"}`}>
                <b className="block truncate text-[10px] text-gray-100">{objective.label}</b>
                <span className="block line-clamp-2 text-[8px] text-gray-400">{objective.detail}</span>
              </button>) : <p className="p-1 text-[10px] italic text-gray-500">{props.worldState === "live" ? "Keine bestätigten aktiven Ziele." : props.worldStateLabel}</p>}
            </div>}
          </section>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-2 left-2 sm:bottom-4 sm:left-4 flex flex-col items-start gap-2">
        <button type="button" onClick={props.onOpenChat} className="flex items-center gap-1.5 rounded-full border border-gray-800 bg-black/80 px-2.5 py-1.5 text-xs font-mono text-[#fbbf24] backdrop-blur-md shadow hover:border-[#b8860b]"><MessageSquare className="h-3.5 w-3.5" /> Realm Chat</button>
        <div>{props.movementControl}</div>
      </div>

      <div className="pointer-events-auto absolute bottom-2 right-2 sm:bottom-4 sm:right-4 flex max-w-[72vw] flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-1.5">
          <button type="button" disabled={props.controlsDisabled} onClick={props.onToggleAutoLoot} aria-pressed={props.autoLoot} className={`${utilityButton} ${props.autoLoot ? "border-emerald-400 bg-emerald-950/80 text-emerald-300" : "border-gray-700 bg-black/80 text-gray-500"}`} title="Auto-Loot"><Sparkles className="h-4 w-4" /><span>A-LOOT</span></button>
          <button type="button" disabled={props.actionsDisabled} onClick={props.onInteract} className={`${utilityButton} border-amber-400/70 bg-black/85 text-amber-300`} title="Interaktion [F]"><Hand className="h-4 w-4" /><span>ACTION</span></button>
          <button type="button" disabled={props.actionsDisabled} onClick={props.onToggleAutoAttack} aria-pressed={props.autoAttack} className={`${utilityButton} ${props.autoAttack ? "border-red-400 bg-red-950/80 text-red-300" : "border-gray-700 bg-black/80 text-gray-300"}`} title="Auto-Angriff"><Repeat className="h-4 w-4" /><span>{props.autoAttack ? "AUTO AN" : "AUTO"}</span></button>
          <button type="button" onClick={props.onOpenControls} className={`${utilityButton} border-cyan-500/60 bg-black/85 text-cyan-300`} title="Steuerung"><Gamepad2 className="h-4 w-4" /><span>CTRL</span></button>
          <button type="button" onClick={props.onOpenParty} className={`${utilityButton} border-sky-500/60 bg-black/85 text-sky-300`} title="Gruppe"><ShieldCheck className="h-4 w-4" /><span>GROUP</span></button>
        </div>

        <div className="flex items-center gap-1.5 rounded-2xl border border-[#b8860b]/40 bg-black/85 p-1.5 backdrop-blur-md shadow-2xl">
          <button type="button" disabled={props.actionsDisabled} onClick={props.onAttack} className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-xl border border-amber-400 bg-gradient-to-br from-amber-600/30 to-black text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.3)] active:scale-90" title="Angriff [R]">
            <Swords className="mx-auto h-6 w-6" /><kbd className="absolute -left-1 -top-1 rounded bg-black px-1 text-[8px] text-amber-300">R</kbd><span className="block text-[7px] font-bold">ANGRIFF</span>
          </button>
          {props.hotbar.map((skill, index) => <button type="button" key={`${skill.command}:${index}`} disabled={props.actionsDisabled} onClick={() => props.onCastSkill(skill.command)} className="relative h-10 w-10 sm:h-12 sm:w-12 rounded-xl border border-gray-700 bg-black/70 hover:border-[#fbbf24] active:scale-90" title={skill.name}>
            <span className="text-lg sm:text-xl" style={{ color: skill.color }}>{skill.icon}</span><kbd className="absolute -left-1 -top-1 rounded bg-black px-1 text-[8px] text-[#fbbf24]">{index + 1}</kbd><small className="sr-only">{skill.name}</small>
          </button>)}
        </div>
        <div className="h-1 w-full max-w-xs overflow-hidden rounded-full border border-gray-800 bg-black/90"><div className={`h-full ${props.connected ? "bg-gradient-to-r from-amber-600 to-yellow-400" : "bg-gray-700"}`} style={{ width: props.connected ? "100%" : "15%" }} /></div>
      </div>

      <button type="button" onClick={() => setCombatOpen(value => !value)} className="pointer-events-auto absolute right-2 top-[46%] sm:right-4 rounded-xl border border-amber-500/40 bg-black/85 px-2.5 py-2 text-[9px] font-mono text-amber-300 backdrop-blur-md shadow-xl" aria-expanded={combatOpen}>
        <Swords className="mx-auto mb-0.5 h-4 w-4" /> DPS {props.combat.eventCount ? props.combat.currentDps : "—"}
      </button>
      {combatOpen && <section id="dps-meter-modal" className="pointer-events-auto absolute right-14 top-[28%] z-30 w-72 sm:w-80 max-w-[calc(100vw-72px)] rounded-2xl border border-amber-500/40 bg-black/92 p-3 shadow-2xl backdrop-blur-xl font-mono">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2"><b className="text-[10px] tracking-wider text-amber-200">BESTÄTIGTE COMBAT METRICS</b><button type="button" onClick={() => setCombatOpen(false)} className="text-gray-400">✕</button></div>
        <div className="grid grid-cols-3 gap-1.5 py-2 text-center"><Metric label="DPS" value={props.combat.eventCount ? props.combat.currentDps : "—"} /><Metric label="PEAK" value={props.combat.eventCount ? props.combat.peakDps : "—"} /><Metric label="DTPS" value={props.combat.eventCount ? props.combat.currentDtps : "—"} /></div>
        <div className="max-h-36 space-y-1 overflow-y-auto text-[8px]">{props.combat.logs.length ? props.combat.logs.slice(0, 8).map(log => <div key={log.id} className="flex gap-1 rounded border border-stone-800 bg-black/60 px-2 py-1"><i className="shrink-0 text-gray-500">T{log.tick}</i><span className="flex-1 text-gray-300">{log.text}</span><b className="text-amber-300">{log.value}</b></div>) : <p className="py-3 text-center italic text-gray-600">Noch keine bestätigten Combat-Events.</p>}</div>
      </section>}

      {props.feedback && <p className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-cyan-500/30 bg-black/85 px-3 py-1.5 text-xs text-cyan-100 shadow-xl" role="status">{props.feedback}</p>}
    </div>
  );
}

function MenuButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" onClick={onClick} title={title} aria-label={title} className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-800 bg-black/75 text-cyan-300 hover:border-cyan-400 [&_svg]:h-4 [&_svg]:w-4">{children}</button>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg border border-stone-800 bg-stone-950/80 p-1.5"><small className="block text-[7px] text-gray-500">{label}</small><b className="text-sm text-amber-300">{value}</b></div>;
}
