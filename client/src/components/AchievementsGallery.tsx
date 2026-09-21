import { useMemo, useState } from "react";
import { Award, CheckCircle2, Flame, Lock, Search, Sparkles, Swords, Trophy, Wrench } from "lucide-react";

type TrackItem = Readonly<{
  trackKind: "weapon" | "skill";
  trackId: string;
  levelExact: string | number;
}>;

export type AchievementsGalleryProps = Readonly<{
  profile?: Readonly<{ aurionPoints: number; victories: number }> | null;
  progression?: Readonly<{ tracks: readonly TrackItem[] }> | null;
  craftingProgression?: Readonly<{ levelExact: string | number; totalXpExact: string | number }> | null;
}>;

type Category = "all" | "weapon" | "skill" | "crafting" | "victory" | "resonance";
type Badge = Readonly<{
  id: string;
  title: string;
  category: Exclude<Category, "all">;
  current: number;
  required: number;
  roman: string;
  tier: string;
  unlocked: boolean;
  progress: number;
}>;

const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X"] as const;
const TIERS = ["Novize","Adept","Kämpfer","Veteran","Meister","Großmeister","Champion","Legendär","Mythisch","Aurion"] as const;

function exactNonNegative(value: string | number | undefined): number | null {
  const number = typeof value === "number" ? value : value !== undefined && /^(0|[1-9][0-9]*)$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function badgeRows(props: AchievementsGalleryProps): Badge[] {
  const rows: Badge[] = [];
  const addTiers = (category: Badge["category"], key: string, label: string, current: number, step: number) => {
    for (let index = 0; index < 10; index++) {
      const required = step * (index + 1);
      rows.push(Object.freeze({
        id: `${category}:${key}:${index + 1}`,
        title: `${label} ${ROMAN[index]}`,
        category,
        current,
        required,
        roman: ROMAN[index],
        tier: TIERS[index],
        unlocked: current >= required,
        progress: Math.min(100, Math.round(current / required * 100)),
      }));
    }
  };

  for (const track of props.progression?.tracks ?? []) {
    const level = exactNonNegative(track.levelExact);
    if (level === null) continue;
    addTiers(track.trackKind, track.trackId, `${track.trackKind === "weapon" ? "Waffe" : "Fertigkeit"}: ${track.trackId}`, level, 10);
  }

  const crafting = exactNonNegative(props.craftingProgression?.levelExact);
  if (crafting !== null) addTiers("crafting", "crafting", "Handwerk & Alchemie", crafting, 10);

  if (props.profile) {
    const victories = exactNonNegative(props.profile.victories);
    const points = exactNonNegative(props.profile.aurionPoints);
    if (victories !== null) addTiers("victory", "victories", "Kampfsiege", victories, 10);
    if (points !== null) addTiers("resonance", "aurion-points", "Aurion-Punkte", points, 50);
  }

  return rows;
}

const CATEGORY: ReadonlyArray<Readonly<{ id: Category; label: string }>> = [
  { id: "all", label: "Alle" },
  { id: "weapon", label: "Waffen" },
  { id: "skill", label: "Fertigkeiten" },
  { id: "crafting", label: "Handwerk" },
  { id: "victory", label: "Siege" },
  { id: "resonance", label: "Aurion" },
];

export function AchievementsGallery(props: AchievementsGalleryProps) {
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);
  const [selected, setSelected] = useState<Badge | null>(null);
  const badges = useMemo(() => badgeRows(props), [props.profile, props.progression, props.craftingProgression]);
  const visible = useMemo(() => badges.filter(badge =>
    (category === "all" || badge.category === category) &&
    (!onlyUnlocked || badge.unlocked) &&
    (!query.trim() || badge.title.toLocaleLowerCase("de-DE").includes(query.trim().toLocaleLowerCase("de-DE")))
  ), [badges, category, onlyUnlocked, query]);
  const unlocked = badges.filter(badge => badge.unlocked).length;
  const completion = badges.length ? Math.round(unlocked / badges.length * 100) : 0;

  const icon = (category: Badge["category"]) => category === "weapon" ? <Swords className="size-4"/> :
    category === "skill" ? <Sparkles className="size-4"/> :
    category === "crafting" ? <Wrench className="size-4"/> :
    category === "victory" ? <Trophy className="size-4"/> : <Flame className="size-4"/>;

  return <section id="account-achievements-gallery" className="rounded-2xl border border-cyan-400/30 bg-black/35 p-6 shadow-2xl backdrop-blur-md">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700/60 pb-5">
      <div className="flex gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-950/50 text-amber-300"><Trophy className="size-6"/></div>
        <div>
          <h3 className="font-serif text-xl font-bold text-slate-100">Meilensteine & Auszeichnungen</h3>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">Rein visuelle Meilensteine aus bestätigten Progressions-, Crafting-, Siege- und Aurion-Punkte-Readbacks. Diese Galerie ist keine eigene Achievement- oder Gameplay-Authority.</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-right text-xs">
        <span className="block text-slate-400">Bestätigte Meilensteine</span>
        <b className="text-cyan-300">{unlocked}/{badges.length} · {completion}%</b>
      </div>
    </header>

    {badges.length === 0 ? <div className="py-8 text-center text-slate-400" data-testid="achievements-no-evidence">
      <Award className="mx-auto mb-2 size-9 text-slate-600"/>
      Keine bestätigten Progressionsdaten für Meilensteine verfügbar.
    </div> : <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Meilenstein-Kategorien">
          {CATEGORY.map(item => <button key={item.id} type="button" role="tab" aria-selected={category === item.id}
            onClick={() => setCategory(item.id)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${category === item.id ? "border-cyan-400/50 bg-cyan-950/70 text-cyan-200" : "border-slate-700 bg-slate-950/50 text-slate-400"}`}>
            {item.label}
          </button>)}
        </div>
        <div className="flex gap-2">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-500"/>
            <span className="sr-only">Meilensteine suchen</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Abzeichen / Pfad suchen..."
              className="h-8 w-48 rounded-lg border border-slate-700 bg-slate-900/80 pl-8 pr-2 text-xs text-slate-200"/>
          </label>
          <button type="button" onClick={() => setOnlyUnlocked(value => !value)}
            className={`rounded-lg border px-3 text-xs ${onlyUnlocked ? "border-amber-400/50 bg-amber-950/60 text-amber-200" : "border-slate-700 text-slate-400"}`}>
            <CheckCircle2 className="mr-1 inline size-3.5"/> Nur erreicht
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {visible.map(badge => <button key={badge.id} type="button" onClick={() => setSelected(badge)}
          className={`rounded-xl border p-3 text-left transition ${badge.unlocked ? "border-cyan-400/40 bg-cyan-950/25" : "border-slate-700 bg-slate-950/60 opacity-65"}`}>
          <div className="flex items-center justify-between text-xs text-slate-400">{icon(badge.category)}<span>{badge.tier}</span></div>
          <div className="my-3 flex items-center justify-center">
            <span className={`flex size-14 items-center justify-center rounded-full border-2 font-serif text-2xl font-black ${badge.unlocked ? "border-amber-300/70 text-amber-200" : "border-slate-700 text-slate-600"}`}>
              {badge.roman}
            </span>
          </div>
          <b className="block truncate text-xs text-slate-100">{badge.title}</b>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400" style={{width:`${badge.progress}%`}}/></div>
          <span className="mt-1 block text-[10px] text-slate-500">{badge.unlocked ? "✓ erreicht" : `${badge.current}/${badge.required}`}</span>
        </button>)}
      </div>
    </>}

    {selected && <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-cyan-400/30 bg-slate-950/80 p-4">
      <div><b className="text-slate-100">{selected.title}</b><p className="text-xs text-slate-400">Bestätigter Readback: {selected.current}; Schwelle: {selected.required}. {selected.unlocked ? "Meilenstein erreicht." : "Noch nicht erreicht."}</p></div>
      <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300">Schließen</button>
    </div>}
  </section>;
}
