import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../../lib/trpc";
import { useAdminStore } from "../core/AdminService";
import { soundSynth } from "../audio/SoundSynthesizer";
import { ADMIN_PLACEMENT_SCALES_PERMILLE, adminPlacementFromRef } from "@shared/adminPlacementPlan";
import { AdminPlacementGhost } from "../integration/AdminPlacementGhost";
import {
  adminPlacementMessage,
  commitAdminPlacement,
  commitAdminRemoval,
  placeableEntry,
  type AdminPlacementApi,
  type PlacementCatalog,
} from "../integration/adminPlacementCommit";
import type { MMOEngine } from "../core/MMOEngine";

/**
 * Keys the placement session owns while it is active. The open-world key handler
 * passes them through instead of using them for gameplay (R is otherwise an attack).
 */
export const ADMIN_PLACEMENT_KEYS: ReadonlySet<string> = new Set(["r", "+", "=", "-", "_", "enter", "escape"]);

type Status = Readonly<{ tone: "ok" | "error" | "info"; text: string }> | null;

/** Next size step (25 % … 400 %); a value between steps moves to the neighbouring step. */
export function nextPlacementScale(current: number, direction: 1 | -1): number {
  const steps = ADMIN_PLACEMENT_SCALES_PERMILLE;
  if (direction > 0) return steps.find(step => step > current) ?? steps[steps.length - 1]!;
  return [...steps].reverse().find(step => step < current) ?? steps[0]!;
}

/** Admin-only authoring calls; the server re-checks the admin role on every call. */
export function useAdminPlacementApi(): AdminPlacementApi {
  const utils = trpc.useUtils();
  const plan = trpc.aurionAuthoring.worldPlan.useMutation();
  const apply = trpc.aurionAuthoring.worldApply.useMutation();
  const retire = trpc.aurionAuthoring.worldRetireAdminPlacements.useMutation();
  const planRef = useRef(plan.mutateAsync); planRef.current = plan.mutateAsync;
  const applyRef = useRef(apply.mutateAsync); applyRef.current = apply.mutateAsync;
  const retireRef = useRef(retire.mutateAsync); retireRef.current = retire.mutateAsync;
  return useMemo(() => ({
    // Always fresh: the draft must bind the current catalog revision and design versions.
    catalog: () => utils.aurionAuthoring.catalog.fetch(undefined, { staleTime: 0 }) as Promise<PlacementCatalog>,
    plan: input => planRef.current(input),
    apply: input => applyRef.current(input),
    retire: input => retireRef.current(input),
  }), [utils]);
}

