import { useState, useMemo, useEffect, useRef } from "react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  Activity,
  Award,
  BarChart3,
  Flame,
  Shield,
  Sparkles,
  Swords,
  Wrench,
  Zap,
} from "lucide-react";

export interface ProgressionTrackItem {
  trackKind: string;
  trackId: string;
  levelExact: string | number;
  characterId?: string | null;
  receiptHash?: string;
}

export interface CharacterProgressionProps {
  profile?: {
    userId: number;
    aurionPoints: number;
    victories: number;
    selectedClass?: string;
  } | null;
  progression?: {
    characterId?: string | null;
    tracks: readonly ProgressionTrackItem[];
  } | null;
  craftingProgression?: {
    levelExact: string | number;
    totalXpExact: string | number;
  } | null;
  confirmedSkills?: readonly string[];
  guildRole?: string | null;
}

interface RadarStatPoint {
  stat: string;
  value: number;
  fullMark: number;
  description: string;
}

interface TrackBarPoint {
  name: string;
  category: string;
  level: number;
  fillColor: string;
}

export function CharacterProgressionChart({
  profile,
  progression,
  craftingProgression,
  confirmedSkills,
  guildRole,
}: CharacterProgressionProps) {
  const [viewMode, setViewMode] = useState<"radar" | "bars">("radar");
  const [isLevelingUp, setIsLevelingUp] = useState(false);
  const [levelUpMessage, setLevelUpMessage] = useState<string | null>(null);

  // Track aggregated level to trigger level-up CSS animations when character level / skills grow
  const prevLevelSumRef = useRef<number | null>(null);

  const currentTotalLevel = useMemo(() => {
    const trackSum = (progression?.tracks ?? []).reduce(
      (acc, t) => acc + Number(t.levelExact || 1),
      0
    );
    const craftLvl = Number(craftingProgression?.levelExact || 1);
    const victories = profile?.victories ?? 0;
    const resonance = Math.floor((profile?.aurionPoints ?? 0) / 25);
    return trackSum + craftLvl + victories + resonance;
  }, [progression, craftingProgression, profile]);

  useEffect(() => {
    if (prevLevelSumRef.current !== null && currentTotalLevel > prevLevelSumRef.current) {
      const delta = currentTotalLevel - prevLevelSumRef.current;
      setLevelUpMessage(`+${delta} STUFE AUFGESTIEGEN!`);
      setIsLevelingUp(true);
      const timer = setTimeout(() => {
        setIsLevelingUp(false);
        setLevelUpMessage(null);
      }, 2400);
      return () => clearTimeout(timer);
    }
    prevLevelSumRef.current = currentTotalLevel;
  }, [currentTotalLevel]);

  // Manual trigger for testing and visual demonstration
  const handleTestLevelUp = () => {
    setLevelUpMessage("✨ PROGRESSIONS-IMPULS: LEVEL UP!");
    setIsLevelingUp(true);
    setTimeout(() => {
      setIsLevelingUp(false);
      setLevelUpMessage(null);
    }, 2400);
  };

  // Derive radar statistical dimensions
  const radarData: RadarStatPoint[] = useMemo(() => {
    const tracks = progression?.tracks ?? [];
    
    // 1. Combat & Weapons (based on weapon tracks max level or count)
    const weaponTracks = tracks.filter((t) => t.trackKind === "weapon");
    const weaponLevelSum = weaponTracks.reduce((acc, t) => acc + Number(t.levelExact || 1), 0);
    const combatScore = Math.min(100, Math.max(10, weaponLevelSum * 15 + (profile?.victories ? profile.victories * 5 : 0)));

    // 2. Skill Mastery (based on skill tracks & confirmed skills)
    const skillTracks = tracks.filter((t) => t.trackKind === "skill");
    const skillLevelSum = skillTracks.reduce((acc, t) => acc + Number(t.levelExact || 1), 0);
    const skillCount = (confirmedSkills?.length ?? 0) + skillTracks.length;
    const skillScore = Math.min(100, Math.max(10, skillLevelSum * 12 + skillCount * 10));

    // 3. Crafting & Alchemy
    const craftLevel = Number(craftingProgression?.levelExact || 1);
    const craftScore = Math.min(100, Math.max(10, craftLevel * 20));

    // 4. Victories & Exploration
    const victories = profile?.victories ?? 0;
    const explorationScore = Math.min(100, Math.max(10, victories * 12 + (tracks.length > 0 ? 15 : 0)));

    // 5. Aurion Resonance
    const aurionPoints = profile?.aurionPoints ?? 0;
    const resonanceScore = Math.min(100, Math.max(10, Math.round(Math.log10(aurionPoints + 1) * 25)));

    // 6. Faction & Guild Alignment
    const hasGuild = Boolean(guildRole);
    const guildScore = hasGuild ? 80 : 25;

    return [
      {
        stat: "Kampf & Waffen",
        value: combatScore,
        fullMark: 100,
        description: `${weaponTracks.length} Waffen-Tracks verifiziert`,
      },
      {
        stat: "Fertigkeiten",
        value: skillScore,
        fullMark: 100,
        description: `${skillCount} aktive Fertigkeiten/Meisterschaften`,
      },
      {
        stat: "Handwerk",
        value: craftScore,
        fullMark: 100,
        description: `Stufe ${craftLevel} (${craftingProgression?.totalXpExact ?? 0} EP)`,
      },
      {
        stat: "Erkundung / Siege",
        value: explorationScore,
        fullMark: 100,
        description: `${victories} bestätigte Siege`,
      },
      {
        stat: "Aurion-Resonanz",
        value: resonanceScore,
        fullMark: 100,
        description: `${aurionPoints} Aurion-Punkte`,
      },
      {
        stat: "Soziales & Gilde",
        value: guildScore,
        fullMark: 100,
        description: guildRole ? `Rolle: ${guildRole}` : "Keine Gilde gebunden",
      },
    ];
  }, [profile, progression, craftingProgression, confirmedSkills, guildRole]);

  // Derive individual tracks progress list
  const trackBarData: TrackBarPoint[] = useMemo(() => {
    const items: TrackBarPoint[] = [];
    const tracks = progression?.tracks ?? [];

    for (const track of tracks) {
      const isWeapon = track.trackKind === "weapon";
      items.push({
        name: track.trackId,
        category: isWeapon ? "Waffe" : "Fertigkeit",
        level: Number(track.levelExact || 1),
        fillColor: isWeapon ? "#06b6d4" : "#38bdf8",
      });
    }

    if (craftingProgression) {
      items.push({
        name: "Handwerk",
        category: "Handwerk",
        level: Number(craftingProgression.levelExact || 1),
        fillColor: "#f59e0b",
      });
    }

    if (items.length === 0) {
      items.push(
        { name: "Basis-Präzision", category: "Waffe", level: 1, fillColor: "#06b6d4" },
        { name: "Auren-Gespür", category: "Fertigkeit", level: 1, fillColor: "#38bdf8" },
        { name: "Schmiedekunst", category: "Handwerk", level: 1, fillColor: "#f59e0b" }
      );
    }

    return items;
  }, [progression, craftingProgression]);

  // Overall average power metric
  const averagePower = useMemo(() => {
    if (!radarData.length) return 0;
    const total = radarData.reduce((acc, curr) => acc + curr.value, 0);
    return Math.round(total / radarData.length);
  }, [radarData]);

  return (
    <article
      id="account-progression-analytics-card"
      className={`relative rounded-2xl border bg-black/30 p-6 shadow-xl backdrop-blur-sm transition-all duration-700 ${
        isLevelingUp
          ? "border-amber-400/80 shadow-[0_0_30px_rgba(245,158,11,0.4)]"
          : "border-cyan-400/25"
      }`}
    >
      {/* Level-Up Overlay Beacon Notification */}
      {isLevelingUp && levelUpMessage && (
        <div className="pointer-events-none absolute -top-3.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-amber-400/80 bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 px-4 py-1 text-xs font-black tracking-widest text-black shadow-[0_0_20px_rgba(245,158,11,0.8)] animate-bounce">
          <Zap className="size-3.5 fill-current" />
          <span>{levelUpMessage}</span>
          <Sparkles className="size-3.5 fill-current" />
        </div>
      )}

      {/* Header section with title, mode switcher and level-up test button */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-xl border transition-all duration-500 shadow-inner ${
              isLevelingUp
                ? "border-amber-400/80 bg-amber-950/70 text-amber-300 scale-110 shadow-[0_0_15px_rgba(245,158,11,0.6)]"
                : "border-cyan-400/30 bg-cyan-950/40 text-cyan-300"
            }`}
          >
            <Activity className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-semibold text-slate-100">
                Charakter-Statistiken & Progression
              </h3>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-300 ${
                  isLevelingUp
                    ? "border-amber-400/80 bg-amber-950/80 text-amber-300 scale-105"
                    : "border-cyan-400/40 bg-cyan-950/60 text-cyan-300"
                }`}
              >
                Resonanz {averagePower}%
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Verifizierte Werte aus kanonischen Progressions- & Handwerks-Receipts
            </p>
          </div>
        </div>

        {/* View toggle and Demo level-up button */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-trigger-levelup-animation"
            type="button"
            onClick={handleTestLevelUp}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 px-2.5 py-1.5 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-900/60 hover:border-amber-400"
            title="CSS Level-Up Animation testen"
          >
            <Zap className="size-3 text-amber-400" />
            Level-Up Pulsieren
          </button>

          <div className="flex rounded-xl border border-slate-700/80 bg-slate-900/80 p-1">
            <button
              id="btn-progression-view-radar"
              type="button"
              onClick={() => setViewMode("radar")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                viewMode === "radar"
                  ? "border border-cyan-400/40 bg-cyan-950/80 text-cyan-200 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="size-3.5" />
              Radar-Diagramm
            </button>
            <button
              id="btn-progression-view-bars"
              type="button"
              onClick={() => setViewMode("bars")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                viewMode === "bars"
                  ? "border border-cyan-400/40 bg-cyan-950/80 text-cyan-200 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="size-3.5" />
              Stufen-Balken
            </button>
          </div>
        </div>
      </div>

      {/* Main visualization area */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-center">
        {/* Left chart display (7 cols) */}
        <div className="lg:col-span-7">
          {viewMode === "radar" ? (
            <div className="relative h-72 w-full min-h-[280px] rounded-xl border border-slate-800/80 bg-slate-950/40 p-2">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
                <RadarChart data={radarData} margin={{ top: 10, right: 25, bottom: 10, left: 25 }}>
                  <PolarGrid stroke="#334155" strokeDasharray="3 3" />
                  <PolarAngleAxis
                    dataKey="stat"
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 500 }}
                  />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    stroke="#475569"
                    tick={{ fill: "#64748b", fontSize: 9 }}
                  />
                  <Radar
                    name="Charakter-Potential"
                    dataKey="value"
                    stroke={isLevelingUp ? "#f59e0b" : "#06b6d4"}
                    fill={isLevelingUp ? "#f59e0b" : "#06b6d4"}
                    fillOpacity={isLevelingUp ? 0.65 : 0.45}
                    strokeWidth={2}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as RadarStatPoint;
                        return (
                          <div className="rounded-lg border border-cyan-400/30 bg-[#081a1f] p-2.5 text-xs shadow-xl">
                            <p className="font-semibold text-cyan-300">{data.stat}</p>
                            <p className="mt-0.5 text-slate-200">
                              Wert: <b className="text-amber-300">{data.value} / 100</b>
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">{data.description}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="relative h-72 w-full min-h-[280px] rounded-xl border border-slate-800/80 bg-slate-950/40 p-2">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
                <BarChart
                  data={trackBarData}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 40, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, "dataMax + 2"]}
                    stroke="#64748b"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#64748b"
                    tick={{ fill: "#cbd5e1", fontSize: 11 }}
                    width={80}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload as TrackBarPoint;
                        return (
                          <div className="rounded-lg border border-cyan-400/30 bg-[#081a1f] p-2.5 text-xs shadow-xl">
                            <p className="font-semibold text-cyan-300">{item.name}</p>
                            <p className="text-slate-300">Kategorie: {item.category}</p>
                            <p className="mt-0.5 text-slate-200">
                              Erreichte Stufe: <b className="text-amber-300">{item.level}</b>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="level" radius={[0, 6, 6, 0]}>
                    {trackBarData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fillColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right breakdown cards & progress meters (5 cols) */}
        <div className="space-y-3 lg:col-span-5">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Swords className="size-3.5 text-cyan-400" />
                <span className="text-xs font-medium">Siege</span>
              </div>
              <p className="mt-1 text-lg font-bold text-slate-100">
                {profile?.victories ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Flame className="size-3.5 text-amber-400" />
                <span className="text-xs font-medium">Aurion-Punkte</span>
              </div>
              <p className="mt-1 text-lg font-bold text-amber-200">
                {profile?.aurionPoints ?? 0}
              </p>
            </div>
          </div>

          {/* Quick linear progress meters with Level-Up CSS Animation Trigger */}
          <div
            className={`rounded-xl border bg-slate-950/60 p-3.5 transition-all duration-500 ${
              isLevelingUp
                ? "border-amber-400/90 progression-meter-levelup"
                : "border-slate-800/80"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Fortschritts-Balken
              </p>
              {isLevelingUp && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-300 animate-pulse">
                  <Zap className="size-3" />
                  Level-Up Aktiv
                </span>
              )}
            </div>
            <div className="mt-3 space-y-3">
              {/* Weapons Progress */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Swords className="size-3 text-cyan-400" />
                    Waffenbeherrschung
                  </span>
                  <span className="font-semibold text-cyan-300">
                    {radarData[0]?.value ?? 0}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isLevelingUp
                        ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-cyan-400 progression-bar-active"
                        : "bg-gradient-to-r from-cyan-500 to-blue-500"
                    }`}
                    style={{ width: `${radarData[0]?.value ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Skills Progress */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Sparkles className="size-3 text-sky-400" />
                    Fertigkeiten-Meisterschaft
                  </span>
                  <span className="font-semibold text-sky-300">
                    {radarData[1]?.value ?? 0}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isLevelingUp
                        ? "bg-gradient-to-r from-amber-400 via-yellow-300 to-sky-400 progression-bar-active"
                        : "bg-gradient-to-r from-sky-500 to-indigo-500"
                    }`}
                    style={{ width: `${radarData[1]?.value ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Crafting Progress */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Wrench className="size-3 text-amber-400" />
                    Handwerk & Schmiede
                  </span>
                  <span className="font-semibold text-amber-300">
                    Stufe {craftingProgression?.levelExact ?? 1}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isLevelingUp
                        ? "bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-200 progression-bar-active"
                        : "bg-gradient-to-r from-amber-500 to-yellow-500"
                    }`}
                    style={{ width: `${radarData[2]?.value ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Resonance Progress */}
              <div>
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Shield className="size-3 text-emerald-400" />
                    Aurion-Resonanz
                  </span>
                  <span className="font-semibold text-emerald-300">
                    {radarData[4]?.value ?? 0}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isLevelingUp
                        ? "bg-gradient-to-r from-emerald-400 via-teal-300 to-yellow-300 progression-bar-active"
                        : "bg-gradient-to-r from-emerald-500 to-teal-500"
                    }`}
                    style={{ width: `${radarData[4]?.value ?? 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
