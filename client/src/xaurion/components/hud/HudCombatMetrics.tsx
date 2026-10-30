import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Swords, X } from "lucide-react";
import type { GameHUDProps } from "./hudTypes";

type MetricsProps = Pick<GameHUDProps, "combat">;

/** Compact DPS chip (lives in the top-left stack). */
export function HudMetricsChip({ combat, open, onToggle }: MetricsProps & Readonly<{ open: boolean; onToggle: () => void }>) {
  return (
    <button type="button" onClick={onToggle} aria-label="Combat Metrics öffnen" aria-expanded={open} className="ax-metrics-chip">
      <Swords aria-hidden /> DPS {combat.eventCount > 0 ? combat.currentDps : "—"}
    </button>
  );
}

/** Confirmed combat metrics panel, rendered at HUD root level so nothing overlaps it. */
export function HudMetricsPanel({ combat, onClose }: MetricsProps & Readonly<{ onClose: () => void }>) {
  const has = combat.eventCount > 0;
  return (
    <>
      <section id="dps-meter-modal" role="dialog" aria-label="Bestätigte Combat Metrics" className="ax-metrics ax-glass">
        <header className="ax-metrics__head">
          <b>BESTÄTIGTE COMBAT METRICS</b>
          <button type="button" onClick={onClose} aria-label="Combat Metrics schließen" className="ax-iconbtn">
            <X aria-hidden />
          </button>
        </header>
        <div className="ax-metrics__grid">
          <Metric label="DPS" value={has ? combat.currentDps : "—"} />
          <Metric label="PEAK" value={has ? combat.peakDps : "—"} />
          <Metric label="DTPS" value={has ? combat.currentDtps : "—"} />
        </div>
        {combat.dpsSeries && combat.dpsSeries.length > 1 && (
          <div className="ax-metrics__chart">
            <p className="ax-eyebrow">DPS-Verlauf</p>
            <div className="ax-metrics__plot">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...combat.dpsSeries]} margin={{ top: 2, right: 4, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="dpsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f6dc9a" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#f6dc9a" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1f2a2e" strokeDasharray="2 2" vertical={false} />
                  <XAxis dataKey="second" tick={{ fontSize: 10, fill: "#8fa3a0" }} tickLine={false} axisLine={false} unit="s" />
                  <YAxis tick={{ fontSize: 10, fill: "#8fa3a0" }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip contentStyle={{ fontSize: 11, background: "#05090c", border: "1px solid #33443f", borderRadius: 8 }} labelFormatter={(v) => `Sek ${v}`} />
                  <Area type="monotone" dataKey="dps" name="DPS" stroke="#f6dc9a" fill="url(#dpsGrad)" strokeWidth={1.8} isAnimationActive={false} />
                  <Area type="monotone" dataKey="dtps" name="DTPS" stroke="#ff5d6c" fill="transparent" strokeWidth={1.2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div className="ax-metrics__log">
          {combat.logs.length ? (
            combat.logs.slice(0, 8).map((log) => (
              <div key={log.id} className="ax-metrics__row">
                <i>T{log.tick}</i>
                <span>{log.text}</span>
                <b>{log.value}</b>
              </div>
            ))
          ) : (
            <p className="ax-empty">Noch keine bestätigten Combat-Events.</p>
          )}
        </div>
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="ax-metric">
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
