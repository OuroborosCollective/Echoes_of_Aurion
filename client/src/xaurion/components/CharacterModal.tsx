/** AX1 character readback: classless attributes, receipt-backed tracks and control bindings.
 * Aurion displays confirmed persistence only; it does not choose classes, weapon rules or XP. */
import { X, User, BookOpen, Trophy, Sparkles } from "lucide-react";
import type { z } from "zod";
import type { playerReadbackSchema } from "../integration/authoritativeHudProjection";
import type { ControlSettings, SkillCommand } from "@shared/playerUiProtocol";
import type { GroupReadmodel } from "@shared/groupInstanceProtocol";
import { Ax1Modal } from "./Ax1Modal";
import { Ax1SkillBook } from "./Ax1SkillBook";

export function CharacterModal({ isOpen, onClose, player, settings, uiPending, groupPending, message, group, onBind, onRoleSkill, onInventory }: {
  isOpen: boolean; onClose: () => void; player?: z.infer<typeof playerReadbackSchema>; settings?: ControlSettings;
  uiPending: boolean; groupPending: boolean; message?: string;
  group?: GroupReadmodel; onBind: (slot: number, command: SkillCommand) => void; onRoleSkill: (skill: "mending_light" | "guardian_stance", equipped: boolean) => void; onInventory: () => void;
}) {
  const profile = player?.profile;
  const weaponTracks = player?.progression.tracks.filter(track => track.trackKind === "weapon") ?? [];
  const skillTracks = player?.progression.tracks.filter(track => track.trackKind === "skill") ?? [];
  return <Ax1Modal open={isOpen} onClose={onClose} id="character" title="Charakter & Skills"><section id="character-dialog" className="ax1-window w-full max-w-3xl bg-[#11141a] border border-[#b8860b]/40 rounded-2xl p-5 sm:p-6 text-gray-200 shadow-[0_0_40px_rgba(184,134,11,0.2)] flex flex-col max-h-[90dvh] overflow-hidden">
    <header className="ax1-window-header flex items-center justify-between border-b border-gray-800 pb-4 gap-3"><div className="flex items-center gap-3"><div className="ax1-crest"><User /></div><div><h3 className="text-lg font-serif font-bold text-white">Explorer · Aurion</h3><p className="text-xs text-[#b8860b] font-mono">{profile ? `Stufe ${profile.level} · ${profile.aurionPoints.toLocaleString()} AURION` : "—"}</p></div></div><button onClick={onClose} aria-label="Charakter schließen" className="ax1-close"><X size={18} /></button></header>
    {message && <p className="ax1-notice" role="status">{message}</p>}
    <div className="flex-1 overflow-y-auto min-h-0 py-3 space-y-4 custom-scrollbar">
      <section className="bg-black/60 rounded-xl border border-gray-800 p-4"><h4 className="font-serif text-amber-300 text-sm mb-3">Dein klassenloser Weg durch Aurion</h4><dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[["Stufe", profile?.level], ["Gesamt-EP", profile?.totalXp], ["Siege", profile?.victories], ["AURION", profile?.aurionPoints]].map(([key, value]) => <div key={key} className="p-3 rounded-xl border border-gray-800 bg-black/60"><dt className="text-[10px] uppercase text-gray-400">{key}</dt><dd className="font-mono text-lg text-white">{value ?? "—"}</dd></div>)}</dl><p className="mt-3 text-xs text-gray-400">Es existiert keine Klassenwahl. Skill- und Waffenstände werden ausschließlich aus bestätigten WASD-Receipts projiziert.</p></section>
      <button className="ax1-primary" onClick={onInventory}>Paperdoll & Ausrüstung öffnen</button>
      <section className="bg-black/70 rounded-xl border border-gray-800 p-4"><h4 className="font-serif text-amber-300 flex gap-2 items-center"><Trophy size={16} /> Bestätigte Waffenpfade</h4><div className="mt-3 grid gap-2 sm:grid-cols-2">{weaponTracks.map(track => <div key={track.trackId} className="rounded-lg border border-gray-800 p-3"><b>{track.trackId}</b><p className="text-xs text-gray-400">Stufe {track.levelExact} · Receipt {track.receiptHash.slice(0, 10)}…</p></div>)}{!weaponTracks.length && <p className="text-xs text-gray-400">Noch kein bestätigter Waffenpfad.</p>}</div></section>
      <section className="bg-black/70 rounded-xl border border-gray-800 p-4"><h4 className="font-serif text-amber-300 flex gap-2 items-center"><BookOpen size={16} /> Bestätigte Skills</h4><div className="mt-3 grid gap-2 sm:grid-cols-2">{skillTracks.map(track => <div key={track.trackId} className="rounded-lg border border-gray-800 p-3"><b>{track.trackId}</b><p className="text-xs text-gray-400">Stufe {track.levelExact} · Receipt {track.receiptHash.slice(0, 10)}…</p></div>)}{!skillTracks.length && <p className="text-xs text-gray-400">Noch kein bestätigter Skillstand.</p>}</div></section>
      <Ax1SkillBook settings={settings} pending={uiPending} onBind={onBind} />
      <fieldset className="bg-black/70 rounded-xl border border-cyan-800 p-4 space-y-3" disabled={groupPending || !group || group.player.status !== "idle"}><legend className="text-cyan-300 text-xs px-2"><Sparkles size={14} className="inline" /> Gruppen-Skills</legend>{([['mending_light', 'Heilendes Licht'], ['guardian_stance', 'Wächterhaltung']] as const).map(([skill, name]) => <label key={skill} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={group?.player.skills.includes(skill) ?? false} onChange={e => onRoleSkill(skill, e.target.checked)} />{name}</label>)}<p className="text-xs text-gray-400">Rollenqualifikation folgt bestätigten Skills und niemals einer Klasse.</p>{group && group.player.status !== "idle" && <p className="text-xs text-amber-300">Skillwechsel nach dem Verlassen der Warteschlange oder Gruppe.</p>}</fieldset>
    </div>
  </section></Ax1Modal>;
}
