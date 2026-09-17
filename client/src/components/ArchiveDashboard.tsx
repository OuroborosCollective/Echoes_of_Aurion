import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Archive, Clock, History, Search, FileText, Database, ShieldCheck, Download } from "lucide-react";

export default function ArchiveDashboard() {
  const [zoneId, setZoneId] = useState("aurion-nexus-01");
  const archivesQuery = trpc.causality.getArchives.useQuery({ zoneId });
  const [selectedArchive, setSelectedArchive] = useState<any>(null);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        <div className="space-y-6">
          <Card className="border-cyan-300/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-100">
                <Archive className="h-5 w-5" /> Causal Archive Explorer
              </CardTitle>
              <CardDescription>
                View and manage long-term stored causal chains.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="archiveZoneId">Zone ID</Label>
                  <Input
                    id="archiveZoneId"
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    className="bg-slate-950 border-cyan-200/20 text-cyan-100"
                  />
                </div>
                <Button variant="outline" className="border-cyan-300/20" onClick={() => archivesQuery.refetch()}>
                  <Search className="h-4 w-4 mr-2" /> Refresh
                </Button>
              </div>

              <ScrollArea className="h-[500px] rounded-md border border-cyan-200/10 p-4">
                <div className="space-y-3">
                  {archivesQuery.isLoading && <p className="text-center py-8 text-slate-500 italic">Reading archives...</p>}
                  {archivesQuery.data?.map((archive: any) => (
                    <div 
                      key={archive.id} 
                      className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                        selectedArchive?.id === archive.id 
                          ? "border-cyan-500 bg-cyan-500/5" 
                          : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                      onClick={() => setSelectedArchive(archive)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="space-y-1">
                          <p className="font-bold text-cyan-100">{archive.id}</p>
                          <div className="flex items-center gap-4 text-[10px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {new Date(archive.createdAt).toLocaleString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <History className="h-3 w-3" /> Ticks {archive.startTick} - {archive.endTick}
                            </span>
                          </div>
                        </div>
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                          {archive.receiptCount} Receipts
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                        <p className="text-[10px] font-mono text-slate-500">Hash: {archive.archiveHash.slice(0, 16)}...</p>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px] text-cyan-400">
                          <Download className="h-3 w-3 mr-1" /> Inspect Payload
                        </Button>
                      </div>
                    </div>
                  ))}
                  {archivesQuery.data?.length === 0 && (
                    <p className="text-center py-12 text-slate-500 italic">No archives found for this zone.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-cyan-300/10 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-amber-100 flex items-center gap-2">
                <FileText className="h-5 w-5" /> Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedArchive ? (
                <div className="space-y-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Archive ID</p>
                    <p className="font-mono text-cyan-100 break-all">{selectedArchive.id}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Duration</p>
                    <p className="text-cyan-100">{selectedArchive.endTick - selectedArchive.startTick} ticks</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Mission Status</p>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">VERIFIED</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Payload Summary</p>
                    <ScrollArea className="h-[200px] w-full rounded border border-white/5 bg-black/30 p-2 font-mono text-[10px] text-slate-400">
                      {JSON.stringify(JSON.parse(selectedArchive.payloadJson).slice(0, 5), null, 2)}
                      {"\n..."}
                    </ScrollArea>
                  </div>
                  <Button className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-300">
                    <ShieldCheck className="h-4 w-4 mr-2" /> Request Forensic Restoration
                  </Button>
                </div>
              ) : (
                <p className="text-center py-12 text-slate-500 italic">Select an archive to view metadata.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-blue-200/15 bg-slate-950/70">
            <CardHeader>
              <CardTitle className="text-blue-100 flex items-center gap-2">
                <Database className="h-5 w-5" /> Storage Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-400">
              <p>• Archives are immutable batches of verified causal history.</p>
              <p>• Restoring from an archive requires a surgical database rollback.</p>
              <p>• End-to-end hash chains are preserved within the payload JSON.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
