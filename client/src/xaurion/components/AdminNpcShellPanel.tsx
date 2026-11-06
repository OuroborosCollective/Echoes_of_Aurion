import React, { useEffect, useState } from "react";
import { useAdminStore } from "../core/AdminService";
import { soundSynth } from "../audio/SoundSynthesizer";
import { findNearestNpcShell, type NpcShellTarget } from "../integration/NpcShellProjection";
import type { MMOEngine } from "../core/MMOEngine";
import { RemovePlacedObjectButton } from "./AdminPlacement";

/** How often the admin prompt checks for a nearby shell (presentation only). */
const PROMPT_POLL_MS = 400;

/**
 * Opens the nearest NPC shell for the admin: the E key and the prompt button both call
 * this. Returns the opened shell, or null when no shell is within reach.
 */
/** The nearest shell around the player, or null while the engine is not (yet) ready. */
function nearestShell(engine: Pick<MMOEngine, "scene" | "player"> | null | undefined): NpcShellTarget | null {
  const position = engine?.player?.position;
  if (!engine?.scene || !position) return null;
  return findNearestNpcShell(engine.scene, { x: position.x, z: position.z });
}

export function openNearestNpcShell(engine: Pick<MMOEngine, "scene" | "player"> | null): NpcShellTarget | null {
  const state = useAdminStore.getState();
  if (!state.isAdmin) return null;
  const shell = nearestShell(engine);
  if (!shell) return null;
  // Pressing E again on the open shell closes it.
  state.setShellTarget(state.shellTarget?.shellRef === shell.shellRef ? null : shell);
  return shell;
}

/**
 * Admin-only NPC shell window: a prompt near a shell, and on E the shell's details and
 * actions. A shell has no own life; its purpose is given later through a confirmed
 * draft (LLMs propose, the admin confirms, Aurion applies with a receipt).
 */
export function AdminNpcShellPanel({ engineRef }: Readonly<{ engineRef: React.RefObject<MMOEngine | null> }>) {
  const isAdmin = useAdminStore(state => state.isAdmin);
  const shell = useAdminStore(state => state.shellTarget);
  const placing = useAdminStore(state => state.placementAsset !== null);
  const setShellTarget = useAdminStore(state => state.setShellTarget);
  const [nearby, setNearby] = useState<NpcShellTarget | null>(null);

  useEffect(() => {
    if (!isAdmin) { setNearby(null); return; }
    const poll = () => setNearby(nearestShell(engineRef.current));
    poll();
    const timer = window.setInterval(poll, PROMPT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [isAdmin, engineRef]);

  // Walking away closes the window, so it never edits a shell the admin left behind.
  useEffect(() => {
    if (shell && nearby?.shellRef !== shell.shellRef) {
      const stillNear = nearestShell(engineRef.current)?.shellRef === shell.shellRef;
      if (!stillNear) setShellTarget(null);
    }
  }, [nearby, shell, engineRef, setShellTarget]);

  useEffect(() => {
    if (!shell) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setShellTarget(null); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [shell, setShellTarget]);

  if (!isAdmin || placing) return null;
  if (!shell) {
    if (!nearby) return null;
    return (
      <button type="button" data-testid="admin-npc-shell-prompt" className="ax1-npc-prompt" aria-label="NPC-Hülle bearbeiten"
        onClick={() => { soundSynth.playUiOpen(); openNearestNpcShell(engineRef.current); }}>
        NPC-Hülle bearbeiten <kbd>E</kbd>
      </button>
    );
  }
  return (
    <section data-testid="admin-npc-shell-panel" role="dialog" aria-label="NPC-Hülle"
      className="fixed bottom-[168px] left-1/2 z-[1002] max-h-[calc(100dvh-200px)] w-[min(92vw,30rem)] -translate-x-1/2 space-y-3 overflow-y-auto rounded-xl border border-amber-400/40 bg-black/85 p-4 text-xs text-amber-50 shadow-2xl backdrop-blur">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-amber-300">NPC-Hülle · ohne eigenes Leben</p>
          <h2 className="text-sm font-bold">{shell.displayName}</h2>
          <p className="font-mono text-[9px] text-gray-400">{shell.shellRef}</p>
        </div>
        <button type="button" onClick={() => setShellTarget(null)} className="min-h-11 min-w-11 rounded-lg border border-white/20 px-3" aria-label="Schließen">Schließen</button>
      </header>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded border border-white/10 bg-black/40 p-2"><dt className="text-[8px] uppercase text-gray-500">Modell</dt><dd className="truncate font-mono text-[10px]">{shell.assetId}</dd></div>
        <div className="rounded border border-white/10 bg-black/40 p-2"><dt className="text-[8px] uppercase text-gray-500">Platz</dt><dd className="font-mono text-[10px]">{shell.position.x.toFixed(2)} / {shell.position.z.toFixed(2)}</dd></div>
      </dl>
      <p className="text-[10px] leading-relaxed text-gray-300" data-testid="admin-npc-shell-purpose">
        Noch kein Zweck bestätigt. Die Hülle steht im Ruhezustand an ihrem Platz und ist für alle Spieler sichtbar.
      </p>
      <RemovePlacedObjectButton placementRef={shell.shellRef} onRemoved={() => setShellTarget(null)} />
    </section>
  );
}
