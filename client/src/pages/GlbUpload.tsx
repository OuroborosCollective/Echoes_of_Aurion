import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileBox, Layers3, ShieldAlert, Upload, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  glbImportReceiptSchema,
  glbLodLevels,
  glbRuntimeCatalogSchema,
  type GlbCatalogEntry,
  type GlbEquipmentSlot,
  type GlbImportPurpose,
  type GlbImportReceipt,
  type GlbLodLevel,
  type GlbRuntimeCatalog,
} from "@shared/glbImportContract";
import { Button } from "@/components/ui/button";

const MAX_GLB_BYTES = 24 * 1024 * 1024;
const MAX_GLB_BATCH_FILES = 12;
const purposeLabels: Record<GlbImportPurpose, string> = {
  auto: "Automatisch zuordnen",
  "npc-fallback": "NPC-Fallback · niemals Spieler",
  "world-environment": "Umgebung & Bauwerke",
  "world-nature": "Natur & Pflanzen",
  "player-public": "Öffentliche Spielercharaktere · einmalige Wahl",
  equipment: "Ausrüstung & Attachments",
};
const purposeDescriptions: Record<GlbImportPurpose, string> = {
  auto: "Bestehende Aurion-Zielregeln. Ein bereits belegtes Ziel wird niemals still ersetzt.",
  "npc-fallback": "Nur bestätigte Charaktermodelle für modelllose NPCs. Kein Spielerziel und keine Gameplay-Wirkung.",
  "world-environment": "Häuser, Brunnen, Teleporter, Marktstände und andere statische Weltobjekte. Uploads sind Darstellung; ein Teleporter erhält dadurch keine Teleport-Logik.",
  "world-nature": "Bäume, Pflanzen, Büsche, Felsen und Naturdekoration. Die Nutzung erfolgt deterministisch als Weltprojektion ohne Gameplay-Autorität.",
  "player-public": "Animierte Charaktere, aus denen Spieler genau einmal wählen können. Die Wahl wird serverseitig gebunden und öffentlich dargestellt.",
  equipment: "Waffen, Schild/Offhand, Helm, Brust, Schultern, Arme, Beine und Stiefel. Das Modell verändert weder Besitz noch Stats.",
};

type SmartUploadResult = Readonly<{
  accepted: true;
  fileName: string;
  purpose: GlbImportPurpose;
  receipt: GlbImportReceipt;
  classification: Readonly<{
    assetType: "character" | "enemy" | "weapon" | "armor" | "arena";
    subcategory: string;
    confidence: "high" | "medium";
    animationNames: readonly string[];
    skinCount: number;
    socketCount: number;
    lod: number | null;
    equipmentSlot: GlbEquipmentSlot | null;
    worldFamily: "environment" | "nature" | null;
  }>;
}>;

type UploadOutcome = Readonly<{ fileName: string; result?: SmartUploadResult; error?: string }>;
type LodFiles = Partial<Record<GlbLodLevel, File>>;
type LodPreflight = Readonly<{
  level: GlbLodLevel;
  file: File;
  fileName: string;
  contentBase64: string;
  assetType: SmartUploadResult["classification"]["assetType"];
  subcategory: string;
  equipmentSlot: GlbEquipmentSlot | null;
  worldFamily: "environment" | "nature" | null;
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
function defaultDisplayName(fileName: string): string { return fileName.replace(/\.glb$/i, "").replaceAll(/[_-]+/g, " ").replaceAll(/\s+/g, " ").trim().slice(0, 120); }
function validateFile(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".glb")) return "Nur binäre GLB-Dateien (.glb) werden akzeptiert.";
  if (file.size < 12 || file.size > MAX_GLB_BYTES) return "Die GLB-Datei muss zwischen 12 Byte und 24 MiB groß sein.";
  return null;
}
function lodClassifyingFileName(fileName: string, level: GlbLodLevel): string {
  const base = fileName.replace(/\.glb$/i, "").replace(/(?:^|[_ -])lod[_ -]?[0-3](?:$|[_ -])/ig, "_").replace(/[_ -]+$/g, "");
  return `${base || "aurion_model"}_LOD${level}.glb`;
}
function lodLevels(entry: GlbCatalogEntry): readonly GlbLodLevel[] {
  return entry.lods.length ? entry.lods.map(value => value.level) : Object.freeze([0 as const]);
}

