import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Code, Globe, MessageSquare, Play, Search, Terminal, Filter } from "lucide-react";

export default function SessionReplayVisualizer() {
  const [logType, setLogType] = useState<any>("sessionReplay");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const logsQuery = trpc.sessionLogs.getLogs.useQuery({ type: logType, limit: 200 });
  const replayMutation = trpc.sessionLogs.triggerReplay.useMutation();

  const filteredLogs = useMemo(() => {
    if (!logsQuery.data) return [];
    
    return logsQuery.data.filter((entry: any) => {
      // Search text filter
      const logString = JSON.stringify(entry.data).toLowerCase();
      const matchesSearch = logString.includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Status code filter (only for network requests)
      if (logType === "networkRequests" && statusFilter !== "all") {
        const status = entry.data.response?.status;
        if (statusFilter === "success") return status >= 200 && status < 300;
        if (statusFilter === "error") return status >= 400;
        if (statusFilter === "redirect") return status >= 300 && status < 400;
      }

      return true;
    });
  }, [logsQuery.data, searchQuery, statusFilter, logType]);

  const handleTriggerReplay = () => {
    replayMutation.mutate({});
  };

  return (
    <div className="space-y-6">
      <Card className="border-amber-200/15 bg-slate-950/70">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-amber-100 flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-400" /> Session Audit & Replay
            </CardTitle>
            <CardDescription>
              Step through captured agent interactions, network traffic, and console output.
            </CardDescription>
          </div>
          <Button 
            onClick={handleTriggerReplay} 
            disabled={replayMutation.isPending}
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-300"
          >
            <Play className="mr-2 h-4 w-4" /> 
            {replayMutation.isPending ? "Starting Replay..." : "Trigger Replay"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-900 border-cyan-200/10 text-cyan-100"
              />
            </div>
            
            {logType === "networkRequests" && (
              <div className="w-[180px]">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="bg-slate-900 border-cyan-200/10 text-cyan-100">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-cyan-200/10 text-cyan-100">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="success">Success (2xx)</SelectItem>
                    <SelectItem value="redirect">Redirect (3xx)</SelectItem>
                    <SelectItem value="error">Error (4xx+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Tabs value={logType} onValueChange={setLogType} className="w-full">
            <TabsList className="bg-slate-900 border-cyan-200/10">
              <TabsTrigger value="sessionReplay" className="gap-2">
                <Activity className="h-4 w-4" /> UI Events
              </TabsTrigger>
              <TabsTrigger value="networkRequests" className="gap-2">
                <Globe className="h-4 w-4" /> Network
              </TabsTrigger>
              <TabsTrigger value="browserConsole" className="gap-2">
                <MessageSquare className="h-4 w-4" /> Console
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 border border-cyan-200/10 rounded-lg bg-slate-950/50">
              <ScrollArea className="h-[500px] w-full">
                <div className="p-4 space-y-3">
                  {logsQuery.isLoading && <p className="text-slate-500 italic">Loading audit logs...</p>}
                  {!logsQuery.isLoading && filteredLogs.length === 0 && (
                    <p className="text-slate-500 italic">No matching logs found.</p>
                  )}
                  
                  {filteredLogs.map((entry: any, i: number) => (
                    <div key={i} className="flex gap-4 text-xs font-mono border-b border-white/5 pb-2 last:border-0">
                      <span className="text-slate-500 shrink-0">[{entry.timestamp}]</span>
                      <div className="space-y-1 overflow-hidden">
                        {logType === "sessionReplay" && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge variant="outline" className="text-cyan-400 border-cyan-400/20 uppercase text-[10px]">
                              {entry.data.kind}
                            </Badge>
                            <span className="text-slate-300">
                              {entry.data.kind === "click" && `at ${entry.data.payload.target?.selectorHint}`}
                              {entry.data.kind === "navigate" && `to ${entry.data.payload.reason}`}
                              {entry.data.kind === "change" && `input: ${entry.data.payload.target?.name}`}
                            </span>
                          </div>
                        )}

                        {logType === "networkRequests" && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge variant="outline" className={`${
                              (entry.data.response?.status || 0) >= 400 ? "text-red-400 border-red-400/20" : "text-emerald-400 border-emerald-400/20"
                            } uppercase text-[10px]`}>
                              {entry.data.method}
                            </Badge>
                            <span className="text-cyan-100 truncate max-w-[400px]">{entry.data.url}</span>
                            <span className="text-slate-500">{entry.data.response?.status || "???"}</span>
                          </div>
                        )}

                        {logType === "browserConsole" && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge variant="outline" className={`${
                              entry.data.level === "ERROR" ? "text-red-400 border-red-400/20" : 
                              entry.data.level === "WARN" ? "text-amber-400 border-amber-400/20" : "text-slate-400"
                            } uppercase text-[10px]`}>
                              {entry.data.level}
                            </Badge>
                            <span className="text-slate-200">
                              {Array.isArray(entry.data.args) ? entry.data.args.map((a: any) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') : entry.data.message}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="border-cyan-300/10 bg-slate-950/70">
        <CardHeader>
          <CardTitle className="text-amber-100 flex items-center gap-2">
            <Terminal className="h-5 w-5" /> Replay Terminal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="bg-slate-950 p-4 rounded-lg text-xs font-mono text-cyan-300 border border-cyan-200/10">
            {`# Manually trigger a deterministic replay from CLI
tsx scripts/replay-session-audit.ts sessionReplay.log`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
