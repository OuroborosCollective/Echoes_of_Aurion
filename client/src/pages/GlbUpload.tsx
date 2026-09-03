import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileBox, ShieldAlert, Upload } from "lucide-react";
import { useState } from "react";

const MAX_GLB_BYTES = 24 * 1024 * 1024;

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

export default function GlbUpload() {
  const { loading, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SmartUploadResult | null>(null);

  const uploadFile = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setError("Nur binäre GLB-Dateien (.glb) werden akzeptiert.");
      return;
    }
    if (file.size < 12 || file.size > MAX_GLB_BYTES) {
      setError("Die GLB-Datei muss zwischen 12 Byte und 24 MiB groß sein.");
      return;
    }
    const chosenName = (displayName.trim() || defaultDisplayName(file.name)).slice(0, 120);
    if (chosenName.length < 3) {
      setError("Der Anzeigename ist zu kurz.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
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
      if (!response.ok || !payload?.accepted) {
        throw new Error(payload?.error || `Upload wurde mit HTTP ${response.status} abgelehnt.`);
      }
      setDisplayName(chosenName);
      setResult(payload);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Der GLB-Upload ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <DashboardLayout><div className="p-8 text-sm text-cyan-100/70">Adminberechtigung wird geprüft…</div></DashboardLayout>;
  if (!user || user.role !== "admin") return <DashboardLayout><div className="mx-auto max-w-xl p-8"><Card className="border-red-300/20 bg-slate-950/80"><CardHeader><CardTitle className="flex items-center gap-2 text-red-100"><ShieldAlert className="h-5 w-5" />Nur für Aurion-Admins</CardTitle><CardDescription>Der GLB-Uploader ist serverseitig zusätzlich durch die Adminrolle geschützt.</CardDescription></CardHeader></Card></div></DashboardLayout>;

  return <DashboardLayout><div className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(45,226,207,.12),transparent_38%),#06131a] p-3 text-slate-100 sm:p-6">
    <div className="mx-auto max-w-4xl space-y-5">
      <header><p className="text-xs tracking-[.24em] text-cyan-300">AURION // ASSET INTAKE</p><h1 className="mt-2 text-3xl font-semibold text-amber-100">GLB automatisch einsortieren</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Du lädst nur die GLB-Datei hoch. Der Server prüft GLB v2, Größe und SHA-256, liest Rig, Knoten und Animationen und entscheidet fail-closed zwischen Character, Enemy, Weapon, Armor und Arena. Der Browser darf den Asset-Typ nicht vorgeben.</p></header>

      <Card className="border-cyan-200/15 bg-slate-950/75">
        <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Upload className="h-5 w-5" />GLB aufnehmen</CardTitle><CardDescription>Maximal 24 MiB. Unklare Modelle werden nicht geraten, sondern abgelehnt.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label htmlFor="smartGlbName">Anzeigename (optional)</Label><Input id="smartGlbName" value={displayName} maxLength={120} onChange={event => setDisplayName(event.target.value)} placeholder="Wird sonst aus dem Dateinamen erzeugt" /></div>
          <label htmlFor="smartGlbFile" className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-cyan-300/30 bg-cyan-400/[.035] p-6 text-center transition-colors hover:bg-cyan-400/[.06]" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void uploadFile(event.dataTransfer.files?.[0]); }}>
            <FileBox className="h-8 w-8 text-cyan-300" /><div><p className="font-medium text-amber-50">GLB hier ablegen oder auswählen</p><p className="mt-1 text-xs text-slate-400">Die Klassifikation findet ausschließlich serverseitig aus dem Binärinhalt statt.</p></div>
            <Input id="smartGlbFile" type="file" accept=".glb,model/gltf-binary" disabled={busy} className="max-w-sm" onChange={event => { void uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
          {busy && <p className="text-sm text-cyan-100">GLB wird gelesen, geprüft, klassifiziert und in den Aurion-Assetkatalog geschrieben…</p>}
          {error && <p role="alert" className="rounded-lg border border-red-300/20 bg-red-400/[.06] p-3 text-sm text-red-200">{error}</p>}
        </CardContent>
      </Card>

      {result && <Card className="border-emerald-300/20 bg-slate-950/75"><CardHeader><CardTitle className="flex items-center gap-2 text-emerald-100"><CheckCircle2 className="h-5 w-5" />Server-Readback</CardTitle><CardDescription>Das Asset wurde gespeichert und mit der serverseitig erkannten Kategorie zurückgelesen.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex flex-wrap gap-2"><Badge variant="outline" className="border-emerald-300/40 text-emerald-100">{result.classification.assetType}</Badge><Badge variant="outline" className="border-cyan-300/30 text-cyan-100">{result.classification.subcategory}</Badge><Badge variant="outline">confidence: {result.classification.confidence}</Badge>{result.classification.lod !== null && <Badge variant="outline">LOD {result.classification.lod}</Badge>}</div><p className="text-slate-300">{result.fileName} · {result.classification.skinCount} Skin(s) · {result.classification.socketCount} Socket(s)</p><p className="text-xs text-slate-400">Animationen: {result.classification.animationNames.length ? result.classification.animationNames.join(", ") : "keine"}</p></CardContent></Card>}
    </div>
  </div></DashboardLayout>;
}
