import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { NpcUtilityChartPanel } from "./NpcUtilityChartPanel";
import { NpcSpatialHeatmap } from "./NpcSpatialHeatmap";
import {
  NPC_UTILITY_CRITICAL_HIGH_BPS,
  NPC_UTILITY_CRITICAL_LOW_BPS,
  classifyUtilityScore,
} from "@shared/npcUtilityThresholds";

const goalLabels: Record<string, string> = {
  seek_safety: "Sicherheit",
  gather_resources: "Ressourcen",
  socialize: "Gemeinschaft",
  gain_reputation: "Ansehen",
  trade: "Handel",
  expand_influence: "Einfluss",
};

const actionLabels: Record<string, string> = {
  consume: "Konsumieren",
  rest: "Ausruhen",
  produce: "Produzieren",
  trade: "Handeln",
  caravan: "Karawane",
  patrol: "Patrouille",
  socialize: "Sozialisieren",
};

const npcNames: Record<string, string> = {
  lyra: "Lyra",
  orun: "Orun",
};

type ScoredCandidate = Readonly<{
  id: string;
  action: string;
  goal: string;
  needPressureBps: number;
  benefitBps: number;
  riskBps: number;
  costBps: number;
  scoreBps: number;
  scoreBreakdown: Readonly<{
    pressureTerm: number;
    benefitTerm: number;
    riskTerm: number;
    costTerm: number;
    personalityBonus: number;
    goalPersistenceBonus: number;
  }>;
  constraintStatus: "eligible" | "blocked";
  constraintCode: string | null;
  declarationIndex: number;
}>;

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-amber-400 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CandidateRow({ candidate, maxScore }: { candidate: ScoredCandidate; maxScore: number }) {
  const blocked = candidate.constraintStatus === "blocked";
  return (
    <div
      data-testid="utility-scored-candidate"
      data-candidate-id={candidate.id}
      data-score={candidate.scoreBps}
      data-blocked={blocked}
      className={`rounded-lg border p-3 text-sm ${blocked ? "border-red-300/20 bg-red-400/[.03] opacity-60" : "border-cyan-200/15 bg-slate-950/60"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <b className="text-amber-50">{actionLabels[candidate.action] ?? candidate.action}</b>
          <span className="text-xs text-slate-400">{goalLabels[candidate.goal] ?? candidate.goal}</span>
        </div>
        {blocked ? (
          <span className="rounded bg-red-300/15 px-2 py-0.5 text-xs text-red-200">
            Blockiert: {candidate.constraintCode}
          </span>
        ) : (
          <span className="font-mono text-sm text-cyan-200">{candidate.scoreBps.toLocaleString("de-DE")} BPS</span>
        )}
      </div>
      {!blocked && (
        <>
          <div className="mt-2">
            <ScoreBar score={candidate.scoreBps} max={maxScore} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-3">
            <span>Bedarfdruck: <b className="text-slate-200">{candidate.scoreBreakdown.pressureTerm.toLocaleString("de-DE")}</b></span>
            <span>Nutzen: <b className="text-emerald-300">+{candidate.scoreBreakdown.benefitTerm.toLocaleString("de-DE")}</b></span>
            <span>Risiko: <b className="text-red-300">−{candidate.scoreBreakdown.riskTerm.toLocaleString("de-DE")}</b></span>
            <span>Kosten: <b className="text-red-300">−{candidate.scoreBreakdown.costTerm.toLocaleString("de-DE")}</b></span>
            {candidate.scoreBreakdown.personalityBonus > 0 && (
              <span>Persönlichkeit: <b className="text-violet-300">+{candidate.scoreBreakdown.personalityBonus.toLocaleString("de-DE")}</b></span>
            )}
            {candidate.scoreBreakdown.goalPersistenceBonus > 0 && (
              <span>Zielbindung: <b className="text-amber-300">+{candidate.scoreBreakdown.goalPersistenceBonus.toLocaleString("de-DE")}</b></span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Druck {candidate.needPressureBps} · Nutzen {candidate.benefitBps} · Risiko {candidate.riskBps} · Kosten {candidate.costBps}
          </div>
        </>
      )}
    </div>
  );
}

function NpcUtilityScoreCard({ npc }: { npc: { npcId: string; resolutionIndex: number; goal: string; scored: readonly ScoredCandidate[] } }) {
  const eligible = npc.scored.filter(c => c.constraintStatus === "eligible");
  const blocked = npc.scored.filter(c => c.constraintStatus === "blocked");
  const maxScore = eligible.length > 0 ? Math.max(...eligible.map(c => c.scoreBps)) : 0;
  const winner = eligible[0] ?? null;
  const winnerScore = winner?.scoreBps ?? 0;
  const threshold = classifyUtilityScore(winnerScore);

  return (
    <article data-testid="npc-utility-score-card" data-npc-id={npc.npcId} data-threshold={threshold} className={`space-y-3 rounded-lg p-3 ${threshold === "critical_low" ? "border border-red-500/40 bg-red-500/[.04]" : threshold === "critical_high" ? "border border-amber-400/40 bg-amber-400/[.04]" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <b className="text-amber-100">{npcNames[npc.npcId] ?? npc.npcId}</b>
          {threshold === "critical_low" && (
            <span data-testid="threshold-badge-low" className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
              ⚠ Kritisch niedrig
            </span>
          )}
          {threshold === "critical_high" && (
            <span data-testid="threshold-badge-high" className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              ⚠ Kritisch hoch
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">
          Ziel: {goalLabels[npc.goal] ?? npc.goal} · Tick {npc.resolutionIndex}
        </span>
      </div>
      {winner && (
        <div className={`rounded-lg border p-2 text-sm ${threshold === "critical_low" ? "border-red-500/30 bg-red-500/[.06]" : threshold === "critical_high" ? "border-amber-400/30 bg-amber-400/[.06]" : "border-amber-300/30 bg-amber-400/[.06]"}`}>
          <span className="text-amber-200">Gewinner: </span>
          <b className="text-amber-100">{actionLabels[winner.action] ?? winner.action}</b>
          <span className="ml-2 font-mono text-xs text-amber-300">{winner.scoreBps.toLocaleString("de-DE")} BPS</span>
          {threshold !== "stable" && (
            <span className="ml-2 text-[10px] text-slate-400">
              Schwellen: ≤{NPC_UTILITY_CRITICAL_LOW_BPS.toLocaleString("de-DE")} / ≥{NPC_UTILITY_CRITICAL_HIGH_BPS.toLocaleString("de-DE")} BPS
            </span>
          )}
        </div>
      )}
      <div className="space-y-2">
        {npc.scored.map(c => (
          <CandidateRow key={`${npc.npcId}-${c.id}`} candidate={c} maxScore={maxScore} />
        ))}
      </div>
      {blocked.length > 0 && (
        <p className="text-xs text-slate-500">{blocked.length} blockiert · {eligible.length} zulässig</p>
      )}
    </article>
  );
}

export function NpcUtilityPlannerDebugPanel({ userId }: { userId: number }) {
  const [enabled, setEnabled] = useState(false);
  const query = trpc.gameplay.npcUtilityScores.useQuery(undefined, {
    enabled: userId > 0 && enabled,
    staleTime: 10_000,
    refetchInterval: 5_000,
  });

  const npcs = query.data?.npcs ?? [];

  return (
    <section aria-label="NPC Utility Planner Debug" data-testid="npc-utility-debug-panel">
      <div className="flex items-center justify-between">
        <h4 className="text-violet-200">Utility Planner · Debug-Scores</h4>
        <button
          onClick={() => setEnabled(v => !v)}
          className="rounded-md border border-violet-300/30 px-3 py-1 text-xs text-violet-200 hover:bg-violet-400/10"
          data-testid="utility-debug-toggle"
        >
          {enabled ? "Ausblenden" : "Einblenden"}
        </button>
      </div>
      {enabled && (
        <>
          {query.isError ? (
            <p role="alert" className="mt-2 text-sm text-red-200">Die Utility-Scores konnten nicht geladen werden.</p>
          ) : !query.data ? (
            <p role="status" className="mt-2 text-sm text-slate-400">Utility-Scores werden geladen…</p>
          ) : npcs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Keine NPC-Entscheidungsdaten verfügbar.</p>
          ) : (
            <>
              {query.isStale && <p role="status" className="mt-1 text-xs text-slate-500">Aktualisierung ausstehend…</p>}
              <div className="mt-3 space-y-4">
                {npcs.map((npc: { npcId: string; resolutionIndex: number; goal: string; scored: readonly ScoredCandidate[] }) => (
                  <NpcUtilityScoreCard key={npc.npcId} npc={npc} />
                ))}
              </div>
              <NpcUtilityChartPanel npcs={npcs} />
              <NpcSpatialHeatmap npcs={npcs} />
            </>
          )}
        </>
      )}
    </section>
  );
}
