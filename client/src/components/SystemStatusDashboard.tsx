import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SystemStatusDashboard() {
  const { data: statuses, isLoading, isError, refetch } = trpc.system.dashboardStatus.useQuery(undefined, {
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center space-x-2 text-cyan-200/60">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span className="text-sm">Verifying system connectivity...</span>
      </div>
    );
  }

  if (isError || !statuses) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 text-center text-red-200">
        <XCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
        <p className="font-medium">Failed to retrieve system status dashboard</p>
        <button onClick={() => refetch()} className="mt-4 text-xs underline hover:text-red-100">
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-cyan-200/60">Auto-refreshing every 30 seconds</p>
        <button 
          onClick={() => refetch()} 
          className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Force Refresh
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {statuses.map((s: any) => {
          const isUp = s.status === "UP";
          const isDown = s.status === "DOWN";
          const isMaintained = s.status === "MAINTAINED";
          
          return (
            <Card key={s.service} className={`border ${isUp ? 'border-emerald-500/20 bg-emerald-950/20' : isDown ? 'border-red-500/30 bg-red-950/20' : 'border-amber-500/20 bg-amber-950/20'} overflow-hidden`}>
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className={`h-4 w-4 ${isUp ? 'text-emerald-400' : isDown ? 'text-red-400' : 'text-amber-400'}`} />
                    <CardTitle className="text-sm font-semibold text-slate-200">
                      {s.service}
                    </CardTitle>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-[10px] uppercase tracking-wider ${isUp ? 'border-emerald-500/30 text-emerald-300' : isDown ? 'border-red-500/30 text-red-300' : 'border-amber-500/30 text-amber-300'}`}
                  >
                    {s.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {!isUp && (
                  <div className="mt-1 flex items-start gap-2 rounded bg-black/40 p-2.5">
                    {isDown ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-300">
                        {isDown ? "Service Disconnected" : "Service Offline/Unconfigured"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400 font-mono break-words">
                        {s.reason || "No diagnostic reason provided"}
                      </p>
                    </div>
                  </div>
                )}
                {isUp && (
                  <div className="mt-1 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs text-emerald-400/80">Online & verified</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
