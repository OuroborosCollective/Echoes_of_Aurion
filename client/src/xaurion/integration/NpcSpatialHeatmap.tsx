/**
 * NPC Spatial Heatmap — visuelle Analyseansicht der räumlichen Verteilung.
 *
 * Zeigt eine 2D-Karte der Welt mit NPC-Positionen und Heatmap-Intensitäten,
 * die anzeigen, wo sich NPCs am häufigsten aufhalten und welche Bereiche
 * für ihre Utility-Ziele am attraktivsten sind.
 *
 * Features:
 *  - Radiale Heat-Halos um jeden NPC, basierend auf Need-Pressure (BPS).
 *  - Farbkodierung nach Goal-Typ (Sicherheit, Ressourcen, etc.).
 *  - Kritische Schwellenwert-Markierungen: pulsierende Ringe für NPCs,
 *    deren Winner-Score bestimmte kritische Schwellen unter- oder
 *    überschreitet.
 *  - Legende für Heat-Farben und Schwellenwert-Indikatoren.
 */
import {
  NPC_UTILITY_CRITICAL_HIGH_BPS,
  NPC_UTILITY_CRITICAL_LOW_BPS,
  NPC_UTILITY_HOT_ZONE_PRESSURE_BPS,
  classifyUtilityScore,
} from "@shared/npcUtilityThresholds";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// NPC positions (millimetres) — derived from questNpcPositions and
// worldServiceNpcs. Merchant NPCs are placed by region heuristically.
// ---------------------------------------------------------------------------

const NPC_POSITIONS: Readonly<Record<string, Readonly<{ x: number; z: number }>>> = Object.freeze({
  lyra: Object.freeze({ x: 6_000, z: -7_000 }),
  orun: Object.freeze({ x: 42_000, z: -38_000 }),
  observatory_blacksmith: Object.freeze({ x: 3_000, z: -14_000 }),
  ax1_merchant_observatory_threshold: Object.freeze({ x: 8_000, z: -10_000 }),
  ax1_merchant_windhollow: Object.freeze({ x: -18_000, z: -22_000 }),
  ax1_merchant_emberfall: Object.freeze({ x: 25_000, z: -30_000 }),
  ax1_merchant_cinder_vault: Object.freeze({ x: 35_000, z: -15_000 }),
});

// ---------------------------------------------------------------------------
// World bounds for the heatmap grid
// ---------------------------------------------------------------------------

const WORLD_MIN_X = -25_000;
const WORLD_MAX_X = 50_000;
const WORLD_MIN_Z = -45_000;
const WORLD_MAX_Z = 5_000;

const GRID_COLS = 24;
const GRID_ROWS = 16;

// ---------------------------------------------------------------------------
// Goal colors and labels
// ---------------------------------------------------------------------------

const goalColors: Readonly<Record<string, string>> = Object.freeze({
  seek_safety: "#3b82f6",
  gather_resources: "#10b981",
  socialize: "#22d3ee",
  gain_reputation: "#f59e0b",
  trade: "#f472b6",
  expand_influence: "#a78bfa",
});

const goalLabels: Readonly<Record<string, string>> = Object.freeze({
  seek_safety: "Sicherheit",
  gather_resources: "Ressourcen",
  socialize: "Gemeinschaft",
  gain_reputation: "Ansehen",
  trade: "Handel",
  expand_influence: "Einfluss",
});

const npcNames: Readonly<Record<string, string>> = Object.freeze({
  lyra: "Lyra",
  orun: "Orun",
  observatory_blacksmith: "Schmied",
  ax1_merchant_observatory_threshold: "Valen",
  ax1_merchant_windhollow: "Elowen",
  ax1_merchant_emberfall: "Torin",
  ax1_merchant_cinder_vault: "Kael",
});

// ---------------------------------------------------------------------------
// Heat computation
// ---------------------------------------------------------------------------

/**
 * Aggregate need pressure from all eligible candidates.
 * Returns the maximum need pressure across all eligible candidates,
 * representing the most urgent unmet need driving the NPC.
 */
function aggregateNeedPressure(npc: NpcData): number {
  const eligible = npc.scored.filter((c) => c.constraintStatus === "eligible");
  if (eligible.length === 0) return 0;
  return Math.max(...eligible.map((c) => c.needPressureBps));
}

