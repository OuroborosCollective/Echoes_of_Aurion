import { useMemo } from "react";
import { Link } from "wouter";
import { Box, LogOut, ShieldCheck, Sparkles, Swords, UserRound, UsersRound } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { readCompanionDataset } from "@/lib/companionLearning";

const classNames = { unbound: "Reisender", vanguard: "Vorhut", seer: "Seher", warden: "Hüter" } as const;
const weaponNames = { blade: "Klinge", staff: "Stab", spear: "Speer", focus: "Fokus" } as const;

/** Aurion account portal: read-only projections of already-persisted game data. */
export default function Account() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const readOptions = { retry: false, refetchOnWindowFocus: false } as const;
  const ui = trpc.player.ui.useQuery(undefined, { ...readOptions, enabled: isAuthenticated });
  // groups.read never creates a profile. A successful read therefore proves that
  // player.me cannot create a profile as a side effect for this account visit.
  const group = trpc.groups.read.useQuery(undefined, { ...readOptions, enabled: isAuthenticated });
  const player = trpc.player.me.useQuery(undefined, { ...readOptions, enabled: isAuthenticated && group.isSuccess });
  const guild = trpc.guild.mine.useQuery(undefined, { ...readOptions, enabled: isAuthenticated });
  const crafting = trpc.crafting.read.useQuery(undefined, { ...readOptions, enabled: isAuthenticated });
  const gateways = trpc.gateway.listSessions.useQuery(undefined, { ...readOptions, enabled: isAuthenticated });

  const training = useMemo(() => {
    const rows = readCompanionDataset();
    const sessions = new Map<string, { rows: number; latest: number; lastSampleId: string }>();
    for (const row of rows) {
      const prior = sessions.get(row.session_id);
      if (!prior) sessions.set(row.session_id, { rows: 1, latest: row.timestamp_epoch, lastSampleId: row.sample_id });
      else { prior.rows += 1; if (row.timestamp_epoch >= prior.latest) { prior.latest = row.timestamp_epoch; prior.lastSampleId = row.sample_id; } }
    }
    return { total: rows.length, sessions: [...sessions.entries()].sort(([a], [b]) => a.localeCompare(b)) };
  }, []);

  const equipment = useMemo(() => {
    const items = ui.data?.items ?? [];
    return (ui.data?.equipment ?? []).map(slot => ({ ...slot, item: items.find(item => item.id === slot.id && item.version === slot.version) }));
  }, [ui.data]);

  if (!isAuthenticated) return <main className="min-h-screen bg-[#061317] p-6 text-slate-100"><section className="mx-auto max-w-3xl rounded-3xl border border-cyan-300/20 bg-[#0b2024] p-8"><h1 className="font-serif text-3xl text-amber-100">Aurion-Konto</h1><p className="mt-4 text-slate-300">Melde dich auf der Startseite an. Ohne bestätigte Sitzung werden keine Charakter- oder Trainingsdaten geladen.</p><Link className="mt-6 inline-block underline" href="/">Zur Startseite</Link></section></main>;

  const profile = player.data?.profile;
  const guildInfo = guild.data;
  return <main className="min-h-screen bg-[#061317] text-slate-100">
    <header className="brand-bar"><div className="brand-lockup"><span role="img" aria-label="Aurion Siegel" className="brand-sigil"><i/><b/><i/></span><div><p className="brand-kicker">AURION // KONTO & READ-ONLY DATEN</p><h1>Echoes <span>of</span> Aurion</h1></div></div><nav className="flex items-center gap-4 text-xs"><Link href="/">Start</Link><Link href="/community">Community</Link></nav></header>
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      <section className="rounded-3xl border border-cyan-300/20 bg-[#0b2024]/90 p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold tracking-[.2em] text-cyan-300">ACCOUNT</p><h2 className="mt-2 font-serif text-3xl text-amber-100">{user?.name ?? `Explorer ${user?.id}`}</h2><p className="mt-2 text-sm text-slate-300">Aurion verwaltet Sitzung, Community und persistente Daten. Diese Seite besitzt keine Spielmutation.</p></div><button type="button" disabled={loading} onClick={() => void logout().then(() => { window.location.href = "/"; })} className="min-h-11 rounded-xl border border-slate-500/50 px-4"><LogOut className="mr-2 inline size-4"/>Abmelden</button></div></section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-500/35 bg-black/20 p-5"><UserRound className="mb-3 size-5 text-cyan-300"/><h3 className="font-semibold">Charakterstand</h3>{profile ? <div className="mt-3 space-y-1 text-sm text-slate-300"><p>Stufe <b className="text-white">{profile.level}</b></p><p>Gesamt-EP <b className="text-white">{profile.totalXp}</b></p><p>Klasse <b className="text-white">{classNames[profile.selectedClass]}</b></p><p>Siege <b className="text-white">{profile.victories}</b></p><p>Aurion <b className="text-white">{profile.aurionPoints}</b></p></div> : <p className="mt-3 text-sm text-slate-400">Kein bereits persistierter Charakterstand verfügbar. Die Website erzeugt keinen.</p>}</article>
        <article className="rounded-2xl border border-slate-500/35 bg-black/20 p-5"><Swords className="mb-3 size-5 text-cyan-300"/><h3 className="font-semibold">Skills & Meisterschaften</h3><div className="mt-3 space-y-2 text-sm text-slate-300">{player.data?.weaponMasteries?.length ? player.data.weaponMasteries.map(entry => <p key={entry.weaponTrack}>{weaponNames[entry.weaponTrack as keyof typeof weaponNames] ?? entry.weaponTrack}: <b className="text-white">Stufe {entry.level}</b> · {entry.xp} EP</p>) : <p>Keine bestätigte Waffenmeisterschaft.</p>}{crafting.data?.progression && <p>Handwerk: <b className="text-white">Stufe {crafting.data.progression.progression.levelExact}</b> · {crafting.data.progression.progression.totalXpExact} EP</p>}{group.data?.player.skills?.length ? <p>Bestätigte Rollen-Skills: <b className="text-white">{group.data.player.skills.join(", ")}</b></p> : <p>Keine bestätigten Rollen-Skills.</p>}<p className="text-xs text-slate-500">Weitere Skillstände erscheinen erst, wenn eine persistierte WASD-Readprojektion vorliegt; die Website berechnet keine Ersatzwerte.</p></div></article>
        <article className="rounded-2xl border border-slate-500/35 bg-black/20 p-5"><UsersRound className="mb-3 size-5 text-cyan-300"/><h3 className="font-semibold">Gildenzugehörigkeit</h3>{guildInfo ? <div className="mt-3 text-sm text-slate-300"><p><b className="text-white">{guildInfo.guild.name}</b> [{guildInfo.guild.tag}]</p><p>Rolle: {guildInfo.membership.role}</p><p className="mt-2 text-xs text-slate-500">Nur Anzeige. Gründen, Bank, Gebäude und Governance sind hier nicht ausführbar.</p></div> : <p className="mt-3 text-sm text-slate-400">Keine bestätigte aktive Gilde.</p>}</article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-slate-500/35 bg-black/20 p-5"><Box className="mb-3 size-5 text-cyan-300"/><h3 className="font-semibold">Inventar & Ausrüstung</h3><p className="mt-1 text-xs text-slate-500">Read-only Projektion; keine Ausrüsten-, Ablegen-, Loot- oder Crafting-Aktion.</p><div className="mt-4 space-y-2">{equipment.length ? equipment.map(entry => <div key={`${entry.slot}:${entry.id}`} className="rounded-xl border border-slate-700/70 p-3 text-sm"><b>{entry.slot}</b><span className="ml-2 text-slate-300">{entry.item?.name ?? entry.id}</span></div>) : <p className="text-sm text-slate-400">Keine bestätigte Ausrüstung.</p>}</div><details className="mt-4"><summary className="cursor-pointer text-sm text-cyan-200">Inventarinhalt ({ui.data?.items.length ?? 0})</summary><div className="mt-3 grid gap-2">{ui.data?.items.map(item => <div key={`${item.version}:${item.id}`} className="rounded-lg bg-white/5 p-2 text-xs"><b>{item.name}</b> · {item.quality} · {item.status}{item.slot ? ` · ${item.slot}` : ""}</div>)}</div></details></article>
        <article className="rounded-2xl border border-slate-500/35 bg-black/20 p-5"><Sparkles className="mb-3 size-5 text-cyan-300"/><h3 className="font-semibold">Companion-Training</h3><p className="mt-1 text-xs text-slate-500">Nur Trainings-/Receipt-Metadaten. Keine Frames werden auf dieser Seite gerendert und kein Companion wird gesteuert.</p><p className="mt-4 text-sm">Lokale Beobachtungszeilen: <b>{training.total}</b></p><div className="mt-3 space-y-2">{training.sessions.map(([sessionId, summary]) => <div key={sessionId} className="rounded-xl border border-slate-700/70 p-3 text-xs"><b>{sessionId}</b><p>{summary.rows} Samples · letzter Beleg {summary.lastSampleId}</p><p>{new Date(summary.latest).toLocaleString()}</p></div>)}{training.sessions.length === 0 && <p className="text-sm text-slate-400">Auf diesem Gerät liegen noch keine Trainingssamples.</p>}</div><div className="mt-4 border-t border-slate-700/60 pt-3 text-xs text-slate-400"><p>Serverseitige Gateway-Sitzungen: {gateways.data?.length ?? 0}</p>{gateways.data?.slice(0,4).map(session => <p key={session.id}>{session.providerLabel} · {session.status}</p>)}</div></article>
      </section>

      <section className="rounded-2xl border border-slate-500/35 bg-black/20 p-5"><h3 className="font-semibold">Achievements</h3><p className="mt-2 text-sm text-slate-400">Noch keine persistierte WASD-Achievement-Readprojektion verbunden. Aurion zeigt deshalb keine aus alten Questzuständen abgeleiteten Ersatz-Achievements.</p></section>
      <section className="rounded-2xl border border-amber-300/25 bg-amber-100/5 p-5 text-sm text-slate-300"><ShieldCheck className="mr-2 inline size-4 text-amber-200"/><b className="text-amber-100">Readonly-Grenze:</b> Aurion zeigt hier persistierte Daten. Kampf, Quests, Skills, Ausrüstung, Inventarwirkungen, Crafting, Markt und Weltmutation werden nicht von dieser Website ausgelöst.</section>
    </div>
  </main>;
}