/** Catalog action: start the floating placement preview of the selected model. */
export function PlaceSelectedModelButton({ assetId, onStarted }: { assetId: string | null; onStarted: () => void }) {
  const api = useAdminPlacementApi();
  const setPlacementAsset = useAdminStore(state => state.setPlacementAsset);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  useEffect(() => { setStatus(null); }, [assetId]);
  const start = async () => {
    if (!assetId || busy) return;
    setBusy(true);
    setStatus({ tone: "info", text: "Prüfe Modell…" });
    try {
      const entry = placeableEntry(await api.catalog(), assetId);
      soundSynth.playUiClick();
      setStatus(null);
      setPlacementAsset(entry);
      onStarted();
    } catch (error) {
      setStatus({ tone: "error", text: adminPlacementMessage(error) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1">
      <button type="button" data-testid="admin-glb-place" disabled={!assetId || busy} onClick={() => void start()}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold py-2.5 rounded-lg text-[10px] uppercase tracking-widest">
        {busy ? "Prüfe…" : "Platzieren"}
      </button>
      {!assetId && <p className="text-[9px] text-gray-500 text-center">Wähle ein Welt-Modell aus, um es frei zu platzieren.</p>}
      {status && <p role={status.tone === "error" ? "alert" : "status"} data-testid="admin-glb-place-status"
        className={`text-[10px] text-center ${status.tone === "error" ? "text-red-300" : "text-sky-300"}`}>{status.text}</p>}
    </div>
  );
}

/** Inspection action for objects the admin placed: remove (two-step, receipted). */
export function RemovePlacedObjectButton({ placementRef, onRemoved }: { placementRef: string | undefined; onRemoved?: () => void }) {
  const api = useAdminPlacementApi();
  const placed = adminPlacementFromRef(placementRef);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  useEffect(() => { setArmed(false); setStatus(null); }, [placementRef]);
  if (!placed) return null;
  const remove = async () => {
    if (busy) return;
    if (!armed) { setArmed(true); return; }
    setBusy(true);
    setStatus({ tone: "info", text: "Wird serverseitig entfernt…" });
    try {
      await commitAdminRemoval(api, placed.designKey, placed.placementKey);
      soundSynth.playUiSuccess();
      setStatus({ tone: "ok", text: "Entfernt und gespeichert." });
      onRemoved?.();
    } catch (error) {
      setStatus({ tone: "error", text: adminPlacementMessage(error) });
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };
  return (
    <div className="space-y-1">
      <button type="button" data-testid="admin-glb-remove-placement" disabled={busy} onClick={() => void remove()}
        className={`w-full py-2 rounded-lg text-[10px] uppercase tracking-widest border ${armed ? "border-red-400 bg-red-500/20 text-red-200" : "border-white/20 text-gray-200 hover:border-red-400"}`}>
        {busy ? "Entferne…" : armed ? "Wirklich entfernen?" : "Platziertes Objekt entfernen"}
      </button>
      {status && <p role={status.tone === "error" ? "alert" : "status"} data-testid="admin-glb-remove-status"
        className={`text-[10px] text-center ${status.tone === "error" ? "text-red-300" : status.tone === "ok" ? "text-emerald-300" : "text-sky-300"}`}>{status.text}</p>}
    </div>
  );
}

type Props = Readonly<{
  engineRef: React.RefObject<MMOEngine | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}>;

/** Renders the placement session only for the admin while a model is being placed. */
export function AdminPlacementController(props: Props) {
  const isAdmin = useAdminStore(state => state.isAdmin);
  const asset = useAdminStore(state => state.placementAsset);
  if (!isAdmin || !asset) return null;
  return <PlacementSession {...props} />;
}

/** Prevents placement shortcuts from intercepting text-field input. */
const typingTarget = () => ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement?.tagName ?? "").toUpperCase());

/** Owns the local placement preview and input handlers, never server world authority. */
function PlacementSession({ engineRef, containerRef }: Props) {
  const asset = useAdminStore(state => state.placementAsset);
  const setPlacementAsset = useAdminStore(state => state.setPlacementAsset);
  const api = useAdminPlacementApi();
  const ghostRef = useRef<{ engine: MMOEngine; ghost: AdminPlacementGhost } | null>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState<0 | 1 | 2 | 3>(0);
  const [scale, setScale] = useState(1_000);
  const rotationRef = useRef<0 | 1 | 2 | 3>(0);
  const scaleRef = useRef(1_000);
  const [placed, setPlaced] = useState(0);
  const [status, setStatus] = useState<Status>({ tone: "info", text: "Bewege die Vorschau und platziere mit Klick oder Enter." });

  // One ghost per engine; a renderer recovery creates a new engine and a new ghost.
  const ensureGhost = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return null;
    if (ghostRef.current?.engine === engine) return ghostRef.current.ghost;
    ghostRef.current?.ghost.dispose();
    const ghost = new AdminPlacementGhost(engine);
    ghostRef.current = { engine, ghost };
    ghost.setScalePermille(scaleRef.current);
    for (let turn = 0; turn < rotationRef.current; turn += 1) ghost.rotate();
    if (asset) ghost.setAsset(asset).catch(() => setStatus({ tone: "error", text: "Das Modell konnte nicht geladen werden." }));
    return ghost;
  }, [engineRef, asset]);

  useEffect(() => {
    ghostRef.current?.ghost.dispose();
    ghostRef.current = null;
    ensureGhost();
    let frame = 0;
    const loop = () => { ensureGhost()?.update(); frame = window.requestAnimationFrame(loop); };
    frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
      ghostRef.current?.ghost.dispose();
      ghostRef.current = null;
    };
  }, [ensureGhost]);

  const rotate = useCallback(() => {
    rotationRef.current = ((rotationRef.current + 1) % 4) as 0 | 1 | 2 | 3;
    ensureGhost()?.rotate();
    setRotation(rotationRef.current);
  }, [ensureGhost]);

  const stepScale = useCallback((direction: 1 | -1) => {
    scaleRef.current = nextPlacementScale(scaleRef.current, direction);
    ensureGhost()?.setScalePermille(scaleRef.current);
    setScale(scaleRef.current);
  }, [ensureGhost]);

  const cancel = useCallback(() => { setPlacementAsset(null); }, [setPlacementAsset]);

  const place = useCallback(async () => {
    if (busyRef.current) return;
    const input = ensureGhost()?.placementInput();
    if (!input) { setStatus({ tone: "error", text: "Kein gültiger Platz im Blick. Richte die Vorschau auf den Boden in deiner Nähe (max. 40 m)." }); return; }
    busyRef.current = true;
    setBusy(true);
    setStatus({ tone: "info", text: "Wird serverseitig gespeichert…" });
    try {
      await commitAdminPlacement(api, input);
      soundSynth.playUiSuccess();
      setPlaced(count => count + 1);
      setStatus({ tone: "ok", text: "Platziert und gespeichert. Bleibt auch nach Neustart erhalten." });
    } catch (error) {
      setStatus({ tone: "error", text: adminPlacementMessage(error) });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [api, ensureGhost]);

  // Keyboard: R rotate, +/- size, Enter place, Esc end. Movement keys stay with the game.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (typingTarget()) return;
      const key = event.key.toLowerCase();
      if (!ADMIN_PLACEMENT_KEYS.has(key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat && key !== "+" && key !== "=" && key !== "-" && key !== "_") return;
      if (key === "r") rotate();
      else if (key === "+" || key === "=") stepScale(1);
      else if (key === "-" || key === "_") stepScale(-1);
      else if (key === "enter") void place();
      else if (key === "escape") cancel();
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [rotate, stepScale, place, cancel]);

  // Mouse: the preview follows the pointer; a click without dragging places.
  // Touch keeps tap-to-move and places via the button, so a tap never places by accident.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let down: { x: number; y: number; mouse: boolean } | null = null;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") { ensureGhost()?.setPointer(null); return; }
      ensureGhost()?.setPointer({ x: event.clientX, y: event.clientY });
    };
    const leave = () => ensureGhost()?.setPointer(null);
    const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY, mouse: event.pointerType === "mouse" && event.button === 0 }; };
    const click = (event: MouseEvent) => {
      const start = down;
      down = null;
      if (!start?.mouse || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      void place();
    };
    container.addEventListener("pointermove", move);
    container.addEventListener("pointerleave", leave);
    container.addEventListener("pointerdown", pointerDown);
    container.addEventListener("click", click);
    return () => {
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerleave", leave);
      container.removeEventListener("pointerdown", pointerDown);
      container.removeEventListener("click", click);
    };
  }, [containerRef, ensureGhost, place]);

  if (!asset) return null;
  return (
    <div data-testid="admin-placement-hud" role="toolbar" aria-label="Objekt platzieren"
      className="fixed bottom-24 left-1/2 z-[1002] w-[min(92vw,30rem)] -translate-x-1/2 rounded-xl border border-emerald-500/40 bg-black/85 p-3 text-xs text-emerald-50 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-bold">Platzieren: {asset.displayName}</span>
        <span className="font-mono text-[10px] text-emerald-300" data-testid="admin-placement-transform">{rotation * 90}° · {Math.round(scale / 10)} %{placed ? ` · ${placed} gesetzt` : ""}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <button type="button" onClick={rotate} className="min-h-11 rounded-lg border border-white/20 px-2" aria-label="Drehen (R)">⟳ <kbd className="text-[9px] opacity-60">R</kbd></button>
        <button type="button" onClick={() => stepScale(-1)} disabled={scale <= ADMIN_PLACEMENT_SCALES_PERMILLE[0]} className="min-h-11 rounded-lg border border-white/20 px-2 disabled:opacity-40" aria-label="Kleiner (−)">−</button>
        <button type="button" onClick={() => stepScale(1)} disabled={scale >= ADMIN_PLACEMENT_SCALES_PERMILLE[ADMIN_PLACEMENT_SCALES_PERMILLE.length - 1]} className="min-h-11 rounded-lg border border-white/20 px-2 disabled:opacity-40" aria-label="Größer (+)">+</button>
        <button type="button" data-testid="admin-placement-confirm" onClick={() => void place()} disabled={busy} className="min-h-11 rounded-lg bg-emerald-600 px-2 font-bold disabled:bg-gray-700" aria-label="Hier platzieren (Enter)">{busy ? "…" : "Setzen"}</button>
        <button type="button" onClick={cancel} className="min-h-11 rounded-lg border border-white/20 px-2" aria-label="Platzieren beenden (Esc)">Fertig</button>
      </div>
      {status && <p role={status.tone === "error" ? "alert" : "status"} data-testid="admin-placement-status"
        className={`mt-2 text-center text-[10px] ${status.tone === "error" ? "text-red-300" : status.tone === "ok" ? "text-emerald-300" : "text-sky-200"}`}>{status.text}</p>}
    </div>
  );
}
