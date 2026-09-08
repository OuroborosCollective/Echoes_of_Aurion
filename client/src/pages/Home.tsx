import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BookOpen, Box, CalendarDays, Compass, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { AX1_PLAY_REQUEST_EVENT, AX1_PLAY_STATUS_EVENT } from "@/xaurion/integration/Ax1PlayNavigationBridge";

type CommunityPanel = "chat" | "forum" | "events" | "assets";

function openAccountAccess(): void {
  window.dispatchEvent(new Event("aurion:open-local-auth"));
}
function openCommunity(panel: CommunityPanel): void {
  window.dispatchEvent(new CustomEvent("aurion:open-community", { detail: { panel } }));
}

/** Aurion website: account, community and read-only persisted information only. */
export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [launchMessage, setLaunchMessage] = useState("");

  useEffect(() => {
    document.title = "Echoes of Aurion";
    const status = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setLaunchMessage(typeof detail?.message === "string" ? detail.message : "");
    };
    window.addEventListener(AX1_PLAY_STATUS_EVENT, status);
    return () => window.removeEventListener(AX1_PLAY_STATUS_EVENT, status);
  }, []);

  return (
    <main className="aurion-app min-h-screen bg-[#061317] text-slate-100">
      <header className="brand-bar">
        <div className="brand-lockup"><span role="img" aria-label="Aurion Siegel" className="brand-sigil"><i/><b/><i/></span><div><p className="brand-kicker">OUROBOROS COLLECTIVE // AURION PORTAL</p><h1>Echoes <span>of</span> Aurion</h1></div></div>
        <nav className="flex items-center gap-4 text-xs"><Link href="/community" className="hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded transition-colors px-1">Community</Link>{isAuthenticated && <Link href="/account" className="hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded transition-colors px-1">Konto</Link>}<a href="/ops" className="text-cyan-100/75 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded transition-colors px-1">OPS</a></nav>
      </header>

      <section className="mx-auto grid min-h-[66vh] max-w-6xl place-items-center px-5 py-14">
        <div className="w-full max-w-3xl rounded-3xl border border-cyan-300/20 bg-[#0b2024]/90 p-6 shadow-2xl sm:p-10">
          <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-cyan-300">AURION // WEBSITE · COMMUNITY · DATENHALTUNG</p>
          <h2 className="font-serif text-3xl text-amber-100 sm:text-5xl">{isAuthenticated ? "Willkommen zurück" : "Dein Zugang zu Echoes of Aurion"}</h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300">Aurion trägt Konto, Forum, Community-Events und persistente Daten. Charakter-, Skill-, Inventar-, Ausrüstungs-, Gilden- und Companionstände werden auf der Website nur gelesen. Die Spieloberfläche gehört AX1; sämtliche Gameplay-Regeln und Zustandsübergänge gehören WASD.</p>

          {!isAuthenticated ? <div className="mt-8"><button type="button" disabled={loading} aria-busy={loading} onClick={openAccountAccess} className="min-h-12 rounded-xl bg-amber-200 px-5 font-bold text-slate-950 disabled:opacity-60 hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><ShieldCheck className="mr-2 inline size-4"/>{loading ? "WIRD GELADEN..." : "KONTO ANLEGEN / ANMELDEN"}</button></div> : <div className="mt-8 space-y-4"><p className="text-sm text-slate-300">Angemeldet als <b className="text-slate-100">{user?.name ?? `Explorer ${user?.id ?? ""}`}</b>.</p><div className="flex flex-wrap gap-3"><button type="button" onClick={() => { setLaunchMessage(""); window.dispatchEvent(new Event(AX1_PLAY_REQUEST_EVENT)); }} className="min-h-12 rounded-xl bg-cyan-300 px-5 font-bold text-slate-950 hover:bg-cyan-400 focus-visible:ring-2 focus-visible:ring-amber-300 transition-colors"><Compass className="mr-2 inline size-4"/>SPIEL BETRETEN</button><Link href="/account" className="min-h-12 rounded-xl border border-cyan-300/30 px-5 py-3 font-semibold hover:bg-cyan-300/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><UserRound className="mr-2 inline size-4"/>KONTO & CHARAKTERDATEN</Link></div>{launchMessage && <p role="status" className="text-sm text-cyan-100">{launchMessage}</p>}</div>}
        </div>
      </section>

      <nav className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-5 pb-12 sm:grid-cols-5" aria-label="Aurion Portalbereiche">
        <Link href="/community" className="flex items-center justify-center min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3 py-3 text-center hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><MessageCircle className="mr-2 inline size-4"/>Community</Link>
        <button type="button" onClick={() => openCommunity("forum")} className="flex items-center justify-center min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><BookOpen className="mr-2 inline size-4"/>Forum</button>
        <button type="button" onClick={() => openCommunity("events")} className="flex items-center justify-center min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><CalendarDays className="mr-2 inline size-4"/>Events</button>
        <button type="button" onClick={() => openCommunity("assets")} className="flex items-center justify-center min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors" aria-label="GLB-Einreichung öffnen"><Box className="mr-2 inline size-4"/>Asset-Katalog</button>
        {isAuthenticated ? <Link href="/account" className="flex items-center justify-center min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3 py-3 text-center hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><UserRound className="mr-2 inline size-4"/>Account</Link> : <button type="button" onClick={openAccountAccess} className="flex items-center justify-center min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 transition-colors"><ShieldCheck className="mr-2 inline size-4"/>Anmelden</button>}
      </nav>
    </main>
  );
}
