import DashboardLayout from "@/components/DashboardLayout";
import ForumAdminComposer from "@/components/ForumAdminComposer";
import ForumAdminEditor from "@/components/ForumAdminEditor";
import GlbSubmissionReview from "@/components/GlbSubmissionReview";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Archive, Server, BadgeDollarSign, Boxes, CheckCircle2, Crown, ExternalLink, Link2, Save, Search, Shield, Sparkles, Trophy, Upload, Users, XCircle, Landmark, MapPin, AlertTriangle, RefreshCw, Hourglass, History } from "lucide-react";
import { useMemo, useState } from "react";
import SystemStatusDashboard from "@/components/SystemStatusDashboard";
import CausalStudioDashboard from "@/components/CausalStudioDashboard";
import SessionReplayVisualizer from "@/components/SessionReplayVisualizer";
import ArchiveDashboard from "@/components/ArchiveDashboard";
import CrossZoneSyncDashboard from "@/components/CrossZoneSyncDashboard";
import GlobalStateReconciliationDashboard from "@/components/GlobalStateReconciliationDashboard";
import GameDevelopmentStudioWorkbench from "@/components/GameDevelopmentStudioWorkbench";
import AurionAuthoringWorkbench from "@/components/AurionAuthoringWorkbench";
import CausalRecoveryDashboard from "@/components/CausalRecoveryDashboard";
import { Link } from "wouter";

const MAX_GLB_BYTES = 24 * 1024 * 1024;
type AssetType = "character" | "enemy" | "weapon" | "armor" | "arena";

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Trophy }) {
  return <Card className="border-cyan-300/10 bg-slate-950/70"><CardContent className="pt-5"><div className="flex items-center justify-between"><div><p className="text-[10px] tracking-[.16em] text-cyan-100/55">{label}</p><p className="mt-2 text-2xl font-semibold text-amber-100">{value}</p></div><Icon className="h-5 w-5 text-cyan-300" /></div></CardContent></Card>;
}

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

function AssetStatus({ status }: { status: "draft" | "approved" | "rejected" | "archived" }) {
  const tones = { draft: "border-amber-300/30 text-amber-100", approved: "border-emerald-300/30 text-emerald-100", rejected: "border-red-300/30 text-red-200", archived: "border-slate-400/30 text-slate-300" };
  return <Badge variant="outline" className={tones[status]}>{status}</Badge>;
}

