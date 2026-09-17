import { useMemo, useState } from "react";
import { AlertCircle, Check, Database, Download, FileCode2, History, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { operationalDate } from "@shared/operationalClock";

const OBSERVABLE_STAGES = ["PRE_STATE", "INPUT_ORDER", "POST_STATE", "RECEIPT"] as const;
const UNOBSERVABLE_V1 = ["MOVEMENT", "PLAYER_ACTION", "RESOURCE", "MOB_FSM", "MOB_COMBAT"] as const;

export default function CausalStudioDashboard() {
  const [zoneId, setZoneId] = useState("observatory_threshold");
  const [tickNumber, setTickNumber] = useState(0);
  const [search, setSearch] = useState("");
  const [requestedReplay, setRequestedReplay] = useState<{ zoneId: string; tick: number } | null>(null);

  const healthQuery = useQuery({
    queryKey: ["aurion-healthz"],
    queryFn: async () => {
      const response = await fetch("/healthz");
      if (!response.ok) throw new Error(`healthz HTTP ${response.status}`);
      return response.json();
    },
  });
  const checkpointsQuery = trpc.causality.getCheckpoints.useQuery({ zoneId, limit: 100 });
  const replayQuery = trpc.causality.replayTick.useQuery(
    requestedReplay ?? { zoneId, tick: tickNumber },
    { enabled: requestedReplay !== null, retry: false },
  );

  const checkpoints = useMemo(() => {
    const rows = checkpointsQuery.data ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter(row => row.id.toLowerCase().includes(query) || row.snapshotHash.toLowerCase().includes(query) || String(row.tick).includes(query));
  }, [checkpointsQuery.data, search]);

  const result = replayQuery.data;
  const verdict = result?.verdict;

  function stageState(stage: string): "match" | "diverged" | "unprovable" | "pending" {
    if (!verdict) return "pending";
    if (verdict.status === "UNPROVABLE") return "unprovable";
    if (verdict.status === "MATCH") return OBSERVABLE_STAGES.includes(stage as any) ? "match" : "unprovable";
    const index = OBSERVABLE_STAGES.indexOf(verdict.stage as any);
    const current = OBSERVABLE_STAGES.indexOf(stage as any);
    if (current < 0 || index < 0) return "unprovable";
    if (current < index) return "match";
    return current === index ? "diverged" : "unprovable";
  }

  function exportDiagnostics() {
    const payload = {
      exportedAt: operationalDate().toISOString(),
      runtimeIdentity: healthQuery.data ?? null,
      zoneId,
      tick: tickNumber,
      replay: result ?? null,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `aurion-causal-${zoneId}-${tickNumber}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card className="border-cyan-200/15 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <FileCode2 className="h-5 w-5 text-cyan-400" /> Causal Studio
          </CardTitle>
          <CardDescription>Receipt-bound readback. Unobserved intermediate stages remain explicitly UNOBSERVABLE.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <section className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-cyan-300">Runtime Identity</h4>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={exportDiagnostics} aria-label="Export diagnostic JSON">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <IdentityRow label="Revision" value={healthQuery.data?.revision} />
                <IdentityRow label="Ruleset" value={healthQuery.data?.authority?.ruleset} />
                <IdentityRow label="Build input" value={healthQuery.data?.buildInputDigest} />
                <IdentityRow label="Artifact" value={healthQuery.data?.artifactDigest} />
                <IdentityRow label="Image" value={healthQuery.data?.runtimeImageDigest} />
              </section>

              <section className="space-y-3 rounded-xl border border-cyan-200/10 bg-cyan-400/[.03] p-4">
                <h4 className="text-sm font-semibold text-cyan-300">Tick Explorer</h4>
                <div>
                  <Label className="text-xs">Zone</Label>
                  <Input value={zoneId} onChange={event => setZoneId(event.target.value)} className="mt-1 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Tick</Label>
                  <Input type="number" min={0} value={tickNumber} onChange={event => setTickNumber(Math.max(0, Number.parseInt(event.target.value, 10) || 0))} className="mt-1 h-8 text-xs" />
                </div>
                <Button className="h-8 w-full text-xs" onClick={() => setRequestedReplay({ zoneId, tick: tickNumber })}>
                  Verify Tick
                </Button>
              </section>
            </div>

            <section className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-200">Replay evidence</h4>
                <Badge variant={verdict?.status === "MATCH" ? "default" : verdict?.status === "FIRST_DIVERGENCE" ? "destructive" : "secondary"}>
                  {replayQuery.isFetching ? "VERIFYING" : verdict?.status ?? "NOT RUN"}
                </Badge>
              </div>

              {replayQuery.error && <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-300">{replayQuery.error.message}</div>}
              {verdict?.status === "UNPROVABLE" && <div className="rounded border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">{verdict.reason}</div>}
              {verdict?.status === "FIRST_DIVERGENCE" && (
                <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-xs">
                  <div className="mb-2 flex items-center gap-2 font-semibold text-red-300"><AlertCircle className="h-4 w-4" /> FIRST_DIVERGENCE: {verdict.stage}</div>
                  <HashRow label="Expected" value={verdict.expectedHash ?? verdict.expected} />
                  <HashRow label="Observed" value={verdict.observedHash ?? verdict.observed} />
                </div>
              )}
              {verdict?.status === "MATCH" && (
                <div className="rounded border border-emerald-500/20 bg-emerald-950/15 p-3 text-xs">
                  <HashRow label="PRE" value={verdict.preStateHash} />
                  <HashRow label="POST" value={verdict.postStateHash} />
                  <HashRow label="Receipt" value={verdict.receiptHash} />
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                {OBSERVABLE_STAGES.map(stage => <Stage key={stage} label={stage} state={stageState(stage)} />)}
                {UNOBSERVABLE_V1.map(stage => <Stage key={stage} label={stage} state="unprovable" subtitle="UNOBSERVABLE in receipt v1" />)}
              </div>
            </section>
          </div>

          <section className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Database className="h-4 w-4" /> Checkpoints</h4>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2 top-2 h-4 w-4 text-slate-500" />
                <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="tick, id or snapshot hash" className="h-8 pl-8 text-xs" />
              </div>
            </div>
            <div className="max-h-72 overflow-auto rounded border border-white/5">
              {checkpoints.map(checkpoint => (
                <button key={checkpoint.id} type="button" onClick={() => setTickNumber(checkpoint.tick)} className="grid w-full grid-cols-[70px_100px_1fr] gap-2 border-b border-white/5 px-3 py-2 text-left text-xs hover:bg-white/5">
                  <span className="font-mono text-slate-300">{checkpoint.tick}</span>
                  <span className={checkpoint.reconciled === 1 ? "text-emerald-400" : checkpoint.reconciled === -1 ? "text-red-400" : "text-amber-300"}>
                    {checkpoint.reconciled === 1 ? "MATCH" : checkpoint.reconciled === -1 ? "DIVERGED" : "UNVERIFIED"}
                  </span>
                  <span className="truncate font-mono text-slate-500" title={checkpoint.snapshotHash}>{checkpoint.snapshotHash}</span>
                </button>
              ))}
              {!checkpoints.length && <div className="p-6 text-center text-xs text-slate-500"><History className="mx-auto mb-2 h-4 w-4" />No checkpoint evidence.</div>}
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function IdentityRow({ label, value }: { label: string; value?: string | null }) {
  return <div className="grid grid-cols-[85px_1fr] gap-2 py-1"><span className="text-slate-500">{label}</span><span className="truncate font-mono text-slate-300" title={value ?? "UNVERIFIED"}>{value ?? "UNVERIFIED"}</span></div>;
}
function HashRow({ label, value }: { label: string; value?: string }) {
  return <div className="grid grid-cols-[70px_1fr] gap-2 py-1"><span className="text-slate-500">{label}</span><span className="break-all font-mono text-slate-300">{value ?? "UNOBSERVABLE"}</span></div>;
}
function Stage({ label, state, subtitle }: { label: string; state: "match" | "diverged" | "unprovable" | "pending"; subtitle?: string }) {
  return (
    <div className={`rounded border p-2 text-xs ${state === "match" ? "border-emerald-500/20 bg-emerald-500/5" : state === "diverged" ? "border-red-500/30 bg-red-500/10" : "border-amber-500/15 bg-amber-500/[.03]"}`}>
      <div className="flex items-center gap-2">
        {state === "match" ? <Check className="h-3 w-3 text-emerald-400" /> : state === "diverged" ? <AlertCircle className="h-3 w-3 text-red-400" /> : <History className="h-3 w-3 text-amber-300" />}
        <span>{label}</span>
      </div>
      {subtitle && <div className="mt-1 text-[10px] text-slate-500">{subtitle}</div>}
    </div>
  );
}
