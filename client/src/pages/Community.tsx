import { Link } from "wouter";
import { Box, CalendarDays, FileText, MessageCircle, ShieldCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

type CommunityPanel = "chat" | "forum" | "events" | "assets" | "guild";
const openCommunity = (panel: CommunityPanel) => window.dispatchEvent(new CustomEvent("aurion:open-community", { detail: { panel } }));

export default function Community() {
  const { isAuthenticated } = useAuth();
  return <main className="min-h-screen bg-[#061317] text-slate-100">
    <header className="brand-bar"><div className="brand-lockup"><span role="img" aria-label="Aurion Siegel" className="brand-sigil"><i/><b/><i/></span><div><p className="brand-kicker">AURION // COMMUNITY</p><h1>Echoes <span>of</span> Aurion</h1></div></div><nav className="flex items-center gap-4 text-xs"><Link href="/" className="hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded transition-colors px-1">Start</Link><Link href="/account" className="hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded transition-colors px-1">Konto</Link></nav></header>
    <section className="mx-auto max-w-6xl px-5 py-10">
      <div className="rounded-3xl border border-cyan-300/20 bg-[#0b2024]/90 p-6 sm:p-9"><p className="text-xs font-semibold tracking-[.2em] text-cyan-300">GEMEINSCHAFT · FORUM · EVENTS</p><h2 className="mt-3 font-serif text-4xl text-amber-100">Die soziale Schicht von Aurion</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Hier verwaltet Aurion das, wofür es zuständig ist: Kommunikation, Forum, Community-Events und öffentliche Daten. Spielregeln, Kampf, Quests, Progression und Weltzustand bleiben außerhalb dieser Website.</p></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <button type="button" disabled={!isAuthenticated} onClick={() => openCommunity("chat")} title={!isAuthenticated ? "Nur für angemeldete Explorer verfügbar" : undefined} className="rounded-2xl border border-slate-500/35 bg-black/20 p-5 text-left disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><MessageCircle className="mb-3 size-5 text-cyan-300"/><b>Signalraum</b><p className="mt-2 text-sm text-slate-400">Community-Chat für angemeldete Explorer.</p></button>
        <button type="button" onClick={() => openCommunity("forum")} className="rounded-2xl border border-slate-500/35 bg-black/20 p-5 text-left hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><FileText className="mb-3 size-5 text-cyan-300"/><b>Forum</b><p className="mt-2 text-sm text-slate-400">Ankündigungen, Patch Notes und Fragen.</p></button>
        <button type="button" onClick={() => openCommunity("events")} className="rounded-2xl border border-slate-500/35 bg-black/20 p-5 text-left hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><CalendarDays className="mb-3 size-5 text-cyan-300"/><b>Events</b><p className="mt-2 text-sm text-slate-400">Community-Termine und Event-Threads.</p></button>
        <button type="button" onClick={() => openCommunity("assets")} className="rounded-2xl border border-slate-500/35 bg-black/20 p-5 text-left hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><Box className="mb-3 size-5 text-cyan-300"/><b>Asset-Katalog</b><p className="mt-2 text-sm text-slate-400">GLB-Modelle und Ressourcen der Community.</p></button>
        <button type="button" disabled={!isAuthenticated} onClick={() => openCommunity("guild")} title={!isAuthenticated ? "Nur für angemeldete Explorer verfügbar" : undefined} className="rounded-2xl border border-slate-500/35 bg-black/20 p-5 text-left disabled:opacity-50 disabled:cursor-not-allowed hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><UsersRound className="mb-3 size-5 text-cyan-300"/><b>Gildenzugehörigkeit</b><p className="mt-2 text-sm text-slate-400">Nur lesen: Name, Kürzel und Rolle.</p></button>
      </div>
      <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-100/5 p-5 text-sm text-slate-300"><ShieldCheck className="mr-2 inline size-4 text-amber-200"/>Community-Schreibrechte bleiben auf soziale Inhalte begrenzt. Charakter- und Gameplaydaten sind auf der Aurion-Website ausschließlich read-only.</div>
    </section>
  </main>;
}
