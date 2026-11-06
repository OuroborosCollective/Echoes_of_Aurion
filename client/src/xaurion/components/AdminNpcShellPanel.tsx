import React, { useEffect, useState } from "react";
import { trpc } from "../../lib/trpc";
import { NPC_PURPOSE_BRIEF_MAX, type NpcPurposeDraft } from "@shared/npcPurposeContract";
import { WORLD_VISUALS_CHANGED_EVENT } from "@shared/worldVisualOverrideContract";
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
      <button type="button" data-testid="admin-npc-shell-prompt" className="ax1-npc-prompt" aria-label="NPC-Hülle bearbeiten" style={{ bottom: 208 }}
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
      {shell.purpose ? (
        <div className="space-y-1 rounded border border-emerald-400/30 bg-emerald-950/30 p-2" data-testid="admin-npc-shell-purpose">
          <p className="text-[10px] uppercase tracking-widest text-emerald-300">Bestätigter Zweck</p>
          <p className="text-sm font-bold">{shell.purpose.displayName} · <span className="font-normal">{shell.purpose.role}</span></p>
          <p className="text-[11px] italic text-gray-300">„{shell.purpose.greeting}“</p>
        </div>
      ) : (
        <p className="text-[10px] leading-relaxed text-gray-300" data-testid="admin-npc-shell-purpose">
          Noch kein Zweck bestätigt. Die Hülle steht im Ruhezustand an ihrem Platz und ist für alle Spieler sichtbar.
        </p>
      )}
      <PurposeEditor shell={shell} />
      <RemovePlacedObjectButton placementRef={shell.shellRef} onRemoved={() => setShellTarget(null)} />
    </section>
  );
}

/** AI fabric and confirmation codes, shown to the admin instead of raw server text. */
const PURPOSE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  OFFLINE: "Das lokale Modell (OpenCode) ist nicht erreichbar.",
  AUTH_FAILED: "Für OpenRouter ist kein gültiger Schlüssel konfiguriert.",
  MODEL_UNAVAILABLE: "Kein passendes freigegebenes Modell verfügbar.",
  FREE_RATE_LIMIT: "Das Tageslimit für kostenlose Anfragen ist erreicht. Bitte später erneut versuchen.",
  CREDIT_LIMIT: "Das OpenRouter-Guthaben ist aufgebraucht.",
  TIMEOUT: "Das LLM hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.",
  INVALID_DRAFT: "Das LLM hat keinen gültigen Entwurf geliefert. Bitte erneut versuchen oder den Auftrag präzisieren.",
  DRAFT_FOR_OTHER_SHELL: "Der Entwurf passte nicht zu dieser Hülle und wurde verworfen.",
  PREMIUM_NOT_APPROVED: "Premium-Modelle sind nicht freigegeben.",
  ZERO_COST_NOT_CONFIRMED: "Die Kostenfreiheit wurde nicht bestätigt; der Entwurf wurde verworfen.",
  NPC_SHELL_NOT_FOUND: "Diese Hülle existiert nicht mehr.",
  NPC_PURPOSE_PREDECESSOR_CHANGED: "Der Zweck wurde inzwischen geändert. Bitte Entwurf neu erstellen.",
  NPC_PURPOSE_UNCHANGED: "Dieser Zweck ist bereits bestätigt.",
  NPC_PURPOSE_DRAFT_CHANGED: "Der Entwurf wurde verändert und nicht übernommen.",
  AUTHORING_ADMIN_REQUIRED: "Nur der Admin-Account darf NPC-Zwecke bestätigen.",
});
function purposeMessage(code: string): string {
  return PURPOSE_MESSAGES[code] ?? (/^[A-Z][A-Z0-9_]{2,95}$/.test(code) ? `Fehlgeschlagen (${code}).` : "Fehlgeschlagen. Bitte später erneut versuchen.");
}
function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return purposeMessage(Object.keys(PURPOSE_MESSAGES).find(code => message.includes(code)) ?? message);
}

type Draft = Readonly<{ draft: NpcPurposeDraft; draftHash: string; model: string }>;

/**
 * Brief → LLM draft (preview only) → one-tap confirmation. The LLM proposes; Aurion
 * persists only what the admin confirmed, with a receipt.
 */
