import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Database, RefreshCw, Eye, Code2 } from 'lucide-react';
import { toast } from "sonner";
import { format } from "date-fns";
import type { WorldContextEntry } from '../../../shared/aurionWorldContextContract';

export default function ContextStudio() {
  const [selectedCapsuleId, setSelectedCapsuleId] = useState<string>('');
  
  const capsulesQuery = trpc.aurionContext.listCapsules.useQuery({ limit: 20 });
  const capsuleQuery = trpc.aurionContext.getCapsule.useQuery(
    { capsuleId: selectedCapsuleId },
    { enabled: !!selectedCapsuleId }
  );

  const replayMutation = trpc.aurionContext.replayCapsule.useMutation();

  const handleReplay = (capsuleId: string) => {
    replayMutation.mutate(
      { capsuleId },
      {
        onSuccess: (result) => {
          if (result.status === 'MATCH') {
            toast.success('Context capsule hash verified perfectly.');
          } else if (result.status === 'UNPROVABLE') {
            toast.error(`Replay failed: ${result.reason}`);
          } else if (result.status === 'FIRST_DIVERGENCE') {
            toast.error(`Replay failed at stage: ${result.stage}`);
          } else {
            toast.error('Replay mismatch detected.');
          }
        },
        onError: (err) => {
          toast.error(`Error replaying capsule: ${err.message}`);
        }
      }
    );
  };

  const capsules = capsulesQuery.data || [];

  return (
    <DashboardLayout>
      <div className="flex-1 space-y-4 p-8 pt-6 overflow-auto">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">Context Studio</h2>
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              AIM-299 Engine Active
            </Badge>
          </div>
        </div>
        
        <Tabs defaultValue="capsules" className="space-y-4">
          <TabsList>
            <TabsTrigger value="capsules">Context Capsules</TabsTrigger>
            <TabsTrigger value="episodes">Historical Episodes</TabsTrigger>
            <TabsTrigger value="eval">Evaluation Suite</TabsTrigger>
          </TabsList>
          
          <TabsContent value="capsules" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card className="col-span-1">
                <CardHeader>
                  <CardTitle>Recent Context Capsules</CardTitle>
                  <CardDescription>
                    Immutable records of context pipeline resolution.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {capsules.map((capsule) => (
                      <div 
                        key={capsule.id} 
                        className={`p-3 rounded-lg border cursor-pointer hover:bg-accent transition-colors ${selectedCapsuleId === capsule.id ? 'border-primary bg-accent/50' : 'border-border'}`}
                        onClick={() => setSelectedCapsuleId(capsule.id)}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-mono text-xs">{capsule.id.split('_').pop()?.substring(0, 8)}...</span>
                          <Badge variant="outline">{capsule.purpose}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex justify-between">
                          <span>{capsule.actorId}</span>
                          <span>{capsule.logicalTick}</span>
                        </div>
                      </div>
                    ))}
                    {capsules.length === 0 && (
                      <div className="text-sm text-muted-foreground italic text-center py-4">
                        No context capsules found.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="col-span-1 lg:col-span-2">
                <CardHeader>
                  <CardTitle>Capsule Inspector</CardTitle>
                  <CardDescription>
                    {selectedCapsuleId ? `Inspecting ${selectedCapsuleId}` : 'Select a capsule to inspect'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {capsuleQuery.data ? (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label className="text-muted-foreground text-xs">Capsule ID</Label>
                          <div className="font-mono text-sm">{capsuleQuery.data.id}</div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-muted-foreground text-xs">Capsule Hash</Label>
                          <div className="font-mono text-sm">{capsuleQuery.data.capsuleHash}</div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-muted-foreground text-xs">World ID & Tick</Label>
                          <div className="text-sm">{capsuleQuery.data.worldId} @ {capsuleQuery.data.logicalTick}</div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-muted-foreground text-xs">Created At</Label>
                          <div className="text-sm">{format(new Date(capsuleQuery.data.createdAt), 'PPpp')}</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Purpose</Label>
                        <div className="p-3 bg-muted rounded-md text-sm font-mono whitespace-pre-wrap">
                          {JSON.stringify(capsuleQuery.data.capsule.purpose, null, 2)}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Selected Entries ({capsuleQuery.data.capsule.selected.length})</Label>
                        <div className="space-y-2">
                          {capsuleQuery.data.capsule.selected.map((entry: WorldContextEntry, idx: number) => (
                            <div key={idx} className="flex justify-between items-center p-2 border rounded text-sm bg-accent/20">
                              <div className="flex gap-2 items-center">
                                <Badge variant="secondary">{entry.entryKind}</Badge>
                                <span className="font-mono text-xs">{entry.entryId}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{entry.estimatedTokens} tokens</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex justify-end pt-4 border-t">
                        <Button 
                          onClick={() => capsuleQuery.data && handleReplay(capsuleQuery.data.id)}
                          disabled={replayMutation.isPending || !capsuleQuery.data}
                        >
                          <RefreshCw className={`w-4 h-4 mr-2 ${replayMutation.isPending ? 'animate-spin' : ''}`} />
                          Verify Replay
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                      <Database className="w-8 h-8 mb-2 opacity-50" />
                      <p>Select a capsule from the list to view its contents.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="episodes">
            <Card>
              <CardHeader>
                <CardTitle>Historical Episodes</CardTitle>
                <CardDescription>Structured outcomes derived from world context capsules.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Episodes view coming soon.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="eval">
            <Card>
              <CardHeader>
                <CardTitle>Evaluation Suite</CardTitle>
                <CardDescription>AIM-299 context assembly correctness and budget metrics.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Evaluation benchmark runner coming soon.
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
