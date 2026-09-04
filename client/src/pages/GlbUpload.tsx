import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileBox, ShieldAlert, Upload, XCircle } from "lucide-react";
import { useState } from "react";

const MAX_GLB_BYTES = 24 * 1024 * 1024;
const MAX_GLB_BATCH_FILES = 12;

type SmartUploadResult = Readonly<{
  accepted: true;
  fileName: string;
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
    return payload;
  };

  const uploadFiles = async (files: readonly File[]) => {
    if (!files.length || busy) return;
    if (files.length > MAX_GLB_BATCH_FILES) {
      setError(`Pro Durchlauf dürfen höchstens ${MAX_GLB_BATCH_FILES} GLB-Dateien hochgeladen werden.`);
      return;
    }

    setBusy(true);
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
      setBusy(false);
    }
  };

  if (loading) return <DashboardLayout><div className="p-8 text-sm text-cyan-100/70">Adminberechtigung wird geprüft…</div></DashboardLayout>;
  if (!user || user.role !== "admin") return <DashboardLayout><div className="mx-auto max-w-xl p-8"><Card className="border-red-300/20 bg-slate-950/80"><CardHeader><CardTitle className="flex items-center gap-2 text-red-100"><ShieldAlert className="h-5 w-5" />Nur für Aurion-Admins</CardTitle><CardDescription>Der GLB-Uploader ist serverseitig zusätzlich durch die Adminrolle geschützt.</CardDescription></CardHeader></Card></div></DashboardLayout>;

  return <DashboardLayout><div className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(45,226,207,.12),transparent_38%),#06131a] p-3 text-slate-100 sm:p-6">
    <div className="mx-auto max-w-4xl space-y-5">
      <header><p className="text-xs tracking-[.24em] text-cyan-300">AURION // ASSET INTAKE</p><h1 className="mt-2 text-3xl font-semibold text-amber-100">GLB automatisch einsortieren</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Wähle eine oder mehrere GLB-Dateien. Aurion lädt sie nacheinander mit deiner Admin-Session hoch; der Server prüft GLB v2, Größe und SHA-256, liest Rig, Knoten und Animationen und entscheidet fail-closed zwischen Character, Enemy, Weapon, Armor und Arena. Der Browser darf den Asset-Typ nicht vorgeben.</p></header>

      <Card className="border-cyan-200/15 bg-slate-950/75">
        <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Upload className="h-5 w-5" />GLB aufnehmen</CardTitle><CardDescription>Bis zu {MAX_GLB_BATCH_FILES} Dateien pro Durchlauf, jeweils maximal 24 MiB. Unklare Modelle werden nicht geraten, sondern einzeln abgelehnt.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="smartGlbName">Anzeigename (optional bei Einzeldatei)</Label><Input id="smartGlbName" value={displayName} maxLength={120} onChange={event => setDisplayName(event.target.value)} placeholder="Bei mehreren Dateien wird der Dateiname verwendet" /></div>
          <label htmlFor="smartGlbFile" className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-cyan-300/30 bg-cyan-400/[.035] p-6 text-center transition-colors hover:bg-cyan-400/[.06]" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
            <FileBox className="h-8 w-8 text-cyan-300" /><div><p className="font-medium text-amber-50">GLBs hier ablegen oder gemeinsam auswählen</p><p className="mt-1 text-xs text-slate-400">Jede Datei wird separat serverseitig klassifiziert und in den Aurion-Assetkatalog geschrieben.</p></div>
            <Input id="smartGlbFile" type="file" multiple accept=".glb,model/gltf-binary" disabled={busy} className="max-w-sm" onChange={event => { void uploadFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
          </label>
          {busy && <p className="text-sm text-cyan-100">GLBs werden nacheinander gelesen, geprüft, klassifiziert und gespeichert…</p>}
          {error && <p role="alert" className="rounded-lg border border-red-300/20 bg-red-400/[.06] p-3 text-sm text-red-200">{error}</p>}
        </CardContent>
      </Card>

      {outcomes.length > 0 && <Card className="border-emerald-300/20 bg-slate-950/75"><CardHeader><CardTitle className="text-emerald-100">Server-Readback</CardTitle><CardDescription>{outcomes.filter(outcome => outcome.result).length}/{outcomes.length} Dateien wurden angenommen. Jede Datei besitzt einen eigenen serverseitigen Klassifikationsnachweis.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">{outcomes.map(outcome => outcome.result ? <div key={outcome.fileName} className="rounded-lg border border-emerald-300/15 p-3"><div className="flex flex-wrap items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><b className="mr-auto text-amber-50">{outcome.fileName}</b><Badge variant="outline" className="border-emerald-300/40 text-emerald-100">{outcome.result.classification.assetType}</Badge><Badge variant="outline" className="border-cyan-300/30 text-cyan-100">{outcome.result.classification.subcategory}</Badge>{outcome.result.classification.lod !== null && <Badge variant="outline">LOD {outcome.result.classification.lod}</Badge>}</div><p className="mt-2 text-xs text-slate-400">{outcome.result.classification.skinCount} Skin(s) · {outcome.result.classification.socketCount} Socket(s) · Animationen: {outcome.result.classification.animationNames.length ? outcome.result.classification.animationNames.join(", ") : "keine"}</p></div> : <div key={outcome.fileName} className="rounded-lg border border-red-300/15 p-3"><div className="flex items-center gap-2 text-red-200"><XCircle className="h-4 w-4" /><b>{outcome.fileName}</b></div><p className="mt-2 text-xs text-red-200/80">{outcome.error}</p></div>)}</CardContent></Card>}
    </div>
  </div></DashboardLayout>;
}
