import { AlertTriangle, CheckCircle2, History, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CausalRecoveryDashboard() {
  const zoneId = "observatory_threshold";
  const statusQuery = trpc.causality.getReadbackStatus.useQuery();
  const planQuery = trpc.causality.planRecovery.useQuery({ zoneId });
  const plan = planQuery.data;

  return (
    <div className="space-y-6">
      <Card className="border-amber-500/20 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <ShieldAlert className="h-5 w-5 text-amber-400" /> Causal Recovery Planning
          </CardTitle>
          <CardDescription>
            Read-only recovery evidence. This surface cannot roll back live gameplay or delete causal history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="OBSERVED" value={statusQuery.data?.observedTicks ?? 0} />
            <Metric label="VERIFIED" value={statusQuery.data?.verifiedTicks ?? 0} good />
            <Metric label="DIVERGENCES" value={statusQuery.data?.divergences ?? 0} warn />
            <Metric label="UNPROVABLE" value={statusQuery.data?.unprovable ?? 0} warn />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-slate-300">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-semibold">Latest recovery candidate</span>
              <Badge variant={plan?.status === "AVAILABLE" ? "default" : "secondary"}>
                {plan?.status ?? "LOADING"}
              </Badge>
            </div>
            {plan?.status === "AVAILABLE" ? (
              <dl className="grid gap-2 sm:grid-cols-2">
                <Row label="Checkpoint" value={plan.checkpointId ?? "—"} />
                <Row label="Tick" value={String(plan.checkpointTick ?? "—")} />
                <Row label="Snapshot hash" value={plan.snapshotHash ?? "—"} />
                <Row label="Mutation authority" value={plan.mutationAuthority} />
              </dl>
            ) : (
              <div className="flex items-start gap-2 text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{plan?.reason ?? "No recovery evidence available yet."}</span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs leading-relaxed text-slate-400">
            <h4 className="mb-2 flex items-center gap-2 font-semibold text-slate-300">
              <History className="h-4 w-4" /> Recovery contract
            </h4>
            <p>
              A reconciled checkpoint may be proposed as a recovery candidate, but verification never executes a restore.
              A future restore requires a separate typed control-plane action, explicit human approval and a compensating or branch receipt.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, good, warn }: { label: string; value: number; good?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${good ? "text-emerald-400" : warn && value > 0 ? "text-amber-300" : "text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all font-mono text-slate-200">{value}</dd>
    </div>
  );
}
