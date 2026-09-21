import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  Shield,
  TrendingUp,
  Users,
  Award,
  Coins,
  TreePine,
  Mountain,
  Sparkles,
  Package,
  Hammer,
  Activity,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";
import type { GuildBankDashboardSummary as DashboardData } from "@shared/guildBankView";

interface GuildBankDashboardSummaryProps {
  summary?: DashboardData;
  treasuryBalanceExact: string;
  resourceBalancesExact: { wood: string; stone: string; aether: string };
  heldItemsCount: number;
}

const RESOURCE_COLORS = {
  wood: "#d97706", // Amber / Wood
  stone: "#94a3b8", // Slate / Stone
  aether: "#06b6d4", // Cyan / Aether
  treasury: "#eab308", // Yellow / Gold
};

const ROLE_LABELS: Record<string, { label: string; badgeClass: string }> = {
  founder: { label: "Gründer", badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  officer: { label: "Offizier", badgeClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" },
  member: { label: "Mitglied", badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  applicant: { label: "Anwärter", badgeClass: "bg-stone-500/20 text-stone-300 border-stone-500/40" },
};

export default function GuildBankDashboardSummary({
  summary,
  treasuryBalanceExact,
  resourceBalancesExact,
  heldItemsCount,
}: GuildBankDashboardSummaryProps) {
  const [chartTab, setChartTab] = useState<"resources" | "activities">("resources");
  // Check for ResizeObserver availability (e.g. testing environments)
  const [hasResizeObserver, setHasResizeObserver] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && typeof window.ResizeObserver !== "undefined") {
      setHasResizeObserver(true);
    }
  }, []);

  const resources = summary?.resources ?? {
    wood: resourceBalancesExact.wood,
    stone: resourceBalancesExact.stone,
    aether: resourceBalancesExact.aether,
    treasuryPoints: treasuryBalanceExact,
    lifetimeWoodDonated: resourceBalancesExact.wood,
    lifetimeStoneDonated: resourceBalancesExact.stone,
    lifetimeAetherDonated: resourceBalancesExact.aether,
    lifetimePointsDeposited: treasuryBalanceExact,
    totalVaultItems: heldItemsCount,
    buildingInvestmentPoints: "0",
  };

  const memberStats = summary?.memberStats ?? [];
  const activityBreakdown = summary?.activityBreakdown ?? [];
  const totalActiveMembers = summary?.totalActiveMembers ?? memberStats.length;
  const totalPoints = summary?.totalGuildContributionPoints ?? 0;
  const totalReceipts = summary?.totalBankReceiptsCount ?? 0;

  // Chart data for Resource Distribution
  const resourceDistributionData = [
    { name: "Holz", balance: Number(resources.wood || 0), lifetime: Number(resources.lifetimeWoodDonated || 0), fill: RESOURCE_COLORS.wood },
    { name: "Stein", balance: Number(resources.stone || 0), lifetime: Number(resources.lifetimeStoneDonated || 0), fill: RESOURCE_COLORS.stone },
    { name: "Äther", balance: Number(resources.aether || 0), lifetime: Number(resources.lifetimeAetherDonated || 0), fill: RESOURCE_COLORS.aether },
    { name: "AURION", balance: Number(resources.treasuryPoints || 0), lifetime: Number(resources.lifetimePointsDeposited || 0), fill: RESOURCE_COLORS.treasury },
  ];

  // Activity Radar Data
  const activityRadarData = activityBreakdown.map(item => ({
    subject: item.label,
    points: item.points,
    count: item.count,
    fullMark: Math.max(...activityBreakdown.map(a => a.points), 100),
  }));

  // Sort members by contribution
  const sortedMembers = [...memberStats].sort((a, b) => b.contributionPoints - a.contributionPoints);

  return (
    <section
      id="guild-bank-dashboard-summary"
      aria-label="Gildenbank Dashboard & Ressourcen-Übersicht"
      className="space-y-6 my-6 p-5 rounded-2xl bg-gradient-to-b from-stone-900/90 via-stone-900/80 to-stone-950/90 border border-amber-500/20 shadow-2xl backdrop-blur-md"
    >
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-800">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h4 className="text-lg font-bold text-amber-100 tracking-wide">
              Expeditions-Zentrale & Ressourcen-Akkumulation
            </h4>
          </div>
          <p className="text-xs text-stone-400 mt-1">
            Gemeinschaftliches Schatzamt, Akkumulationsströme und Aktivitätsmetriken
          </p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center p-1 bg-stone-950/60 rounded-xl border border-stone-800" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={chartTab === "resources"}
            id="tab-resource-accumulation"
            onClick={() => setChartTab("resources")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              chartTab === "resources"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
            Ressourcen-Bestand
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={chartTab === "activities"}
            id="tab-member-activities"
            onClick={() => setChartTab("activities")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              chartTab === "activities"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            Mitglieder-Aktivität
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div id="kpi-treasury" className="p-3.5 rounded-xl bg-stone-950/50 border border-amber-500/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs uppercase tracking-wider font-semibold">Gildenkasse</span>
            <Coins className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-extrabold text-amber-300 font-mono">
              {Number(resources.treasuryPoints).toLocaleString("de-DE")}
              <span className="text-xs font-normal text-amber-400/80 ml-1">AURION</span>
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">
              Gesamt eingezahlt: <span className="text-stone-300 font-mono">{Number(resources.lifetimePointsDeposited).toLocaleString("de-DE")}</span>
            </div>
          </div>
        </div>

        <div id="kpi-vault-items" className="p-3.5 rounded-xl bg-stone-950/50 border border-cyan-500/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs uppercase tracking-wider font-semibold">Tresor-Gegenstände</span>
            <Package className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-extrabold text-cyan-300 font-mono">
              {resources.totalVaultItems}
              <span className="text-xs font-normal text-cyan-400/80 ml-1">Items</span>
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">
              Verwaltete Gilden-Depots
            </div>
          </div>
        </div>

        <div id="kpi-active-members" className="p-3.5 rounded-xl bg-stone-950/50 border border-emerald-500/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs uppercase tracking-wider font-semibold">Aktive Mitglieder</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-extrabold text-emerald-300 font-mono">
              {totalActiveMembers}
              <span className="text-xs font-normal text-emerald-400/80 ml-1">Entdecker</span>
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">
              Gemeinsamer Beitrag: <span className="text-stone-300 font-mono">{totalPoints.toLocaleString("de-DE")} Pkt</span>
            </div>
          </div>
        </div>

        <div id="kpi-building-investment" className="p-3.5 rounded-xl bg-stone-950/50 border border-amber-600/15 flex flex-col justify-between">
          <div className="flex items-center justify-between text-stone-400">
            <span className="text-xs uppercase tracking-wider font-semibold">Ausbau-Investition</span>
            <Hammer className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-extrabold text-amber-200 font-mono">
              {Number(resources.buildingInvestmentPoints).toLocaleString("de-DE")}
              <span className="text-xs font-normal text-amber-400/80 ml-1">Punkte</span>
            </div>
            <div className="text-[11px] text-stone-400 mt-0.5">
              Bank-Transaktionen: <span className="text-stone-300 font-mono">{totalReceipts}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Charts & Accumulation Details */}
      {chartTab === "resources" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Resource Stockpile Cards */}
          <div className="space-y-3">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              Ressourcen-Lagerbestand
            </h5>

            {/* Wood Card */}
            <div id="stockpile-wood" className="p-3 rounded-xl bg-stone-950/60 border border-amber-600/20 hover:border-amber-500/40 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-700/20 border border-amber-600/40 flex items-center justify-center text-amber-400">
                    <TreePine className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-stone-200">Bauholz (Oak)</div>
                    <div className="text-[10px] text-stone-400">Konstruktion & Wehrbauten</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold font-mono text-amber-300">
                    {Number(resources.wood).toLocaleString("de-DE")}
                  </div>
                  <div className="text-[10px] text-stone-400">
                    Gesamt: {Number(resources.lifetimeWoodDonated).toLocaleString("de-DE")}
                  </div>
                </div>
              </div>
            </div>

            {/* Stone Card */}
            <div id="stockpile-stone" className="p-3 rounded-xl bg-stone-950/60 border border-slate-600/20 hover:border-slate-500/40 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-700/20 border border-slate-500/40 flex items-center justify-center text-slate-300">
                    <Mountain className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-stone-200">Sandstein & Granit</div>
                    <div className="text-[10px] text-stone-400">Mauern & Festungstore</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold font-mono text-slate-200">
                    {Number(resources.stone).toLocaleString("de-DE")}
                  </div>
                  <div className="text-[10px] text-stone-400">
                    Gesamt: {Number(resources.lifetimeStoneDonated).toLocaleString("de-DE")}
                  </div>
                </div>
              </div>
            </div>

            {/* Aether Card */}
            <div id="stockpile-aether" className="p-3 rounded-xl bg-stone-950/60 border border-cyan-600/20 hover:border-cyan-500/40 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-cyan-700/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-stone-200">Ätherstaub & Essenzen</div>
                    <div className="text-[10px] text-stone-400">Arkane Resonanz & Magie</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold font-mono text-cyan-300">
                    {Number(resources.aether).toLocaleString("de-DE")}
                  </div>
                  <div className="text-[10px] text-stone-400">
                    Gesamt: {Number(resources.lifetimeAetherDonated).toLocaleString("de-DE")}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recharts: Resource Accumulation Chart */}
          <div className="lg:col-span-2 p-4 rounded-xl bg-stone-950/60 border border-stone-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                Aktueller Bestand vs. Kumulierte Akkumulation
              </h5>
              <span className="text-[11px] text-stone-400 font-mono">Aurion Ledger V2</span>
            </div>

            <div className="w-full h-56">
              {hasResizeObserver ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={resourceDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#78716c" tick={{ fill: "#a8a29e", fontSize: 11 }} />
                    <YAxis stroke="#78716c" tick={{ fill: "#a8a29e", fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1c1917",
                        borderColor: "#78350f",
                        borderRadius: "0.75rem",
                        color: "#fef3c7",
                        fontSize: "12px",
                      }}
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                      formatter={value => <span className="text-stone-300">{value === "balance" ? "Aktueller Bestand" : "Kumuliert (Lifetime)"}</span>}
                    />
                    <Bar dataKey="balance" name="balance" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="lifetime" name="lifetime" fill="#f59e0b" opacity={0.65} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col justify-center space-y-3 px-2">
                  {resourceDistributionData.map(res => (
                    <div key={res.name} className="space-y-1">
                      <div className="flex justify-between text-xs text-stone-300">
                        <span>{res.name}</span>
                        <span className="font-mono">{res.balance.toLocaleString("de-DE")} / {res.lifetime.toLocaleString("de-DE")}</span>
                      </div>
                      <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-cyan-400"
                          style={{ width: `${Math.min(100, (res.balance / (res.lifetime || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Member Activities View */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Activity Category Radar / Bar Chart */}
          <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <PieChartIcon className="w-3.5 h-3.5 text-cyan-400" />
                Aktivitäts-Verteilung der Gilde
              </h5>
              <span className="text-[11px] text-stone-400 font-mono">Punkteverteilung</span>
            </div>

            <div className="w-full h-64">
              {!hasResizeObserver ? (
                <div className="h-full flex flex-col justify-center space-y-2.5 px-2">
                  {activityBreakdown.map(item => (
                    <div key={item.category} className="space-y-1">
                      <div className="flex justify-between text-xs text-stone-300">
                        <span>{item.label}</span>
                        <span className="font-mono text-cyan-300">{item.points.toLocaleString("de-DE")} Pkt</span>
                      </div>
                      <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-cyan-400"
                          style={{ width: `${Math.min(100, (item.points / Math.max(1, ...activityBreakdown.map(a => a.points))) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activityRadarData.length >= 3 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={activityRadarData}>
                    <PolarGrid stroke="#44403c" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: "#d6d3d1", fontSize: 10 }} />
                    <PolarRadiusAxis stroke="#78716c" tick={{ fill: "#a8a29e", fontSize: 9 }} />
                    <Radar name="Punkte" dataKey="points" stroke="#22d3ee" fill="#06b6d4" fillOpacity={0.4} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1c1917",
                        borderColor: "#0891b2",
                        borderRadius: "0.75rem",
                        color: "#cffafe",
                        fontSize: "12px",
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityBreakdown} layout="vertical" margin={{ top: 10, right: 20, left: 40, bottom: 0 }}>
                    <XAxis type="number" stroke="#78716c" tick={{ fill: "#a8a29e", fontSize: 10 }} />
                    <YAxis type="category" dataKey="label" stroke="#78716c" tick={{ fill: "#d6d3d1", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1c1917",
                        borderColor: "#0891b2",
                        borderRadius: "0.75rem",
                        color: "#cffafe",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="points" name="Beitragspunkte" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Member Activity Leaderboard */}
          <div className="p-4 rounded-xl bg-stone-950/60 border border-stone-800 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                Mitglieder-Beitragsstatistik & Rangliste
              </h5>
              <span className="text-[11px] text-stone-400">{sortedMembers.length} Mitglieder</span>
            </div>

            <div className="overflow-y-auto max-h-60 space-y-2 pr-1 custom-scrollbar">
              {sortedMembers.length === 0 ? (
                <div className="p-4 text-center text-xs text-stone-400">
                  Noch keine Mitgliederaktivitäten im Hauptbuch erfasst.
                </div>
              ) : (
                sortedMembers.map((member, index) => {
                  const roleConfig = ROLE_LABELS[member.role] ?? ROLE_LABELS.member;
                  return (
                    <div
                      key={member.userId}
                      id={`member-stat-${member.userId}`}
                      className="p-2.5 rounded-lg bg-stone-900/60 border border-stone-800/80 flex items-center justify-between hover:bg-stone-900/90 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          index === 0
                            ? "bg-amber-500 text-stone-950 shadow-sm"
                            : index === 1
                            ? "bg-slate-300 text-stone-950"
                            : index === 2
                            ? "bg-amber-700 text-amber-100"
                            : "bg-stone-800 text-stone-400"
                        }`}>
                          {index + 1}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-stone-200">{member.name}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded border ${roleConfig.badgeClass}`}>
                              {roleConfig.label}
                            </span>
                          </div>
                          <div className="text-[10px] text-stone-400">
                            {member.activityCount} Aktionen · {member.bankTransactionsCount} Banktransaktionen
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-bold font-mono text-cyan-300">
                          {member.contributionPoints.toLocaleString("de-DE")} Pkt
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
