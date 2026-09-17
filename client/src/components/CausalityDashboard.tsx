import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, History, PlayCircle, Search, Terminal, Database, ShieldCheck, ShieldAlert, ShieldQuestion, Archive, Save, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CausalityDashboard() {
  const [zoneId, setZoneId] = useState("aurion-nexus-01");
  const [tickNumber, setTickNumber] = useState<number>(0);
  const [lastVerdict, setLastVerdict] = useState<any>(null);

  const utils = trpc.useUtils();
  const latestReceipts = trpc.causality.getLatestReceipts.useQuery({ zoneId });
  const checkpointsQuery = trpc.causality.getCheckpoints.useQuery({ zoneId, limit: 10 });
  const archiveStatsQuery = trpc.causality.getArchiveStats.useQuery({ zoneId });
  const divergentCheckpointsQuery = trpc.causality.getDivergentCheckpoints.useQuery({ zoneId });
  const replayMutation = trpc.causality.replayTick.useMutation();
  const repairMutation = trpc.causality.repairZone.useMutation();
  const triggerBackup = trpc.causality.triggerBackup.useMutation();

  const handleReplay = async () => {
    try {
      const result = await replayMutation.mutateAsync({ zoneId, tick: tickNumber });
      setLastVerdict(result);
    } catch (err: any) {
      setLastVerdict({ error: err.message });
    }
  };

  const handleRepair = async (checkpointId: string) => {
    if (!confirm("Are you sure you want to REPAIR this zone? This will ROLL BACK live state to this checkpoint and CLEAR all subsequent causal logs.")) {
      return;
    }
    try {
      await repairMutation.mutateAsync({ zoneId, checkpointId });
      utils.causality.getCheckpoints.invalidate();
      utils.causality.getLatestReceipts.invalidate();
      utils.causality.getDivergentCheckpoints.invalidate();
      alert("Zone state repaired successfully.");
    } catch (err: any) {
      alert(`Repair failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {divergentCheckpointsQuery.data && divergentCheckpointsQuery.data.length > 0 && (
        <Card className="border-red-500/50 bg-red-500/10 animate-pulse">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 text-red-200">
              <ShieldAlert className="h-6 w-6 text-red-500" />
              <div>
                <p className="font-bold">CRITICAL CAUSAL ANOMALY DETECTED</p>
                <p className="text-xs text-red-300/80">
                  {divergentCheckpointsQuery.data.length} checkpoints failed reconciliation. World state may be divergent.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-red-500/50 text-red-400">ACTION REQUIRED</Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-cyan-300/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-100">
              <History className="h-5 w-5" /> Causal Evidence Chain
            </CardTitle>
            <CardDescription>
              Verify deterministic gameplay ticks against the canonical ruleset (Step 13).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="zoneId">Zone ID</Label>
                <Input
                  id="zoneId"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="bg-slate-950 border-cyan-200/20 text-cyan-100"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tickNumber">Tick Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="tickNumber"
                    type="number"
                    value={tickNumber}
                    onChange={(e) => setTickNumber(parseInt(e.target.value) || 0)}
                    className="bg-slate-950 border-cyan-200/20 text-cyan-100"
                  />
                  <Button 
                    onClick={handleReplay} 
                    disabled={replayMutation.isPending}
                    className="bg-cyan-500 text-slate-950 hover:bg-cyan-300"
                  >
                    {replayMutation.isPending ? "Replaying..." : <><PlayCircle className="mr-2 h-4 w-4" /> Replay</>}
                  </Button>
                </div>
              </div>
            </div>

            {latestReceipts.data && latestReceipts.data.length > 0 && (
              <div className="rounded-lg border border-cyan-200/10 bg-cyan-400/[.03] p-3 text-xs">
                <p className="text-cyan-200/60 font-semibold mb-1">LATEST RECORDED RECEIPT</p>
                <div className="flex justify-between">
                  <span>Tick: {latestReceipts.data[0].tick}</span>
                  <span className="font-mono text-cyan-300">{latestReceipts.data[0].receiptHash.slice(0, 16)}...</span>
                </div>
              </div>
            )}

            {lastVerdict && (
              <div className={`mt-4 p-4 rounded-xl border ${
                lastVerdict.isMatch ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {lastVerdict.isMatch ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  )}
                  <span className={`font-bold ${lastVerdict.isMatch ? "text-emerald-100" : "text-red-100"}`}>
                    {lastVerdict.isMatch ? "DETERMINISTIC MATCH" : "CAUSAL DIVERGENCE"}
                  </span>
                </div>

                {lastVerdict.error ? (
                  <p className="text-sm text-red-300">{lastVerdict.error}</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <p className="text-slate-300">
                      Verdict: <Badge variant="outline">{lastVerdict.verdict.verdict}</Badge>
                    </p>
                    {!lastVerdict.isMatch && (
                      <div className="bg-slate-950/50 p-3 rounded-lg font-mono text-xs border border-red-500/20">
                        <p className="text-red-300 font-bold mb-1">Stage: {lastVerdict.verdict.stage}</p>
                        <div className="grid grid-cols-[80px_1fr] gap-x-2">
                          <span className="text-slate-500">Expected:</span>
                          <span className="text-emerald-300 break-all">{lastVerdict.verdict.expectedHash}</span>
                          <span className="text-slate-500">Observed:</span>
                          <span className="text-red-300 break-all">{lastVerdict.verdict.observedHash}</span>
                        </div>
                        {lastVerdict.verdict.diffDetails && (
                          <p className="mt-2 text-slate-400 italic">{lastVerdict.verdict.diffDetails}</p>
                        )}
                      </div>
                    )}
                    {lastVerdict.isMatch && (
                      <p className="text-xs text-slate-400">
                        Replay successfully verified 8 internal simulation stages.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-200/15 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-100">
              <Database className="h-5 w-5 text-cyan-400" /> Snapshot Reconciliation
            </CardTitle>
            <CardDescription>
              Sparse checkpoints reconciled by the background verification service (Step 14).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px] pr-4">
              <div className="space-y-2">
                {checkpointsQuery.isLoading && <p className="text-xs text-slate-500 italic">Reading checkpoints...</p>}
                {checkpointsQuery.data?.map((checkpoint: any) => (
                  <div key={checkpoint.id} className="flex items-center justify-between p-2 rounded border border-white/5 bg-white/[0.02] text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-cyan-100">Tick {checkpoint.tick}</span>
                        <span className="font-mono text-slate-500">{checkpoint.snapshotHash.slice(0, 12)}...</span>
                      </div>
                      <p className="text-[10px] text-slate-500">Created: {new Date(checkpoint.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {checkpoint.reconciled === 1 && (
                        <div className="flex flex-col items-end gap-1">
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                            <ShieldCheck className="h-3 w-3" /> VERIFIED
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 text-[9px] text-cyan-400 hover:text-cyan-300 p-1"
                            onClick={() => handleRepair(checkpoint.id)}
                            disabled={repairMutation.isPending}
                          >
                            RESTORE HERE
                          </Button>
                        </div>
                      )}
                      {checkpoint.reconciled === -1 && (
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
                          <ShieldAlert className="h-3 w-3" /> DIVERGENT
                        </Badge>
                      )}
                      {checkpoint.reconciled === 0 && (
                        <Badge variant="outline" className="text-slate-500 border-slate-500/20 gap-1">
                          <ShieldQuestion className="h-3 w-3" /> PENDING
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {checkpointsQuery.data?.length === 0 && (
                  <p className="text-center py-8 text-slate-500 italic">No checkpoints found for this zone.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-blue-200/15 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-100">
              <Database className="h-5 w-5 text-blue-400" /> Causal Cold Storage
            </CardTitle>
            <CardDescription>
              Verified historical receipts moved to long-term archival (Step 16).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded border border-white/5 bg-white/[0.02]">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Batches</p>
                <p className="text-2xl font-mono text-blue-300">
                  {archiveStatsQuery.data?.totalArchives ?? 0}
                </p>
              </div>
              <div className="p-3 rounded border border-white/5 bg-white/[0.02]">
                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Archived Receipts</p>
                <p className="text-2xl font-mono text-blue-300">
                  {archiveStatsQuery.data?.totalArchivedReceipts ?? 0}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <Button 
                variant="outline" 
                size="sm"
                className="w-full border-blue-400/30 text-blue-100 hover:bg-blue-400/10"
                onClick={() => {
                  triggerBackup.mutate({ zoneId }, {
                    onSuccess: () => {
                      window.dispatchEvent(new CustomEvent("aurion:causal-backup-confirmed", { 
                        detail: { message: "Manueller Backup bestätigt" } 
                      }));
                      utils.causality.getArchiveStats.invalidate();
                    }
                  });
                }}
                disabled={triggerBackup.isPending}
              >
                {triggerBackup.isPending ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />}
                Backup erzwingen
              </Button>
            </div>
            <p className="mt-4 text-[10px] text-slate-500 italic">
              Archiving reduces database row overhead while preserving the integrity of the causal chain.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200/15 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <Terminal className="h-5 w-5" /> Forensic CLI
          </CardTitle>
          <CardDescription>
            Commands for deep investigation via the Aurion management terminal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-slate-950 p-4 rounded-lg text-xs font-mono text-cyan-300 border border-cyan-200/10 overflow-x-auto">
            {`# Replay a specific range of ticks
tsx scripts/replay-aurion-zone.ts --zone ${zoneId} --from-tick ${Math.max(0, tickNumber - 10)} --to-tick ${tickNumber}

# Detailed debug output for a single tick
tsx scripts/replay-aurion-zone.ts --zone ${zoneId} --tick ${tickNumber} --debug`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
