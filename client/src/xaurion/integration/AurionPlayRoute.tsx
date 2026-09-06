import { useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import AurionOpenWorldRuntime from "./AurionOpenWorldRuntime";
import { OpenWorldErrorBoundary } from "./OpenWorldErrorBoundary";

export const AURION_PLAY_LAUNCH_KEY = "aurion:confirmed-play-launch.v1" as const;
type PlayLaunch = Readonly<{ displayName?: string; revision?: number; globalWorld?: unknown; [key: string]: unknown }>;

export function persistConfirmedPlayLaunch(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  try { sessionStorage.setItem(AURION_PLAY_LAUNCH_KEY, JSON.stringify(value)); return true; } catch { return false; }
}

function consumeLaunch(): PlayLaunch | null {
  try {
    const raw = sessionStorage.getItem(AURION_PLAY_LAUNCH_KEY);
    sessionStorage.removeItem(AURION_PLAY_LAUNCH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as PlayLaunch : null;
  } catch { return null; }
}

/** `/play` is the only mounted AX1 runtime. Aurion website routes remain host/auth surfaces. */
export default function AurionPlayRoute() {
  const launch = useMemo(consumeLaunch, []);
  const [, navigate] = useLocation();
  useEffect(() => {
    const leave = () => navigate("/");
    window.addEventListener("aurion:return-to-tower", leave);
    return () => window.removeEventListener("aurion:return-to-tower", leave);
  }, [navigate]);
  useEffect(() => {
    if (!launch) return;
    queueMicrotask(() => window.dispatchEvent(new CustomEvent("aurion:load-open-world", { detail: launch })));
  }, [launch]);

  if (!launch) return (
    <main className="min-h-screen grid place-items-center bg-slate-950 text-slate-100 p-6">
      <section className="max-w-xl text-center space-y-4">
        <h1 className="text-2xl font-semibold">Aurion-Spielstart benötigt einen bestätigten Weltübergang</h1>
        <p className="text-slate-300">Öffne die Welt über das Aurion-Portal. Die Spielroute erfindet keinen Snapshot und startet keine Legacy-Arena.</p>
        <Link href="/" className="underline">Zum Aurion-Portal</Link>
      </section>
    </main>
  );

  return <OpenWorldErrorBoundary><AurionOpenWorldRuntime /></OpenWorldErrorBoundary>;
}