/** Winner score = first eligible candidate's score (already sorted desc). */
function winnerScore(npc: NpcData): number {
  const eligible = npc.scored.filter((c) => c.constraintStatus === "eligible");
  return eligible.length > 0 ? eligible[0].scoreBps : 0;
}

/**
 * Compute heat intensity (0–1) for a grid cell from a single NPC.
 * Uses a Gaussian-like falloff based on normalised distance.
 */
function cellHeatFromNpc(
  cellNormX: number,
  cellNormZ: number,
  npcNormX: number,
  npcNormZ: number,
  pressure: number,
): number {
  const dx = cellNormX - npcNormX;
  const dz = cellNormZ - npcNormZ;
  const distSq = dx * dx + dz * dz;
  // Sigma covers ~3 grid cells of influence radius.
  const sigma = 0.14;
  const falloff = Math.exp(-distSq / (2 * sigma * sigma));
  // Heat intensity scales with need pressure (0–10000 → 0–1).
  const intensity = Math.min(1, pressure / 10_000);
  return falloff * intensity;
}

// ---------------------------------------------------------------------------
// NPC marker on the heatmap
// ---------------------------------------------------------------------------

function NpcMarker({ npc, normX, normZ }: { npc: NpcData; normX: number; normZ: number }) {
  const pressure = aggregateNeedPressure(npc);
  const score = winnerScore(npc);
  const classification = classifyUtilityScore(score);
  const goalColor = goalColors[npc.goal] ?? "#64748b";
  const isHotZone = pressure >= NPC_UTILITY_HOT_ZONE_PRESSURE_BPS;
  const name = npcNames[npc.npcId] ?? npc.npcId;

  // Halo size scales with need pressure.
  const haloSize = 40 + (pressure / 10_000) * 80; // 40px – 120px
  const haloOpacity = 0.15 + (pressure / 10_000) * 0.45; // 0.15 – 0.60

  return (
    <div
      data-testid="heatmap-npc-marker"
      data-npc-id={npc.npcId}
      data-score={score}
      data-pressure={pressure}
      data-threshold={classification}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${normX * 100}%`, top: `${normZ * 100}%` }}
    >
      {/* Heat halo */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: `${haloSize}px`,
          height: `${haloSize}px`,
          backgroundColor: goalColor,
          opacity: haloOpacity,
          filter: "blur(8px)",
        }}
      />
      {/* Critical threshold ring */}
      {classification !== "stable" && (
        <div
          data-testid="heatmap-threshold-ring"
          data-threshold={classification}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
          style={{
            width: "44px",
            height: "44px",
            borderColor: classification === "critical_low" ? "#ef4444" : "#fbbf24",
            animation: "heatmap-pulse 1.5s ease-in-out infinite",
          }}
        />
      )}
      {/* NPC dot */}
      <div
        className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-900 text-[9px] font-bold text-white"
        style={{ backgroundColor: goalColor }}
        title={`${name}: ${goalLabels[npc.goal] ?? npc.goal} · ${score.toLocaleString("de-DE")} BPS`}
      >
        {name.charAt(0)}
      </div>
      {/* Hot zone indicator */}
      {isHotZone && (
        <div
          data-testid="heatmap-hot-zone"
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[8px] font-medium text-orange-300"
        >
          🔥
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function HeatmapLegend() {
  const goalItems = Object.entries(goalLabels) as readonly [string, string][];
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
        {goalItems.map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: goalColors[key] }} />
            {label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-red-500" />
          Kritisch niedrig (≤ {NPC_UTILITY_CRITICAL_LOW_BPS.toLocaleString("de-DE")} BPS)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-400" />
          Kritisch hoch (≥ {NPC_UTILITY_CRITICAL_HIGH_BPS.toLocaleString("de-DE")} BPS)
        </span>
        <span className="flex items-center gap-1">
          🔥 Hot-Zone (Druck ≥ {NPC_UTILITY_HOT_ZONE_PRESSURE_BPS.toLocaleString("de-DE")} BPS)
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function NpcSpatialHeatmap({ npcs }: { npcs: readonly NpcData[] }) {
  if (npcs.length === 0) return null;

  // Compute heat grid.
  const heatGrid: number[][] = Array.from({ length: GRID_ROWS }, () =>
    new Array(GRID_COLS).fill(0),
  );

  // Normalise NPC positions to 0–1 grid space.
  const npcNormPositions = npcs
    .map((npc) => {
      const pos = NPC_POSITIONS[npc.npcId];
      if (!pos) return null;
      const normX = (pos.x - WORLD_MIN_X) / (WORLD_MAX_X - WORLD_MIN_X);
      const normZ = (pos.z - WORLD_MIN_Z) / (WORLD_MAX_Z - WORLD_MIN_Z);
      return { npc, normX, normZ };
    })
    .filter((p): p is { npc: NpcData; normX: number; normZ: number } => p !== null);

  // Fill heat grid.
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const cellNormX = (col + 0.5) / GRID_COLS;
      const cellNormZ = (row + 0.5) / GRID_ROWS;
      let totalHeat = 0;
      for (const { npc, normX, normZ } of npcNormPositions) {
        const pressure = aggregateNeedPressure(npc);
        totalHeat += cellHeatFromNpc(cellNormX, cellNormZ, normX, normZ, pressure);
      }
      heatGrid[row][col] = Math.min(1, totalHeat);
    }
  }

  // Count threshold alerts.
  const lowCount = npcs.filter((n) => classifyUtilityScore(winnerScore(n)) === "critical_low").length;
  const highCount = npcs.filter((n) => classifyUtilityScore(winnerScore(n)) === "critical_high").length;

  return (
    <div data-testid="npc-spatial-heatmap" className="mt-4 space-y-3">
      <h5 className="text-xs font-medium text-violet-200">
        Räumliche Heatmap · NPC-Aufenthalt & Utility-Attraktivität
      </h5>

      {/* Threshold alert summary */}
      {(lowCount > 0 || highCount > 0) && (
        <div
          data-testid="heatmap-threshold-alert"
          className="flex flex-wrap gap-3 rounded-lg border border-red-300/30 bg-red-400/[.06] p-2 text-xs"
        >
          {lowCount > 0 && (
            <span className="text-red-300">
              ⚠ {lowCount} NPC(s) kritisch niedrig (≤ {NPC_UTILITY_CRITICAL_LOW_BPS.toLocaleString("de-DE")} BPS)
            </span>
          )}
          {highCount > 0 && (
            <span className="text-amber-300">
              ⚠ {highCount} NPC(s) kritisch hoch (≥ {NPC_UTILITY_CRITICAL_HIGH_BPS.toLocaleString("de-DE")} BPS)
            </span>
          )}
        </div>
      )}

      {/* Heatmap canvas */}
      <div
        data-testid="heatmap-grid"
        className="relative aspect-[3/2] w-full overflow-hidden rounded-lg border border-violet-300/15 bg-slate-950"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
        }}
      >
        {/* Heat cells */}
        {heatGrid.map((row, rowIdx) =>
          row.map((heat, colIdx) => {
            // Blend from cool (slate) to warm (orange/red) based on heat.
            const hue = 30 + (1 - heat) * 200; // 230 (blue) → 30 (orange)
            const lightness = 8 + heat * 35; // 8% → 43%
            return (
              <div
                key={`${rowIdx}-${colIdx}`}
                data-testid="heatmap-cell"
                data-heat={heat.toFixed(3)}
                style={{
                  backgroundColor: heat > 0.01
                    ? `hsl(${hue}, 70%, ${lightness}%)`
                    : "hsl(222, 47%, 8%)",
                  opacity: heat > 0.01 ? 0.3 + heat * 0.7 : 0.5,
                }}
              />
            );
          }),
        )}

        {/* NPC markers overlay */}
        {npcNormPositions.map(({ npc, normX, normZ }) => (
          <NpcMarker key={npc.npcId} npc={npc} normX={normX} normZ={normZ} />
        ))}
      </div>

      {/* Position labels */}
      <div className="flex justify-between text-[9px] text-slate-500">
        <span>X: {(WORLD_MIN_X / 1000).toFixed(0)}m</span>
        <span>X: 0m</span>
        <span>X: {(WORLD_MAX_X / 1000).toFixed(0)}m</span>
      </div>

      <HeatmapLegend />
    </div>
  );
}
