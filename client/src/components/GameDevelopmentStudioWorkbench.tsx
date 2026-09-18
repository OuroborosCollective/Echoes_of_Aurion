import { useState } from "react";
import { Sparkles, Upload, ShieldCheck, PackageCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type LivePurpose = "npc-fallback" | "world-environment" | "world-nature" | "player-public" | "equipment";

const purposes: readonly { value: LivePurpose; label: string }[] = [
  { value: "world-environment", label: "Welt / Umgebung" },
  { value: "world-nature", label: "Natur" },
  { value: "npc-fallback", label: "NPC-Fallback" },
  { value: "player-public", label: "Öffentlicher Spieler-Avatar" },
  { value: "equipment", label: "Ausrüstung" },
];

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("GLB konnte nicht gelesen werden"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.includes(",")) return reject(new Error("GLB besitzt kein lesbares Binärformat"));
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export default function GameDevelopmentStudioWorkbench() {
  const utils = trpc.useUtils();
  const [brief, setBrief] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [purpose, setPurpose] = useState<LivePurpose>("world-environment");
  const [rightsBasis, setRightsBasis] = useState<"owner-created-private" | "licensed">("owner-created-private");
  const [license, setLicense] = useState("");
  const [packageVersion, setPackageVersion] = useState("1.0.0");
  const [fileName, setFileName] = useState("");
  const [contentBase64, setContentBase64] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);

  const design = trpc.admin.developer.designAsset.useMutation({
    onSuccess: result => {
      setDisplayName(result.workOrder.suggestedDisplayName);
      setPurpose(result.workOrder.suggestedPurpose);
      plan.reset();
    },
  });
  const plan = trpc.admin.developer.gameDevPlan.useMutation();
  const apply = trpc.admin.developer.gameDevApply.useMutation({
    onSuccess: () => {
      void utils.admin.assets.list.invalidate();
    },
  });

  const assetInput = {
    displayName,
    fileName,
    contentBase64,
    purpose,
    packageVersion,
    rightsBasis,
    ...(rightsBasis === "licensed" && license ? { license } : {}),
    ...(design.data?.workOrderSha256 ? { designWorkOrderSha256: design.data.workOrderSha256 } : {}),
  };

  const readyForPlan = Boolean(displayName && fileName && contentBase64 && packageVersion && (rightsBasis === "owner-created-private" || license));
  const resetPlan = () => {
    if (plan.data) plan.reset();
    if (apply.data || apply.error) apply.reset();
  };

  return (
    <div className="space-y-5">
      <Card className="border-cyan-200/15 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <Sparkles className="h-5 w-5 text-cyan-300" /> Mensch + KI Design
          </CardTitle>
          <CardDescription>
            Genkit 1.42 entwirft nur den gebundenen Arbeitsauftrag. Es schreibt nichts live und entscheidet keine Lizenz.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="game-dev-brief">Design-Brief</Label>
          <textarea
            id="game-dev-brief"
            value={brief}
            onChange={event => setBrief(event.target.value)}
            placeholder="z. B. Ein verfallener Runenstein-Schrein als Mid-Poly Weltobjekt, gut lesbar auf Tablet und Desktop …"
            className="min-h-28 w-full rounded-md border border-cyan-200/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300/50"
            maxLength={1800}
          />
          <Button
            type="button"
            disabled={brief.trim().length < 12 || design.isPending}
            onClick={() => design.mutate({ request: brief.trim() })}
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-300"
          >
            {design.isPending ? "KI entwirft…" : "KI-Designvorschlag erstellen"}
          </Button>
          {design.data && (
            <div className="rounded-lg border border-cyan-200/10 bg-cyan-400/[.04] p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Human Review Pflicht</Badge>
                <code className="text-[10px] text-cyan-100/60">{design.data.workOrderSha256}</code>
              </div>
              <p className="mt-3 font-medium text-amber-100">{design.data.workOrder.title}</p>
              <p className="mt-1 text-slate-300">{design.data.workOrder.designIntent}</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-400">
                {design.data.workOrder.acceptanceCriteria.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {design.error && <p className="text-sm text-red-300">{design.error.message}</p>}
        </CardContent>
      </Card>

      <Card className="border-amber-200/15 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <Upload className="h-5 w-5 text-amber-300" /> Reale Asset-Bytes + Provenienz
          </CardTitle>
          <CardDescription>
            Der Mensch liefert die GLB-Datei und die echte Rechtebasis. Eigene privat erzeugte Assets brauchen keine Fremdlizenz; Aurion dokumentiert sie als owner-created/private. Änderungen nach dem Plan machen die Live-Freigabe ungültig.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="gds-file">GLB-Datei</Label>
            <Input
              id="gds-file"
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={async event => {
                const file = event.target.files?.[0];
                setFileError(null);
                resetPlan();
                if (!file) {
                  setFileName("");
                  setContentBase64("");
                  return;
                }
                try {
                  setFileName(file.name);
                  setContentBase64(await fileBase64(file));
                } catch (error) {
                  setFileError(error instanceof Error ? error.message : "GLB konnte nicht gelesen werden");
                }
              }}
            />
            {fileError && <p className="text-sm text-red-300">{fileError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gds-name">Live-Anzeigename</Label>
            <Input id="gds-name" value={displayName} onChange={event => { setDisplayName(event.target.value); resetPlan(); }} maxLength={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gds-purpose">Präsentationszweck</Label>
            <select
              id="gds-purpose"
              value={purpose}
              onChange={event => { setPurpose(event.target.value as LivePurpose); resetPlan(); }}
              className="flex h-10 w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 text-sm text-slate-100"
            >
              {purposes.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gds-rights">Rechtebasis</Label>
            <select
              id="gds-rights"
              value={rightsBasis}
              onChange={event => {
                setRightsBasis(event.target.value as "owner-created-private" | "licensed");
                resetPlan();
              }}
              className="flex h-10 w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 text-sm text-slate-100"
            >
              <option value="owner-created-private">Von mir erzeugt · privat/proprietär</option>
              <option value="licensed">Fremd-/Lizenzasset</option>
            </select>
            {rightsBasis === "owner-created-private"
              ? <p className="text-xs text-slate-400">Kein CC-/SPDX-Etikett nötig. Das Package wird als <code>Proprietary-Owner-Created</code> dokumentiert.</p>
              : <Input
                  id="gds-license"
                  value={license}
                  onChange={event => { setLicense(event.target.value); resetPlan(); }}
                  placeholder="z. B. CC0-1.0 oder kommerzieller Lizenzbezeichner"
                  maxLength={128}
                />}
          </div>
          <div className="space-y-2">
            <Label htmlFor="gds-version">Asset-Version</Label>
            <Input id="gds-version" value={packageVersion} onChange={event => { setPackageVersion(event.target.value); resetPlan(); }} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-cyan-200/15 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <ShieldCheck className="h-5 w-5 text-cyan-300" /> Game Development Studio Plan
          </CardTitle>
          <CardDescription>
            Inspect + Validate laufen zuerst. Dieser Schritt schreibt weder in Aurions Live-Katalog noch bestätigt er das Vendoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            variant="outline"
            disabled={!readyForPlan || plan.isPending}
            onClick={() => plan.mutate(assetInput)}
          >
            {plan.isPending ? "Prüfung läuft…" : "Plan prüfen und hashen"}
          </Button>
          {plan.data && (
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/[.04] p-4 text-sm">
              <p className="font-medium text-emerald-200">Validation: {plan.data.validationPassed ? "PASS" : "BLOCKED"}</p>
              <p className="mt-2 break-all font-mono text-[10px] text-slate-400">Plan {plan.data.planSha256}</p>
              <p className="mt-1 break-all font-mono text-[10px] text-slate-500">GLB {plan.data.sourceSha256}</p>
            </div>
          )}
          {plan.error && <p className="text-sm text-red-300">{plan.error.message}</p>}
        </CardContent>
      </Card>

      <Card className="border-red-300/20 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <PackageCheck className="h-5 w-5 text-red-200" /> Menschlicher Live-Commit
          </CardTitle>
          <CardDescription>
            Erst dieser Klick autorisiert: Package Build → Verify → Vendor Dry-Run → Vendor Confirm → Aurion Live-Ingest → Katalog-Readback.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            type="button"
            disabled={!plan.data?.validationPassed || apply.isPending}
            onClick={() => {
              if (!plan.data) return;
              apply.mutate({
                asset: assetInput,
                expectedPlanSha256: plan.data.planSha256,
                confirmation: "APPLY_TO_LIVE_AURION",
              });
            }}
            className="bg-red-500 text-white hover:bg-red-400"
          >
            {apply.isPending ? "Live-Admission läuft…" : "Verifizierte Bytes jetzt live übernehmen"}
          </Button>
          {apply.data && (
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/[.04] p-4 text-sm text-emerald-100">
              <p className="font-medium">Live-Katalog Readback bestätigt</p>
              <p className="mt-2">Asset: {apply.data.aurionAssetId}</p>
              <p className="break-all font-mono text-[10px] text-emerald-100/70">SHA {apply.data.aurionStorageSha256}</p>
              <p className="break-all font-mono text-[10px] text-emerald-100/60">Catalog {apply.data.aurionCatalogRevision}</p>
            </div>
          )}
          {apply.error && <p className="text-sm text-red-300">{apply.error.message}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
