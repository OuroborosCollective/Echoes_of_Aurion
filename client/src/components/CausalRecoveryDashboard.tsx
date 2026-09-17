import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Wrench, ShieldAlert, CheckCircle2, History } from "lucide-react";
import { toast } from "sonner";

export default function CausalRecoveryDashboard() {
  const zoneId = "observatory_threshold";
  const statusQuery = trpc.causality.getReadbackStatus.useQuery();
  const triggerRollback = trpc.causality.triggerAutomaticRollback.useMutation({
    onSuccess: (success) => {
      if (success) {
        toast.success("The zone was successfully repaired from the last known good checkpoint.");
        statusQuery.refetch();
      } else {
        toast.error("Could not find a valid reconciled checkpoint to rollback to.");
      }
    }
  });

  return (
    <div className="space-y-6">
      <Card className="border-red-500/20 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-200">
            <AlertTriangle className="h-5 w-5 text-red-500" /> Causal Recovery & World Repair
          </CardTitle>
          <CardDescription>
            Automatic rollback and manual determinism divergence repair tools (Step 20).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-red-400" />
              <div>
                <h4 className="text-sm font-semibold text-red-200">Zone Determinism Status</h4>
                <p className="text-xs text-red-300/70">Monitors the causal timeline for logical divergence.</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-2">
              <div className="flex gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 font-medium">TOTAL DIVERGENCES</span>
                  <span className="text-xl font-bold text-slate-200">{statusQuery.data?.divergences || 0}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 font-medium">VERIFIED TICKS</span>
                  <span className="text-xl font-bold text-emerald-400">{statusQuery.data?.verifiedTicks || 0}</span>
                </div>
              </div>

              <Button 
                variant="destructive" 
                size="sm" 
                className="gap-2"
                disabled={triggerRollback.isPending}
                onClick={() => triggerRollback.mutate({ zoneId })}
              >
                <Wrench className="h-4 w-4" />
                Trigger Safe Revert
              </Button>
            </div>
          </div>

          <div className="text-xs text-slate-400 leading-relaxed p-4 rounded-xl border border-white/5 bg-white/[0.02]">
            <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-2">
              <History className="h-4 w-4" /> Recovery Protocol
            </h4>
            <ul className="list-disc pl-4 space-y-1">
              <li>When a <b>Determinism Divergence</b> is detected during readback, the system automatically flags the epoch.</li>
              <li>A <b>Safe Revert</b> finds the last known <i>reconciled</i> checkpoint for the affected zone.</li>
              <li>The world state is restored to this checkpoint, and all subsequent divergent causal receipts are pruned.</li>
              <li>Clients automatically re-sync with the restored readmodel on their next heartbeat.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
