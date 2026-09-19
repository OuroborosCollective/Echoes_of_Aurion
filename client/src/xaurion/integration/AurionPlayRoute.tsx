import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Compass } from "lucide-react";
import AurionOpenWorldRuntime from "./AurionOpenWorldRuntime";
import Ax1CompanionOverlay from "./Ax1CompanionOverlay";
import { OpenWorldErrorBoundary } from "./OpenWorldErrorBoundary";

export const AURION_PLAY_LAUNCH_KEY = "aurion:confirmed-play-launch.v1" as const;
type PlayLaunch = Readonly<{
  displayName?: string;
  revision?: number;
  globalWorld: Readonly<{ worldSeed: string; epoch: number; deterministicHash?: string }>;
  [key: string]: unknown;
}>;

function isPlayLaunch(value: unknown): value is PlayLaunch {
  if (!value || typeof value !== "object") return false;
  const world = (value as { globalWorld?: unknown }).globalWorld;
  if (!world || typeof world !== "object") return false;
  const candidate = world as { worldSeed?: unknown; epoch?: unknown; deterministicHash?: unknown };
  if (typeof candidate.worldSeed !== "string" || candidate.worldSeed.length < 3) return false;
  if (!Number.isSafeInteger(candidate.epoch) || Number(candidate.epoch) < 0) return false;
  if (candidate.deterministicHash !== undefined && (typeof candidate.deterministicHash !== "string" || !/^fnv1a-[0-9a-f]{8}$/.test(candidate.deterministicHash))) return false;
  return true;
}

export function persistConfirmedPlayLaunch(value: unknown): boolean {
  if (!isPlayLaunch(value)) return false;
  try { sessionStorage.setItem(AURION_PLAY_LAUNCH_KEY, JSON.stringify(value)); return true; } catch { return false; }
}

export const DEV_OFFLINE_FIXTURE: PlayLaunch = Object.freeze({
  displayName: "Echoes of Aurion [Offline Dev Testbed]",
  revision: 1,
  zoneTier: 1,
  globalWorld: Object.freeze({
    worldSeed: "offline-dev-testbed-seed",
    epoch: 1,
    deterministicHash: "fnv1a-00000000",
  }),
  isOfflineTestbed: true,
});

if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__aurionInjectOfflinePlayLaunch = () => {
    persistConfirmedPlayLaunch(DEV_OFFLINE_FIXTURE);
    window.location.reload();
  };
}

export function consumeLaunch(): PlayLaunch | null {
  try {
    if (typeof window !== "undefined" && (window.location.search.includes("dev_offline=1") || window.location.search.includes("offline_test=true"))) {
      return DEV_OFFLINE_FIXTURE;
    }
    const raw = sessionStorage.getItem(AURION_PLAY_LAUNCH_KEY);
    sessionStorage.removeItem(AURION_PLAY_LAUNCH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPlayLaunch(parsed) ? parsed : null;
  } catch { return null; }
}

/** `/play` is the only mounted AX1 runtime. Aurion routes remain host/auth/community surfaces. */
export default function AurionPlayRoute() {
  const launch = useMemo(consumeLaunch, []);
  const [, navigate] = useLocation();

  useEffect(() => {
    const leave = () => navigate("/");
    const requestLeave = () => window.dispatchEvent(new Event("aurion:return-to-tower"));
    window.addEventListener("aurion:return-to-tower", leave);
    window.addEventListener("aurion:xaurion-return-request", requestLeave);
    return () => {
      window.removeEventListener("aurion:return-to-tower", leave);
      window.removeEventListener("aurion:xaurion-return-request", requestLeave);
    };
  }, [navigate]);

  useEffect(() => {
    if (!launch) return;
    queueMicrotask(() => window.dispatchEvent(new CustomEvent("aurion:load-open-world", { detail: launch })));
  }, [launch]);

  if (!launch) return (
    <main className="min-h-screen grid place-items-center bg-[#070b13] text-slate-100 p-6">
      <section className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-black/85 p-6 text-center space-y-4 backdrop-blur-xl shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.15)]">
          <Compass className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-serif font-bold text-amber-100">AX1-Spielstart</h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          AX1-Spielstart benötigt einen bestätigten WASD-Weltvertrag aus dem Aurion-Portal. Die Spielroute erfindet keinen Snapshot und startet keine Legacy-Arena.
        </p>
        <div className="pt-2 flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/60 bg-amber-500/20 px-4 py-2.5 text-sm font-serif font-semibold text-amber-200 hover:bg-amber-500/30 transition-all shadow-md"
          >
            <ArrowLeft className="h-4 w-4" /> Zum Aurion-Portal
          </Link>
        </div>
      </section>
    </main>
  );

  return (
    <OpenWorldErrorBoundary>
      <AurionOpenWorldRuntime />
      <Ax1CompanionOverlay />
    </OpenWorldErrorBoundary>
  );
}
