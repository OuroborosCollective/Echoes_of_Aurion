import { useMemo, useState } from "react";
import { Compass, GitBranch, MapPinned, Network, ShieldCheck, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AuthoringKind = "world" | "quest" | "dungeon";

const confirmationFor = (kind: AuthoringKind) =>
  kind === "world" ? "APPLY_WORLD_DESIGN" : kind === "quest" ? "PUBLISH_QUEST_TEMPLATE" : "PUBLISH_DUNGEON";

function parseDraft(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Der Draft muss ein JSON-Objekt sein.");
  return parsed as Record<string, unknown>;
}

export default function AurionAuthoringWorkbench() {
  const utils = trpc.useUtils();
  const catalog = trpc.aurionAuthoring.catalog.useQuery();
  const [kind, setKind] = useState<AuthoringKind>("world");
  const [brief, setBrief] = useState("");
  const [draftJson, setDraftJson] = useState("");
  const [planHash, setPlanHash] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [result, setResult] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);

  const propose = trpc.aurionAuthoring.propose.useMutation();
  const worldPlan = trpc.aurionAuthoring.worldPlan.useMutation();
  const worldApply = trpc.aurionAuthoring.worldApply.useMutation();
  const dungeonPlan = trpc.aurionAuthoring.dungeonPlan.useMutation();
  const dungeonApply = trpc.aurionAuthoring.dungeonApply.useMutation();
  const questDraft = trpc.aurionQuest.proposeDraft.useMutation();
  const questPlan = trpc.aurionQuest.publishPlan.useMutation();
  const questPublish = trpc.aurionQuest.publish.useMutation();

  const busy = propose.isPending || worldPlan.isPending || worldApply.isPending || dungeonPlan.isPending || dungeonApply.isPending || questDraft.isPending || questPlan.isPending || questPublish.isPending;
  const expectedConfirmation = confirmationFor(kind);
  const mutationError = propose.error ?? worldPlan.error ?? worldApply.error ?? dungeonPlan.error ?? dungeonApply.error ?? questDraft.error ?? questPlan.error ?? questPublish.error;
  const activeSummary = useMemo(() => ({
    world: catalog.data?.world.designs.length ?? 0,
    dungeons: catalog.data?.dungeons.length ?? 0,
    assets: catalog.data?.assets.length ?? 0,
  }), [catalog.data]);

  const resetPlan = () => {
    setPlanHash("");
    setConfirmation("");
    setProposalId("");
    setResult("");
    setLocalError(null);
  };

  const requestDraft = async () => {
    setLocalError(null);
    resetPlan();
    try {
      const response = await propose.mutateAsync({ kind, request: brief.trim() });
      setDraftJson(response.draftJson);
      setResult(`Genkit-Vorschlag „${response.title}“ erzeugt. Noch nichts wurde veröffentlicht.`);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Authoring-Vorschlag fehlgeschlagen.");
    }
  };

  const makePlan = async () => {
    setLocalError(null);
    setResult("");
    setConfirmation("");
    try {
      const parsed = parseDraft(draftJson);
      if (kind === "world") {
        const plan = await worldPlan.mutateAsync(parsed as never);
        setPlanHash(plan.planHash);
        setResult(`World-Plan geprüft: ${plan.placements.length} Platzierungen, ${plan.referencedAssetHashes.length} gebundene Asset-Hashes.`);
        return;
      }
      if (kind === "dungeon") {
        const plan = await dungeonPlan.mutateAsync(parsed as never);
        setPlanHash(plan.planHash);
        setResult(`Dungeon-Plan geprüft: ${plan.rooms.length} Räume, ${plan.bosses.length} Bosse, Graph ${plan.graphHash.slice(0, 16)}…`);
        return;
      }
      const templateId = typeof parsed.templateId === "string" ? parsed.templateId : "";
      const version = typeof parsed.version === "number" ? parsed.version : Number(parsed.version);
      if (!templateId || !Number.isSafeInteger(version) || version < 1) throw new Error("Quest-Draft benötigt templateId und positive version.");
      const proposal = await questDraft.mutateAsync({
        templateId,
        templateVersion: version,
        proposedDataJson: JSON.stringify(parsed),
      });
      setProposalId(proposal.id);
      const plan = await questPlan.mutateAsync({ proposalId: proposal.id });
      setPlanHash(plan.planHash);
      setResult(`Quest-Publish-Plan geprüft: Template ${plan.template.templateId} v${plan.template.version}, Hash ${plan.templateHash.slice(0, 16)}…`);
    } catch (error) {
      setPlanHash("");
      setLocalError(error instanceof Error ? error.message : "Plan konnte nicht validiert werden.");
    }
  };

  const apply = async () => {
    setLocalError(null);
    if (!planHash || confirmation !== expectedConfirmation) return;
    try {
      const parsed = parseDraft(draftJson);
      if (kind === "world") {
        const applied = await worldApply.mutateAsync({
          draft: parsed as never,
          expectedPlanHash: planHash,
          confirmation: "APPLY_WORLD_DESIGN",
        });
        setResult(`World-Design übernommen. Receipt ${applied.receipt.receiptId}; Readback ${applied.readback.revision.slice(0, 16)}…`);
      } else if (kind === "dungeon") {
        const applied = await dungeonApply.mutateAsync({
          draft: parsed as never,
          expectedPlanHash: planHash,
          confirmation: "PUBLISH_DUNGEON",
        });
        setResult(`Dungeon veröffentlicht. Receipt ${applied.receipt.receiptId}; Design ${applied.dungeon.designHash.slice(0, 16)}…`);
      } else {
        if (!proposalId) throw new Error("Quest-Proposal fehlt. Erzeuge den Plan erneut.");
        const published = await questPublish.mutateAsync({
          proposalId,
          expectedPlanHash: planHash,
          confirmation: "PUBLISH_QUEST_TEMPLATE",
        });
        setResult(`Quest-Template veröffentlicht. Receipt ${published.receipt.receiptId}; Template-Set ${published.templateSetHash.slice(0, 16)}…`);
        await utils.aurionQuest.status.invalidate();
        await utils.aurionQuest.templates.invalidate();
      }
      await utils.aurionAuthoring.catalog.invalidate();
      setConfirmation("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Apply/Publish fehlgeschlagen.");
    }
  };

  const mutateDraft = (value: string) => {
    setDraftJson(value);
    resetPlan();
  };

  return (
    <div className="space-y-5">
      <Card className="border-cyan-200/15 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100"><Compass className="h-5 w-5 text-cyan-300" /> Aurion Human + AI Authoring</CardTitle>
          <CardDescription>
            Genkit schlägt vor. Aurion validiert, hasht und veröffentlicht erst nach deiner separaten Bestätigung. Game Development Studio liefert und prüft Assets; Gameplay-Authority bleibt ausschließlich bei Aurion.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">GLB Assets: {activeSummary.assets}</Badge>
          <Badge variant="outline">Aktive World Designs: {activeSummary.world}</Badge>
          <Badge variant="outline">Authoring Dungeons: {activeSummary.dungeons}</Badge>
          <Badge variant="outline" className="font-mono">Catalog {catalog.data?.glbCatalogRevision.slice(0, 12) ?? "…"}</Badge>
        </CardContent>
      </Card>

      <Tabs value={kind} onValueChange={value => { setKind(value as AuthoringKind); setDraftJson(""); setBrief(""); resetPlan(); }}>
        <TabsList className="h-auto flex-wrap bg-slate-950">
          <TabsTrigger value="world"><MapPinned className="mr-2 h-4 w-4" />Welt</TabsTrigger>
          <TabsTrigger value="quest"><GitBranch className="mr-2 h-4 w-4" />Nebenquest</TabsTrigger>
          <TabsTrigger value="dungeon"><Network className="mr-2 h-4 w-4" />Dungeon</TabsTrigger>
        </TabsList>

        {(["world", "quest", "dungeon"] as const).map(tab => (
          <TabsContent key={tab} value={tab} className="space-y-5">
            <Card className="border-slate-800 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-base text-amber-100">1. Design-Brief</CardTitle>
                <CardDescription>
                  Beschreibe Ziele, Stimmung, Geometrie, Assets, Questschritte oder Dungeonräume. Dieser Schritt erzeugt nur einen bearbeitbaren Draft.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  value={brief}
                  onChange={event => setBrief(event.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder={tab === "world"
                    ? "Baue in Windhain einen verfallenen Runenschrein mit Tor, Altar und Bäumen; nutze passende bestätigte GLBs…"
                    : tab === "quest"
                      ? "Nebenquest: Lyra bittet um drei Runensteine; danach Wahl zwischen Befreien oder Zerstören; zwei Outcomes…"
                      : "Dungeon unter Windhain: 6 Räume, Rätsel, Untotenwelle, Seitenziel und Runenwächter als Endboss…"}
                  className="w-full rounded-md border border-cyan-200/15 bg-slate-950 p-3 text-sm text-slate-100"
                />
                <Button disabled={brief.trim().length < 12 || busy} onClick={() => void requestDraft()} className="bg-cyan-500 text-slate-950 hover:bg-cyan-300">
                  <Sparkles className="mr-2 h-4 w-4" /> KI-Draft erzeugen
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-base text-amber-100">2. Draft prüfen & ändern</CardTitle>
                <CardDescription>
                  Der JSON-Draft ist noch nicht vertrauenswürdig. Jede Änderung löscht einen vorhandenen Plan-Hash und erzwingt eine neue Validierung.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  value={draftJson}
                  onChange={event => mutateDraft(event.target.value)}
                  rows={18}
                  spellCheck={false}
                  className="w-full rounded-md border border-slate-700 bg-black/30 p-3 font-mono text-xs text-slate-200"
                  placeholder="Hier erscheint der strukturierte Authoring-Draft…"
                />
                <Button variant="outline" disabled={!draftJson.trim() || busy} onClick={() => void makePlan()}>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Aurion Plan validieren
                </Button>
              </CardContent>
            </Card>

            <Card className="border-red-300/20 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="text-base text-amber-100">3. Menschlicher Commit</CardTitle>
                <CardDescription>
                  Dieser Schritt ist die Consequence-Grenze. Der sichtbare Plan-Hash ist genau der Vertrag, der ausgeführt wird; geänderte Inputs werden abgewiesen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-cyan-200/10 bg-cyan-400/[.03] p-3 font-mono text-[11px] text-cyan-100/70">
                  Plan: {planHash || "noch nicht validiert"}
                </div>
                <Label htmlFor={`authoring-confirm-${tab}`}>Zum Veröffentlichen exakt eingeben: <code>{expectedConfirmation}</code></Label>
                <Input
                  id={`authoring-confirm-${tab}`}
                  value={confirmation}
                  onChange={event => setConfirmation(event.target.value)}
                  autoComplete="off"
                  placeholder={expectedConfirmation}
                />
                <Button
                  disabled={!planHash || confirmation !== expectedConfirmation || busy}
                  onClick={() => void apply()}
                  className="bg-red-500 text-white hover:bg-red-400"
                >
                  {tab === "world" ? "World Design anwenden" : tab === "quest" ? "Quest veröffentlichen" : "Dungeon veröffentlichen"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {(localError || mutationError) && <p role="alert" className="rounded-md border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-200">{localError ?? mutationError?.message}</p>}
      {result && <p aria-live="polite" className="rounded-md border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{result}</p>}
    </div>
  );
}
