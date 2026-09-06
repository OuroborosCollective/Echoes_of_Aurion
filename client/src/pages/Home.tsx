import { useEffect, useState } from "react";
import { Boxes, Compass, MessageCircle, ShieldCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { AX1_PLAY_REQUEST_EVENT, AX1_PLAY_STATUS_EVENT } from "@/xaurion/integration/Ax1PlayNavigationBridge";

type CommunityPanel = "chat" | "partners" | "market" | "guild" | "assets" | "forum";

function openAccountAccess(): void {
  window.dispatchEvent(new Event("aurion:open-local-auth"));
}

function openCommunity(panel: CommunityPanel): void {
  window.dispatchEvent(new CustomEvent("aurion:open-community", { detail: { panel } }));
}

/**
 * Aurion website boundary.
 *
 * This route owns presentation, authentication entry points and community
 * navigation only. It does not mount a renderer, simulate movement, define
 * combat/quest/skill rules, or construct gameplay state. The explicit launch
 * request is consumed by AX1, which binds a WASD-confirmed world contract.
 */
export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [portalReady, setPortalReady] = useState(false);
  const [launchMessage, setLaunchMessage] = useState("");

  useEffect(() => {
    document.title = "Echoes of Aurion";
    const status = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string; message?: string }>).detail;
      setLaunchMessage(typeof detail?.message === "string" ? detail.message : "");
    };
    window.addEventListener(AX1_PLAY_STATUS_EVENT, status);
    return () => window.removeEventListener(AX1_PLAY_STATUS_EVENT, status);
  }, []);

  return (
    <main className="aurion-app min-h-screen bg-[#061317] text-slate-100">
      <header className="brand-bar">
        <div className="brand-lockup">
          <span role="img" aria-label="Aurion Siegel" className="brand-sigil"><i /><b /><i /></span>
          <div><p className="brand-kicker">OUROBOROS COLLECTIVE // AURION PORTAL</p><h1>Echoes <span>of</span> Aurion</h1></div>
        </div>
        <div className="brand-status">
          <a href="/ops" className="mr-4 text-[10px] tracking-[.14em] text-cyan-100/75 hover:text-cyan-200">OPS</a>
          <span className={isAuthenticated ? "signal-dot active" : "signal-dot"} /> {isAuthenticated ? "Konto verbunden" : "Konto erforderlich"}
        </div>
      </header>

      <section className="mx-auto grid min-h-[68vh] max-w-6xl place-items-center px-5 py-14">
        <div className="w-full max-w-3xl rounded-3xl border border-cyan-300/20 bg-[#0b2024]/90 p-6 shadow-2xl sm:p-10">
          <p className="mb-3 text-xs font-semibold tracking-[0.22em] text-cyan-300">AURION // WEBSITE · COMMUNITY · DATENHALTUNG</p>
          <h2 className="font-serif text-3xl text-amber-100 sm:text-5xl">{isAuthenticated ? "Willkommen zurück" : "Dein Zugang zur Aurion-Welt"}</h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300">
            Aurion stellt Konto, Community und persistente Daten bereit. Die Spieloberfläche gehört AX1; Bewegung, Kampf, Quests, Progression und Weltregeln werden ausschließlich aus WASD-Verträgen ausgeführt.
          </p>

          {!isAuthenticated ? (
            <div className="mt-8">
              <button type="button" disabled={loading} onClick={openAccountAccess} className="min-h-12 rounded-xl bg-amber-200 px-5 font-bold text-slate-950 disabled:opacity-60">
                <ShieldCheck className="mr-2 inline size-4" />KONTO ANLEGEN / ANMELDEN
              </button>
            </div>
          ) : (
            <div className="mt-8 space-y-4">
              <p className="text-sm text-slate-300">Angemeldet als <b className="text-slate-100">{user?.name ?? `Explorer ${user?.id ?? ""}`}</b>.</p>
              {!portalReady ? (
                <button type="button" onClick={() => { setPortalReady(true); setLaunchMessage(""); }} className="min-h-12 rounded-xl bg-amber-200 px-5 font-bold text-slate-950">
                  <Compass className="mr-2 inline size-4" />ALLEIN DIE STERNWARTE BETRETEN
                </button>
              ) : (
                <button type="button" onClick={() => window.dispatchEvent(new Event(AX1_PLAY_REQUEST_EVENT))} className="min-h-12 rounded-xl bg-cyan-300 px-5 font-bold text-slate-950">
                  <Compass className="mr-2 inline size-4" />IN DIE OPEN WORLD
                </button>
              )}
              {launchMessage && <p role="status" className="text-sm text-cyan-100">{launchMessage}</p>}
            </div>
          )}
        </div>
      </section>

      <nav className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-5 pb-12 sm:grid-cols-5" aria-label="Aurion Gemeinschaft">
        <button type="button" onClick={() => openCommunity("chat")} className="min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3"><MessageCircle className="mr-2 inline size-4" />Chat</button>
        <button type="button" onClick={() => openCommunity("partners")} className="min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3"><UsersRound className="mr-2 inline size-4" />Partner</button>
        <button type="button" onClick={() => openCommunity("guild")} className="min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3"><UsersRound className="mr-2 inline size-4" />Gilde</button>
        <button type="button" onClick={() => openCommunity("market")} className="min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3"><Boxes className="mr-2 inline size-4" />Handel</button>
        <button type="button" onClick={() => openCommunity("assets")} className="min-h-12 rounded-xl border border-slate-500/40 bg-white/5 px-3" aria-label="GLB-Einreichung öffnen"><Boxes className="mr-2 inline size-4" />GLB-Einreichung</button>
      </nav>
    </main>
  );
}