export default function GlbUpload() {
  const { loading, user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [purpose, setPurpose] = useState<GlbImportPurpose>("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<readonly UploadOutcome[]>([]);
  const [catalog, setCatalog] = useState<GlbRuntimeCatalog | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [agentSession, setAgentSession] = useState<{ token: string; expiresAt: string } | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [lodBusy, setLodBusy] = useState(false);
  const [lodExistingAssetId, setLodExistingAssetId] = useState("");
  const [lodFamilyName, setLodFamilyName] = useState("");
  const [lodFiles, setLodFiles] = useState<LodFiles>({});
  const selectedLodFamily = useMemo(() => catalog?.entries.find(entry => entry.assetId === lodExistingAssetId) ?? null, [catalog, lodExistingAssetId]);

  const refreshCatalog = async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/admin/glb-import/status", { credentials: "include", signal });
      const body = await response.json();
      if (!response.ok || !body.writable) throw new Error("Der Dateispeicher ist nicht verfügbar. Bitte später erneut versuchen.");
      const checked = glbRuntimeCatalogSchema.parse(body.catalog);
      if (!signal?.aborted) { setCatalog(checked); setStorageError(null); }
    } catch (readError) { if (!signal?.aborted) { setCatalog(null); setStorageError(readError instanceof Error ? readError.message : "Dateispeicher nicht erreichbar."); } }
  };
  useEffect(() => {
    setCatalog(null); setStorageError(null); setAgentSession(null);
    if (user?.role !== "admin") return;
    const controller = new AbortController(); void refreshCatalog(controller.signal);
    return () => controller.abort();
  }, [user?.id, user?.role]);

  const createAgentSession = async () => {
    setSessionBusy(true); setAgentSession(null);
    try {
      const response = await fetch("/api/admin/glb-import/agent-session", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok || typeof body.token !== "string" || typeof body.expiresAt !== "string") throw new Error("Import-Zugang konnte nicht erstellt werden.");
      setAgentSession({ token: body.token, expiresAt: body.expiresAt });
    } catch (sessionError) { setError(sessionError instanceof Error ? sessionError.message : "Import-Zugang nicht verfügbar."); }
    finally { setSessionBusy(false); }
  };

  const uploadOne = async (file: File, chosenName: string, chosenPurpose = purpose, contentBase64?: string, fileName = file.name): Promise<SmartUploadResult> => {
    const response = await fetch("/api/admin/glb-smart-upload", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: chosenName, fileName, purpose: chosenPurpose, contentBase64: contentBase64 ?? await readFileAsBase64(file) }),
    });
    const payload = await response.json().catch(() => null) as (SmartUploadResult & { error?: string }) | null;
    if (!response.ok || !payload?.accepted) throw new Error(payload?.error || `Upload wurde mit HTTP ${response.status} abgelehnt.`);
    const receipt = glbImportReceiptSchema.safeParse(payload.receipt);
    if (!receipt.success) throw new Error("Der Server hat keinen gültigen Speichernachweis geliefert.");
    if (payload.purpose !== chosenPurpose) throw new Error("Der Server hat einen abweichenden Verwendungszweck bestätigt.");
    if (chosenPurpose !== "auto" && (receipt.data.targetKey !== null || receipt.data.status !== "catalog")) throw new Error("Der Server hat die katalog-only Grenze des gewählten Zwecks nicht bestätigt.");
    if (chosenPurpose === "npc-fallback" && receipt.data.assetType !== "character") throw new Error("Der Server hat keinen Charakter-NPC-Fallback bestätigt.");
    if (chosenPurpose === "player-public" && receipt.data.assetType !== "character") throw new Error("Der Server hat keinen öffentlichen Spielercharakter bestätigt.");
    if (chosenPurpose === "world-environment" && (receipt.data.assetType !== "arena" || payload.classification.worldFamily !== "environment")) throw new Error("Der Server hat kein Umgebungsobjekt bestätigt.");
    if (chosenPurpose === "world-nature" && (receipt.data.assetType !== "arena" || payload.classification.worldFamily !== "nature")) throw new Error("Der Server hat kein Naturmodell bestätigt.");
    if (chosenPurpose === "equipment" && (!payload.classification.equipmentSlot || !["weapon", "armor"].includes(receipt.data.assetType))) throw new Error("Der Server hat keinen tragbaren Ausrüstungsslot bestätigt.");
    return payload;
  };

  const uploadFiles = async (files: readonly File[]) => {
    if (!files.length || busyRef.current || !catalog || storageError) return;
    if (files.length > MAX_GLB_BATCH_FILES) { setError(`Pro Durchlauf dürfen höchstens ${MAX_GLB_BATCH_FILES} GLB-Dateien hochgeladen werden.`); return; }
    busyRef.current = true; setBusy(true); setError(null); setOutcomes([]);
    const singleOverride = files.length === 1 ? displayName.trim() : "";
    try {
      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) { setOutcomes(current => [...current, { fileName: file.name, error: validationError }]); continue; }
        const chosenName = (singleOverride || defaultDisplayName(file.name)).slice(0, 120);
        if (chosenName.length < 3) { setOutcomes(current => [...current, { fileName: file.name, error: "Der Anzeigename ist zu kurz." }]); continue; }
        try {
          const result = await uploadOne(file, chosenName);
          setOutcomes(current => [...current, { fileName: file.name, result }]);
          if (files.length === 1) setDisplayName(chosenName);
        } catch (uploadError) { setOutcomes(current => [...current, { fileName: file.name, error: uploadError instanceof Error ? uploadError.message : "Der GLB-Upload ist fehlgeschlagen." }]); }
      }
    } finally { busyRef.current = false; setBusy(false); await refreshCatalog(); }
  };

  const preflightLod = async (level: GlbLodLevel, file: File, familyPurpose: GlbImportPurpose): Promise<LodPreflight> => {
    const validationError = validateFile(file);
    if (validationError) throw new Error(`LOD${level}: ${validationError}`);
    const contentBase64 = await readFileAsBase64(file);
    const fileName = lodClassifyingFileName(file.name, level);
    const response = await fetch("/api/admin/glb-import/plan", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentBase64, fileName, purpose: familyPurpose }) });
    const body = await response.json().catch(() => null) as Record<string, any> | null;
    if (!response.ok || !body || !body.classification) throw new Error(`LOD${level}: ${body?.error || "Server-Prüfung fehlgeschlagen."}`);
    return Object.freeze({ level, file, fileName, contentBase64, assetType: body.classification.assetType, subcategory: body.classification.subcategory, equipmentSlot: body.classification.equipmentSlot ?? null, worldFamily: body.classification.worldFamily ?? null });
  };

  const uploadLodFamily = async () => {
    if (!catalog || storageError || lodBusy || busyRef.current) return;
    const existing = selectedLodFamily;
    const familyPurpose = existing?.purpose ?? purpose;
    const baseName = (existing?.displayName ?? lodFamilyName).trim().slice(0, 114);
    const occupied = new Set<GlbLodLevel>(existing ? lodLevels(existing) : []);
    const chosen = glbLodLevels.flatMap(level => lodFiles[level] ? [[level, lodFiles[level]!] as const] : []);
    if (!baseName || baseName.length < 3) { setError("Für eine neue LOD-Familie wird ein Anzeigename benötigt."); return; }
    if (!chosen.length) { setError("Bitte mindestens eine neue LOD-Datei auswählen."); return; }
    if (!existing && !lodFiles[0]) { setError("Eine neue LOD-Familie benötigt LOD0 als Hauptmodell."); return; }
    if (chosen.some(([level]) => occupied.has(level))) { setError("Eine ausgewählte LOD-Stufe ist in dieser Familie bereits vorhanden."); return; }

    setLodBusy(true); setError(null); setOutcomes([]);
    try {
      const preflight = await Promise.all(chosen.map(([level, file]) => preflightLod(level, file, familyPurpose)));
      const reference = preflight[0]!;
      for (const item of preflight) {
        if (item.assetType !== reference.assetType || item.subcategory !== reference.subcategory || item.equipmentSlot !== reference.equipmentSlot || item.worldFamily !== reference.worldFamily) throw new Error(`LOD${item.level} gehört laut Server-Klassifikation nicht zur selben Modellfamilie.`);
        if (existing && (item.assetType !== existing.assetType || (existing.subcategory && item.subcategory !== existing.subcategory) || (existing.equipmentSlot && item.equipmentSlot !== existing.equipmentSlot))) throw new Error(`LOD${item.level} passt nicht zum vorhandenen Katalogmodell.`);
      }

      if (existing && !existing.lods.length) {
        const enable = await fetch("/api/admin/glb-import/lod-family/enable", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: existing.assetId }) });
        const enabled = await enable.json().catch(() => null) as { error?: string } | null;
        if (!enable.ok) throw new Error(enabled?.error || "Das vorhandene Modell konnte nicht als LOD0 markiert werden.");
      }

      for (const item of preflight.sort((left, right) => left.level - right.level)) {
        const result = await uploadOne(item.file, `${baseName} LOD${item.level}`, familyPurpose, item.contentBase64, item.fileName);
        setOutcomes(current => [...current, { fileName: `LOD${item.level} · ${item.file.name}`, result }]);
      }
      setLodFiles({});
      if (!existing) setLodFamilyName(baseName);
      await refreshCatalog();
    } catch (lodError) {
      setError(lodError instanceof Error ? lodError.message : "LOD-Familie konnte nicht übernommen werden.");
      await refreshCatalog();
    } finally { setLodBusy(false); }
  };

  const replaceTarget = async (result: SmartUploadResult) => {
    const receipt = result.receipt;
    if (result.purpose !== "auto" || !receipt.targetKey) { setError("Katalog-Zwecke besitzen absichtlich kein ersetzbares Spielziel."); return; }
    try {
      const response = await fetch("/api/admin/glb-import/assign", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: receipt.assetId, targetType: receipt.assetType, targetKey: receipt.targetKey, expectedActiveAssetId: receipt.activeAssetId }) });
      if (!response.ok) throw new Error(response.status === 409 ? "Die Zuordnung wurde inzwischen geändert. Bitte den Katalog aktualisieren." : "Das Modell konnte nicht zugeordnet werden.");
      const body = await response.json();
      if (body.assetId !== receipt.assetId || body.targetKey !== receipt.targetKey || body.active !== 1) throw new Error("Die Zuordnung wurde nicht bestätigt.");
      setOutcomes(current => current.map(outcome => outcome.result?.receipt.assetId === receipt.assetId ? { ...outcome, result: { ...outcome.result, receipt: { ...receipt, status: "assigned", activeAssetId: receipt.assetId } } } : outcome));
      await refreshCatalog();
    } catch (replaceError) { setError(replaceError instanceof Error ? replaceError.message : "Zuordnung fehlgeschlagen."); }
  };

  if (loading) return <DashboardLayout><div className="p-8 text-sm text-cyan-100/70">Adminberechtigung wird geprüft…</div></DashboardLayout>;
  if (!user || user.role !== "admin") return <DashboardLayout><div className="mx-auto max-w-xl p-8"><Card className="border-red-300/20 bg-slate-950/80"><CardHeader><CardTitle className="flex items-center gap-2 text-red-100"><ShieldAlert className="h-5 w-5" />Nur für Aurion-Admins</CardTitle><CardDescription>Der GLB-Uploader ist serverseitig zusätzlich durch die Adminrolle geschützt.</CardDescription></CardHeader></Card></div></DashboardLayout>;

  return <DashboardLayout><div data-testid="glb-upload-scroll-region" tabIndex={0} className="h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-y-contain touch-pan-y [scrollbar-gutter:stable] md:h-[calc(100dvh-2rem)] bg-[radial-gradient(circle_at_top_right,rgba(45,226,207,.12),transparent_38%),#06131a] p-3 text-slate-100 sm:p-6">
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <header><p className="text-xs tracking-[.24em] text-cyan-300">AURION // ASSET INTAKE</p><h1 className="mt-2 text-3xl font-semibold text-amber-100">GLB automatisch einsortieren</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Modelle hochladen, serverseitig erkennen und ausschließlich innerhalb des gewählten Darstellungszwecks verwenden.</p></header>
      <p className="text-sm text-muted-foreground">Katalog-Zwecke verändern keine Quest-, Händler-, Kampf-, Inventar- oder Teleportlogik. Ausrüstung ist Mesh-Autorität, keine Item-Autorität.</p>
      <div role="status" className="rounded-xl border border-cyan-200/15 p-4 text-sm">{storageError ? <><span className="text-red-200">{storageError}</span><Button variant="outline" className="ml-3" onClick={() => void refreshCatalog()}>Erneut prüfen</Button></> : catalog ? <span className="text-emerald-200">Dateispeicher bereit · {catalog.entries.length} logische Katalogmodelle</span> : "Dateispeicher wird geprüft…"}</div>

      <Card className="border-cyan-200/15 bg-slate-950/75"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Upload className="h-5 w-5" />GLB aufnehmen</CardTitle><CardDescription>Bis zu {MAX_GLB_BATCH_FILES} Dateien pro Durchlauf, jeweils maximal 24 MiB. Unklare Modelle werden einzeln abgelehnt.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="space-y-2"><Label htmlFor="smartGlbPurpose">Kategorie / Verwendungszweck</Label><select id="smartGlbPurpose" value={purpose} disabled={busy || lodBusy} onChange={event => setPurpose(event.target.value as GlbImportPurpose)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background">{(Object.keys(purposeLabels) as GlbImportPurpose[]).map(value => <option key={value} value={value}>{purposeLabels[value]}</option>)}</select><p className="text-xs leading-5 text-slate-400">{purposeDescriptions[purpose]}</p></div>
        <div className="space-y-2"><Label htmlFor="smartGlbName">Anzeigename (optional bei Einzeldatei)</Label><Input id="smartGlbName" value={displayName} maxLength={120} onChange={event => setDisplayName(event.target.value)} placeholder="Bei mehreren Dateien wird der Dateiname verwendet" /></div>
        <label htmlFor="smartGlbFile" className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-cyan-300/30 bg-cyan-400/[.035] p-6 text-center transition-colors hover:bg-cyan-400/[.06]" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}><FileBox className="h-8 w-8 text-cyan-300" /><div><p className="font-medium text-amber-50">GLBs hier ablegen oder gemeinsam auswählen</p><p className="mt-1 text-xs text-slate-400">Dateiname und GLB-Inhalt werden gemeinsam klassifiziert; der Server bestätigt jeden Zweck separat.</p></div><Input id="smartGlbFile" type="file" multiple accept=".glb,model/gltf-binary" disabled={busy || lodBusy || !catalog || Boolean(storageError)} className="max-w-sm" onChange={event => { void uploadFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} /></label>
        {busy && <p className="text-sm text-cyan-100">GLBs werden nacheinander gelesen, geprüft, klassifiziert und gespeichert…</p>}{error && <p role="alert" className="rounded-lg border border-red-300/20 bg-red-400/[.06] p-3 text-sm text-red-200">{error}</p>}
      </CardContent></Card>

      <Card className="border-violet-300/20 bg-slate-950/75"><CardHeader><CardTitle className="flex items-center gap-2 text-violet-100"><Layers3 className="h-5 w-5" />LOD-Familie · bis zu 4 Stufen</CardTitle><CardDescription>LOD0–LOD3 werden physisch einzeln geprüft, im Katalog aber als ein Modell angezeigt. Im Spiel bleiben sie reine Rendering-/Performance-Stufen.</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="space-y-2"><Label htmlFor="lodExisting">Vorhandenes Modell erweitern (optional)</Label><select id="lodExisting" value={lodExistingAssetId} disabled={lodBusy} onChange={event => { setLodExistingAssetId(event.target.value); setLodFiles({}); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"><option value="">Neue LOD-Familie</option>{catalog?.entries.map(entry => <option key={entry.assetId} value={entry.assetId}>{entry.displayName} · {lodLevels(entry).map(level => `LOD${level}`).join("/")}</option>)}</select></div>
        {!selectedLodFamily && <div className="space-y-2"><Label htmlFor="lodFamilyName">Familienname</Label><Input id="lodFamilyName" maxLength={114} value={lodFamilyName} onChange={event => setLodFamilyName(event.target.value)} placeholder="z. B. Ancient Oak" /></div>}
        {selectedLodFamily && <div className="rounded-lg border border-violet-300/15 p-3 text-sm"><b>{selectedLodFamily.displayName}</b><p className="mt-1 text-xs text-slate-400">Zweck: {purposeLabels[selectedLodFamily.purpose]} · vorhanden: {lodLevels(selectedLodFamily).map(level => `LOD${level}`).join(", ")}</p></div>}
        <div className="grid gap-3 sm:grid-cols-2">{glbLodLevels.map(level => { const occupied = selectedLodFamily ? lodLevels(selectedLodFamily).includes(level) : false; return <div key={level} className="rounded-lg border border-violet-300/15 p-3"><Label htmlFor={`lodFile${level}`} className="flex items-center justify-between"><span>LOD{level}{level === 0 ? " · Hauptmodell" : ""}</span>{occupied && <Badge variant="outline">vorhanden</Badge>}</Label><Input id={`lodFile${level}`} className="mt-2" type="file" accept=".glb,model/gltf-binary" disabled={lodBusy || occupied} onChange={event => { const file = event.target.files?.[0]; setLodFiles(current => ({ ...current, [level]: file })); }} />{lodFiles[level] && <p className="mt-1 truncate text-xs text-slate-400">{lodFiles[level]!.name}</p>}</div>; })}</div>
        <p className="text-xs leading-5 text-slate-400">Vor dem Speichern werden alle neuen Stufen serverseitig klassifiziert. Asset-Typ, Unterkategorie und Ausrüstungsslot müssen übereinstimmen. Vorhandene LOD-Stufen werden nicht still überschrieben.</p>
        <Button disabled={lodBusy || busy || !catalog || Boolean(storageError)} onClick={() => void uploadLodFamily()}>{lodBusy ? "LOD-Familie wird geprüft…" : "LOD-Familie prüfen & hochladen"}</Button>
      </CardContent></Card>

      <Card className="border-cyan-200/15 bg-slate-950/75"><CardHeader><CardTitle>Automatisierter Import</CardTitle><CardDescription>Der Zugang gilt eine Stunde und ausschließlich für GLB-Importe.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p>Client: <code>node scripts/glb-import.mjs --purpose world-nature --watch /pfad/zu/glbs</code>. Unterstützt werden <code>auto</code>, <code>npc-fallback</code>, <code>world-environment</code>, <code>world-nature</code>, <code>player-public</code> und <code>equipment</code>. Dateien mit demselben Basisnamen und <code>LOD0</code>…<code>LOD3</code> werden im Runtime-Katalog automatisch zu einer Familie zusammengefasst. Zugang nur über <code>AURION_GLB_BEARER_TOKEN</code> oder eine private <code>AURION_GLB_TOKEN_FILE</code>.</p><Button disabled={sessionBusy} variant="outline" onClick={() => void createAgentSession()}>Import-Zugang für eine Stunde erstellen</Button>{agentSession && <div className="space-y-2"><Label htmlFor="glbAgentToken">Persönlicher GLB-Zugang · gültig bis {agentSession.expiresAt}</Label><Input id="glbAgentToken" type="password" readOnly value={agentSession.token} autoComplete="off" /><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(agentSession.token).catch(() => setError("Kopieren nicht möglich. Bitte den Zugang im Feld auswählen und kopieren.")); }}>Zugang kopieren</Button><Button variant="ghost" onClick={() => setAgentSession(null)}>Ausblenden</Button></div>}</CardContent></Card>

      {outcomes.length > 0 && <Card className="border-emerald-300/20 bg-slate-950/75"><CardHeader><CardTitle className="text-emerald-100">Server-Readback</CardTitle><CardDescription>{outcomes.filter(outcome => outcome.result).length}/{outcomes.length} Dateien wurden angenommen.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm">{outcomes.map((outcome, index) => outcome.result ? <div key={`${outcome.fileName}-${index}`} className="rounded-lg border border-emerald-300/15 p-3"><div className="flex flex-wrap items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /><b className="mr-auto text-amber-50">{outcome.fileName}</b><Badge variant="outline" className="border-emerald-300/40 text-emerald-100">{outcome.result.classification.assetType}</Badge><Badge variant="outline" className="border-cyan-300/30 text-cyan-100">{outcome.result.classification.subcategory}</Badge><Badge variant="outline" className="border-amber-300/30 text-amber-100">{purposeLabels[outcome.result.purpose]}</Badge>{outcome.result.classification.equipmentSlot && <Badge variant="outline">Slot {outcome.result.classification.equipmentSlot}</Badge>}{outcome.result.classification.lod !== null && <Badge variant="outline">LOD {outcome.result.classification.lod}</Badge>}</div><div className="mt-3 space-y-2"><p className="text-emerald-100">{outcome.result.purpose !== "auto" ? "Im zweckgebundenen Katalog · kein automatisches Gameplay-Ziel" : outcome.result.receipt.status === "assigned" ? "Dem Spielziel zugeordnet" : outcome.result.receipt.status === "conflict" ? "Gespeichert · Ziel bereits belegt" : outcome.result.receipt.status === "archived" ? "Bereits archiviert" : "Im Katalog · kein eindeutiges Spielziel"}{outcome.result.receipt.deduplicated ? " · Datei bereits vorhanden" : ""}</p><p className="break-all text-xs text-slate-400">Ziel: {outcome.result.receipt.targetKey ?? "offen"} · SHA-256: {outcome.result.receipt.sha256}</p>{outcome.result.purpose === "auto" && outcome.result.receipt.status === "conflict" && <Button variant="outline" onClick={() => void replaceTarget(outcome.result!)}>Bisheriges Modell durch dieses ersetzen</Button>}</div><p className="mt-2 text-xs text-slate-400">{outcome.result.classification.skinCount} Skin(s) · {outcome.result.classification.socketCount} Socket(s) · Animationen: {outcome.result.classification.animationNames.length ? outcome.result.classification.animationNames.join(", ") : "keine"}</p></div> : <div key={`${outcome.fileName}-${index}`} className="rounded-lg border border-red-300/15 p-3"><div className="flex items-center gap-2 text-red-200"><XCircle className="h-4 w-4" /><b>{outcome.fileName}</b></div><p className="mt-2 text-xs text-red-200/80">{outcome.error}</p></div>)}</CardContent></Card>}
      {catalog && catalog.entries.length > 0 && <Card className="border-cyan-200/15 bg-slate-950/75"><CardHeader><CardTitle>Veröffentlichte Modelle</CardTitle><CardDescription>Ein logisches Modell erscheint nur einmal. Vorhandene LOD-Stufen bleiben darunter einzeln hashgebunden und abrufbar.</CardDescription></CardHeader><CardContent className="space-y-3">{catalog.entries.map(entry => <div key={`${entry.assetId}:${entry.targetKey}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/10 pb-3 text-sm"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b>{entry.displayName}</b>{entry.lods.length > 1 && <Badge variant="outline" className="border-violet-300/40 text-violet-100">{entry.lods.length} LODs</Badge>}</div><p className="text-xs text-slate-400">{entry.assetType} · {purposeLabels[entry.purpose]} · {entry.equipmentSlot ? `Slot ${entry.equipmentSlot}` : entry.subcategory ?? entry.targetKey ?? "Nur Katalog"}</p></div><div className="flex flex-wrap gap-2">{entry.lods.length ? entry.lods.map(lod => <a key={lod.level} className="text-cyan-200 underline" href={lod.storageUrl} target="_blank" rel="noreferrer">LOD{lod.level}</a>) : <a className="text-cyan-200 underline" href={entry.storageUrl} target="_blank" rel="noreferrer">GLB öffnen</a>}</div></div>)}</CardContent></Card>}
    </div>
  </div></DashboardLayout>;
}
