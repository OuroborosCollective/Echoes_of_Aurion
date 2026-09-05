import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileBox, ShieldAlert, Upload, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { glbImportReceiptSchema, glbRuntimeCatalogSchema, type GlbImportReceipt, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import { Button } from "@/components/ui/button";

const MAX_GLB_BYTES = 24 * 1024 * 1024;
const MAX_GLB_BATCH_FILES = 12;

type SmartUploadResult = Readonly<{
  accepted: true;
  fileName: string;
  receipt: GlbImportReceipt;
  classification: Readonly<{
    assetType: "character" | "enemy" | "weapon" | "armor" | "arena";
    subcategory: string;
    confidence: "high" | "medium";
    animationNames: readonly string[];
    skinCount: number;
    socketCount: number;
    lod: number | null;
  }>;
}>;

type UploadOutcome = Readonly<{
  fileName: string;
  result?: SmartUploadResult;
  error?: string;
}>;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Die GLB-Datei konnte nicht gelesen werden."));
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.includes(",")) {
        reject(new Error("Die GLB-Datei besitzt kein lesbares Binärformat."));
        return;
      }
      resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function defaultDisplayName(fileName: string): string {
  return fileName.replace(/\.glb$/i, "").replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ").trim().slice(0, 120);
}

function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".glb")) return "Nur binäre GLB-Dateien (.glb) werden akzeptiert.";
  if (file.size < 12 || file.size > MAX_GLB_BYTES) return "Die GLB-Datei muss zwischen 12 Byte und 24 MiB groß sein.";
  return null;
}

