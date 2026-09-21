import { useState, useMemo } from "react";
import {
  Award,
  CheckCircle2,
  ChevronRight,
  Filter,
  Flame,
  Lock,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Wrench,
} from "lucide-react";
import { ProgressionTrackItem } from "./CharacterProgressionChart";

export interface AchievementsGalleryProps {
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

export type MilestoneCategory =
  | "all"
  | "weapon"
  | "skill"
  | "crafting"
  | "victory"
  | "resonance";

export interface ProgressionMilestoneBadge {
  id: string;
  title: string;
  category: "weapon" | "skill" | "crafting" | "victory" | "resonance";
  trackName: string;
  requiredLevel: number;
  currentLevel: number;
  romanNumeral: string;
  tierRank: number; // 1 to 10
  tierName: string;
  iconName: "swords" | "sparkles" | "wrench" | "trophy" | "shield" | "flame";
  isUnlocked: boolean;
  progressPercent: number;
  description: string;
  colorTheme: {
    border: string;
    bg: string;
    text: string;
    glow: string;
    numeralColor: string;
    badgeStyle: string;
  };
}

const ROMAN_NUMERALS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
];

const TIER_NAMES = [
  "Novize",
  "Adept",
  "Kämpfer",
  "Meister",
  "Großmeister",
  "Champion",
  "Vorhut",
  "Wächter",
  "Legende",
  "Transzendent",
];

function getTierTheme(tierIndex: number, isUnlocked: boolean) {
  if (!isUnlocked) {
    return {
      border: "border-slate-800",
      bg: "bg-slate-950/60",
      text: "text-slate-500",
      glow: "",
      numeralColor: "text-slate-600",
      badgeStyle: "opacity-60 grayscale-[70%]",
    };
  }

  // Tier 1-2 (Bronze / Copper)
  if (tierIndex < 2) {
    return {
      border: "border-amber-700/60",
      bg: "bg-gradient-to-br from-amber-950/70 via-stone-900/90 to-amber-950/40",
      text: "text-amber-300",
      glow: "shadow-[0_0_15px_rgba(217,119,6,0.3)]",
      numeralColor: "text-amber-400",
      badgeStyle: "border-amber-600/70",
    };
  }
  // Tier 3-4 (Silver / Steel)
  if (tierIndex < 4) {
    return {
      border: "border-slate-400/70",
      bg: "bg-gradient-to-br from-slate-800/80 via-slate-900/90 to-cyan-950/50",
      text: "text-slate-200",
      glow: "shadow-[0_0_16px_rgba(203,213,225,0.35)]",
      numeralColor: "text-cyan-200",
      badgeStyle: "border-slate-300/80",
    };
  }
  // Tier 5-6 (Gold / Solar)
  if (tierIndex < 6) {
    return {
      border: "border-yellow-500/80",
      bg: "bg-gradient-to-br from-amber-900/90 via-yellow-950/80 to-stone-900/90",
      text: "text-yellow-300",
      glow: "shadow-[0_0_20px_rgba(234,179,8,0.45)]",
      numeralColor: "text-yellow-300",
      badgeStyle: "border-yellow-400",
    };
  }
  // Tier 7-8 (Platinum / Turquoise)
  if (tierIndex < 8) {
    return {
      border: "border-cyan-400/90",
      bg: "bg-gradient-to-br from-cyan-950/90 via-teal-950/90 to-slate-900/90",
      text: "text-cyan-200",
      glow: "shadow-[0_0_22px_rgba(45,226,207,0.5)]",
      numeralColor: "text-cyan-300",
      badgeStyle: "border-cyan-300",
    };
  }
  // Tier 9-10 (Aurion Aether / Prismatic Cosmic)
  return {
    border: "border-emerald-400/90",
    bg: "bg-gradient-to-br from-teal-900/90 via-cyan-950/90 to-indigo-950/90",
    text: "text-emerald-200",
    glow: "shadow-[0_0_26px_rgba(52,211,153,0.6)]",
    numeralColor: "text-emerald-300",
    badgeStyle: "border-emerald-300",
  };
}

