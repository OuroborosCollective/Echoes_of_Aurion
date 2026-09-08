import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import type { GlbCatalogEntry } from "@shared/glbImportContract";

export type PublicCharacterSelection = Readonly<{
  assetId: string;
  displayName: string;
  storageUrl: string;
  visibility: "private" | "public";
}>;

type PublicCharacterCatalogResponse = Readonly<{
  version: "aurion.glb-import.v1";
  revision: string;
  entries: readonly GlbCatalogEntry[];
  selected: PublicCharacterSelection | null;
  immutable: boolean;
}>;

export function PublicCharacterPicker({ onSelected }: Readonly<{ onSelected?: (selection: PublicCharacterSelection) => void }> = {}) {
  const onSelectedRef = useRef(onSelected);
  onSelectedRef.current = onSelected;
  const [catalog, setCatalog] = useState<PublicCharacterCatalogResponse | null>(null);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (signal?: AbortSignal) => {
    const response = await fetch("/api/game/public-player-characters", { credentials: "include", signal });
    if (!response.ok) throw new Error("Öffentliche Charaktermodelle konnten nicht geladen werden.");
    const body = await response.json() as PublicCharacterCatalogResponse;
    if (!Array.isArray(body.entries) || typeof body.revision !== "string") throw new Error("Ungültiger Charakterkatalog.");
    if (!signal?.aborted) {
      setCatalog(body);
      // Only a server-returned immutable/public selection may release the Open World gate.
      if (body.selected) onSelectedRef.current?.(body.selected);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Charakterkatalog nicht verfügbar."); });
    return () => controller.abort();
  }, []);

  const selectedCandidate = useMemo(() => catalog?.entries.find(entry => entry.assetId === candidate) ?? null, [catalog, candidate]);

  const confirm = async () => {
    if (!selectedCandidate || catalog?.immutable || busy) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/game/public-player-characters/select", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: selectedCandidate.assetId }),
      });
      const body = await response.json().catch(() => null) as (PublicCharacterSelection & { immutable?: boolean; error?: string }) | null;
      if (!response.ok) {
        if (response.status === 409 || body?.error === "CHARACTER_BINDING_IMMUTABLE") throw new Error("Dein öffentliches Charaktermodell wurde bereits dauerhaft gewählt.");
        throw new Error("Die Charakterwahl wurde vom Server nicht bestätigt.");
      }
      if (!body || body.assetId !== selectedCandidate.assetId || body.visibility !== "public") throw new Error("Der Server-Readback stimmt nicht mit der gewählten Figur überein.");
      setCatalog(current => current ? { ...current, selected: body, immutable: true } : current);
      setCandidate(null);
      onSelectedRef.current?.(body);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Charakterwahl fehlgeschlagen.");
    } finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-cyan-300/20 bg-black/20 p-5" data-testid="public-character-picker">
    <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-cyan-300"/><div><h3 className="font-semibold">Öffentliches Spielermodell</h3><p className="mt-1 text-xs text-slate-400">Diese Auswahl ist einmalig und wird serverseitig gebunden. Andere aktuell verbundene Spieler dürfen anschließend nur dieses öffentliche Darstellungsmodell sehen; Werte, Klasse, Inventar und Kampf bleiben unverändert.</p></div></div>
    {!catalog && !error && <p className="mt-4 flex items-center gap-2 text-sm text-slate-400"><LoaderCircle className="size-4 animate-spin"/>Charaktermodelle werden geladen…</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-400/5 p-3 text-sm text-red-200">{error}</p>}
    {catalog?.selected && <div className="mt-4 rounded-xl border border-emerald-300/25 bg-emerald-300/5 p-4 text-sm"><p className="flex items-center gap-2 text-emerald-200"><CheckCircle2 className="size-4"/><b>Dauerhaft gewählt</b></p><p className="mt-1 text-slate-300">{catalog.selected.displayName}</p></div>}
    {catalog && !catalog.selected && catalog.entries.length === 0 && <p className="mt-4 text-sm text-slate-400">Noch kein Charakter wurde vom Admin als öffentliche Spielerwahl freigegeben.</p>}
    {catalog && !catalog.immutable && catalog.entries.length > 0 && <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Öffentliche Charaktermodelle">
        {catalog.entries.map(entry => <button key={entry.assetId} type="button" role="radio" aria-checked={candidate === entry.assetId} onClick={() => setCandidate(entry.assetId)} className="rounded-xl border border-slate-600/50 bg-white/5 p-3 text-left aria-checked:border-cyan-300 aria-checked:bg-cyan-300/10"><b className="text-sm text-slate-100">{entry.displayName}</b><p className="mt-1 text-[11px] text-slate-500">{entry.subcategory}</p></button>)}
      </div>
      {selectedCandidate && <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4"><p className="text-sm text-amber-100"><b>Einmalige Wahl:</b> {selectedCandidate.displayName}</p><p className="mt-1 text-xs text-slate-400">Nach der Bestätigung kann kein anderes öffentliches Charaktermodell mehr gewählt werden.</p><button type="button" disabled={busy} onClick={() => void confirm()} className="mt-3 min-h-11 rounded-xl bg-amber-200 px-4 font-bold text-slate-950 disabled:opacity-50">{busy ? "Wird bestätigt…" : "Dauerhaft wählen"}</button></div>}
    </>}
  </section>;
}
