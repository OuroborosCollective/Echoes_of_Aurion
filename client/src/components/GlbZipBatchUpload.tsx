import { Archive, CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GlbImportPurpose } from "@shared/glbImportContract";

const MAX_GLB_ZIP_BYTES = 768 * 1024 * 1024;

type ZipEntryReadback = Readonly<{
  archivePath: string;
  fileName: string;
  displayName: string;
  purpose: GlbImportPurpose;
  familyName: string;
  lodLevel: number | null;
  classification: Readonly<{ assetType: string; subcategory: string; equipmentSlot?: string | null }>;
  receipt: Readonly<{ assetId: string; sha256: string; deduplicated: boolean }>;
}>;
type ZipReadback = Readonly<{
  accepted: true;
  archiveSha256: string;
  fileCount: number;
  familyCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  catalogRevision: string;
  catalogCount: number;
  entries: readonly ZipEntryReadback[];
}>;

type Props = Readonly<{
  fallbackPurpose: GlbImportPurpose;
  disabled?: boolean;
  onComplete: () => void | Promise<void>;
}>;

function mib(bytes: number): string { return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`; }

export default function GlbZipBatchUpload({ fallbackPurpose, disabled = false, onComplete }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readback, setReadback] = useState<ZipReadback | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file || busy || disabled) return;
    setError(null); setReadback(null);
    if (!file.name.toLowerCase().endsWith(".zip")) { setError("Bitte ein ZIP-Archiv auswählen."); return; }
    if (file.size < 22 || file.size > MAX_GLB_ZIP_BYTES) { setError("Das ZIP muss zwischen 22 Byte und 768 MiB groß sein."); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/glb-zip-upload?purpose=${encodeURIComponent(fallbackPurpose)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/zip" },
        body: file,
      });
      const payload = await response.json().catch(() => null) as (ZipReadback & { error?: string }) | null;
      if (!response.ok || !payload?.accepted) throw new Error(payload?.error || `ZIP-Upload wurde mit HTTP ${response.status} abgelehnt.`);
      setReadback(payload);
      await onComplete();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "ZIP-Batch konnte nicht verarbeitet werden.");
    } finally { setBusy(false); }
  };

  return <Card className="border-amber-300/20 bg-slate-950/75">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-amber-100"><Archive className="h-5 w-5" />ZIP-Batch · viele GLBs in einem Upload</CardTitle>
      <CardDescription>Das Archiv wird vollständig serverseitig geprüft, erst danach werden die GLBs idempotent in den bestehenden Runtime-Katalog aufgenommen.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4 text-sm">
      <div className="rounded-lg border border-amber-300/15 bg-amber-300/[.03] p-3 text-xs leading-5 text-slate-300">
        <p><b>Empfohlenes Schema für gemischte Archive:</b> <code>npc-fallback/Female_Ranger_LOD0.glb</code>, <code>equipment/Steel_Sword.glb</code>, <code>world-nature/Ancient_Oak_LOD1.glb</code>.</p>
        <p className="mt-1">Erlaubte Top-Level-Ordner sind <code>auto</code>, <code>npc-fallback</code>, <code>world-environment</code>, <code>world-nature</code>, <code>player-public</code> und <code>equipment</code>. Flache ZIPs ohne Purpose-Ordner verwenden die oben ausgewählte Kategorie. Gleiche Basisnamen mit <code>LOD0</code>…<code>LOD3</code> werden automatisch als Familie erkannt.</p>
        <p className="mt-1">Nur GLBs sind erlaubt; Pfad-Traversal, Symlinks, verschlüsselte/ZIP64-Archive, unbekannte Kompression, doppelte Pfade/LOD-Stufen und einzelne GLBs über 24 MiB werden vor der Aufnahme abgewiesen.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="glbZipFile">ZIP-Archiv auswählen</Label>
        <Input id="glbZipFile" type="file" accept=".zip,application/zip,application/x-zip-compressed" disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; void upload(file); event.currentTarget.value = ""; }} />
      </div>
      {busy && <p className="text-cyan-100">ZIP wird gelesen, entpackt, vollständig vorgeprüft und anschließend katalogisiert…</p>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-300/20 bg-red-400/[.06] p-3 text-red-200"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {readback && <div className="space-y-3 rounded-lg border border-emerald-300/20 p-3">
        <div className="flex flex-wrap items-center gap-2 text-emerald-100"><CheckCircle2 className="h-4 w-4" /><b>{readback.fileCount} GLBs · {readback.familyCount} logische Familien aufgenommen</b><Badge variant="outline">Katalog {readback.catalogCount}</Badge></div>
        <p className="break-all text-xs text-slate-400">ZIP SHA-256: {readback.archiveSha256} · komprimiert {mib(readback.compressedBytes)} · GLB-Nutzlast {mib(readback.uncompressedBytes)}</p>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{readback.entries.map(entry => <div key={`${entry.archivePath}:${entry.receipt.assetId}`} className="rounded border border-emerald-300/10 p-2 text-xs"><div className="flex flex-wrap gap-2"><b className="mr-auto text-amber-50">{entry.archivePath}</b><Badge variant="outline">{entry.purpose}</Badge>{entry.lodLevel !== null && <Badge variant="outline">LOD{entry.lodLevel}</Badge>}</div><p className="mt-1 text-slate-400">{entry.classification.assetType} · {entry.classification.subcategory}{entry.classification.equipmentSlot ? ` · ${entry.classification.equipmentSlot}` : ""}{entry.receipt.deduplicated ? " · bereits vorhanden" : ""}</p></div>)}</div>
      </div>}
    </CardContent>
  </Card>;
}
