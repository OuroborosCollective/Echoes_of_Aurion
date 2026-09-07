/** -ax1 CharacterModal@d356881 (9adab86): crest, attributes, mastery selectors and grimoire.
 * Aurion owns class choice, mastery and skill loadouts; no fabricated AX1 starter attributes. */
import { useState } from "react";
import { X, User, BookOpen, Trophy, Sparkles } from "lucide-react";
import type { z } from "zod";
import type { playerReadbackSchema } from "../integration/authoritativeHudProjection";
import type { ControlSettings, SkillCommand } from "@shared/playerUiProtocol";
import type { GroupReadmodel } from "@shared/groupInstanceProtocol";
import { Ax1Modal } from "./Ax1Modal";
import { Ax1SkillBook } from "./Ax1SkillBook";

export const classNames = { unbound: "Reisender", vanguard: "Vorhut", seer: "Seher", warden: "Hüter" } as const;
const weaponNames = { blade: "Klinge", staff: "Stab", spear: "Speer", focus: "Fokus" } as const;
export function CharacterModal({ isOpen, onClose, player, settings, playerPending, uiPending, groupPending, message, group, onBind, onClass, onWeapon, onRoleSkill, onInventory }: {
  isOpen: boolean; onClose: () => void; player?: z.infer<typeof playerReadbackSchema>; settings?: ControlSettings;
  playerPending: boolean; uiPending: boolean; groupPending: boolean; message?: string;
  group?: GroupReadmodel; onBind: (slot: number, command: SkillCommand) => void; onClass: (value: "vanguard" | "seer" | "warden") => void; onWeapon: (value: keyof typeof weaponNames) => void; onRoleSkill: (skill: "mending_light" | "guardian_stance", equipped: boolean) => void; onInventory: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"attributes" | "skillbook">("attributes");
  const [weaponTab, setWeaponTab] = useState<keyof typeof weaponNames>("blade");
  const profile = player?.profile;
  const mastery = player?.weaponMasteries.find(m => m.weaponTrack === weaponTab);
  return <Ax1Modal open={isOpen} onClose={onClose} id="character" title="Charakter & Skills"><section id="character-dialog" className="ax1-window w-full max-w-3xl bg-[#11141a] border border-[#b8860b]/40 rounded-2xl p-5 sm:p-6 text-gray-200 shadow-[0_0_40px_rgba(184,134,11,0.2)] flex flex-col max-h-[90dvh] overflow-hidden">
    <header className="ax1-window-header flex items-center justify-between border-b border-gray-800 pb-4 gap-3"><div className="flex items-center gap-3"><div className="ax1-crest"><User /></div><div><h3 className="text-lg font-serif font-bold text-white">{profile ? classNames[profile.selectedClass] : "Charakter wird geladen"} · Aurion</h3><p className="text-xs text-[#b8860b] font-mono">{profile ? `Stufe ${profile.level} · ${profile.aurionPoints.toLocaleString()} AURION` : "—"}</p></div></div><button onClick={onClose} aria-label="Charakter schließen" className="ax1-close"><X size={18} /></button></header>
    <nav className="flex gap-2 py-3 border-b border-gray-800" aria-label="Charakteransicht"><button className="ax1-tab" aria-pressed={activeTab === "attributes"} onClick={() => setActiveTab("attributes")}><User size={15} /> Charakter & Werte</button><button className="ax1-tab" aria-pressed={activeTab === "skillbook"} onClick={() => setActiveTab("skillbook")}><BookOpen size={15} /> Skills & Meisterschaft</button></nav>
    {message && <p className="ax1-notice" role="status">{message}</p>}
    <div className="flex-1 overflow-y-auto min-h-0 py-3 space-y-4 custom-scrollbar">{activeTab === "attributes" ? <>
      <section className="bg-black/60 rounded-xl border border-gray-800 p-4"><h4 className="font-serif text-amber-300 text-sm mb-3">Dein Weg durch Aurion</h4><dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[["Stufe", profile?.level], ["Gesamt-EP", profile?.totalXp], ["Siege", profile?.victories], ["AURION", profile?.aurionPoints]].map(([key, value]) => <div key={key} className="p-3 rounded-xl border border-gray-800 bg-black/60"><dt className="text-[10px] uppercase text-gray-400">{key}</dt><dd className="font-mono text-lg text-white">{value ?? "—"}</dd></div>)}</dl></section>
      <fieldset disabled={playerPending || !player?.capabilities.canChooseClass} className="p-4 bg-black/70 border border-[#b8860b]/30 rounded-xl"><legend className="text-xs text-amber-300 px-2">Klasse wählen</legend><p className="text-xs text-gray-400 mb-3">Die dauerhafte Klassenwahl wird ab Stufe {player?.capabilities.classUnlockLevel ?? "—"} freigeschaltet.</p><div className="flex gap-2 flex-wrap">{(["vanguard", "seer", "warden"] as const).map(value => <button key={value} className="ax1-tab" aria-pressed={profile?.selectedClass === value} onClick={() => onClass(value)}>{classNames[value]}</button>)}</div></fieldset>
      <button className="ax1-primary" onClick={onInventory}>Paperdoll & Ausrüstung öffnen</button>
    </> : <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{Object.entries(weaponNames).map(([key, name], i) => <button key={key} className="p-3 rounded-xl border border-gray-800 bg-black/50 text-center ax1-tab flex-col" aria-pressed={weaponTab === key} onClick={() => setWeaponTab(key as keyof typeof weaponNames)}><span className="text-2xl">{["⚔", "✦", "➶", "◈"][i]}</span><b className="font-serif">{name}</b><small>{player?.weaponMasteries.find(m => m.weaponTrack === key)?.level ?? "—"}</small></button>)}</div>
      <section className="bg-black/70 rounded-xl border border-gray-800 p-4"><h4 className="font-serif text-amber-300 flex gap-2 items-center"><Trophy size={16} /> {weaponNames[weaponTab]} · Meisterschaft</h4><p className="text-xs my-2">{mastery ? `Stufe ${mastery.level} · ${mastery.xp} EP` : "Noch keine bestätigte Meisterschaft erworben."}</p><button className="ax1-tab" disabled={playerPending || !player} aria-pressed={player?.weaponLoadout?.weaponTrack === weaponTab} onClick={() => onWeapon(weaponTab)}>Waffendisziplin wählen</button></section>
      <Ax1SkillBook settings={settings} pending={uiPending} onBind={onBind} />
      <fieldset className="bg-black/70 rounded-xl border border-cyan-800 p-4 space-y-3" disabled={groupPending || !group || group.player.status !== "idle"}><legend className="text-cyan-300 text-xs px-2"><Sparkles size={14} className="inline" /> Gruppen-Skills</legend>{([['mending_light', 'Heilendes Licht'], ['guardian_stance', 'Wächterhaltung']] as const).map(([skill, name]) => <label key={skill} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={group?.player.skills.includes(skill) ?? false} onChange={e => onRoleSkill(skill, e.target.checked)} />{name}</label>)}<p className="text-xs text-gray-400">Ein ausgerüsteter Heil-Skill qualifiziert für die Heilerrolle, unabhängig von Klasse und Waffenart.</p>{group && group.player.status !== "idle" && <p className="text-xs text-amber-300">Skillwechsel nach dem Verlassen der Warteschlange oder Gruppe.</p>}</fieldset>
    </>}</div>
  </section></Ax1Modal>;
}