export default function GlbUpload() {
  const { loading, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<readonly UploadOutcome[]>([]);
  const [catalog, setCatalog] = useState<GlbRuntimeCatalog | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const refreshCatalog = async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/glb-import/status", { credentials: "include", signal });
      const body = await response.json();
      if (!response.ok || !body.writable) throw new Error("Der Dateispeicher ist nicht verfügbar. Bitte später erneut versuchen.");
      const checked = glbRuntimeCatalogSchema.parse(body.catalog);
      if (!signal?.aborted) { setCatalog(checked); setStorageError(null); }
    } catch (error) { if (!signal?.aborted) { setCatalog(null); setStorageError(error instanceof Error ? error.message : "Dateispeicher nicht erreichbar."); } }
  };
  useEffect(() => {
    setCatalog(null); setStorageError(null);
    if (user?.role !== "admin") return;
    const controller = new AbortController(); void refreshCatalog(controller.signal);
    return () => controller.abort();
  }, [user?.id, user?.role]);

  const uploadOne = async (file: File, chosenName: string): Promise<SmartUploadResult> => {
    const response = await fetch("/api/admin/glb-smart-upload", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: chosenName,
        fileName: file.name,
        contentBase64: await readFileAsBase64(file),
      }),
    });
    const payload = await response.json().catch(() => null) as (SmartUploadResult & { error?: string }) | null;
    if (!response.ok || !payload?.accepted) throw new Error(payload?.error || `Upload wurde mit HTTP ${response.status} abgelehnt.`);
    const receipt = glbImportReceiptSchema.safeParse(payload.receipt);
    if (!receipt.success) throw new Error("Der Server hat keinen gültigen Speichernachweis geliefert.");
    return payload;
  };

  const uploadFiles = async (files: readonly File[]) => {
    if (!files.length || busyRef.current || !catalog || storageError) return;
    if (files.length > MAX_GLB_BATCH_FILES) {
      setError(`Pro Durchlauf dürfen höchstens ${MAX_GLB_BATCH_FILES} GLB-Dateien hochgeladen werden.`);
      return;
    }

    busyRef.current = true; setBusy(true);
    setError(null);
    setOutcomes([]);
    const singleOverride = files.length === 1 ? displayName.trim() : "";

    try {
      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          setOutcomes(current => [...current, { fileName: file.name, error: validationError }]);
          continue;
        }
        const chosenName = (singleOverride || defaultDisplayName(file.name)).slice(0, 120);
        if (chosenName.length < 3) {
          setOutcomes(current => [...current, { fileName: file.name, error: "Der Anzeigename ist zu kurz." }]);
          continue;
        }
        try {
          const result = await uploadOne(file, chosenName);
          setOutcomes(current => [...current, { fileName: file.name, result }]);
          if (files.length === 1) setDisplayName(chosenName);
        } catch (uploadError) {
          setOutcomes(current => [...current, { fileName: file.name, error: uploadError instanceof Error ? uploadError.message : "Der GLB-Upload ist fehlgeschlagen." }]);
        }
      }
    } finally {
      busyRef.current = false; setBusy(false); await refreshCatalog();
    }
  };

  const replaceTarget = async (result: SmartUploadResult) => {
    const receipt = result.receipt;
    try {
      const response = await fetch("/api/admin/glb-import/assign", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: receipt.assetId, targetType: receipt.assetType, targetKey: receipt.targetKey, expectedActiveAssetId: receipt.activeAssetId }) });
      if (!response.ok) throw new Error(response.status === 409 ? "Die Zuordnung wurde inzwischen geändert. Bitte den Katalog aktualisieren." : "Das Modell konnte nicht zugeordnet werden.");
      const body = await response.json();
      if (body.assetId !== receipt.assetId || body.targetKey !== receipt.targetKey || body.active !== 1) throw new Error("Die Zuordnung wurde nicht bestätigt.");
      setOutcomes(current => current.map(outcome => outcome.result?.receipt.assetId === receipt.assetId ? { ...outcome, result: { ...outcome.result, receipt: { ...receipt, status: "assigned", activeAssetId: receipt.assetId } } } : outcome));
      await refreshCatalog();
    } catch (error) { setError(error instanceof Error ? error.message : "Zuordnung fehlgeschlagen."); }
  };

  if (loading) return <DashboardLayout><div className="p-8 text-sm text-cyan-100/70">Adminberechtigung wird geprüft…</div></DashboardLayout>;
  if (!user || user.role !== "admin") return <DashboardLayout><div className="mx-auto max-w-xl p-8"><Card className="border-red-300/20 bg-slate-950/80"><CardHeader><CardTitle className="flex items-center gap-2 text-red-100"><ShieldAlert className="h-5 w-5" />Nur für Aurion-Admins</CardTitle><CardDescription>Der GLB-Uploader ist serverseitig zusätzlich durch die Adminrolle geschützt.</CardDescription></CardHeader></Card></div></DashboardLayout>;

  return <DashboardLayout><div className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(45,226,207,.12),transparent_38%),#06131a] p-3 text-slate-100 sm:p-6">
    <div className="mx-auto max-w-4xl space-y-5">
      <header><p className="text-xs tracking-[.24em] text-cyan-300">AURION // ASSET INTAKE</p><h1 className="mt-2 text-3xl font-semibold text-amber-100">GLB automatisch einsortieren</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Modelle hochladen, erkennen und im Spiel verwenden. Geprüfte Admin-Uploads werden veröffentlicht und freien passenden Zielen zugeordnet. Ist ein Ziel belegt, entscheidest du über den Austausch.</p></header>
      <p className="text-sm text-muted-foreground">Automatische Darstellung: Standard-Charakter in Sternwarte und Open World; Spinne, Bestien-LOD und Arena in der Sternwarte. Waffen und Rüstung erhalten Katalogzuordnungen; individuelle Ausrüstung und neue Weltobjekte benötigen passende Spielregeln.</p>
      <div role="status" className="rounded-xl border border-cyan-200/15 p-4 text-sm">{storageError ? <><span className="text-red-200">{storageError}</span><Button variant="outline" className="ml-3" onClick={() => void refreshCatalog()}>Erneut prüfen</Button></> : catalog ? <span className="text-emerald-200">Dateispeicher bereit · {catalog.entries.length} freigegebene Katalogeinträge</span> : "Dateispeicher wird geprüft…"}</div>

      <Card className="border-cyan-200/15 bg-slate-950/75">
        <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Upload className="h-5 w-5" />GLB aufnehmen</CardTitle><CardDescription>Bis zu {MAX_GLB_BATCH_FILES} Dateien pro Durchlauf, jeweils maximal 24 MiB. Unklare Modelle werden nicht geraten, sondern einzeln abgelehnt.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="smartGlbName">Anzeigename (optional bei Einzeldatei)</Label><Input id="smartGlbName" value={displayName} maxLength={120} onChange={event => setDisplayName(event.target.value)} placeholder="Bei mehreren Dateien wird der Dateiname verwendet" /></div>
          <label htmlFor="smartGlbFile" className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-cyan-300/30 bg-cyan-400/[.035] p-6 text-center transition-colors hover:bg-cyan-400/[.06]" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
            <FileBox className="h-8 w-8 text-cyan-300" /><div><p className="font-medium text-amber-50">GLBs hier ablegen oder gemeinsam auswählen</p><p className="mt-1 text-xs text-slate-400">Jede Datei wird separat serverseitig klassifiziert und in den Aurion-Assetkatalog geschrieben.</p></div>
            <Input id="smartGlbFile" type="file" multiple accept=".glb,model/gltf-binary" disabled={busy || !catalog || Boolean(storageError)} className="max-w-sm" onChange={event => { void uploadFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
          </label>
          {busy && <p className="text-sm text-cyan-100">GLBs werden nacheinander gelesen, geprüft, klassifiziert und gespeichert…</p>}
          {error && <p role="alert" className="rounded-lg border border-red-300/20 bg-red-400/[.06] p-3 text-sm text-red-200">{error}</p>}
        </CardContent>
      </Card>

      {outcomes.length > 0 && <Card className="border-emerald-300/20 bg-slate-950/75"><CardHeader><CardTitle className="text-emerald-100">Server-Readback</CardTitle><CardDescription>{outcomes.filter(outcome => outcome.result).length}/{outcomes.length} Dateien wurden angenommen. Jede Datei besitzt einen eigenen serverseitigen Klassifikationsnachweis.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">{outcomes.map(outcome => outcome.result ? <div key={`${outcome.fileName}-${outcomes.indexOf(outcome)}`} className="rounded-lg border border-emerald-300/15 p-3"><div className="flex flex-wrap items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><b className="mr-auto text-amber-50">{outcome.fileName}</b><Badge variant="outline" className="border-emerald-300/40 text-emerald-100">{outcome.result.classification.assetType}</Badge><Badge variant="outline" className="border-cyan-300/30 text-cyan-100">{outcome.result.classification.subcategory}</Badge>{outcome.result.classification.lod !== null && <Badge variant="outline">LOD {outcome.result.classification.lod}</Badge>}</div><div className="mt-3 space-y-2"><p className="text-emerald-100">{outcome.result.receipt.status === "assigned" ? "Dem Spielziel zugeordnet" : outcome.result.receipt.status === "conflict" ? "Gespeichert · Ziel bereits belegt" : outcome.result.receipt.status === "archived" ? "Bereits archiviert · keine Veröffentlichung" : "Im Katalog · kein eindeutiges Spielziel"}{outcome.result.receipt.deduplicated ? " · Datei bereits vorhanden" : ""}</p><p className="break-all text-xs text-slate-400">Ziel: {outcome.result.receipt.targetKey ?? "offen"} · SHA-256: {outcome.result.receipt.sha256}</p>{outcome.result.receipt.status === "conflict" && <Button variant="outline" onClick={() => void replaceTarget(outcome.result!)}>Bisheriges Modell durch dieses ersetzen</Button>}</div><p className="mt-2 text-xs text-slate-400">{outcome.result.classification.skinCount} Skin(s) · {outcome.result.classification.socketCount} Socket(s) · Animationen: {outcome.result.classification.animationNames.length ? outcome.result.classification.animationNames.join(", ") : "keine"}</p></div> : <div key={`${outcome.fileName}-${outcomes.indexOf(outcome)}`} className="rounded-lg border border-red-300/15 p-3"><div className="flex items-center gap-2 text-red-200"><XCircle className="h-4 w-4" /><b>{outcome.fileName}</b></div><p className="mt-2 text-xs text-red-200/80">{outcome.error}</p></div>)}</CardContent></Card>}
      {catalog && catalog.entries.length > 0 && <Card className="border-cyan-200/15 bg-slate-950/75"><CardHeader><CardTitle>Veröffentlichte Modelle</CardTitle><CardDescription>Zuordnungen werden beim nächsten Laden oder Aktualisieren der Spielansicht übernommen.</CardDescription></CardHeader><CardContent className="space-y-3">{catalog.entries.map(entry => <div key={`${entry.assetId}:${entry.targetKey}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/10 pb-3 text-sm"><div><b>{entry.displayName}</b><p className="text-xs text-slate-400">{entry.assetType} · {entry.targetKey ?? "Nur Katalog"}</p></div><a className="text-cyan-200 underline" href={entry.storageUrl} target="_blank" rel="noreferrer">GLB öffnen</a></div>)}</CardContent></Card>}
    </div>
  </div></DashboardLayout>;
}
