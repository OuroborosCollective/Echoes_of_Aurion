import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Compass,
  Database,
  Eye,
  FileCode,
  GitCommit,
  Layers,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export default function QuestStudio() {
  const utils = trpc.useUtils();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('qi_1_tpl_caravan_investigation_a1b2c3d4');
  const [draftTemplateId, setDraftTemplateId] = useState('tpl_caravan_investigation');
  const [draftVersion, setDraftVersion] = useState(2);
  const [proposedJson, setProposedJson] = useState(
    JSON.stringify(
      {
        title: 'Caravan Ambush Investigation v2',
        description: 'Expanded evidence gathering with additional merchant trust multipliers.',
        maxCompositionDepth: 12,
      },
      null,
      2
    )
  );

  const statusQuery = trpc.aurionQuest.status.useQuery();
  const templatesQuery = trpc.aurionQuest.templates.useQuery();
  const factsQuery = trpc.aurionQuest.facts.useQuery();
  const instancesQuery = trpc.aurionQuest.instances.useQuery();

  const replayMutation = trpc.aurionQuest.replay.useMutation();
  const proposeMutation = trpc.aurionQuest.proposeDraft.useMutation({
    onSuccess: () => {
      void utils.aurionQuest.status.invalidate();
    },
  });
  const visualSupportMutation = trpc.aurionQuest.visualSupport.useMutation();

  const status = statusQuery.data;
  const templates = templatesQuery.data || [];
  const facts = factsQuery.data || [];
  const instances = instancesQuery.data || [];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-100">
              <Compass className="h-6 w-6 text-cyan-400" />
              Aurion Quest Studio & Compiler (AIM-298)
            </h1>
            <p className="text-sm text-slate-400">
              Deterministic quest compilation, role resolution, causality verification, and Game Dev 1.0.2 visual support.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">
              Compiler v1.0.0
            </Badge>
            <Badge variant="outline" className="border-amber-500/40 text-amber-300">
              Schema: aurion.quest.v1
            </Badge>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">Template Set Hash</p>
                  <p className="mt-1 font-mono text-xs text-cyan-300">
                    {status?.activeTemplateSetHash ? `${status.activeTemplateSetHash.slice(0, 14)}...` : 'Loading...'}
                  </p>
                </div>
                <Layers className="h-5 w-5 text-cyan-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">Active Templates</p>
                  <p className="mt-1 text-xl font-bold text-slate-100">{status?.activeTemplatesCount ?? 0}</p>
                </div>
                <FileCode className="h-5 w-5 text-emerald-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">World Facts Sequence</p>
                  <p className="mt-1 text-xl font-bold text-amber-200">
                    Seq #{status?.worldStateSequence ?? 0} ({status?.worldFactsCount ?? 0} Facts)
                  </p>
                </div>
                <Database className="h-5 w-5 text-amber-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400">Game Dev 1.0.2</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Rev: <span className="font-mono text-cyan-300">96a0b4f3</span>
                  </p>
                </div>
                <ShieldCheck className="h-5 w-5 text-purple-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Operations */}
        <Tabs defaultValue="templates" className="space-y-4">
          <TabsList className="border-slate-800 bg-slate-900">
            <TabsTrigger value="templates" className="data-[state=active]:bg-cyan-950 data-[state=active]:text-cyan-200">
              Templates & Drafts
            </TabsTrigger>
            <TabsTrigger value="graph" className="data-[state=active]:bg-cyan-950 data-[state=active]:text-cyan-200">
              Graph & Plan Inspector
            </TabsTrigger>
            <TabsTrigger value="instances" className="data-[state=active]:bg-cyan-950 data-[state=active]:text-cyan-200">
              Live Instances
            </TabsTrigger>
            <TabsTrigger value="replay" className="data-[state=active]:bg-cyan-950 data-[state=active]:text-cyan-200">
              Deterministic Replay
            </TabsTrigger>
            <TabsTrigger value="gamedev" className="data-[state=active]:bg-cyan-950 data-[state=active]:text-cyan-200">
              Game Dev 1.0.2 Visual Support
            </TabsTrigger>
          </TabsList>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="border-slate-800 bg-slate-900/80">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-100">Active Quest Templates</CardTitle>
                  <CardDescription className="text-slate-400">
                    Canonical templates currently registered in the compiler.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {templates.map(tpl => (
                    <div key={`${tpl.templateId}-v${tpl.version}`} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-cyan-300">{tpl.title}</span>
                        <Badge variant="outline" className="border-slate-700 text-slate-300">
                          v{tpl.version}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{tpl.description}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary" className="bg-slate-900 text-slate-300">
                          Nodes: {tpl.nodes.length}
                        </Badge>
                        <Badge variant="secondary" className="bg-slate-900 text-slate-300">
                          Roles: {tpl.roles.map(r => r.roleName).join(', ')}
                        </Badge>
                        <Badge variant="secondary" className="bg-slate-900 text-slate-300">
                          Outcomes: {tpl.outcomes.length}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-slate-900/80">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-100">Propose Template Draft Proposal</CardTitle>
                  <CardDescription className="text-slate-400">
                    Submits a draft proposal bound to the expected template set hash without direct mutation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-300">Template ID</Label>
                    <Input
                      value={draftTemplateId}
                      onChange={e => setDraftTemplateId(e.target.value)}
                      className="border-slate-800 bg-slate-950 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-300">Version</Label>
                    <Input
                      type="number"
                      value={draftVersion}
                      onChange={e => setDraftVersion(parseInt(e.target.value) || 1)}
                      className="border-slate-800 bg-slate-950 text-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-300">Proposed Payload (JSON)</Label>
                    <textarea
                      value={proposedJson}
                      onChange={e => setProposedJson(e.target.value)}
                      rows={5}
                      className="w-full rounded-md border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <Button
                    onClick={() =>
                      proposeMutation.mutate({
                        templateId: draftTemplateId,
                        templateVersion: draftVersion,
                        proposedDataJson: proposedJson,
                      })
                    }
                    disabled={proposeMutation.isPending}
                    className="w-full bg-cyan-600 hover:bg-cyan-500"
                  >
                    {proposeMutation.isPending ? 'Submitting Proposal...' : 'Submit Draft Proposal'}
                  </Button>

                  {proposeMutation.data && (
                    <div className="rounded-md border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300">
                      <p className="font-semibold">Proposal Created Successfully!</p>
                      <p className="font-mono text-[11px] mt-1">Receipt Hash: {proposeMutation.data.receiptHash}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Graph Inspector Tab */}
          <TabsContent value="graph" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">Quest Graph & Plan Structure</CardTitle>
                <CardDescription className="text-slate-400">
                  Visual node/edge graph representation compiled by the Aurion Quest Engine.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {templates[0]?.nodes.map((node, idx) => (
                    <div key={node.id} className="relative rounded-lg border border-cyan-500/30 bg-slate-950 p-4">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-cyan-950 text-cyan-300">Step {idx + 1}</Badge>
                        <span className="font-mono text-[10px] text-slate-400">{node.type}</span>
                      </div>
                      <h4 className="mt-2 font-semibold text-slate-100">{node.title}</h4>
                      {node.objective && (
                        <p className="mt-1 text-xs text-amber-300">
                          Objective: {node.objective.description} ({node.objective.targetValue})
                        </p>
                      )}
                      <p className="mt-2 text-[11px] font-mono text-slate-500">Key: {node.narrativeKey}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Instances Tab */}
          <TabsContent value="instances" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">Live Quest Instances</CardTitle>
                <CardDescription className="text-slate-400">
                  Authoritative player quest instances persisted in Aurion storage.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {instances.map(inst => (
                    <div key={inst.id} className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950 p-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-cyan-300">{inst.id}</span>
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                            {inst.state}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          Player ID: {inst.playerUserId} | Template: {inst.templateId} v{inst.templateVersion}
                        </p>
                        <p className="font-mono text-[10px] text-slate-500 mt-1">
                          Seed Digest: {inst.seedDigest.slice(0, 16)}... | Plan Hash: {inst.planHash.slice(0, 16)}...
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedInstanceId(inst.id);
                          replayMutation.mutate({ instanceId: inst.id });
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200"
                      >
                        Replay Instance
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Replay Tab */}
          <TabsContent value="replay" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">Deterministic Replay Verification</CardTitle>
                <CardDescription className="text-slate-400">
                  Re-evaluates seed digest, candidate resolution, and graph composition against original source inputs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={selectedInstanceId}
                    onChange={e => setSelectedInstanceId(e.target.value)}
                    placeholder="Enter Instance ID"
                    className="border-slate-800 bg-slate-950 font-mono text-xs text-slate-200"
                  />
                  <Button
                    onClick={() => replayMutation.mutate({ instanceId: selectedInstanceId })}
                    disabled={replayMutation.isPending}
                    className="bg-cyan-600 hover:bg-cyan-500"
                  >
                    <Play className="mr-1 h-4 w-4" /> Run Replay
                  </Button>
                </div>

                {replayMutation.data && (
                  <div
                    className={`rounded-lg border p-4 text-xs ${
                      replayMutation.data.verdict === 'MATCH'
                        ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-200'
                        : 'border-red-500/30 bg-red-950/40 text-red-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {replayMutation.data.verdict === 'MATCH' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                      )}
                      Verdict: {replayMutation.data.verdict}
                    </div>

                    <div className="mt-3 space-y-1 font-mono text-[11px]">
                      <p>Expected Plan Hash: {replayMutation.data.sourceTuple.expectedPlanHash}</p>
                      <p>Replayed Plan Hash: {replayMutation.data.replayedPlanHash}</p>
                      <p>Replayed Graph Hash: {replayMutation.data.replayedGraphHash}</p>
                    </div>

                    {replayMutation.data.firstDivergenceDetails && (
                      <p className="mt-2 text-red-300 font-semibold">{replayMutation.data.firstDivergenceDetails}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Game Dev 1.0.2 Support Tab */}
          <TabsContent value="gamedev" className="space-y-4">
            <Card className="border-slate-800 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-lg text-slate-100">Game Development Studio 1.0.2 Visual Support</CardTitle>
                <CardDescription className="text-slate-400">
                  Generates immutable visual support receipts bound to approved GLB asset catalog IDs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() =>
                    visualSupportMutation.mutate({
                      templateVersionId: 'tpl_caravan_investigation:v1',
                      assets: [
                        { assetId: 'npc_merchant_kaelen', purpose: 'giver_npc' },
                        { assetId: 'item_damaged_manifest', purpose: 'prop_item' },
                      ],
                    })
                  }
                  disabled={visualSupportMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-500"
                >
                  <Sparkles className="mr-1 h-4 w-4" /> Inspect & Validate Visual Assets
                </Button>

                {visualSupportMutation.data && (
                  <div className="rounded-lg border border-purple-500/30 bg-purple-950/30 p-4 text-xs text-purple-200 space-y-2">
                    <p className="font-bold text-sm">Visual Support Receipt Emitted</p>
                    <p className="font-mono text-[11px]">Schema: {visualSupportMutation.data.schemaVersion}</p>
                    <p className="font-mono text-[11px]">Asset Set Hash: {visualSupportMutation.data.assetSetHash}</p>
                    <p className="font-mono text-[11px]">
                      Game Dev: v{visualSupportMutation.data.gameDevelopmentStudio.version} (Rev:{' '}
                      {visualSupportMutation.data.gameDevelopmentStudio.sourceRevision.slice(0, 8)})
                    </p>
                    <div className="mt-2 space-y-1">
                      {visualSupportMutation.data.assets.map((a, i) => (
                        <div key={i} className="rounded border border-purple-900/50 bg-slate-950 p-2 font-mono text-[11px]">
                          Asset: {a.assetId} | Purpose: {a.purpose} | Verdict: <Badge variant="outline">{a.verdict}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
