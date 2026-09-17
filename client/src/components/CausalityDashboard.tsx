import { useState } from "react";
import { AlertCircle, Archive, CheckCircle2, Database, History, PlayCircle, RefreshCw, Save, ShieldAlert, ShieldCheck, ShieldQuestion, Terminal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CausalityDashboard() {
  const [zoneId, setZoneId] = useState("observatory_threshold");
  const [tickNumber, setTickNumber] = useState(0);
  const [requestedReplay, setRequestedReplay] = useState<{ zoneId: string; tick: number } | null>(null);
  const [backupReceipt, setBackupReceipt] = useState<any>(null);

  const utils = trpc.useUtils();
  const latestReceipts = trpc.causality.getLatestReceipts.useQuery({ zoneId });
  const checkpoints = trpc.causality.getCheckpoints.useQuery({ zoneId, limit: 10 });
  const archiveStats = trpc.causality.getArchiveStats.useQuery({ zoneId });
  const divergent = trpc.causality.getDivergentCheckpoints.useQuery({ zoneId });
  const recoveryPlan = trpc.causality.planRecovery.useQuery({ zoneId });
  const replay = trpc.causality.replayTick.useQuery(requestedReplay ?? { zoneId, tick: tickNumber }, {
    enabled: requestedReplay !== null,
    retry: false,
  });
  const triggerBackup = trpc.causality.triggerBackup.useMutation({
    onSuccess: async receipt => {
      setBackupReceipt(receipt);
      await utils.causality.getArchiveStats.invalidate({ zoneId });
    },
  });

  const verdict = replay.data?.verdict;

  return (
    <div className="space-y-6">
      {!!divergent.data?.length && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3 text-red-200">
              <ShieldAlert className="h-6 w-6 text-red-500" />
              <div>
                <p className="font-bold">CAUSAL DIVERGENCE OBSERVED</p>
                <p className="text-xs text-red-300/80">{divergent.data.length} checkpoint(s) are marked divergent. Verification itself performs no rollback.</p>
              </div>
            </div>
            <Badge variant="outline" className="border-red-500/50 text-red-400">INVESTIGATE</Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-cyan-300/10 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-100"><History className="h-5 w-5" /> Causal Evidence Chain</CardTitle>
            <CardDescription>Side-effect-free receipt replay. Missing evidence remains UNPROVABLE.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="causal-zone">Zone ID</Label>
                <Input id="causal-zone" value={zoneId} onChange={event => setZoneId(event.target.value)} className="bg-slate-950 border-cyan-200/20 text-cyan-100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="causal-tick">Tick Number</Label>
                <div className="flex gap-2">
                  <Input id="causal-tick" type="number" min={0} value={tickNumber} onChange={event => setTickNumber(Math.max(0, Number.parseInt(event.target.value, 10) || 0))} className="bg-slate-950 border-cyan-200/20 text-cyan-100" />
                  <Button onClick={() => setRequestedReplay({ zoneId, tick: tickNumber })} disabled={replay.isFetching} className="bg-cyan-500 text-slate-950 hover:bg-cyan-300">
                    {replay.isFetching ? "Replaying…" : <><PlayCircle className="mr-2 h-4 w-4" />Replay</>}
                  </Button>
                </div>
              </div>
            </div>

            {!!latestReceipts.data?.length && (
              <div className="rounded-lg border border-cyan-200/10 bg-cyan-400/[.03] p-3 text-xs">
                <p className="mb-1 font-semibold text-cyan-200/60">LATEST RECORDED RECEIPT</p>
                <div className="flex justify-between gap-3"><span>Tick {latestReceipts.data[0].tick}</span><span className="truncate font-mono text-cyan-300">{latestReceipts.data[0].receiptHash}</span></div>
              </div>
            )}

            {replay.error && <EvidenceBox kind="error" title="REPLAY ERROR" body={replay.error.message} />}
            {verdict?.status === "MATCH" && <EvidenceBox kind="success" title="VERIFIED MATCH" body={`Receipt v1 verified ${verdict.stagesVerified} observable stages. Intermediate phase hashes are not claimed.`} />}
            {verdict?.status === "UNPROVABLE" && <EvidenceBox kind="warning" title="UNPROVABLE" body={verdict.reason} />}
            {verdict?.status === "FIRST_DIVERGENCE" && <EvidenceBox kind="error" title={`FIRST_DIVERGENCE: ${verdict.stage}`} body={`expected=${verdict.expectedHash ?? verdict.expected}\nobserved=${verdict.observedHash ?? verdict.observed}`} />}
          </CardContent>
        </Card>

        <Card className="border-amber-200/15 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-100"><Database className="h-5 w-5 text-cyan-400" /> Snapshot Reconciliation</CardTitle>
            <CardDescription>Checkpoints are evidence. Recovery is a read-only plan, never an automatic mutation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ScrollArea className="h-[220px] pr-4">
              <div className="space-y-2">
                {checkpoints.data?.map(checkpoint => (
                  <div key={checkpoint.id} className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] p-2 text-xs">
                    <div><div className="font-bold text-cyan-100">Tick {checkpoint.tick}</div><div className="max-w-64 truncate font-mono text-slate-500">{checkpoint.snapshotHash}</div></div>
                    {checkpoint.reconciled === 1 ? <Badge className="gap-1 bg-emerald-500/10 text-emerald-400"><ShieldCheck className="h-3 w-3" />VERIFIED</Badge> : checkpoint.reconciled === -1 ? <Badge className="gap-1 bg-red-500/10 text-red-400"><ShieldAlert className="h-3 w-3" />DIVERGENT</Badge> : <Badge variant="outline" className="gap-1 text-slate-500"><ShieldQuestion className="h-3 w-3" />PENDING</Badge>}
                  </div>
                ))}
                {!checkpoints.data?.length && <p className="py-8 text-center text-xs italic text-slate-500">No checkpoint evidence.</p>}
              </div>
            </ScrollArea>

            <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
              <div className="mb-1 font-semibold text-slate-300">Recovery candidate</div>
              <div>Status: <span className="font-mono">{recoveryPlan.data?.status ?? "LOADING"}</span></div>
              <div>Checkpoint: <span className="font-mono">{recoveryPlan.data?.checkpointId ?? "—"}</span></div>
              <div>Mutation authority: <span className="font-mono">{recoveryPlan.data?.mutationAuthority ?? "none"}</span></div>
              {recoveryPlan.data?.reason && <div className="mt-1 text-amber-300">{recoveryPlan.data.reason}</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200/15 bg-slate-950/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-100"><Archive className="h-5 w-5 text-blue-400" /> Causal Cold Storage</CardTitle>
            <CardDescription>Archive is copy-only. Primary causal receipts are never deleted by backup.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Metric label="Archive batches" value={archiveStats.data?.totalArchives ?? 0} />
              <Metric label="Copied receipts" value={archiveStats.data?.totalArchivedReceipts ?? 0} />
            </div>
            <Button variant="outline" size="sm" className="mt-4 w-full border-blue-400/30 text-blue-100" onClick={() => triggerBackup.mutate({ zoneId })} disabled={triggerBackup.isPending}>
              {triggerBackup.isPending ? <RefreshCw className="mr-2 h-3 w-3 animate-spin" /> : <Save className="mr-2 h-3 w-3" />} Create verified archive copy
            </Button>
            {backupReceipt && <EvidenceBox kind={backupReceipt.ok ? "success" : "warning"} title={backupReceipt.status} body={backupReceipt.ok ? `archive=${backupReceipt.archiveId}\nreceipts=${backupReceipt.archivedCount}\ncheckpoint=${backupReceipt.checkpointId}` : backupReceipt.reason ?? "No archive receipt produced."} />}
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200/15 bg-slate-950/70">
        <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><Terminal className="h-5 w-5" /> Forensic CLI</CardTitle><CardDescription>The CLI uses the same replay contract; it does not confer mutation authority.</CardDescription></CardHeader>
        <CardContent><pre className="overflow-x-auto rounded-lg border border-cyan-200/10 bg-slate-950 p-4 text-xs font-mono text-cyan-300">{`tsx scripts/replay-aurion-zone.ts --zone ${zoneId} --tick ${tickNumber} --debug`}</pre></CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded border border-white/5 bg-white/[0.02] p-3"><p className="mb-1 text-[10px] font-bold uppercase text-slate-500">{label}</p><p className="text-2xl font-mono text-blue-300">{value}</p></div>;
}

function EvidenceBox({ kind, title, body }: { kind: "success" | "warning" | "error"; title: string; body: string }) {
  const cls = kind === "success" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200" : kind === "error" ? "border-red-500/30 bg-red-500/5 text-red-200" : "border-amber-500/30 bg-amber-500/5 text-amber-200";
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return <div className={`mt-4 rounded-xl border p-3 text-xs ${cls}`}><div className="mb-2 flex items-center gap-2 font-bold"><Icon className="h-4 w-4" />{title}</div><pre className="whitespace-pre-wrap break-all font-mono text-[11px]">{body}</pre></div>;
}
