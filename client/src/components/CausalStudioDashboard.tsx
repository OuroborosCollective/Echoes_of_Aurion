import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, FileCode2, PlayCircle, History, Database, Check, Download, Activity, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, Tooltip as RechartsTooltip, YAxis } from "recharts";

export default function CausalStudioDashboard() {
  const [zoneId, setZoneId] = useState("observatory_threshold");
  const [tickNumber, setTickNumber] = useState<number>(0);
  const [lastVerdict, setLastVerdict] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDiffTree, setShowDiffTree] = useState(false);

  const healthQuery = useQuery({
    queryKey: ["healthz"],
    queryFn: async () => {
      const res = await fetch("/healthz");
      if (!res.ok) throw new Error("Failed to fetch health check");
      return res.json();
    }
  });

  const replayMutation = trpc.causality.replayTick.useMutation();
  const checkpointsQuery = trpc.causality.getCheckpoints.useQuery({ zoneId, limit: 100 });

  const handleReplay = async () => {
    try {
      const result = await replayMutation.mutateAsync({ zoneId, tick: tickNumber });
      setLastVerdict(result);
    } catch (err: any) {
      setLastVerdict({ error: err.message });
    }
  };

  const handleExportDiagnostics = () => {
    const diagnosticData = {
      timestamp: new Date().toISOString(),
      identity: healthQuery.data,
      zoneId,
      tickNumber,
      verdict: lastVerdict
    };
    
    const blob = new Blob([JSON.stringify(diagnosticData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `causal-diagnostic-${zoneId}-${tickNumber}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Diagnostic data exported successfully");
  };

  const filteredCheckpoints = useMemo(() => {
    if (!checkpointsQuery.data) return [];
    if (!searchQuery) return checkpointsQuery.data;
    const lowerQuery = searchQuery.toLowerCase();
    return checkpointsQuery.data.filter(cp => 
      cp.stateHash.toLowerCase().includes(lowerQuery) || 
      cp.id.toLowerCase().includes(lowerQuery)
    );
  }, [checkpointsQuery.data, searchQuery]);

  // Generate sparkline data: map checkpoints to a divergence magnitude score
  // If reconciled === 1, divergence is 0. If reconciled === 0 (divergent), we give it a magnitude.
  const sparklineData = useMemo(() => {
    if (!checkpointsQuery.data) return [];
    return [...checkpointsQuery.data].reverse().map(cp => ({
      tick: cp.tick,
      divergence: cp.reconciled === 1 ? 0 : 100 // simplistic magnitude for visualization
    }));
  }, [checkpointsQuery.data]);

  const stages = [
    { id: "pre", label: "PRE" },
    { id: "inputs", label: "Inputs" },
    { id: "movement", label: "Movement" },
    { id: "action", label: "Player Action" },
    { id: "resources", label: "Resources" },
    { id: "mob_fsm", label: "Mob FSM" },
    { id: "mob_combat", label: "Mob Combat" },
    { id: "post", label: "POST" }
  ];

  const getStageStatus = (stageId: string) => {
    if (!lastVerdict || lastVerdict.error) return "pending";
    if (lastVerdict.isMatch) return "match";
    
    // First divergence logic
    if (lastVerdict.verdict.status === "FIRST_DIVERGENCE") {
      const stageOrder = stages.map(s => s.id);
      const errIndex = stageOrder.indexOf(lastVerdict.verdict.stage);
      const currentIndex = stageOrder.indexOf(stageId);
      
      if (currentIndex < errIndex) return "match";
      if (currentIndex === errIndex) return "diverged";
      return "unprovable";
    }
    
    return "pending";
  };

  return (
    <div className="space-y-6">
      <Card className="border-cyan-200/15 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-amber-100 flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-cyan-400" /> Causal Studio
          </CardTitle>
          <CardDescription>Detailed tick explorer and receipt chain visualization (Step 24).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
            
            {/* Identity & Context Panel */}
            <div className="space-y-6">
              <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-cyan-300">Runtime Identity</h4>
                  <Button variant="outline" size="icon" className="h-6 w-6 text-cyan-400 border-cyan-400/20 bg-transparent hover:bg-cyan-400/10" onClick={handleExportDiagnostics} title="Export Diagnostic JSON">
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Revision</span>
                    <span className="font-mono text-slate-300 truncate max-w-[150px]">{healthQuery.data?.revision?.substring(0, 8) || "..."}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ruleset</span>
                    <span className="font-mono text-emerald-400">{healthQuery.data?.authority?.ruleset || "..."}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/10 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Build Prov</span>
                    <span className="font-mono text-slate-400 truncate max-w-[120px]" title={healthQuery.data?.buildInputDigest}>{healthQuery.data?.buildInputDigest?.substring(0, 16) || "..."}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Image Prov</span>
                    <span className="font-mono text-slate-400 truncate max-w-[120px]" title={healthQuery.data?.runtimeImageDigest}>{healthQuery.data?.runtimeImageDigest?.substring(0, 16) || "..."}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Donor Prov</span>
                    <span className="font-mono text-slate-400 truncate max-w-[120px]">aurion-nexus-stable</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 rounded-xl border border-cyan-200/10 bg-cyan-400/[.03]">
                <h4 className="text-sm font-semibold text-cyan-300">Tick Explorer</h4>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">World / Zone</Label>
                    <Input 
                      value={zoneId} 
                      onChange={e => setZoneId(e.target.value)} 
                      className="h-8 text-xs bg-slate-900 border-white/10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tick</Label>
                    <Input 
                      type="number" 
                      value={tickNumber} 
                      onChange={e => setTickNumber(parseInt(e.target.value) || 0)} 
                      className="h-8 text-xs bg-slate-900 border-white/10"
                    />
                  </div>
                  <Button 
                    onClick={handleReplay} 
                    disabled={replayMutation.isPending}
                    className="w-full h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    {replayMutation.isPending ? "Computing..." : "Explore Tick"}
                  </Button>
                </div>
              </div>

              {/* Sparkline Chart */}
              <div className="space-y-4 p-4 rounded-xl border border-red-500/10 bg-red-500/[.02]">
                <h4 className="text-sm font-semibold text-red-300 flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Divergence Frequency
                </h4>
                <div className="h-16 w-full cursor-pointer">
                  {sparklineData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sparklineData} onClick={(e) => {
                        if (e && e.activePayload && e.activePayload.length > 0) {
                          setTickNumber(e.activePayload[0].payload.tick);
                        }
                      }}>
                        <YAxis hide domain={[0, 100]} />
                        <RechartsTooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px' }}
                          labelStyle={{ color: '#94a3b8' }}
                        />
                        <Line type="monotone" dataKey="divergence" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4, cursor: 'pointer' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500 italic">No checkpoint data</div>
                  )}
                </div>
              </div>
            </div>

            {/* Stages & Receipt Panel */}
            <div className="p-4 rounded-xl border border-white/10 bg-black/40 space-y-4">
              <h4 className="text-sm font-semibold text-amber-100 flex items-center justify-between">
                <span>Transition Stages</span>
                {lastVerdict && (
                  <Badge variant={lastVerdict.isMatch ? "default" : "destructive"} className="uppercase text-[10px]">
                    {lastVerdict.isMatch ? "MATCH" : lastVerdict.verdict?.status || "ERROR"}
                  </Badge>
                )}
              </h4>
              
              {!lastVerdict ? (
                <div className="h-[200px] flex items-center justify-center text-xs text-slate-500 border border-dashed border-white/10 rounded-lg">
                  Select a zone and tick to explore causal transition stages.
                </div>
              ) : lastVerdict.error ? (
                <div className="p-4 rounded border border-red-500/20 bg-red-950/20 text-red-400 text-sm">
                  {lastVerdict.error}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Current State Hashes Display */}
                  <div className="p-3 rounded-lg bg-white/[0.03] border border-white/10 space-y-2 text-xs font-mono">
                    <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1">
                      <span className="text-slate-500">PRE HASH:</span>
                      <span className="text-cyan-300 truncate">a3b4cdef987...</span>
                      <span className="text-slate-500">POST HASH:</span>
                      <span className="text-emerald-300 truncate">{lastVerdict.isMatch ? "c5d6effa123..." : "---"}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="grid gap-2">
                      {stages.map((stage) => {
                      const status = getStageStatus(stage.id);
                      return (
                        <div key={stage.id} className={`flex items-center justify-between p-2 rounded text-xs border ${
                          status === "match" ? "border-emerald-500/20 bg-emerald-500/5" :
                          status === "diverged" ? "border-red-500/30 bg-red-500/10" :
                          status === "unprovable" ? "border-amber-500/20 bg-amber-500/5 text-amber-300/50" :
                          "border-white/5 bg-white/5 text-slate-500"
                        }`}>
                          <div className="flex items-center gap-2">
                            {status === "match" && <Check className="h-3 w-3 text-emerald-400" />}
                            {status === "diverged" && <AlertCircle className="h-3 w-3 text-red-400" />}
                            {status === "unprovable" && <History className="h-3 w-3 text-amber-400/50" />}
                            {status === "pending" && <div className="h-3 w-3 rounded-full border border-slate-600" />}
                            <span className={
                              status === "match" ? "text-emerald-100" :
                              status === "diverged" ? "text-red-200 font-bold" : ""
                            }>{stage.label}</span>
                          </div>
                          
                          {/* Optional detailed hashes or input counts if we had them in the verdict */}
                          <div className="font-mono text-[10px]">
                            {status === "match" && "✓"}
                            {status === "diverged" && "FIRST_DIVERGENCE"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  </div>

                  {!lastVerdict.isMatch && lastVerdict.verdict?.status === "FIRST_DIVERGENCE" && (
                    <div className="mt-4 p-3 rounded bg-red-950/30 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)] space-y-3 text-xs font-mono relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                      <div className="flex items-center justify-between">
                        <p className="text-red-300 font-bold flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" /> 
                          CRITICAL DIVERGENCE ({lastVerdict.verdict.stage})
                        </p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-6 text-[10px] bg-red-950/50 text-red-300 border-red-500/30 hover:bg-red-900/50 hover:text-red-200"
                          onClick={() => setShowDiffTree(!showDiffTree)}
                        >
                          <FileCode2 className="h-3 w-3 mr-1" />
                          {showDiffTree ? "Hide Diff" : "View Diff Tree"}
                        </Button>
                      </div>

                      {showDiffTree ? (
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div className="space-y-1">
                            <div className="text-emerald-400 font-bold mb-1 border-b border-emerald-500/30 pb-1">Expected State Hash</div>
                            <pre className="text-emerald-300/80 bg-black/40 p-2 rounded overflow-x-auto">
{`{
  "stage": "${lastVerdict.verdict.stage}",
  "hash": "${lastVerdict.verdict.expectedHash}"
}`}
                            </pre>
                          </div>
                          <div className="space-y-1">
                            <div className="text-red-400 font-bold mb-1 border-b border-red-500/30 pb-1">Observed State Hash</div>
                            <pre className="text-red-300/80 bg-black/40 p-2 rounded overflow-x-auto">
{`{
  "stage": "${lastVerdict.verdict.stage}",
  "hash": "${lastVerdict.verdict.observedHash}",
  "diff": "${lastVerdict.verdict.diffDetails?.replace(/"/g, '\\"') || "Hash mismatch detected"}"
}`}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1 items-start mt-2">
                          <span className="text-slate-500">Expected:</span>
                          <span className="text-emerald-300 break-all">{lastVerdict.verdict.expectedHash}</span>
                          <span className="text-slate-500">Observed:</span>
                          <span className="text-red-300 break-all">{lastVerdict.verdict.observedHash}</span>
                        </div>
                      )}
                      
                      {!showDiffTree && lastVerdict.verdict.diffDetails && (
                        <p className="mt-2 text-red-300/80 font-sans italic">{lastVerdict.verdict.diffDetails}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
          </div>

          {/* State Hash History Panel */}
          <div className="mt-6 p-4 rounded-xl border border-white/10 bg-black/20 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h4 className="text-sm font-semibold text-amber-100 flex items-center gap-2">
                <Database className="h-4 w-4" /> State Hash History
              </h4>
              <div className="relative w-full sm:w-[300px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Filter by hash or ID..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs bg-slate-900 border-white/10"
                />
              </div>
            </div>
            
            <ScrollArea className="h-[200px] w-full rounded border border-white/5 bg-slate-950/50">
              <div className="p-2 space-y-1">
                {checkpointsQuery.isLoading ? (
                  <p className="p-4 text-xs text-slate-500 text-center">Loading history...</p>
                ) : filteredCheckpoints.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">No matching checkpoints found.</p>
                ) : (
                  filteredCheckpoints.map(cp => (
                    <div key={cp.id} className="grid grid-cols-[60px_1fr_60px] gap-2 items-center p-2 rounded hover:bg-white/5 text-xs border-b border-white/5 last:border-0 cursor-pointer" onClick={() => setTickNumber(cp.tick)}>
                      <span className="font-mono text-slate-400">T-{cp.tick}</span>
                      <span className="font-mono text-cyan-300 truncate" title={cp.stateHash}>{cp.stateHash}</span>
                      <Badge variant={cp.reconciled === 1 ? "outline" : "destructive"} className="text-[9px] uppercase justify-center">
                        {cp.reconciled === 1 ? "SYNC" : "DIV"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
