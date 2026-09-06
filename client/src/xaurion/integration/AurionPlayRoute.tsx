import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
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

function consumeLaunch(): PlayLaunch | null {
  try {
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
    <main className="min-h-screen grid place-items-center bg-slate-950 text-slate-100 p-6">
      <section className="max-w-xl text-center space-y-4">
        <h1 className="text-2xl font-semibold">AX1-Spielstart benötigt einen bestätigten WASD-Weltvertrag</h1>
        <p className="text-slate-300">Öffne die Welt über das Aurion-Portal. Die Spielroute erfindet keinen Snapshot und startet keine Legacy-Arena.</p>
        <Link href="/" className="underline">Zum Aurion-Portal</Link>
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