function PurposeEditor({ shell }: Readonly<{ shell: NpcShellTarget }>) {
  const utils = trpc.useUtils();
  const draftMutation = trpc.aurionAuthoring.npcPurposeDraft.useMutation();
  const confirmMutation = trpc.aurionAuthoring.npcPurposeConfirm.useMutation();
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<Readonly<{ tone: "info" | "ok" | "error"; text: string }> | null>(null);
  useEffect(() => { setDraft(null); setStatus(null); setBrief(""); }, [shell.shellRef]);
  const busy = draftMutation.isPending || confirmMutation.isPending;

  const requestDraft = async () => {
    if (busy || brief.trim().length < 12) return;
    setDraft(null);
    setStatus({ tone: "info", text: "Das LLM schreibt den Entwurf … das kann bis zu 30 Sekunden dauern." });
    try {
      const result = await draftMutation.mutateAsync({ shellRef: shell.shellRef, brief: brief.trim(), mode: "auto" });
      if (result.status !== "AI_DRAFT") {
        const reasons = [...new Set(result.failures.map(failure => purposeMessage(failure.code)))];
        setStatus({ tone: "error", text: reasons.join(" ") || "Kein Entwurf erhalten." });
        return;
      }
      setDraft({ draft: result.draft, draftHash: result.draftHash, model: result.model });
      setStatus({ tone: "info", text: "Entwurf bereit. Prüfen und mit einem Tipp bestätigen." });
    } catch (error) { setStatus({ tone: "error", text: errorText(error) }); }
  };

  const confirm = async () => {
    if (!draft || busy) return;
    try {
      const current = await utils.aurionAuthoring.npcPurposes.fetch(undefined, { staleTime: 0 });
      const previous = current.purposes.find(item => item.shellRef === shell.shellRef)?.purposeHash ?? null;
      await confirmMutation.mutateAsync({ draft: draft.draft, expectedDraftHash: draft.draftHash, expectedPreviousPurposeHash: previous, confirmation: "CONFIRM_NPC_PURPOSE" });
      soundSynth.playUiSuccess();
      setDraft(null);
      setBrief("");
      setStatus({ tone: "ok", text: `Bestätigt und mit Beleg gespeichert: ${draft.draft.displayName} lebt ab jetzt an diesem Platz.` });
      window.dispatchEvent(new Event(WORLD_VISUALS_CHANGED_EVENT));
    } catch (error) { setStatus({ tone: "error", text: errorText(error) }); }
  };

  return (
    <div className="space-y-2 rounded border border-white/10 bg-black/40 p-2" data-testid="npc-purpose-editor">
      <label className="block text-[10px] uppercase tracking-widest text-amber-300" htmlFor={`npc-brief-${shell.placementKey}`}>
        {shell.purpose ? "Neuen Auftrag geben" : "Auftrag für diesen NPC"}
      </label>
      <textarea id={`npc-brief-${shell.placementKey}`} data-testid="npc-purpose-brief" value={brief} maxLength={NPC_PURPOSE_BRIEF_MAX} rows={5}
        onChange={event => setBrief(event.target.value)} enterKeyHint="done" disabled={busy}
        placeholder="Wer ist dieser NPC, was tut er hier, welche Aufgaben oder Quests hat er? z. B. „Eine Kräuterhändlerin, die Reisenden Heilkräuter verkauft und seltene Pflanzen sammeln lässt.“"
        className="w-full rounded-lg border border-white/20 bg-black/60 p-2 text-sm text-amber-50 placeholder:text-gray-500" />
      <div className="flex items-center justify-between text-[9px] text-gray-500"><span>Das LLM macht nur einen Vorschlag. Erst deine Bestätigung zählt.</span><span>{brief.length}/{NPC_PURPOSE_BRIEF_MAX}</span></div>
      <button type="button" data-testid="npc-purpose-draft" disabled={busy || brief.trim().length < 12} onClick={() => void requestDraft()}
        className="min-h-12 w-full rounded-lg bg-amber-600 font-bold text-black disabled:bg-gray-700 disabled:text-gray-400">
        {draftMutation.isPending ? "LLM schreibt …" : "Entwurf vom LLM erstellen"}
      </button>
      {draft && <PurposePreview draft={draft} />}
      {draft && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-testid="npc-purpose-confirm" disabled={busy} onClick={() => void confirm()} className="min-h-12 rounded-lg bg-emerald-600 font-bold disabled:bg-gray-700">
            {confirmMutation.isPending ? "Speichere …" : "Bestätigen"}
          </button>
          <button type="button" data-testid="npc-purpose-discard" disabled={busy} onClick={() => { setDraft(null); setStatus(null); }} className="min-h-12 rounded-lg border border-white/20">Verwerfen</button>
        </div>
      )}
      {status && <p role={status.tone === "error" ? "alert" : "status"} data-testid="npc-purpose-status"
        className={`text-[11px] ${status.tone === "error" ? "text-red-300" : status.tone === "ok" ? "text-emerald-300" : "text-sky-200"}`}>{status.text}</p>}
    </div>
  );
}

function PurposePreview({ draft }: Readonly<{ draft: Draft }>) {
  const value = draft.draft;
  return (
    <article className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-950/20 p-2 text-[11px]" data-testid="npc-purpose-preview">
      <p className="text-[9px] uppercase tracking-widest text-amber-300">Entwurf · Vorschau · noch nicht gespeichert</p>
      <h3 className="text-sm font-bold">{value.displayName} · <span className="font-normal">{value.role}</span></h3>
      <p className="text-gray-300">{value.persona}</p>
      <p className="italic">„{value.greeting}“</p>
      <section><h4 className="text-[9px] uppercase text-gray-500">Gesprächsthemen</h4>
        <ul className="list-disc pl-4">{value.topics.map(topic => <li key={topic.topic}><b>{topic.topic}:</b> {topic.line}</li>)}</ul></section>
      <section><h4 className="text-[9px] uppercase text-gray-500">Tagesablauf um seinen Platz</h4>
        <ul className="list-disc pl-4">{value.routine.map((step, index) => <li key={index}>{step.label} · {(step.offsetXMm / 1000).toFixed(1)} m / {(step.offsetZMm / 1000).toFixed(1)} m · {Math.round(step.dwellSeconds / 60) || 1} min</li>)}</ul></section>
      {value.questIdeas.length > 0 && <section><h4 className="text-[9px] uppercase text-gray-500">Quest-Ideen (Vorschläge, noch keine aktiven Quests)</h4>
        <ul className="list-disc pl-4">{value.questIdeas.map(quest => <li key={quest.title}><b>{quest.title}</b>: {quest.summary} <i>Ziel: {quest.objective}</i></li>)}</ul></section>}
      <p className="text-[9px] text-gray-500">Modell: {draft.model}</p>
    </article>
  );
}
