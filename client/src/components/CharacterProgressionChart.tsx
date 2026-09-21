import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Flame, Swords, Wrench } from "lucide-react";

export type ProgressionTrackItem = Readonly<{
  trackKind: "weapon" | "skill";
  trackId: string;
  levelExact: string | number;
}>;

export type CharacterProgressionChartProps = Readonly<{
  profile?: Readonly<{ aurionPoints: number; victories: number }> | null;
  progression?: Readonly<{ tracks: readonly ProgressionTrackItem[] }> | null;
  craftingProgression?: Readonly<{ levelExact: string | number; totalXpExact: string | number }> | null;
}>;

type ExactRow = Readonly<{
  id: string;
  label: string;
  category: "Waffe" | "Fertigkeit" | "Handwerk";
  level: number;
}>;

function exactNonNegative(value: string | number | undefined): number | null {
  const parsed = typeof value === "number"
    ? value
    : value !== undefined && /^(0|[1-9][0-9]*)$/.test(value)
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function exactProgressionRows(props: CharacterProgressionChartProps): readonly ExactRow[] {
  const rows: ExactRow[] = [];
  for (const track of props.progression?.tracks ?? []) {
    const level = exactNonNegative(track.levelExact);
    if (level === null) continue;
    rows.push(Object.freeze({
      id: `${track.trackKind}:${track.trackId}`,
      label: track.trackId,
      category: track.trackKind === "weapon" ? "Waffe" : "Fertigkeit",
      level,
    }));
  }

  const crafting = exactNonNegative(props.craftingProgression?.levelExact);
  if (crafting !== null) {
    rows.push(Object.freeze({
      id: "crafting:confirmed",
      label: "Handwerk",
      category: "Handwerk",
      level: crafting,
    }));
  }

  return Object.freeze(rows.sort((left, right) =>
    left.category.localeCompare(right.category, "de-DE")
      || left.label.localeCompare(right.label, "de-DE")
  ));
}

export function CharacterProgressionChart(props: CharacterProgressionChartProps) {
  const rows = useMemo(
    () => exactProgressionRows(props),
    [props.progression, props.craftingProgression],
  );
  const victories = exactNonNegative(props.profile?.victories);
  const aurionPoints = exactNonNegative(props.profile?.aurionPoints);
  const craftingXp = exactNonNegative(props.craftingProgression?.totalXpExact);

  return (
    <section
      id="account-progression-readback"
      className="rounded-2xl border border-cyan-400/25 bg-black/30 p-6 shadow-xl backdrop-blur-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700/60 pb-4">
        <div className="flex gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-950/40 text-cyan-300">
            <Activity className="size-5" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-semibold text-slate-100">Charakter-Progression</h3>
            <p className="mt-1 max-w-2xl text-xs text-slate-400">
              Exakte read-only Darstellung bestätigter Waffen-, Skill- und Crafting-Stufen. Keine Gesamtlevel-, Power- oder Resonanz-Scores werden erfunden.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-200">
          Readback only
        </span>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400"><Swords className="size-4 text-cyan-300" /> Siege</div>
          <b className="mt-1 block text-xl text-slate-100">{victories ?? "—"}</b>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400"><Flame className="size-4 text-amber-300" /> Aurion-Punkte</div>
          <b className="mt-1 block text-xl text-slate-100">{aurionPoints ?? "—"}</b>
        </article>
        <article className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400"><Wrench className="size-4 text-amber-200" /> Crafting-EP</div>
          <b className="mt-1 block text-xl text-slate-100">{craftingXp ?? "—"}</b>
        </article>
      </div>

      {rows.length ? (
        <>
          <div className="mt-5 h-72 min-h-[288px] w-full" data-testid="progression-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
              <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 52 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  domain={[0, "dataMax"]}
                  tick={{ fill: "#94a3b8", fontSize: 10 }}
                  stroke="#475569"
                />
                <YAxis
                  dataKey="label"
                  type="category"
                  width={96}
                  tick={{ fill: "#cbd5e1", fontSize: 11 }}
                  stroke="#475569"
                />
                <Tooltip
                  cursor={{ fill: "rgba(15, 23, 42, 0.35)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as ExactRow | undefined;
                    if (!row) return null;
                    return (
                      <div className="rounded-lg border border-cyan-400/30 bg-[#081a1f] p-2.5 text-xs shadow-xl">
                        <b className="text-cyan-200">{row.label}</b>
                        <p className="text-slate-300">{row.category} · bestätigte Stufe {row.level}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="level" name="Bestätigte Stufe" fill="#2DE2CF" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {rows.map(row => (
              <div key={row.id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs">
                <span className="text-slate-400">{row.category}</span>
                <b className="ml-2 text-slate-100">{row.label}</b>
                <span className="float-right font-mono text-cyan-300">Stufe {row.level}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950/45 p-4 text-sm text-slate-400" data-testid="progression-no-evidence">
          Keine bestätigten Progressionsstufen verfügbar.
        </p>
      )}
    </section>
  );
}
