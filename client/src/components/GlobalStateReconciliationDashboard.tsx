import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, ShieldCheck, History, CheckCircle2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GLOBAL_WORLD_ID } from "@shared/worldIdentity";

export default function GlobalStateReconciliationDashboard() {
  const worldId = GLOBAL_WORLD_ID;
  const proofsQuery = trpc.causality.getGlobalStateProofs.useQuery({ worldId });

  return (
    <div className="space-y-6">
      <Card className="border-emerald-300/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-100">
            <Globe className="h-5 w-5 text-emerald-400" /> Global State Reconciliation
          </CardTitle>
          <CardDescription>
            Evidence-only World Causal Roots from exact zone receipt ranges (Wave 2 · Step 22).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {proofsQuery.isLoading && (
                <p className="text-sm text-slate-500 italic">Reading global proof ledger...</p>
              )}
              
              {proofsQuery.data?.map((proof) => (
                <div key={proof.id} className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-bold text-slate-200">World Epoch {proof.epoch}</span>
                    </div>
                    {proof.status === "VERIFIED" ? (
                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> VERIFIED
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> {proof.status}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div className="p-2 rounded bg-black/40 border border-white/5 flex flex-col gap-1">
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>GLOBAL PROOF HASH</span>
                        <span className="text-emerald-400/70">{new Date(proof.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <span className="text-xs font-mono text-emerald-100/90 break-all">
                        {proof.globalProofHash}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-[10px] text-slate-400">
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-400" />
                      {proof.status === "VERIFIED" ? "Causally Bound" : "Evidence not proven"}
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 text-cyan-400" />
                      {proof.status === "VERIFIED" ? "World evidence root independently reproducible" : "Gameplay truth unchanged; evidence remains fail-closed"}
                    </div>
                  </div>
                </div>
              ))}

              {proofsQuery.data?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Globe className="h-12 w-12 mb-4 opacity-10" />
                  <p className="italic">No global state proofs have been consolidated yet.</p>
                  <p className="text-[10px] mt-1">Reconciliation service is monitoring world epochs.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="border-emerald-300/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-sm text-emerald-100 font-medium">Reconciliation Protocol</CardTitle>
        </CardHeader>
        <CardContent className="text-[11px] text-slate-400 leading-relaxed space-y-2">
          <p>
            1. <b>Epoch Staging:</b> The global host proposes a world epoch after resolving world-wide events (weather, ecology).
          </p>
          <p>
            2. <b>Zone Evidence:</b> Exact persisted causal receipt ranges are grouped into deterministic zone epoch roots.
          </p>
          <p>
            3. <b>Evidence Aggregation:</b> Every expected live causal zone must be present; missing or mismatched evidence becomes UNPROVABLE.
          </p>
          <p>
            4. <b>Consolidation:</b> Canonically sorted zone roots and the previous world root are hashed into one evidence-only World Causal Root.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
