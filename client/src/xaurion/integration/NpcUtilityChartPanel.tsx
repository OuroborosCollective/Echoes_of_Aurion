/**
 * NPC Utility Planner — visuelle Analyseansicht.
 *
 * Stellt die berechneten Utility-Scores als horizontales Balkendiagramm dar,
 * damit NPC-Prioritäten in der Simulation direkt nachvollziehbar sind.
 * Jede NPC-Karte zeigt alle Kandidaten mit ihrem Score, aufgeschlüsselt nach
 * den Score-Komponenten (Druck, Nutzen, Risiko, Kosten, Boni).
 */

const actionLabels: Record<string, string> = {
  consume: "Konsum",
  rest: "Ruhe",
  produce: "Produktion",
  trade: "Handel",
  caravan: "Karawane",
  patrol: "Patrouille",
  socialize: "Sozial",
};

const actionColors: Record<string, string> = {
  consume: "#34d399",
  rest: "#60a5fa",
  produce: "#fbbf24",
  trade: "#f472b6",
  caravan: "#fb923c",
  patrol: "#a78bfa",
  socialize: "#22d3ee",
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

type NpcData = Readonly<{
  npcId: string;
  resolutionIndex: number;
  goal: string;
  scored: readonly ScoredCandidate[];
}>;

const SCORE_MAX = 40_000;

/** Eine gestapelte Balkensegment-Komponente. */
function BarSegment({ value, color, label }: { value: number; color: string; label: string }) {
  if (value === 0) return null;
  const pct = Math.max(0, Math.min(100, (Math.abs(value) / SCORE_MAX) * 100));
  return (
    <div
      className="h-full shrink-0 transition-all"
      style={{ width: `${pct}%`, backgroundColor: color }}
      title={`${label}: ${value.toLocaleString("de-DE")} BPS`}
    />
  );
}

/** Ein horizontaler Balken mit gestapelten Score-Komponenten. */
function ScoreBarChart({ candidate, maxScore }: { candidate: ScoredCandidate; maxScore: number }) {
  const blocked = candidate.constraintStatus === "blocked";
  const bd = candidate.scoreBreakdown;
  const barMax = Math.max(maxScore, 1);

  return (
    <div data-testid="utility-chart-bar" data-candidate-id={candidate.id} data-score={candidate.scoreBps} className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: actionColors[candidate.action] ?? "#64748b" }} />
          <b className="text-amber-50">{actionLabels[candidate.action] ?? candidate.action}</b>
          {blocked && <span className="rounded bg-red-300/15 px-1.5 py-0.5 text-[10px] text-red-200">{candidate.constraintCode}</span>}
        </span>
        <span className="font-mono text-cyan-200">{candidate.scoreBps.toLocaleString("de-DE")}</span>
      </div>
      {blocked ? (
        <div className="h-4 w-full overflow-hidden rounded bg-red-400/10" />
      ) : (
        <div className="flex h-4 w-full overflow-hidden rounded bg-slate-800/60" style={{ maxWidth: "100%" }}>
          <BarSegment value={bd.pressureTerm} color="#0891b2" label="Druck" />
          <BarSegment value={bd.benefitTerm} color="#10b981" label="Nutzen" />
          <BarSegment value={bd.personalityBonus} color="#8b5cf6" label="Persönlichkeit" />
          <BarSegment value={bd.goalPersistenceBonus} color="#f59e0b" label="Zielbindung" />
          <BarSegment value={-bd.riskTerm} color="#ef4444" label="Risiko" />
          <BarSegment value={-bd.costTerm} color="#dc2626" label="Kosten" />
        </div>
      )}
    </div>
  );
}

/** Legende für die Balkenfarben. */
function ChartLegend() {
  const items: ReadonlyArray<readonly [string, string]> = [
    ["#0891b2", "Druck"],
    ["#10b981", "Nutzen"],
    ["#8b5cf6", "Persönlichkeit"],
    ["#f59e0b", "Zielbindung"],
    ["#ef4444", "Risiko"],
    ["#dc2626", "Kosten"],
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function NpcChartCard({ npc }: { npc: NpcData }) {
  const eligible = npc.scored.filter(c => c.constraintStatus === "eligible");
  const blocked = npc.scored.filter(c => c.constraintStatus === "blocked");
  const maxScore = eligible.length > 0 ? Math.max(...eligible.map(c => c.scoreBps)) : 0;
  const winner = eligible[0] ?? null;

  return (
    <article data-testid="npc-utility-chart-card" data-npc-id={npc.npcId} className="space-y-3 rounded-lg border border-violet-300/15 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between">
        <b className="text-amber-100">{npc.npcId}</b>
        <span className="text-xs text-slate-400">Tick {npc.resolutionIndex}</span>
      </div>
      {winner && (
        <div className="rounded border border-amber-300/30 bg-amber-400/[.06] px-2 py-1 text-xs">
          <span className="text-amber-200">Gewinner: </span>
          <b className="text-amber-100">{actionLabels[winner.action] ?? winner.action}</b>
          <span className="ml-2 font-mono text-amber-300">{winner.scoreBps.toLocaleString("de-DE")} BPS</span>
        </div>
      )}
      <div className="space-y-2.5">
        {npc.scored.map(c => (
          <ScoreBarChart key={`${npc.npcId}-${c.id}`} candidate={c} maxScore={maxScore} />
        ))}
      </div>
      <ChartLegend />
      {blocked.length > 0 && (
        <p className="text-[10px] text-slate-500">{blocked.length} blockiert · {eligible.length} zulässig</p>
      )}
    </article>
  );
}

export function NpcUtilityChartPanel({ npcs }: { npcs: readonly NpcData[] }) {
  if (npcs.length === 0) return null;
  return (
    <div data-testid="npc-utility-chart-panel" className="mt-4 space-y-4">
      <h5 className="text-xs font-medium text-violet-200">Score-Verteilung · Balkendiagramm</h5>
      <div className="grid gap-3 sm:grid-cols-2">
        {npcs.map(npc => (
          <NpcChartCard key={npc.npcId} npc={npc} />
        ))}
      </div>
    </div>
  );
}
