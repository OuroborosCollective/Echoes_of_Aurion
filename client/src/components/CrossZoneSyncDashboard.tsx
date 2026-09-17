import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRightLeft, Clock, Map, ShieldCheck, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function CrossZoneSyncDashboard() {
  const [zoneId, setZoneId] = useState("observatory_threshold");
  const worldId = "aurion-world-01";

  const transfersQuery = trpc.causality.getPendingTransfers.useQuery({ worldId, zoneId });

  return (
    <div className="space-y-6">
      <Card className="border-cyan-300/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-100">
            <ArrowRightLeft className="h-5 w-5 text-cyan-400" /> Cross-Zone Synchronization
          </CardTitle>
          <CardDescription>
            Deterministic interactions between adjacent simulation domains (Step 17).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
            <Map className="h-4 w-4 text-cyan-300" />
            <span className="text-xs text-slate-300">Target Zone:</span>
            <Badge variant="outline" className="bg-slate-950 border-cyan-400/30 text-cyan-100">
              {zoneId}
            </Badge>
          </div>

          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {transfersQuery.isLoading && (
                <p className="text-sm text-slate-500 italic">Discovering pending transfers...</p>
              )}
              
              {transfersQuery.data?.map((transfer) => (
                <div key={transfer.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                        {transfer.payload.kind.toUpperCase()}
                      </Badge>
                      <span className="text-xs font-mono text-slate-400">{transfer.id.slice(0, 16)}...</span>
                    </div>
                    <Badge variant="outline" className="text-cyan-400 border-cyan-400/20 gap-1">
                      <Clock className="h-3 w-3" /> PENDING
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div className="space-y-1">
                      <p className="text-slate-500 uppercase font-bold text-[10px]">Source Domain</p>
                      <p className="text-slate-200">{transfer.sourceZoneId}</p>
                      <p className="text-slate-500">Tick: {transfer.sourceTick}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-slate-500 uppercase font-bold text-[10px]">Target Domain</p>
                      <p className="text-slate-200">{transfer.targetZoneId}</p>
                      <p className="text-slate-500">Awaiting Tick...</p>
                    </div>
                  </div>

                  <div className="p-2 rounded bg-black/40 border border-white/5 flex items-center gap-2">
                    <User className="h-3 w-3 text-amber-300" />
                    <span className="text-[10px] font-mono text-amber-100/70">
                      Entity: {transfer.payload.entityId}
                    </span>
                    <span className="ml-auto text-[10px] text-slate-500">
                      Hash: {transfer.transferHash.slice(0, 8)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-emerald-400/60">
                    <ShieldCheck className="h-3 w-3" />
                    Verified by Source Receipt {transfer.sourceTick}
                  </div>
                </div>
              ))}

              {transfersQuery.data?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <ArrowRightLeft className="h-12 w-12 mb-4 opacity-10" />
                  <p className="italic">No pending cross-zone transfers detected for this domain.</p>
                  <p className="text-[10px] mt-1">Causal state is currently localized.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-blue-300/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-sm text-blue-100">Handover Protocol (AX1-AURION-WASD)</CardTitle>
        </CardHeader>
        <CardContent className="text-[11px] text-slate-400 leading-relaxed space-y-2">
          <p>
            1. <b>Source Departure:</b> Zone A records a Transfer-Out Receipt in its deterministic tick.
          </p>
          <p>
            2. <b>Causal Staging:</b> Synchronization service picks up the receipt and validates its post-state signature.
          </p>
          <p>
            3. <b>Target Admission:</b> Zone B requires the validated Transfer-In Receipt as a prerequisite for admitting the entity into its next tick.
          </p>
          <p>
            4. <b>Consolidation:</b> Both zones converge on the handover, ensuring zero duplication and zero loss of entity state across boundaries.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
