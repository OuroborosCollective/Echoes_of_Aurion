import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  BookOpen,
  Compass,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Swords,
  UsersRound,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AX1_PLAY_REQUEST_EVENT,
  AX1_PLAY_STATUS_EVENT,
} from "@/xaurion/integration/Ax1PlayNavigationBridge";

type CommunityPanel = "chat" | "forum" | "events" | "assets";

function openAccountAccess(): void {
  window.dispatchEvent(new Event("aurion:open-local-auth"));
}

function openCommunity(panel: CommunityPanel): void {
  window.dispatchEvent(
    new CustomEvent("aurion:open-community", { detail: { panel } }),
  );
}

const gameplayFeatures = [
  {
    icon: Compass,
    eyebrow: "01 // LIVING WORLD",
    title: "Eine Welt, die weiterläuft",
    text: "Wälder, Siedlungen, Märkte, Konflikte und lokale Ereignisse sind Teil eines fortlaufenden Weltzustands. Dein Abenteuer findet in einer Welt statt, nicht auf einer statischen Kulisse.",
  },
  {
    icon: UsersRound,
    eyebrow: "02 // SELF-ACTING NPCs",
    title: "NPCs mit eigenem Leben",
    text: "Bewohner verfolgen Bedürfnisse, bilden Ziele, reagieren auf bestätigte Ereignisse und führen ihre eigenen kleinen Geschichten weiter — auch dann, wenn du gerade ganz woanders unterwegs bist.",
  },
  {
    icon: MessageCircle,
    eyebrow: "03 // MEMORY & RUMOR",
    title: "Erinnerungen werden zu Handlung",
    text: "Erlebtes wird erinnert, Informationen wandern zwischen Figuren und widersprüchliche Berichte bleiben unterscheidbar. So können Begegnungen später an anderer Stelle wieder Wirkung zeigen.",
  },
  {
    icon: Swords,
    eyebrow: "04 // COMBAT",
    title: "Kampf mit Konsequenzen",
    text: "Kämpfe, Skills, Loot und Progression sind nicht von der Welt getrennt. Ein Ergebnis erzeugt eine echte Spielwirkung, die später erneut als bestätigte Ursache gelesen werden kann.",
  },
  {
    icon: Sparkles,
    eyebrow: "05 // EVOLUTIONÄRE ÖKOSYSTEME",
    title: "Systeme, die sich gegenseitig antreiben",
    text: "Ressourcen, Handwerk, Handel, Bevölkerung und Fraktionen bilden gekoppelte Kreisläufe. Veränderungen können neue Chancen, Engpässe, Konflikte und Geschichten erzeugen.",
  },
  {
    icon: BookOpen,
    eyebrow: "06 // QUESTS & KONSEQUENZEN",
    title: "Deine Geschichte bleibt",
    text: "Quests und Entscheidungen sind Teil derselben persistenten Welt. Was passiert, wird nicht nur erzählt — es wird zum nächsten Input für zukünftige Entscheidungen.",
  },
] as const;

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [launchMessage, setLaunchMessage] = useState("");

  useEffect(() => {
    document.title = "Echoes of Aurion";
    const status = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setLaunchMessage(
        typeof detail?.message === "string" ? detail.message : "",
      );
    };
    window.addEventListener(AX1_PLAY_STATUS_EVENT, status);
    return () => window.removeEventListener(AX1_PLAY_STATUS_EVENT, status);
  }, []);

  return (
    <main className="aurion-app min-h-screen overflow-hidden bg-[#061317] text-slate-100">
      <header className="brand-bar sticky top-0 z-20 border-b border-white/5 backdrop-blur-xl">
        <div className="brand-lockup">
          <span role="img" aria-label="Aurion Siegel" className="brand-sigil">
            <i />
            <b />
            <i />
          </span>
          <div>
            <p className="brand-kicker">OUROBOROS COLLECTIVE // MMORPG</p>
            <h1>
              Echoes <span>of</span> Aurion
            </h1>
          </div>
        </div>
        <nav
          aria-label="Hauptnavigation"
          className="flex items-center gap-3 text-xs sm:gap-5"
        >
          <a
            href="#gameplay"
            className="hidden rounded px-1 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:block"
          >
            Gameplay
          </a>
          <a
            href="#living-world"
            className="hidden rounded px-1 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:block"
          >
            Living World
          </a>
          <Link
            href="/community"
            className="rounded px-1 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            Community
          </Link>
          {isAuthenticated && (
            <Link
              href="/account"
              className="rounded px-1 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              Konto
            </Link>
          )}
          <a
            href="/ops"
            className="rounded px-1 text-cyan-100/55 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            OPS
          </a>
        </nav>
      </header>

      <section className="relative border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(34,211,238,.20),transparent_34%),radial-gradient(circle_at_15%_65%,rgba(251,191,36,.10),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pb-28">
          <div>
            <p className="text-xs font-semibold tracking-[0.28em] text-cyan-300">
              PERSISTENT 3D MMORPG // LIVING WORLD
            </p>
            <h2 className="mt-5 max-w-4xl font-serif text-5xl leading-[0.98] text-amber-100 sm:text-7xl">
              Eine Welt, die{" "}
              <span className="block text-cyan-200">nicht auf dich wartet.</span>
            </h2>
            <p className="mt-7 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Echoes of Aurion verbindet offene Erkundung, Combat, Crafting,
              Handel und Quests mit einer lebendigen Welt, in der NPCs selbst
              handeln, lernen und auf bestätigte Ereignisse reagieren.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
              Der besondere Spielfluss entsteht aus Ursachen und Konsequenzen:
              Eine Entscheidung verändert den Weltzustand, der Weltzustand
              verändert die nächsten Entscheidungen — bei dir und bei allen,
              die darin leben.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => {
                    setLaunchMessage("");
                    window.dispatchEvent(new Event(AX1_PLAY_REQUEST_EVENT));
                  }}
                  className="group min-h-12 rounded-xl bg-cyan-300 px-6 font-bold text-slate-950 shadow-lg shadow-cyan-950/30 transition-all hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95"
                >
                  <Compass className="mr-2 inline size-4" />
                  SPIEL BETRETEN
                </button>
              ) : (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  disabled={loading}
                  aria-busy={loading}
                  onClick={openAccountAccess}
                  className="group min-h-12 rounded-xl bg-amber-200 px-6 font-bold text-slate-950 shadow-lg shadow-amber-950/20 transition-all hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:hover:-translate-y-0.5 motion-safe:active:scale-95"
                >
                  <ShieldCheck className="mr-2 inline size-4" />
                  {loading ? "WIRD GELADEN..." : "KONTO ANLEGEN / ANMELDEN"}
                </button>
              )}
              <a
                href="#gameplay"
                className="inline-flex min-h-12 items-center rounded-xl border border-cyan-200/20 bg-white/5 px-6 font-semibold text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
              >
                GAMEPLAY ENTDECKEN
              </a>
            </div>

            {launchMessage && (
              <p role="status" className="mt-4 text-sm text-cyan-100">
                {launchMessage}
              </p>
            )}

            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <p className="text-2xl font-semibold text-cyan-200">01</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                  Welt
                </p>
                <p className="mt-2 text-sm text-slate-200">persistent</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <p className="text-2xl font-semibold text-cyan-200">02</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                  NPCs
                </p>
                <p className="mt-2 text-sm text-slate-200">self-acting</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.04] p-4">
                <p className="text-2xl font-semibold text-cyan-200">03</p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                  Ursache
                </p>
                <p className="mt-2 text-sm text-slate-200">deterministisch</p>
              </div>
            </div>
          </div>

          <div
            id="living-world"
            className="relative mx-auto w-full max-w-xl lg:max-w-none"
          >
            <div className="rounded-[2rem] border border-cyan-200/15 bg-[#0b2024]/85 p-3 shadow-2xl shadow-black/30">
              <div className="relative min-h-[430px] overflow-hidden rounded-[1.55rem] border border-white/5 bg-[radial-gradient(circle_at_70%_25%,rgba(34,211,238,.22),transparent_26%),linear-gradient(155deg,#102a2e,#071317_58%,#0c1720)] p-6 sm:min-h-[500px]">
                <div className="absolute -right-20 -top-20 size-60 rounded-full border border-cyan-200/10" />
                <div className="absolute -right-4 top-20 size-36 rounded-full border border-cyan-200/10" />
                <div className="absolute bottom-10 left-8 h-24 w-2/3 rounded-full bg-amber-200/5 blur-2xl" />

                <div className="relative flex h-full min-h-[380px] flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.26em] text-cyan-300">
                      AURION // WORLD PULSE
                    </p>
                    <p className="mt-3 max-w-xs font-serif text-3xl text-amber-100">
                      Beobachten.
                      <br />
                      Entscheiden.
                      <br />
                      Folgen.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur">
                      <p className="text-xs text-cyan-200">NPC A</p>
                      <p className="mt-2 text-sm text-slate-200">
                        bemerkt einen Engpass
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Bedürfnis → Ziel → Aktion
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur">
                      <p className="text-xs text-amber-200">NPC B</p>
                      <p className="mt-2 text-sm text-slate-200">
                        hört von einem Ereignis
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Erfahrung → Erinnerung → Information
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur sm:col-span-2">
                      <p className="text-xs text-slate-300">WELTREAKTION</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
                        <span className="rounded-full border border-cyan-200/15 bg-cyan-200/5 px-3 py-1.5">
                          Ressourcen
                        </span>
                        <span className="rounded-full border border-cyan-200/15 bg-cyan-200/5 px-3 py-1.5">
                          Handel
                        </span>
                        <span className="rounded-full border border-cyan-200/15 bg-cyan-200/5 px-3 py-1.5">
                          Fraktionen
                        </span>
                        <span className="rounded-full border border-cyan-200/15 bg-cyan-200/5 px-3 py-1.5">
                          Quests
                        </span>
                        <span className="rounded-full border border-cyan-200/15 bg-cyan-200/5 px-3 py-1.5">
                          neue Entscheidungen
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="gameplay" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold tracking-[0.26em] text-cyan-300">
            GAMEPLAY // SYSTEME STATT KULISSE
          </p>
          <h3 className="mt-4 font-serif text-4xl text-amber-100 sm:text-5xl">
            Jede Aktion kann der Anfang von etwas Neuem sein.
          </h3>
          <p className="mt-5 text-base leading-8 text-slate-400">
            Die Galerie zeigt nicht einzelne Screens als Selbstzweck, sondern
            die Spielsysteme dahinter: eine Welt, die reagiert, NPCs, die
            handeln, und Konsequenzen, die in späteren Situationen wieder
            auftauchen können.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {gameplayFeatures.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="group rounded-[1.7rem] border border-white/8 bg-white/[0.035] p-6 transition-all hover:-translate-y-1 hover:border-cyan-200/20 hover:bg-white/[0.055]"
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-cyan-200" />
                  <span className="text-[10px] font-bold tracking-[0.2em] text-slate-500">
                    {feature.eyebrow}
                  </span>
                </div>
                <div className="mt-8 h-28 overflow-hidden rounded-2xl border border-white/5 bg-[linear-gradient(135deg,rgba(34,211,238,.13),rgba(251,191,36,.04),rgba(255,255,255,.015))] p-4">
                  <div className="grid grid-cols-3 gap-2 opacity-70">
                    <div className="h-16 rounded-xl border border-cyan-200/10 bg-cyan-200/5" />
                    <div className="mt-5 h-11 rounded-xl border border-amber-200/10 bg-amber-200/5" />
                    <div className="h-20 rounded-xl border border-white/10 bg-black/10" />
                  </div>
                </div>
                <h4 className="mt-6 text-xl font-semibold text-slate-100">
                  {feature.title}
                </h4>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  {feature.text}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => openCommunity("assets")}
            className="min-h-12 rounded-xl border border-cyan-200/20 bg-white/5 px-6 font-semibold text-slate-100 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
          >
            Asset-Katalog
          </button>
        </div>
      </section>

      <section className="border-y border-white/5 bg-white/[0.018]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:py-20">
          <div>
            <p className="text-xs font-semibold tracking-[0.26em] text-cyan-300">
              DER KERN DES SPIELFLUSSES
            </p>
            <h3 className="mt-4 font-serif text-4xl text-amber-100">
              Ursache → Reaktion → Erinnerung → neue Welt
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-5">
            {["Beobachtung", "Bedürfnis", "Entscheidung", "Konsequenz", "Erinnerung"].map(
              (label, index) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/8 bg-black/10 p-4"
                >
                  <p className="text-xs text-cyan-200">0{index + 1}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">
                    {label}
                  </p>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="rounded-[2rem] border border-cyan-200/15 bg-[#0b2024]/80 p-7 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-semibold tracking-[0.24em] text-cyan-300">
                BEREIT FÜR DIE WELT?
              </p>
              <h3 className="mt-3 font-serif text-4xl text-amber-100">
                Deine Geschichte ist nur ein Ereignis davon entfernt,
                <span className="block text-cyan-200">
                  die nächste Geschichte auszulösen.
                </span>
              </h3>
            </div>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new Event(AX1_PLAY_REQUEST_EVENT))
                }
                className="min-h-12 rounded-xl bg-cyan-300 px-6 font-bold text-slate-950 hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
              >
                <Compass className="mr-2 inline size-4" />
                IN DIE WELT
              </button>
            ) : (
              <button
                type="button"
                aria-haspopup="dialog"
                disabled={loading}
                onClick={openAccountAccess}
                className="min-h-12 rounded-xl bg-amber-200 px-6 font-bold text-slate-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 disabled:opacity-60"
              >
                <ShieldCheck className="mr-2 inline size-4" />
                ZUGANG ERSTELLEN
              </button>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            <span className="text-slate-300">Echoes of Aurion</span> ·
            persistentes 3D-MMORPG · Living World
          </p>
          <nav className="flex flex-wrap gap-x-5 gap-y-3">
            <Link href="/community" className="hover:text-slate-200">
              Community
            </Link>
            <Link href="/account" className="hover:text-slate-200">
              Konto
            </Link>
            <a href="/ops" className="hover:text-slate-200">
              OPS
            </a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