export function AchievementsGallery({
  profile,
  progression,
  craftingProgression,
  confirmedSkills,
  guildRole,
}: AchievementsGalleryProps) {
  const [selectedCategory, setSelectedCategory] =
    useState<MilestoneCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);
  const [selectedBadge, setSelectedBadge] =
    useState<ProgressionMilestoneBadge | null>(null);

  // Generate badges for every levelable progression track
  const allBadges: ProgressionMilestoneBadge[] = useMemo(() => {
    const badges: ProgressionMilestoneBadge[] = [];

    // Helper to add 10 tiers (10, 20, 30, ... 100) for a given track
    const createTiersForTrack = (
      trackKey: string,
      displayName: string,
      category: "weapon" | "skill" | "crafting" | "victory" | "resonance",
      currentLvl: number,
      icon: "swords" | "sparkles" | "wrench" | "trophy" | "shield" | "flame",
      unitName = "Stufe"
    ) => {
      for (let t = 0; t < 10; t++) {
        const requiredLevel = (t + 1) * 10;
        const roman = ROMAN_NUMERALS[t];
        const tierName = TIER_NAMES[t];
        const isUnlocked = currentLvl >= requiredLevel;
        const progressPercent = Math.min(
          100,
          Math.max(0, Math.round((currentLvl / requiredLevel) * 100))
        );
        const theme = getTierTheme(t, isUnlocked);

        badges.push({
          id: `${category}-${trackKey}-tier-${t + 1}`,
          title: `${displayName} ${roman}`,
          category,
          trackName: displayName,
          requiredLevel,
          currentLevel: currentLvl,
          romanNumeral: roman,
          tierRank: t + 1,
          tierName,
          iconName: icon,
          isUnlocked,
          progressPercent,
          description: `Erreiche ${unitName} ${requiredLevel} in ${displayName} für den Rang „${tierName} ${roman}“.`,
          colorTheme: theme,
        });
      }
    };

    // 1. Weapon tracks
    const rawTracks = progression?.tracks ?? [];
    const weaponTracks = rawTracks.filter((t) => t.trackKind === "weapon");
    if (weaponTracks.length > 0) {
      for (const track of weaponTracks) {
        const lvl = Number(track.levelExact || 1);
        createTiersForTrack(
          track.trackId,
          `Waffe: ${track.trackId}`,
          "weapon",
          lvl,
          "swords"
        );
      }
    } else {
      createTiersForTrack(
        "aurion_spear",
        "Waffe: Aurion-Speer",
        "weapon",
        1,
        "swords"
      );
      createTiersForTrack(
        "blade_resonance",
        "Waffe: Klingen-Resonanz",
        "weapon",
        1,
        "swords"
      );
    }

    // 2. Skill tracks
    const skillTracks = rawTracks.filter((t) => t.trackKind === "skill");
    if (skillTracks.length > 0) {
      for (const track of skillTracks) {
        const lvl = Number(track.levelExact || 1);
        createTiersForTrack(
          track.trackId,
          `Fertigkeit: ${track.trackId}`,
          "skill",
          lvl,
          "sparkles"
        );
      }
    } else {
      createTiersForTrack(
        "solar_ward",
        "Fertigkeit: Sonnenschutz",
        "skill",
        1,
        "sparkles"
      );
      createTiersForTrack(
        "light_strike",
        "Fertigkeit: Lichtstoß",
        "skill",
        1,
        "sparkles"
      );
    }

    // 3. Crafting track
    const craftLvl = Number(craftingProgression?.levelExact || 1);
    createTiersForTrack(
      "crafting_mastery",
      "Handwerk & Alchemie",
      "crafting",
      craftLvl,
      "wrench"
    );

    // 4. Victories track (10, 20, 30 ... 100 victories)
    const victories = profile?.victories ?? 0;
    createTiersForTrack(
      "arena_victories",
      "Kampfsiege",
      "victory",
      victories,
      "trophy",
      "Siege"
    );

    // 5. Aurion Points Resonance Tiers (100 = I, 200 = II, ... 1000 = X, scale down /10 for lvl equivalent)
    const aurionPoints = profile?.aurionPoints ?? 0;
    for (let t = 0; t < 10; t++) {
      const requiredPoints = (t + 1) * 50;
      const roman = ROMAN_NUMERALS[t];
      const tierName = TIER_NAMES[t];
      const isUnlocked = aurionPoints >= requiredPoints;
      const progressPercent = Math.min(
        100,
        Math.max(0, Math.round((aurionPoints / requiredPoints) * 100))
      );
      const theme = getTierTheme(t, isUnlocked);

      badges.push({
        id: `resonance-points-tier-${t + 1}`,
        title: `Resonanz-Aura ${roman}`,
        category: "resonance",
        trackName: "Aurion-Resonanz",
        requiredLevel: requiredPoints,
        currentLevel: aurionPoints,
        romanNumeral: roman,
        tierRank: t + 1,
        tierName,
        iconName: "flame",
        isUnlocked,
        progressPercent,
        description: `Sammle ${requiredPoints} Aurion-Punkte für den Rang „${tierName} ${roman}“.`,
        colorTheme: theme,
      });
    }

    return badges;
  }, [progression, craftingProgression, profile]);

  // Filtered badges
  const filteredBadges = useMemo(() => {
    return allBadges.filter((b) => {
      if (selectedCategory !== "all" && b.category !== selectedCategory) {
        return false;
      }
      if (onlyUnlocked && !b.isUnlocked) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          b.title.toLowerCase().includes(q) ||
          b.trackName.toLowerCase().includes(q) ||
          b.tierName.toLowerCase().includes(q) ||
          b.romanNumeral.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allBadges, selectedCategory, onlyUnlocked, searchQuery]);

  // Statistics
  const totalBadges = allBadges.length;
  const unlockedCount = useMemo(
    () => allBadges.filter((b) => b.isUnlocked).length,
    [allBadges]
  );
  const completionRate =
    totalBadges > 0 ? Math.round((unlockedCount / totalBadges) * 100) : 0;

  // Render appropriate Lucide icon
  const renderIcon = (iconName: string, className = "size-4") => {
    switch (iconName) {
      case "swords":
        return <Swords className={className} />;
      case "sparkles":
        return <Sparkles className={className} />;
      case "wrench":
        return <Wrench className={className} />;
      case "trophy":
        return <Trophy className={className} />;
      case "shield":
        return <Shield className={className} />;
      case "flame":
        return <Flame className={className} />;
      default:
        return <Award className={className} />;
    }
  };

  return (
    <section
      id="account-achievements-gallery"
      className="rounded-2xl border border-cyan-400/30 bg-black/35 p-6 shadow-2xl backdrop-blur-md"
    >
      {/* Gallery Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/60 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="flex size-11 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-950/50 text-amber-300 shadow-inner">
            <Trophy className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="font-serif text-xl font-bold tracking-wide text-slate-100">
                Meilensteine & Auszeichnungen-Galerie
              </h3>
              <span className="rounded-full border border-amber-400/40 bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                {unlockedCount} / {totalBadges} Freigeschaltet ({completionRate}%)
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Verdiente Römische Rang-Abzeichen (I–X) bei jedem 10. Levelaufstieg in allen Progressionspfaden
            </p>
          </div>
        </div>

        {/* Global summary badge progress meter */}
        <div className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-950/70 px-4 py-2">
          <div className="text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Gesamtfortschritt
            </span>
            <span className="font-serif text-sm font-bold text-cyan-300">
              {completionRate}% Erreicht
            </span>
          </div>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-amber-400 to-emerald-400 transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
          {(
            [
              { id: "all", label: "Alle", icon: Award },
              { id: "weapon", label: "Waffen (10er Tiers)", icon: Swords },
              { id: "skill", label: "Fertigkeiten", icon: Sparkles },
              { id: "crafting", label: "Handwerk", icon: Wrench },
              { id: "victory", label: "Siege", icon: Trophy },
              { id: "resonance", label: "Resonanz", icon: Flame },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = selectedCategory === tab.id;
            return (
              <button
                key={tab.id}
                id={`btn-achievement-tab-${tab.id}`}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "border border-cyan-400/40 bg-cyan-950/80 text-cyan-200 shadow"
                    : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
                }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Only Unlocked toggle */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
            <input
              id="achievement-search-input"
              type="text"
              placeholder="Abzeichen / Pfad suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-44 rounded-lg border border-slate-700 bg-slate-900/80 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <button
            id="btn-toggle-unlocked-only"
            type="button"
            onClick={() => setOnlyUnlocked(!onlyUnlocked)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              onlyUnlocked
                ? "border-amber-400/50 bg-amber-950/70 text-amber-200"
                : "border-slate-700 bg-slate-900/80 text-slate-400 hover:text-slate-200"
            }`}
          >
            <CheckCircle2 className="size-3.5" />
            Nur Freigeschaltet
          </button>
        </div>
      </div>

      {/* Badges Grid */}
      <div className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {filteredBadges.map((badge) => {
          const isSelected = selectedBadge?.id === badge.id;
          return (
            <div
              key={badge.id}
              id={`badge-card-${badge.id}`}
              onClick={() => setSelectedBadge(badge)}
              className={`group relative flex cursor-pointer flex-col items-center rounded-xl border p-3.5 transition-all duration-300 ${
                badge.colorTheme.border
              } ${badge.colorTheme.bg} ${badge.colorTheme.glow} ${
                isSelected ? "ring-2 ring-cyan-400 scale-[1.02]" : "hover:scale-[1.02]"
              } ${badge.isUnlocked ? "badge-unlocked-glow" : "opacity-60"}`}
            >
              {/* Badge Top Header: Icon & Tier Tag */}
              <div className="flex w-full items-center justify-between">
                <div
                  className={`rounded-md p-1.5 ${
                    badge.isUnlocked
                      ? "bg-black/40 text-cyan-300"
                      : "bg-slate-900/80 text-slate-600"
                  }`}
                >
                  {renderIcon(badge.iconName, "size-3.5")}
                </div>
                <span
                  className={`text-[10px] font-bold tracking-wider ${
                    badge.isUnlocked ? badge.colorTheme.text : "text-slate-500"
                  }`}
                >
                  Tier {badge.tierRank}
                </span>
              </div>

              {/* Ornate Roman Numeral Shield Emblem */}
              <div className="relative my-3 flex size-14 items-center justify-center">
                {/* Outer Ring */}
                <div
                  className={`absolute inset-0 rounded-full border-2 transition-all ${
                    badge.isUnlocked
                      ? `${badge.colorTheme.badgeStyle} bg-black/40 shadow-inner`
                      : "border-dashed border-slate-700 bg-slate-950/80"
                  }`}
                />
                {/* Inner Roman Numeral */}
                <span
                  className={`relative font-serif text-2xl font-black tracking-tight ${
                    badge.isUnlocked
                      ? `${badge.colorTheme.numeralColor} badge-roman-active`
                      : "text-slate-600"
                  }`}
                >
                  {badge.romanNumeral}
                </span>
                {/* Locked overlay badge icon */}
                {!badge.isUnlocked && (
                  <div className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-slate-900 border border-slate-700 text-slate-400 shadow">
                    <Lock className="size-2.5" />
                  </div>
                )}
              </div>

              {/* Badge Details */}
              <div className="w-full text-center">
                <p className="line-clamp-1 font-serif text-xs font-bold text-slate-100">
                  {badge.title}
                </p>
                <p className="line-clamp-1 text-[10px] text-slate-400">
                  {badge.tierName} · Lvl {badge.requiredLevel}
                </p>

                {/* Progress bar inside card */}
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-950">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      badge.isUnlocked
                        ? "bg-gradient-to-r from-cyan-400 to-emerald-400"
                        : "bg-slate-700"
                    }`}
                    style={{ width: `${badge.progressPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-[9px] text-slate-500">
                  {badge.isUnlocked
                    ? "✓ Freigeschaltet"
                    : `${badge.currentLevel} / ${badge.requiredLevel} (${badge.progressPercent}%)`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {filteredBadges.length === 0 && (
        <div className="my-8 text-center text-slate-400">
          <Award className="mx-auto size-10 text-slate-600" />
          <p className="mt-2 text-sm">Keine Meilensteine gefunden für die gewählten Filter.</p>
        </div>
      )}

      {/* Selected Badge Detail Modal / Drawer Card */}
      {selectedBadge && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-cyan-400/40 bg-gradient-to-r from-slate-950 via-cyan-950/40 to-slate-950 p-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-xl border-2 border-cyan-400/60 bg-black/60 shadow-lg">
              <span className="font-serif text-3xl font-black text-cyan-300">
                {selectedBadge.romanNumeral}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-serif text-base font-bold text-slate-100">
                  {selectedBadge.title}
                </h4>
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                    selectedBadge.isUnlocked
                      ? "bg-emerald-950 border border-emerald-500/50 text-emerald-300"
                      : "bg-slate-900 border border-slate-700 text-slate-400"
                  }`}
                >
                  {selectedBadge.isUnlocked ? "Freigeschaltet" : "Gesperrt"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-300">{selectedBadge.description}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Pfad: <b className="text-cyan-300">{selectedBadge.trackName}</b> · Aktueller Stand:{" "}
                <b className="text-amber-300">
                  {selectedBadge.currentLevel} / {selectedBadge.requiredLevel}
                </b>
              </p>
            </div>
          </div>
          <button
            id="btn-close-selected-badge"
            type="button"
            onClick={() => setSelectedBadge(null)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Schließen
          </button>
        </div>
      )}
    </section>
  );
}