export default function Operations() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"readback" | "archiving" | "cross-zone" | "global-state">("readback");
  const [guildName, setGuildName] = useState("");
  const [guildTag, setGuildTag] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [submittedPlayerSearch, setSubmittedPlayerSearch] = useState("");
  const [glbDisplayName, setGlbDisplayName] = useState("");
  const [glbAssetType, setGlbAssetType] = useState<AssetType>("character");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [readingAsset, setReadingAsset] = useState(false);
  const [assignmentTargets, setAssignmentTargets] = useState<Record<string, string>>({});
  const [roleChoices, setRoleChoices] = useState<Record<number, "user" | "admin">>({});
  const [placementKey, setPlacementKey] = useState("");
  const [placementKind, setPlacementKind] = useState<"banner" | "offerwall" | "vote_list">("banner");
  const [providerLabel, setProviderLabel] = useState("");
  const [placementActive, setPlacementActive] = useState(false);
  const [consentRequired, setConsentRequired] = useState(true);
  const [configurationJson, setConfigurationJson] = useState('{\n  "surface": "ops-preview"\n}');
  const [seasonKey, setSeasonKey] = useState("");
  const [seasonDisplayName, setSeasonDisplayName] = useState("");
  const [rotationConfirmation, setRotationConfirmation] = useState("");
  const [nextSeasonKey, setNextSeasonKey] = useState("");
  const [nextSeasonDisplayName, setNextSeasonDisplayName] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [targetEpochInput, setTargetEpochInput] = useState<number>(1);
  const currentWorldId = "echoes-of-aurion-global";
  const adminPlayerInput = useMemo(() => ({ limit: 25, ...(submittedPlayerSearch ? { query: submittedPlayerSearch } : {}) }), [submittedPlayerSearch]);

  const profile = trpc.player.me.useQuery();
  const leaderboard = trpc.leaderboard.list.useQuery({ limit: 10 });
  const guildCreate = trpc.guild.create.useMutation({ onSuccess: () => { void utils.player.me.invalidate(); setGuildName(""); setGuildTag(""); } });
  const assets = trpc.admin.assets.list.useQuery(undefined, { enabled: user?.role === "admin" });
  const assignments = trpc.admin.assets.listAssignments.useQuery(undefined, { enabled: user?.role === "admin" });
  const placements = trpc.admin.monetization.list.useQuery(undefined, { enabled: user?.role === "admin" });
  const adminPlayers = trpc.admin.players.list.useQuery(adminPlayerInput, { enabled: user?.role === "admin" });
  const assetUpload = trpc.admin.assets.upload.useMutation({ onSuccess: () => { void utils.admin.assets.list.invalidate(); setGlbDisplayName(""); setUploadError(null); } });
  const assetReview = trpc.admin.assets.setReview.useMutation({ onSuccess: () => { void utils.admin.assets.list.invalidate(); } });
  const assetAssign = trpc.admin.assets.assign.useMutation({ onSuccess: () => { void utils.admin.assets.listAssignments.invalidate(); setAssignmentTargets({}); } });
  const placementUpsert = trpc.admin.monetization.upsert.useMutation({ onSuccess: () => { void utils.admin.monetization.list.invalidate(); setPlacementKey(""); setProviderLabel(""); } });
  const roleUpdate = trpc.admin.players.setRole.useMutation({ onSuccess: () => { void utils.admin.players.list.invalidate(); setRoleChoices({}); } });
  const liveAdminRanking = trpc.admin.rankings.live.useQuery({ limit: 25 }, { enabled: user?.role === "admin" });
  const managedSeasons = trpc.admin.rankings.seasons.useQuery({ limit: 25 }, { enabled: user?.role === "admin" });
  const selectedSeasonSnapshots = trpc.admin.rankings.snapshots.useQuery({ seasonId: selectedSeasonId, limit: 50 }, { enabled: user?.role === "admin" && Boolean(selectedSeasonId) });
  const seasonStart = trpc.admin.rankings.startSeason.useMutation({ onSuccess: () => { void utils.admin.rankings.seasons.invalidate(); setSeasonKey(""); setSeasonDisplayName(""); } });
  const seasonRotation = trpc.admin.rankings.rotateSeason.useMutation({ onSuccess: () => { void utils.admin.rankings.seasons.invalidate(); void utils.admin.rankings.live.invalidate(); setRotationConfirmation(""); setNextSeasonKey(""); setNextSeasonDisplayName(""); } });

  const civHistory = trpc.history.getHistory.useQuery({ worldId: currentWorldId });
  const civActive = trpc.history.getActiveCivilization.useQuery({ worldId: currentWorldId });
  const civRuins = trpc.history.getVisibleRuins.useQuery({ worldId: currentWorldId });
  const civRebirth = trpc.history.getRebirthCandidates.useQuery({ worldId: currentWorldId });
  const civOrchestrate = trpc.history.triggerOrchestration.useMutation({
    onSuccess: () => {
      void utils.history.getHistory.invalidate();
      void utils.history.getActiveCivilization.invalidate();
      void utils.history.getVisibleRuins.invalidate();
      void utils.history.getRebirthCandidates.invalidate();
    }
  });

  const [selectedNpc, setSelectedNpc] = useState<"lyra" | "orun">("lyra");
  const [rollbackVersion, setRollbackVersion] = useState<number | "">("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const confirmedPolicy = trpc.npcPolicy.getConfirmed.useQuery({ npcId: selectedNpc }, { enabled: user?.role === "admin" });
  const policyHistory = trpc.npcPolicy.getHistory.useQuery({ npcId: selectedNpc }, { enabled: user?.role === "admin" });

  const rollbackMutation = trpc.admin.npcPolicy.rollback.useMutation({
    onSuccess: () => {
      void utils.npcPolicy.getConfirmed.invalidate({ npcId: selectedNpc });
      void utils.npcPolicy.getHistory.invalidate({ npcId: selectedNpc });
      setRollbackVersion("");
      setRollbackReason("");
      setRollbackError(null);
    },
    onError: (err) => {
      setRollbackError(err.message);
    }
  });

  const state = profile.data;
  const activeSeason = managedSeasons.data?.find(season => season.status === "active");

  const handleGlbFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".glb")) {
      setUploadError("Nur binäre GLB-Dateien (.glb) dürfen aufgenommen werden.");
      return;
    }
    if (file.size > MAX_GLB_BYTES) {
      setUploadError("GLB-Dateien dürfen höchstens 24 MiB groß sein.");
      return;
    }
    if (!glbDisplayName.trim()) {
      setUploadError("Vergib vor dem Upload einen Anzeigenamen.");
      return;
    }
    setReadingAsset(true);
    setUploadError(null);
    try {
      assetUpload.mutate({ displayName: glbDisplayName.trim(), assetType: glbAssetType, contentBase64: await readFileAsBase64(file) });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Die GLB-Datei konnte nicht vorbereitet werden.");
    } finally {
      setReadingAsset(false);
    }
  };

  if (profile.isLoading) return <DashboardLayout><div className="min-h-full bg-[#06131a] p-8 text-sm text-cyan-100/70">Operationsdaten werden serverseitig abgeglichen…</div></DashboardLayout>;
  if (profile.isError || !state) return <DashboardLayout><div className="min-h-full bg-[#06131a] p-8 text-sm text-red-200">Operationsdaten konnten nicht geladen werden. Bitte starte die Sitzung erneut.</div></DashboardLayout>;

  return <DashboardLayout><div className="min-h-full bg-[radial-gradient(circle_at_top_right,rgba(45,226,207,.13),transparent_38%),#06131a] p-2 text-slate-100 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-cyan-200/10 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs tracking-[.24em] text-cyan-300">AURION // OPERATIONS</p><h1 className="mt-2 text-3xl font-semibold text-amber-100">Expeditionsverwaltung</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Spielwerte, Gilden und Assets werden serverseitig geführt. Der Browser zeigt bestätigte Zustände, setzt sie aber nicht verbindlich.</p></div><Button asChild variant="outline" className="border-amber-300/30 bg-transparent text-amber-100 hover:bg-amber-200/10"><Link href="/"><ExternalLink className="mr-2 h-4 w-4" />Zum Spiel</Link></Button></header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="PROGRESSIONS-TRACKS" value={state.progression.tracks.length} icon={Sparkles} /><Stat label="AURION-PUNKTE" value={state.profile.aurionPoints} icon={Trophy} /><Stat label="SIEGE" value={state.profile.victories} icon={Crown} /><Stat label="WAFFENPFAD" value={state.progression.tracks.filter(track => track.trackKind === "weapon").length} icon={Shield} /></section>
      <Tabs defaultValue="profile" className="w-full"><TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0"><TabsTrigger value="profile">Profil & Gilde</TabsTrigger><TabsTrigger value="endgame">Endgame</TabsTrigger><TabsTrigger value="ranking">Ranglisten</TabsTrigger><TabsTrigger value="civilization">Zivilisation</TabsTrigger>{user?.role === "admin" && <><TabsTrigger value="admin">Admin</TabsTrigger><TabsTrigger value="game-dev">Game Dev Studio</TabsTrigger><TabsTrigger value="authoring">World · Quest · Dungeon</TabsTrigger><TabsTrigger value="causality">Kausalität</TabsTrigger><TabsTrigger value="replay">Replay</TabsTrigger><TabsTrigger value="archives">Archives</TabsTrigger><TabsTrigger value="crosszone">Cross-Zone Sync</TabsTrigger><TabsTrigger value="global-state">Global State</TabsTrigger><TabsTrigger value="recovery">Recovery</TabsTrigger><TabsTrigger value="system">System Status</TabsTrigger></>}</TabsList>
        <TabsContent value="profile" className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Resonanzprofil</CardTitle><CardDescription>Freischaltungen folgen nur bestätigtem serverseitigem Fortschritt.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Badge variant="outline">klassenlos</Badge><Badge variant="outline">Aggregate Level/XP: WASD-Snapshot ausstehend</Badge>{state.progression.tracks.map(track => <Badge key={`${track.trackKind}:${track.trackId}`} className="bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/10">{track.trackKind === "weapon" ? "Waffe" : "Skill"}: {track.trackId} · L{track.levelExact}</Badge>)}</div><div className="rounded-xl border border-cyan-200/10 bg-cyan-400/[.035] p-4"><p className="text-xs tracking-[.14em] text-cyan-200/60">GILDENSTATUS</p>{state.guild ? <div className="mt-2 flex items-center gap-3"><Users className="h-5 w-5 text-cyan-300" /><div><p className="font-medium">[{state.guild.guild.tag}] {state.guild.guild.name}</p><p className="text-sm text-slate-400">Rolle: {state.guild.membership.role} · Saisonpunkte: {state.guild.guild.seasonPoints}</p></div></div> : <p className="mt-2 text-sm text-slate-300">Noch keinem Sternwartenpakt beigetreten.</p>}</div></CardContent></Card>
          <Card className="border-cyan-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Sternwartenpakt gründen</CardTitle><CardDescription>Eine aktive Mitgliedschaft pro Spieler. Rollen und Beiträge werden serverseitig geprüft.</CardDescription></CardHeader><CardContent><form className="space-y-4" onSubmit={event => { event.preventDefault(); guildCreate.mutate({ name: guildName, tag: guildTag }); }}><div className="space-y-2"><Label htmlFor="guildName">Gildenname</Label><Input id="guildName" value={guildName} maxLength={48} onChange={event => setGuildName(event.target.value)} placeholder="Pakt der Sternenruinen" disabled={Boolean(state.guild)} /></div><div className="space-y-2"><Label htmlFor="guildTag">Tag</Label><Input id="guildTag" value={guildTag} maxLength={8} onChange={event => setGuildTag(event.target.value.toUpperCase())} placeholder="AURION" disabled={Boolean(state.guild)} /></div>{guildCreate.error && <p className="text-sm text-red-300">{guildCreate.error.message}</p>}<Button type="submit" disabled={!guildName || guildTag.length < 2 || guildCreate.isPending || Boolean(state.guild)} className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-300">{guildCreate.isPending ? "Pakt wird geprüft…" : "Gilde serverseitig gründen"}</Button></form></CardContent></Card></TabsContent>
        <TabsContent value="endgame" className="mt-5 space-y-5">
          <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Boxes className="h-5 w-5" />Reliktinventar</CardTitle><CardDescription>Instanzen, Qualität und Affixe stammen vollständig aus bestätigten serverseitigen Drop-Receipts.</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2">{state.inventory.map(item => <div key={item.id} className="rounded-xl border border-cyan-200/10 bg-cyan-400/[.03] p-4"><div className="flex items-center justify-between gap-2"><p className="font-medium text-amber-50">{item.baseItemKey.replaceAll("_", " ")}</p><Badge variant="outline" className={item.quality === "unique" ? "border-amber-300/60 text-amber-100" : item.quality === "set" ? "border-emerald-300/50 text-emerald-100" : "border-cyan-300/30 text-cyan-100"}>{item.quality}</Badge></div><p className="mt-1 text-xs text-slate-400">Gegenstandsstufe {item.itemLevel}{item.setKey ? ` · Set: ${item.setKey}` : ""}</p><div className="mt-3 flex flex-wrap gap-1">{item.affixes.map(affix => <Badge key={`${item.id}-${affix.key}`} className="bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/10">{affix.slot}: {affix.key} · {Object.entries(affix.stats).map(([key, value]) => `${key} +${value}`).join(", ")}</Badge>)}{!item.affixes.length && <span className="text-xs text-slate-500">Keine Affixe</span>}</div></div>)}{!state.inventory.length && <p className="col-span-full py-8 text-sm text-slate-400">Noch keine serverbestätigten Reliktinstanzen. Beute erscheint erst nach validierten Expeditionsergebnissen.</p>}</div></CardContent></Card>
            <div className="space-y-5"><Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Set-Fortschritt</CardTitle><CardDescription>Aktive Boni werden aus deinen gespeicherten Set-Instanzen berechnet.</CardDescription></CardHeader><CardContent className="space-y-3">{state.setBonuses.map(bonus => <div key={`${bonus.setKey}-${bonus.piecesOwned}`} className="rounded-lg border border-emerald-300/15 p-3"><p className="font-medium text-emerald-100">{bonus.displayName}</p><p className="mt-1 text-xs text-slate-400">{bonus.piecesOwned}/{bonus.piecesTotal} Teile</p><div className="mt-2 flex flex-wrap gap-1">{Object.entries(bonus.modifiers).map(([key, value]) => <Badge key={key} variant="outline" className="border-emerald-300/30 text-emerald-100">{key} +{value}</Badge>)}</div></div>)}{!state.setBonuses.length && <p className="text-sm text-slate-400">Noch kein Setbonus aktiv.</p>}</CardContent></Card>
              <Card className="border-cyan-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Klassenlose Progression</CardTitle><CardDescription>Aurion akzeptiert keine Klassenwahl. Fähigkeiten und Waffenpfade erscheinen nur aus bestätigten WASD-Progressionsreceipts.</CardDescription></CardHeader><CardContent className="space-y-3"><Badge variant="outline">Charakter: {state.progression.characterId ?? "noch ohne Progressionsreceipt"}</Badge><p className="text-sm text-slate-400">{state.progression.tracks.length ? `${state.progression.tracks.length} dynamische Tracks bestätigt.` : "Noch keine dynamischen Skill- oder Waffenstände bestätigt."}</p></CardContent></Card></div>
          </section>
          <section className="grid gap-5 md:grid-cols-2"><Card className="border-cyan-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Dynamische Progression</CardTitle><CardDescription>Read-only Projektion der bestätigten Skill- und Waffenstände; Aurion berechnet keine Levelkurve.</CardDescription></CardHeader><CardContent className="space-y-2">{state.progression.tracks.map(track => <div key={`${track.trackKind}:${track.trackId}`} className="flex items-center justify-between rounded-lg border border-cyan-200/10 p-3"><span className="font-medium">{track.trackKind === "weapon" ? "Waffe" : "Skill"} · {track.trackId}</span><span className="text-sm text-cyan-100">Stufe {track.levelExact}</span></div>)}{!state.progression.tracks.length && <p className="text-sm text-slate-400">Noch keine bestätigte dynamische Progression.</p>}</CardContent></Card><Card className="border-cyan-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Langzeitmotiv</CardTitle><CardDescription>Gildenfortschritt, Set-Resonanz und Waffenmeisterschaft verbinden einzelne Expeditionen mit saisonalen Zielen.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm text-slate-300">{state.guild ? <><p className="font-medium text-cyan-100">[{state.guild.guild.tag}] {state.guild.guild.name}</p><p>Gildenstufe {state.guild.guild.level} · Saisonpunkte {state.guild.guild.seasonPoints}</p><p className="text-xs text-slate-400">Rolle: {state.guild.membership.role}. Beiträge bleiben nur mit serverseitigen Receipts gültig.</p></> : <p>Gründe oder finde einen Sternwartenpakt, um gemeinsame saisonale Ziele freizuschalten.</p>}</CardContent></Card></section>
        </TabsContent>
        <TabsContent value="ranking" className="mt-5"><Card className="border-cyan-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Saison-Rangliste</CardTitle><CardDescription>Sortiert nach bestätigten Saisonpunkten, Siegen und Stufe.</CardDescription></CardHeader><CardContent><div className="divide-y divide-cyan-200/10">{leaderboard.data?.map((entry, index) => <div key={entry.userId} className="flex items-center gap-4 py-3"><span className="w-7 text-center text-sm text-cyan-200">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{entry.name || `Explorer ${entry.userId}`}</p><p className="text-xs text-slate-400">Stufe {entry.level}</p></div><div className="text-right text-sm"><p className="text-amber-100">{entry.seasonPoints} SP</p><p className="text-slate-400">{entry.victories} Siege</p></div></div>)}{!leaderboard.data?.length && <p className="py-8 text-sm text-slate-400">Noch keine bestätigten Expeditionswerte.</p>}</div></CardContent></Card></TabsContent>

        <TabsContent value="civilization" className="mt-5 space-y-5">
          <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <Card className="border-amber-200/15 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-100">
                  <Landmark className="h-5 w-5" /> Aktive Zivilisationsdynamik
                </CardTitle>
                <CardDescription>
                  Werte des aktuellen Zeitalters. Die Berechnungen basieren auf deterministischen WASD-Spielverträgen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {civActive.data ? (
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                    <div className="rounded-xl border border-cyan-200/10 bg-cyan-400/[.03] p-4">
                      <p className="text-xs tracking-[.14em] text-cyan-200/60">EPOCHE</p>
                      <p className="mt-2 text-xl font-bold text-amber-100">Epoche {civActive.data.worldEpoch}</p>
                      <p className="text-xs text-slate-400 mt-1">ID: {civActive.data.civilizationId.slice(0, 16)}…</p>
                    </div>
                    <div className="rounded-xl border border-cyan-200/10 bg-cyan-400/[.03] p-4">
                      <p className="text-xs tracking-[.14em] text-cyan-200/60">POPULATION</p>
                      <p className="mt-2 text-xl font-bold text-amber-100">{civActive.data.population.toLocaleString()}</p>
                      <p className="text-xs text-slate-400 mt-1">Überlebende Bürger</p>
                    </div>
                    <div className="rounded-xl border border-cyan-200/10 bg-cyan-400/[.03] p-4">
                      <p className="text-xs tracking-[.14em] text-cyan-200/60">STABILITÄT</p>
                      <p className="mt-2 text-xl font-bold text-amber-100">{(civActive.data.stability * 100).toFixed(0)}%</p>
                      <p className="text-xs text-slate-400 mt-1">Gefahr des Verfalls</p>
                    </div>
                    <div className="rounded-xl border border-cyan-200/10 bg-cyan-400/[.03] p-4">
                      <p className="text-xs tracking-[.14em] text-cyan-200/60">GEFAHRENINDEX</p>
                      <p className="mt-2 text-xl font-bold text-amber-100">{(civActive.data.hazardIndex * 100).toFixed(0)}%</p>
                      <p className="text-xs text-slate-400 mt-1">Umweltbelastung</p>
                    </div>
                    <div className="rounded-xl border border-cyan-200/10 bg-cyan-400/[.03] p-4">
                      <p className="text-xs tracking-[.14em] text-cyan-200/60">KNAPPHEITSSCHWERE</p>
                      <p className="mt-2 text-xl font-bold text-amber-100">{(civActive.data.scarcitySeverity * 100).toFixed(0)}%</p>
                      <p className="text-xs text-slate-400 mt-1">Ressourcenmangel</p>
                    </div>
                    <div className="rounded-xl border border-cyan-200/10 bg-cyan-400/[.03] p-4">
                      <p className="text-xs tracking-[.14em] text-cyan-200/60">LETZTE RESOLUTION</p>
                      <p className="mt-2 text-xl font-bold text-amber-100">Epoch-Index {civActive.data.lastResolutionIndex}</p>
                      <p className="text-xs text-slate-400 mt-1">Zuletzt aktualisiert</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-500/25 bg-red-500/[.03] p-6 text-center space-y-3">
                    <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
                    <p className="font-semibold text-red-200">Kollaps-Phase aktiv</p>
                    <p className="text-sm text-slate-300 max-w-md mx-auto">
                      Die aktive Zivilisation dieses Weltbereichs ist untergegangen. Die entstandenen Ruinen warten auf Entdeckung, Erforschung und die schlussendliche Wiedergeburt einer neuen Ansiedlung.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-5">
              {user?.role === "admin" && (
                <Card className="border-cyan-300/20 bg-slate-950/70">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-amber-100">
                      <RefreshCw className="h-5 w-5" /> Loop-Orchestrierung
                    </CardTitle>
                    <CardDescription>
                      Zivilisationsschleife für diese Epoche manuell berechnen und fortschreiben.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="targetEpoch">Epoche für Berechnungs-Eingabe</Label>
                      <Input
                        id="targetEpoch"
                        type="number"
                        min={1}
                        value={targetEpochInput}
                        className="bg-slate-950 border-cyan-200/20 text-cyan-100"
                        onChange={(e) => setTargetEpochInput(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <Button
                      className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-300"
                      disabled={civOrchestrate.isPending}
                      onClick={() => {
                        civOrchestrate.mutate({
                          worldId: currentWorldId,
                          epoch: targetEpochInput,
                        });
                      }}
                    >
                      {civOrchestrate.isPending ? "Schleife wird berechnet…" : "Loop-Schleife triggern"}
                    </Button>
                    {civOrchestrate.data && (
                      <div className="p-3 rounded border border-emerald-500/25 bg-emerald-500/[.05] text-xs text-emerald-200">
                        Ergebnis: <strong>{civOrchestrate.data.action}</strong>
                        {civOrchestrate.data.ruinId && <span> (Ruin-ID: {civOrchestrate.data.ruinId})</span>}
                        {civOrchestrate.data.civilizationId && <span> (Civ-ID: {civOrchestrate.data.civilizationId})</span>}
                        {civOrchestrate.data.candidateId && <span> (Kandidat-ID: {civOrchestrate.data.candidateId})</span>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              
              <Card className="border-cyan-200/15 bg-slate-950/70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-amber-100">
                    <Hourglass className="h-5 w-5" /> Wiedergeburtskandidaten
                  </CardTitle>
                  <CardDescription>
                    Mögliche Orte für die Neuentstehung einer Siedlung.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {civRebirth.data?.map(candidate => (
                    <div key={candidate.candidateId} className="rounded-lg border border-cyan-200/10 p-3 text-sm bg-slate-950/40">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-5 flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-cyan-300" /> {candidate.locationIdentity}
                        </span>
                        <Badge variant="outline" className="border-amber-300/30 text-amber-100">{candidate.state}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">ID: {candidate.candidateId.slice(0, 16)}…</p>
                      <p className="text-xs text-slate-500 mt-0.5">Seed-Digest: {candidate.candidateSeedDigest.slice(0, 16)}…</p>
                    </div>
                  ))}
                  {!civRebirth.data?.length && (
                    <p className="text-sm text-slate-400 py-4 text-center">Keine aktiven Wiedergeburtskandidaten erfasst.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-2">
            <Card className="border-cyan-200/15 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-100">
                  <History className="h-5 w-5" /> Weltgeschichte & Chronik
                </CardTitle>
                <CardDescription>
                  Die historisch unveränderliche Zeitleiste dieses Reiches.
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[400px] overflow-auto divide-y divide-cyan-200/10">
                {civHistory.data?.map(event => (
                  <div key={event.eventId} className="py-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-200">Epoche {event.worldEpoch}</span>
                      <Badge className={event.eventType === "CIVILIZATION_COLLAPSE" ? "bg-red-500/10 text-red-200 hover:bg-red-500/10" : "bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/10"}>
                        {event.eventType}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      Sequenz: {event.occurredSequence} · Revision: {event.sourceRevision}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      Receipt-ID: {event.sourceReceiptId}
                    </p>
                  </div>
                ))}
                {!civHistory.data?.length && (
                  <p className="text-sm text-slate-400 py-8 text-center">Die Chronik dieser Welt ist noch leer.</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-cyan-200/15 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-100">
                  <Boxes className="h-5 w-5" /> Entdeckte Ruinen
                </CardTitle>
                <CardDescription>
                  Überbleibsel früherer Zeitalter, die von Spielern erforscht werden können.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {civRuins.data?.map(ruin => (
                  <div key={ruin.ruinId} className="rounded-lg border border-cyan-200/10 p-3 text-sm bg-slate-950/40">
                    <div className="flex items-center justify-between">
                      <b className="text-amber-50">{ruin.locationIdentity}</b>
                      <Badge variant="outline" className="border-cyan-300/30 text-cyan-100">{ruin.state}</Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Urahn: {ruin.originCivilizationId.slice(0, 16)}…</p>
                    <p className="text-xs text-slate-400">Collapse-Epoche: {ruin.worldEpoch}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Ruleset: {ruin.rulesetVersion}</p>
                  </div>
                ))}
                {!civRuins.data?.length && (
                  <p className="text-sm text-slate-400 py-8 text-center">Aktuell sind keine historischen Ruinen freigelegt.</p>
                )}
              </CardContent>
            </Card>
          </section>
        </TabsContent>
        {user?.role === "admin" && <TabsContent value="admin" className="mt-5 space-y-5">
          <ForumAdminComposer />
          <ForumAdminEditor />
          <GlbSubmissionReview />
          <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Users className="h-5 w-5" />Spielerverzeichnis</CardTitle><CardDescription>Serverseitig aggregierte Profile; die Suche akzeptiert nur begrenzte Namens- und E-Mail-Fragmente.</CardDescription></CardHeader><CardContent className="space-y-4"><form className="flex gap-2" onSubmit={event => { event.preventDefault(); setSubmittedPlayerSearch(playerSearch.trim()); }}><Input value={playerSearch} maxLength={64} onChange={event => setPlayerSearch(event.target.value)} placeholder="Name oder E-Mail suchen" /><Button type="submit" variant="outline" className="border-cyan-300/30"><Search className="h-4 w-4" /><span className="sr-only">Suchen</span></Button></form><div className="max-h-80 divide-y divide-cyan-200/10 overflow-auto">{adminPlayers.data?.map(player => <div key={player.userId} className="flex items-center gap-3 py-3 text-sm"><div className="min-w-0 flex-1"><p className="truncate font-medium text-amber-50">{player.name || `Explorer ${player.userId}`}</p><p className="truncate text-xs text-slate-400">{player.email || "Keine E-Mail"} · {player.role}</p></div><div className="text-right text-xs text-cyan-100/80"><p>Stufe {player.level ?? 1} · {player.victories ?? 0} Siege</p><p>{player.guildTag ? `[${player.guildTag}] ${player.guildName}` : "ohne Gilde"}</p></div></div>)}{!adminPlayers.data?.length && <p className="py-8 text-sm text-slate-400">Keine passenden serverseitig gespeicherten Spielerprofile.</p>}</div></CardContent></Card>
            <Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><BadgeDollarSign className="h-5 w-5" />Platzierungsprinzip</CardTitle><CardDescription>Konfiguration speichert nur sichtbare Placementdaten, niemals Provider-Schlüssel oder Tokens.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm text-slate-300"><p>Aktivierungen sind explizit und Einwilligung bleibt je Fläche verbindlich.</p><p>Reward- und Provider-Callbacks benötigen weiterhin eine getrennte serverseitige Verifikation.</p><Badge variant="outline" className="border-cyan-300/30 text-cyan-100">kein Secret im Browser</Badge></CardContent></Card></section>

          <section className="grid gap-5 xl:grid-cols-2"><Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Upload className="h-5 w-5" />GLB aufnehmen</CardTitle><CardDescription>Maximal 24 MiB; der Server prüft GLB-v2-Kopf, Länge und SHA-256, schreibt die Bytes nach S3 und legt die Metadaten als Entwurf an.</CardDescription></CardHeader><CardContent><div className="space-y-4"><div className="space-y-2"><Label htmlFor="glbName">Anzeigename</Label><Input id="glbName" value={glbDisplayName} maxLength={120} onChange={event => setGlbDisplayName(event.target.value)} placeholder="Explorer Mk II" /></div><div className="space-y-2"><Label htmlFor="glbType">Asset-Typ</Label><select id="glbType" value={glbAssetType} onChange={event => setGlbAssetType(event.target.value as AssetType)} className="flex h-10 w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 text-sm"><option value="character">Character</option><option value="enemy">Enemy</option><option value="weapon">Weapon</option><option value="armor">Armor</option><option value="arena">Arena</option></select></div><div className="space-y-2"><Label htmlFor="glbUpload">Binäres GLB</Label><Input id="glbUpload" type="file" accept=".glb,model/gltf-binary" disabled={readingAsset || assetUpload.isPending} onChange={event => { void handleGlbFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></div>{(uploadError || assetUpload.error) && <p className="text-sm text-red-300">{uploadError || assetUpload.error?.message}</p>}<p className="text-xs text-cyan-100/55">{readingAsset ? "Binärdatei wird lokal vorbereitet…" : assetUpload.isPending ? "S3-Aufnahme und Metadaten-Readback laufen…" : "Nach Aufnahme muss ein Admin das Asset freigeben."}</p></div></CardContent></Card>
            <Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Save className="h-5 w-5" />Platzierung speichern</CardTitle><CardDescription>Die JSON-Konfiguration wird als öffentliche, nicht geheime Platzierungsbeschreibung validiert.</CardDescription></CardHeader><CardContent><form className="space-y-3" onSubmit={event => { event.preventDefault(); placementUpsert.mutate({ placementKey, kind: placementKind, providerLabel, active: placementActive, consentRequired, configurationJson }); }}><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="placementKey">Placement-Key</Label><Input id="placementKey" value={placementKey} onChange={event => setPlacementKey(event.target.value.toLowerCase())} placeholder="mission_banner" /></div><div className="space-y-2"><Label htmlFor="providerLabel">Provider-Label</Label><Input id="providerLabel" value={providerLabel} onChange={event => setProviderLabel(event.target.value)} placeholder="Verifizierter Provider" /></div></div><div className="space-y-2"><Label htmlFor="placementKind">Typ</Label><select id="placementKind" value={placementKind} onChange={event => setPlacementKind(event.target.value as "banner" | "offerwall" | "vote_list")} className="flex h-10 w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 text-sm"><option value="banner">Banner</option><option value="offerwall">Offerwall</option><option value="vote_list">Vote-Liste</option></select></div><div className="space-y-2"><Label htmlFor="placementConfig">Öffentliche JSON-Konfiguration</Label><textarea id="placementConfig" value={configurationJson} onChange={event => setConfigurationJson(event.target.value)} rows={4} className="flex w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 py-2 font-mono text-xs" /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={placementActive} onChange={event => setPlacementActive(event.target.checked)} /> Aktiv</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consentRequired} onChange={event => setConsentRequired(event.target.checked)} /> Einwilligung erforderlich</label>{placementUpsert.error && <p className="text-sm text-red-300">{placementUpsert.error.message}</p>}<Button type="submit" disabled={!placementKey || !providerLabel || placementUpsert.isPending} className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-300">{placementUpsert.isPending ? "Server prüft…" : "Platzierung speichern"}</Button></form></CardContent></Card></section>

          <section className="grid gap-5 xl:grid-cols-2"><Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Boxes className="h-5 w-5" />GLB-Katalog & Review</CardTitle><CardDescription>Nur freigegebene Assets dürfen einer Spielfigur, einem Gegner, einer Waffe, Rüstung oder Arena aktiv zugewiesen werden.</CardDescription></CardHeader><CardContent className="space-y-3">{assets.data?.map(asset => <div key={asset.id} className="rounded-lg border border-cyan-200/10 p-3 text-sm"><div className="flex flex-wrap items-center gap-2"><b className="mr-auto">{asset.displayName}</b><AssetStatus status={asset.status} /><Badge variant="outline">{asset.assetType}</Badge></div><p className="mt-1 text-xs text-slate-400">{asset.bytes.toLocaleString()} Bytes · {asset.sha256.slice(0, 12)}…</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="border-emerald-300/30 text-emerald-100" disabled={assetReview.isPending} onClick={() => assetReview.mutate({ assetId: asset.id, status: "approved" })}><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Freigeben</Button><Button size="sm" variant="outline" className="border-red-300/30 text-red-200" disabled={assetReview.isPending} onClick={() => assetReview.mutate({ assetId: asset.id, status: "rejected" })}><XCircle className="mr-1 h-3.5 w-3.5" />Ablehnen</Button><Button size="sm" variant="outline" className="border-slate-400/30 text-slate-300" disabled={assetReview.isPending} onClick={() => assetReview.mutate({ assetId: asset.id, status: "archived" })}><Archive className="mr-1 h-3.5 w-3.5" />Archivieren</Button></div>{asset.status === "approved" && <div className="mt-3 flex gap-2"><Input value={assignmentTargets[asset.id] ?? ""} maxLength={120} onChange={event => setAssignmentTargets(current => ({ ...current, [asset.id]: event.target.value }))} placeholder="Zielschlüssel, z. B. explorer" /><Button size="sm" disabled={!assignmentTargets[asset.id] || assetAssign.isPending} onClick={() => assetAssign.mutate({ assetId: asset.id, targetType: asset.assetType, targetKey: assignmentTargets[asset.id]!, expectedActiveAssetId: assignments.data?.find(entry => entry.targetType === asset.assetType && entry.targetKey === assignmentTargets[asset.id] && entry.active === 1)?.assetId ?? null })}><Link2 className="mr-1 h-3.5 w-3.5" />Zuweisen</Button></div>}</div>)}{!assets.data?.length && <p className="text-sm text-slate-400">Noch keine GLB-Metadaten eingetragen.</p>}{(assetReview.error || assetAssign.error) && <p className="text-sm text-red-300">{assetReview.error?.message || assetAssign.error?.message}</p>}</CardContent></Card>
            <Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Aktive Zuweisungen & Flächen</CardTitle><CardDescription>Die zuletzt bestätigte aktive Zuweisung überschreibt serverseitig eine vorherige Zuweisung auf dasselbe Ziel.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="space-y-2">{assignments.data?.map(assignment => <div key={assignment.id} className="rounded-lg border border-cyan-200/10 p-3 text-sm"><p className="font-medium">{assignment.targetType}:{assignment.targetKey}</p><p className="text-xs text-slate-400">{assignment.displayName} · {assignment.active ? "aktiv" : "historisch"}</p></div>)}{!assignments.data?.length && <p className="text-sm text-slate-400">Noch keine bestätigten Zielzuweisungen.</p>}</div><div className="border-t border-cyan-200/10 pt-4 space-y-2">{placements.data?.map(placement => <div key={placement.id} className="rounded-lg border border-cyan-200/10 p-3 text-sm"><div className="flex items-center justify-between gap-2"><b>{placement.placementKey}</b><Badge variant="outline">{placement.kind}</Badge></div><p className="mt-1 text-xs text-slate-400">{placement.active ? "Aktiv" : "Deaktiviert"} · Einwilligung: {placement.consentRequired ? "erforderlich" : "nicht erforderlich"}</p></div>)}{!placements.data?.length && <p className="text-sm text-slate-400">Keine gespeicherten Werbe-, Offerwall- oder Vote-Konfigurationen.</p>}</div></CardContent></Card></section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Card className="border-amber-200/15 bg-slate-950/70">
              <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Shield className="h-5 w-5" />Rollenverwaltung</CardTitle><CardDescription>Die eigene Rolle und die Rolle des Projekteigentümers sind serverseitig gegen Änderungen über diese Konsole geschützt.</CardDescription></CardHeader>
              <CardContent className="space-y-3"><div className="max-h-96 divide-y divide-cyan-200/10 overflow-auto">{adminPlayers.data?.map(player => {
                const selectedRole = roleChoices[player.userId] ?? player.role;
                const isSelf = player.userId === user.id;
                return <div key={`role-${player.userId}`} className="flex flex-wrap items-center gap-2 py-3 text-sm"><div className="min-w-0 flex-1"><p className="truncate font-medium">{player.name || `Explorer ${player.userId}`}</p><p className="text-xs text-slate-400">{player.email || "Keine E-Mail"}</p></div><select value={selectedRole} disabled={isSelf || roleUpdate.isPending} onChange={event => setRoleChoices(current => ({ ...current, [player.userId]: event.target.value as "user" | "admin" }))} className="h-9 rounded-md border border-cyan-200/20 bg-slate-950 px-2 text-xs"><option value="user">user</option><option value="admin">admin</option></select><Button size="sm" variant="outline" className="border-cyan-300/30" disabled={isSelf || selectedRole === player.role || roleUpdate.isPending} onClick={() => roleUpdate.mutate({ userId: player.userId, role: selectedRole })}>Bestätigen</Button></div>;
              })}{!adminPlayers.data?.length && <p className="py-8 text-sm text-slate-400">Keine verwaltbaren Profile in der aktuellen Suche.</p>}</div>{roleUpdate.error && <p className="text-sm text-red-300">{roleUpdate.error.message}</p>}</CardContent>
            </Card>
            <Card className="border-amber-200/15 bg-slate-950/70">
              <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Trophy className="h-5 w-5" />Live-Rangliste</CardTitle><CardDescription>Administrative Einsicht zeigt die aktuellen bestätigten Saisonpunkte; die öffentliche Rangliste bleibt davon getrennt.</CardDescription></CardHeader>
              <CardContent className="divide-y divide-cyan-200/10">{liveAdminRanking.data?.map((entry, index) => <div key={entry.userId} className="flex items-center gap-3 py-3 text-sm"><span className="w-6 text-cyan-200">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{entry.name || `Explorer ${entry.userId}`}</p><p className="text-xs text-slate-400">{entry.email || "keine E-Mail"}</p></div><p className="text-right text-xs text-amber-100">{entry.seasonPoints} SP<br /><span className="text-slate-400">{entry.victories} Siege · L{entry.level}</span></p></div>)}{!liveAdminRanking.data?.length && <p className="py-8 text-sm text-slate-400">Noch keine bestätigten Saisonwerte.</p>}</CardContent>
            </Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Card className="border-amber-200/15 bg-slate-950/70">
              <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Sparkles className="h-5 w-5" />Saison starten</CardTitle><CardDescription>Start ist nur ohne aktive Saison möglich und verwendet einen Idempotenzschlüssel gegen doppelte Ausführung.</CardDescription></CardHeader>
              <CardContent><form className="space-y-3" onSubmit={event => { event.preventDefault(); seasonStart.mutate({ seasonKey, displayName: seasonDisplayName, idempotencyKey: `season-start:${seasonKey}` }); }}><div className="space-y-2"><Label htmlFor="seasonKey">Saison-Key</Label><Input id="seasonKey" value={seasonKey} onChange={event => setSeasonKey(event.target.value.toLowerCase())} placeholder="aurion_s01" disabled={Boolean(activeSeason)} /></div><div className="space-y-2"><Label htmlFor="seasonName">Anzeigename</Label><Input id="seasonName" value={seasonDisplayName} onChange={event => setSeasonDisplayName(event.target.value)} placeholder="Sternwarte: Erwachen" disabled={Boolean(activeSeason)} /></div>{activeSeason && <p className="text-xs text-amber-100">Aktive Saison: {activeSeason.displayName} ({activeSeason.seasonKey})</p>}{seasonStart.error && <p className="text-sm text-red-300">{seasonStart.error.message}</p>}<Button type="submit" disabled={Boolean(activeSeason) || !seasonKey || !seasonDisplayName || seasonStart.isPending} className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-300">{seasonStart.isPending ? "Saison wird bestätigt…" : "Saison serverseitig starten"}</Button></form></CardContent>
            </Card>
            <Card className="border-red-300/20 bg-slate-950/70">
              <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Archive className="h-5 w-5" />Saison rotieren</CardTitle><CardDescription>Der bestätigte aktive Key wird mit dem Server verglichen. Erst dann werden Standings archiviert und aktuelle Saisonpunkte zurückgesetzt.</CardDescription></CardHeader>
              <CardContent><form className="space-y-3" onSubmit={event => { event.preventDefault(); if (!activeSeason) return; seasonRotation.mutate({ confirmedSeasonKey: rotationConfirmation, nextSeasonKey, nextDisplayName: nextSeasonDisplayName, idempotencyKey: `season-rotate:${activeSeason.seasonKey}:${nextSeasonKey}` }); }}><div className="space-y-2"><Label htmlFor="rotationConfirm">Aktiven Key zur Bestätigung eingeben</Label><Input id="rotationConfirm" value={rotationConfirmation} onChange={event => setRotationConfirmation(event.target.value.toLowerCase())} placeholder={activeSeason?.seasonKey || "keine aktive Saison"} disabled={!activeSeason} /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="nextSeasonKey">Nächster Key</Label><Input id="nextSeasonKey" value={nextSeasonKey} onChange={event => setNextSeasonKey(event.target.value.toLowerCase())} placeholder="aurion_s02" disabled={!activeSeason} /></div><div className="space-y-2"><Label htmlFor="nextSeasonName">Nächster Name</Label><Input id="nextSeasonName" value={nextSeasonDisplayName} onChange={event => setNextSeasonDisplayName(event.target.value)} placeholder="Sternwarte: Nachhall" disabled={!activeSeason} /></div></div>{seasonRotation.error && <p className="text-sm text-red-300">{seasonRotation.error.message}</p>}<Button type="submit" variant="outline" disabled={!activeSeason || rotationConfirmation !== activeSeason.seasonKey || !nextSeasonKey || !nextSeasonDisplayName || seasonRotation.isPending} className="w-full border-red-300/40 text-red-100 hover:bg-red-400/10">{seasonRotation.isPending ? "Archivierung läuft…" : "Archivieren und neue Saison starten"}</Button></form></CardContent>
            </Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-2"><Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Saisonarchiv</CardTitle><CardDescription>Geschlossene Saisons contain server-recorded leaderboard snapshots.</CardDescription></CardHeader><CardContent className="space-y-2">{managedSeasons.data?.map(season => <button type="button" key={season.id} onClick={() => setSelectedSeasonId(season.id)} className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${selectedSeasonId === season.id ? "border-cyan-300/60 bg-cyan-400/10" : "border-cyan-200/10 hover:bg-cyan-400/[.04]"}`}><span className="font-medium">{season.displayName}</span><span className="ml-2 text-xs text-cyan-100/60">{season.status}</span><p className="mt-1 text-xs text-slate-400">{season.seasonKey} · Start {new Date(season.startsAt).toLocaleDateString()}</p></button>)}{!managedSeasons.data?.length && <p className="py-8 text-sm text-slate-400">Noch keine Saison wurde serverseitig gestartet.</p>}</CardContent></Card><Card className="border-amber-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100">Archivierte Standings</CardTitle><CardDescription>{selectedSeasonId ? "Sortiert nach gesicherten Saisonpunkten, Siegen und Stufe." : "Wähle links eine geschlossene Saison aus."}</CardDescription></CardHeader><CardContent className="divide-y divide-cyan-200/10">{selectedSeasonSnapshots.data?.map((entry, index) => <div key={entry.userId} className="flex items-center gap-3 py-3 text-sm"><span className="w-6 text-cyan-200">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{entry.name || `Explorer ${entry.userId}`}</p><p className="text-xs text-slate-400">L{entry.level}</p></div><p className="text-right text-xs text-amber-100">{entry.seasonPoints} SP<br /><span className="text-slate-400">{entry.victories} Siege</span></p></div>)}{selectedSeasonId && !selectedSeasonSnapshots.data?.length && <p className="py-8 text-sm text-slate-400">Für diese Saison wurden keine Standings archiviert.</p>}</CardContent></Card></section>

          {/* NPC Policy Self-Evolution (AIM-295) */}
          <section className="grid gap-5 xl:grid-cols-2">
            <Card className="border-amber-200/15 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-100">
                  <Shield className="h-5 w-5 text-amber-300" /> NPC Policy Custody & Self-Evolution
                </CardTitle>
                <CardDescription>
                  Revisionsgebundene NPC-Policy-Verwaltung mit WASD-Provenance.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>NPC-Auswahl</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={selectedNpc === "lyra" ? "default" : "outline"}
                      onClick={() => setSelectedNpc("lyra")}
                      className={selectedNpc === "lyra" ? "bg-cyan-500 text-slate-950" : "border-cyan-300/30"}
                    >
                      Lyra
                    </Button>
                    <Button
                      variant={selectedNpc === "orun" ? "default" : "outline"}
                      onClick={() => setSelectedNpc("orun")}
                      className={selectedNpc === "orun" ? "bg-cyan-500 text-slate-950" : "border-cyan-300/30"}
                    >
                      Orun
                    </Button>
                  </div>
                </div>

                {confirmedPolicy.isLoading ? (
                  <p className="text-sm text-slate-400">Lade aktuelle Policy...</p>
                ) : confirmedPolicy.data ? (
                  <div className="space-y-3 rounded-lg border border-cyan-200/10 bg-cyan-400/[0.02] p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-100">Confirmed Version</span>
                      <Badge className="bg-cyan-500/20 text-cyan-200">v{confirmedPolicy.data.version}</Badge>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-cyan-200/60 block">Policy Hash</span>
                      <code className="text-xs font-mono bg-slate-900 px-2 py-1 rounded select-all block truncate">
                        {confirmedPolicy.data.policyHash}
                      </code>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs border-t border-cyan-200/10 pt-2">
                      <div>
                        <span className="text-cyan-200/60 block">Source SHA-256</span>
                        <span className="font-mono text-slate-300 truncate block">
                          {confirmedPolicy.data.sourceSha256.slice(0, 16)}...
                        </span>
                      </div>
                      <div>
                        <span className="text-cyan-200/60 block">Source Revision</span>
                        <span className="text-slate-300 capitalize truncate block">
                          {confirmedPolicy.data.sourceRevision}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-cyan-200/10 pt-2 text-xs">
                      <span className="text-cyan-200/60 block mb-1">Policy Payload</span>
                      <pre className="text-[11px] max-h-36 overflow-auto bg-slate-900 p-2 rounded font-mono text-cyan-100">
                        {JSON.stringify(confirmedPolicy.data.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-yellow-200/10 bg-yellow-400/[0.02] p-4 text-sm text-yellow-200">
                    Keine bestätigte Policy für {selectedNpc} gefunden. (Verwende WASD-Integration, um eine erste Policy zu pushen).
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-amber-200/15 bg-slate-950/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-100">
                  <History className="h-5 w-5 text-amber-300" /> Administrative Rollback (AIM-295)
                </CardTitle>
                <CardDescription>
                  Erstellt ein signiertes Rollback-Receipt. Der Versionszähler wird deterministisch inkrementiert.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!rollbackVersion) return;
                    rollbackMutation.mutate({
                      npcId: selectedNpc,
                      targetVersion: Number(rollbackVersion),
                      reason: rollbackReason,
                    });
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="rollbackVersion">Ziel-Version (Candidate Targets)</Label>
                    <select
                      id="rollbackVersion"
                      value={rollbackVersion}
                      onChange={(e) => setRollbackVersion(e.target.value === "" ? "" : Number(e.target.value))}
                      className="flex h-10 w-full rounded-md border border-cyan-200/20 bg-slate-950 px-3 text-sm text-slate-100"
                    >
                      <option value="">Wähle ein Rollback-Ziel aus...</option>
                      {policyHistory.data
                        ?.filter((h) => h.version !== confirmedPolicy.data?.version)
                        .map((h) => (
                          <option key={h.version} value={h.version}>
                            Version {h.version} (Source: {h.sourceRevision.slice(0, 8)}…)
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rollbackReason">Begründung (Reason / Evidence)</Label>
                    <Input
                      id="rollbackReason"
                      value={rollbackReason}
                      onChange={(e) => setRollbackReason(e.target.value)}
                      placeholder="z.B. Drift-Korrektur oder ungeeignete Selektion"
                      maxLength={150}
                      required
                    />
                  </div>

                  {rollbackError && (
                    <div className="rounded border border-red-300/20 bg-red-400/5 p-3 text-xs text-red-300 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{rollbackError}</span>
                    </div>
                  )}

                  {rollbackMutation.isSuccess && (
                    <div className="rounded border border-emerald-300/20 bg-emerald-400/5 p-3 text-xs text-emerald-200 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <div>
                        <b>Rollback erfolgreich!</b>
                        <p className="mt-1 text-[11px] text-slate-300">
                          Neue Version: v{rollbackMutation.data?.version} (Wiederhergestellt von v{rollbackVersion}).
                        </p>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={!rollbackVersion || !rollbackReason || rollbackMutation.isPending}
                    className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-300"
                  >
                    {rollbackMutation.isPending ? "Führe Rollback aus..." : "Rollback anfordern"}
                  </Button>
                </form>

                <div className="border-t border-cyan-200/10 pt-3">
                  <span className="text-xs font-semibold text-cyan-200/80 block mb-2">Immutable History (Audit Log)</span>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {policyHistory.isLoading ? (
                      <p className="text-xs text-slate-500">Lade Verlauf...</p>
                    ) : policyHistory.data?.length ? (
                      policyHistory.data.map((h) => (
                        <div
                          key={h.version}
                          className={`rounded border p-2 text-xs space-y-1 ${
                            h.version === confirmedPolicy.data?.version
                              ? "border-cyan-300/30 bg-cyan-400/5"
                              : "border-cyan-200/5 bg-slate-900/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200">Version {h.version}</span>
                            {h.version === confirmedPolicy.data?.version && (
                              <Badge className="bg-emerald-500/20 text-emerald-200 text-[9px] px-1.5 py-0 h-4">Aktiv</Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono truncate">{h.policyHash}</p>
                          <p className="text-[11px] text-slate-300">
                            <b>Source revision:</b> {h.sourceRevision}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono truncate">
                            <b>Source SHA-256:</b> {h.sourceSha256}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {new Date(h.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">Keine historischen Einträge vorhanden.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </TabsContent>}
        {user?.role === "admin" && <TabsContent value="game-dev" className="mt-5 space-y-5"><GameDevelopmentStudioWorkbench /></TabsContent>}\n        {user?.role === "admin" && <TabsContent value="authoring" className="mt-5 space-y-5"><AurionAuthoringWorkbench /></TabsContent>}\n        {user?.role === "admin" && <TabsContent value="causality" className="mt-5 space-y-5"><CausalStudioDashboard /></TabsContent>}
        {user?.role === "admin" && <TabsContent value="replay" className="mt-5 space-y-5"><SessionReplayVisualizer /></TabsContent>}
        {user?.role === "admin" && <TabsContent value="archives" className="mt-5 space-y-5"><ArchiveDashboard /></TabsContent>}
        {user?.role === "admin" && <TabsContent value="crosszone" className="mt-5 space-y-5"><CrossZoneSyncDashboard /></TabsContent>}
        {user?.role === "admin" && <TabsContent value="global-state" className="mt-5 space-y-5"><GlobalStateReconciliationDashboard /></TabsContent>}
        {user?.role === "admin" && <TabsContent value="recovery" className="mt-5 space-y-5"><CausalRecoveryDashboard /></TabsContent>}
        {user?.role === "admin" && <TabsContent value="system" className="mt-5 space-y-5"><Card className="border-cyan-200/15 bg-slate-950/70"><CardHeader><CardTitle className="text-amber-100 flex items-center gap-2"><Server className="h-5 w-5 text-cyan-400" /> System Status & Connectivity</CardTitle><CardDescription>Real-time connectivity monitoring for core infrastructure components.</CardDescription></CardHeader><CardContent><SystemStatusDashboard /></CardContent></Card></TabsContent>}
      </Tabs>
    </div>
  </div></DashboardLayout>;
}
