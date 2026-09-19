import { useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  Crosshair,
  Crown,
  Filter,
  ListTodo,
  Percent,
  RotateCcw,
  Scroll,
  Search,
  ShieldAlert,
  Sparkles,
  Swords,
  X,
} from "lucide-react";
import type { Ax1HudObjective } from "./GameHUD";

export interface ActiveQuestsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  objectives: readonly Ax1HudObjective[];
  zoneName?: string;
  onFocusObjective?: (id: string) => void;
  focusedObjectiveId?: string | null;
}

export function ActiveQuestsPanel({
  isOpen,
  onClose,
  objectives,
  zoneName = "Aurion Open World",
  onFocusObjective,
  focusedObjectiveId,
}: ActiveQuestsPanelProps) {
  const [filterKind, setFilterKind] = useState<"all" | "primary" | "encounter" | "npc" | "world">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(objectives.map(o => o.id)));

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(objectives.map(o => o.id)));
  const collapseAll = () => setExpandedIds(new Set());

  // Calculations for summary stats
  const totalCount = objectives.length;
  const completedCount = objectives.filter(o => o.completed || (o.progress !== undefined && o.progress >= 1)).length;
  const avgProgress = totalCount > 0
    ? Math.round(
        (objectives.reduce((acc, obj) => {
          if (obj.completed) return acc + 100;
          if (obj.progress !== undefined) return acc + Math.min(100, Math.max(0, obj.progress * 100));
          return acc + 0;
        }, 0) /
          totalCount)
      )
    : 0;

  const filteredObjectives = useMemo(() => {
    return objectives.filter(obj => {
      // Kind filtering
      if (filterKind === "primary" && obj.kind !== "primary") return false;
      if (filterKind === "encounter" && obj.kind !== "encounter") return false;
      if (filterKind === "npc" && obj.kind !== "npc") return false;
      if (filterKind === "world" && obj.kind !== "portal" && obj.kind !== "landmark") return false;

      // Query search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesLabel = obj.label.toLowerCase().includes(query);
        const matchesDetail = obj.detail.toLowerCase().includes(query);
        const matchesSubtasks = obj.subtasks?.some(st => st.toLowerCase().includes(query)) ?? false;
        const matchesLore = obj.lore?.toLowerCase().includes(query) ?? false;
        if (!matchesLabel && !matchesDetail && !matchesSubtasks && !matchesLore) return false;
      }

      return true;
    });
  }, [objectives, filterKind, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      id="active-quests-modal-backdrop"
      data-testid="active-quests-panel"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        id="active-quests-window"
        role="dialog"
        aria-label="Aktive Quests und Missionsziele"
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border-2 border-amber-500/60 bg-[#071322]/95 text-gray-100 shadow-[0_0_50px_rgba(245,158,11,0.25)] overflow-hidden"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gray-800/90 px-4 sm:px-6 py-3.5 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-400">
              <Scroll className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-serif font-bold text-amber-200 tracking-wide uppercase">
                  Aktive Quests & Missionsziele
                </h2>
                <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300">
                  {totalCount} {totalCount === 1 ? "Ziel" : "Ziele"}
                </span>
              </div>
              <p className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                <Compass className="h-3.5 w-3.5 text-cyan-400" />
                <span>Region: <b className="text-gray-300">{zoneName}</b></span>
                <span className="text-gray-600">·</span>
                <span>Serverbestätigter Missionsfortschritt</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Panel schließen"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-700 bg-black/60 text-gray-400 hover:border-amber-400 hover:text-amber-200 active:scale-95 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Global Progress Summary Bar */}
        <div className="border-b border-gray-800/80 bg-black/30 px-4 sm:px-6 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-950/20 p-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <ListTodo className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400">Aktive Missionen</span>
                <p className="text-sm font-bold text-amber-200 font-mono">{totalCount}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-gray-400">Abgeschlossen</span>
                <p className="text-sm font-bold text-emerald-300 font-mono">
                  {completedCount} <span className="text-xs text-gray-500 font-normal">/ {totalCount}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
                <Percent className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                  <span className="uppercase text-gray-400">Gesamt-Fortschritt</span>
                  <b className="text-cyan-300">{avgProgress}%</b>
                </div>
                <div className="h-2 w-full rounded-full bg-black/70 overflow-hidden border border-cyan-900/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-600 via-teal-400 to-amber-400 transition-all duration-500"
                    style={{ width: `${avgProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-gray-800/80 bg-black/20 px-4 sm:px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono text-gray-400 uppercase mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filter:
            </span>
            <button
              type="button"
              onClick={() => setFilterKind("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono transition-all ${
                filterKind === "all"
                  ? "border border-amber-500/60 bg-amber-500/20 text-amber-200 font-bold shadow-sm"
                  : "border border-gray-800 bg-black/50 text-gray-400 hover:text-gray-200 hover:border-gray-700"
              }`}
            >
              Alle ({objectives.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterKind("primary")}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono transition-all ${
                filterKind === "primary"
                  ? "border border-purple-500/60 bg-purple-950/40 text-purple-200 font-bold shadow-sm"
                  : "border border-gray-800 bg-black/50 text-gray-400 hover:text-gray-200 hover:border-gray-700"
              }`}
            >
              👑 Hauptziele ({objectives.filter(o => o.kind === "primary").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterKind("encounter")}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono transition-all ${
                filterKind === "encounter"
                  ? "border border-red-500/60 bg-red-950/40 text-red-200 font-bold shadow-sm"
                  : "border border-gray-800 bg-black/50 text-gray-400 hover:text-gray-200 hover:border-gray-700"
              }`}
            >
              ⚔️ Begegnungen ({objectives.filter(o => o.kind === "encounter").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterKind("npc")}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono transition-all ${
                filterKind === "npc"
                  ? "border border-cyan-500/60 bg-cyan-950/40 text-cyan-200 font-bold shadow-sm"
                  : "border border-gray-800 bg-black/50 text-gray-400 hover:text-gray-200 hover:border-gray-700"
              }`}
            >
              💬 Kontakte ({objectives.filter(o => o.kind === "npc").length})
            </button>
            <button
              type="button"
              onClick={() => setFilterKind("world")}
              className={`rounded-lg px-2.5 py-1 text-xs font-mono transition-all ${
                filterKind === "world"
                  ? "border border-emerald-500/60 bg-emerald-950/40 text-emerald-200 font-bold shadow-sm"
                  : "border border-gray-800 bg-black/50 text-gray-400 hover:text-gray-200 hover:border-gray-700"
              }`}
            >
              🧭 Welt ({objectives.filter(o => o.kind === "portal" || o.kind === "landmark").length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Ziele filtern..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-7 w-32 sm:w-44 rounded-lg border border-gray-800 bg-black/60 pl-8 pr-2.5 text-xs text-gray-200 placeholder-gray-500 focus:border-amber-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={expandedIds.size === objectives.length ? collapseAll : expandAll}
              title={expandedIds.size === objectives.length ? "Alle einklappen" : "Alle ausklappen"}
              className="rounded-lg border border-gray-800 bg-black/50 px-2 py-1 text-[10px] font-mono text-gray-400 hover:border-gray-700 hover:text-gray-200"
            >
              {expandedIds.size === objectives.length ? "Einklappen" : "Ausklappen"}
            </button>
          </div>
        </div>

        {/* Objectives List Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 custom-scrollbar">
          {filteredObjectives.length === 0 ? (
            <div className="rounded-2xl border border-gray-800 bg-black/40 p-8 text-center space-y-2">
              <ShieldAlert className="mx-auto h-8 w-8 text-gray-600" />
              <h3 className="text-sm font-serif font-bold text-gray-400">Keine passenden Missionsziele gefunden</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {searchQuery
                  ? `Keine Ziele für den Suchbegriff "${searchQuery}" vorhanden.`
                  : "In dieser Kategorie liegen zurzeit keine aktiven Realm-Ziele vor."}
              </p>
              {(searchQuery || filterKind !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterKind("all");
                    setSearchQuery("");
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-mono text-amber-300 hover:bg-amber-500/20"
                >
                  <RotateCcw className="h-3 w-3" /> Filter zurücksetzen
                </button>
              )}
            </div>
          ) : (
            filteredObjectives.map(obj => {
              const isExpanded = expandedIds.has(obj.id);
              const isFocused = focusedObjectiveId === obj.id;
              const isCompleted = obj.completed || (obj.progress !== undefined && obj.progress >= 1);
              const progressPct = obj.progress !== undefined ? Math.round(Math.min(100, Math.max(0, obj.progress * 100))) : (isCompleted ? 100 : 0);

              return (
                <article
                  key={obj.id}
                  id={`quest-card-${obj.id}`}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                    isFocused
                      ? "border-amber-400 bg-[#091b30] shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                      : obj.kind === "primary"
                      ? "border-purple-500/40 bg-purple-950/20 hover:border-purple-400/60"
                      : isCompleted
                      ? "border-emerald-500/30 bg-emerald-950/15"
                      : "border-gray-800 bg-black/50 hover:border-gray-700"
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Kind Icon Badge */}
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border mt-0.5 ${
                            obj.kind === "primary"
                              ? "border-purple-500/60 bg-purple-900/40 text-purple-300"
                              : obj.kind === "encounter"
                              ? "border-red-500/60 bg-red-900/40 text-red-300"
                              : obj.kind === "npc"
                              ? "border-cyan-500/60 bg-cyan-900/40 text-cyan-300"
                              : "border-emerald-500/60 bg-emerald-900/40 text-emerald-300"
                          }`}
                        >
                          {obj.kind === "primary" ? (
                            <Crown className="h-4 w-4" />
                          ) : obj.kind === "encounter" ? (
                            <Swords className="h-4 w-4" />
                          ) : obj.kind === "npc" ? (
                            <Sparkles className="h-4 w-4" />
                          ) : (
                            <Compass className="h-4 w-4" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                                obj.kind === "primary"
                                  ? "border-purple-500/50 bg-purple-950/60 text-purple-300"
                                  : obj.kind === "encounter"
                                  ? "border-red-500/50 bg-red-950/60 text-red-300"
                                  : obj.kind === "npc"
                                  ? "border-cyan-500/50 bg-cyan-950/60 text-cyan-300"
                                  : "border-emerald-500/50 bg-emerald-950/60 text-emerald-300"
                              }`}
                            >
                              {obj.kind === "primary"
                                ? "Hauptmission"
                                : obj.kind === "encounter"
                                ? "Begegnung"
                                : obj.kind === "npc"
                                ? "Kontakt"
                                : "Erkundung"}
                            </span>

                            {isCompleted ? (
                              <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-1.5 py-0.5 rounded">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Abgeschlossen
                              </span>
                            ) : (
                              <span className="text-[9px] font-mono text-amber-300 bg-amber-950/40 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                In Bearbeitung
                              </span>
                            )}

                            {isFocused && (
                              <span className="text-[9px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-400/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Crosshair className="h-2.5 w-2.5 text-cyan-400" /> Im HUD fokussiert
                              </span>
                            )}
                          </div>

                          <h3 className="text-sm sm:text-base font-serif font-bold text-gray-100 mt-1">
                            {obj.label}
                          </h3>
                        </div>
                      </div>

                      {/* Right Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onFocusObjective && (
                          <button
                            type="button"
                            onClick={() => onFocusObjective(obj.id)}
                            title={isFocused ? "Fokus aufheben" : "Im HUD fokussieren"}
                            aria-label={`Missionsziel ${obj.label} fokussieren`}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
                              isFocused
                                ? "border-cyan-400 bg-cyan-950/70 text-cyan-300"
                                : "border-gray-800 bg-black/60 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                            }`}
                          >
                            <Crosshair className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleExpand(obj.id)}
                          aria-expanded={isExpanded}
                          aria-label={`Details zu ${obj.label} umschalten`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-800 bg-black/60 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar & Percentage Meter */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-gray-400 text-[11px] font-sans">Fortschritt</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-bold font-mono ${
                              isCompleted
                                ? "text-emerald-400"
                                : progressPct > 50
                                ? "text-cyan-300"
                                : "text-amber-400"
                            }`}
                          >
                            {progressPct}%
                          </span>
                          {isCompleted && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                        </div>
                      </div>
                      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-black/80 border border-gray-800">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${
                            isCompleted
                              ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                              : obj.kind === "primary"
                              ? "bg-gradient-to-r from-purple-600 via-purple-400 to-amber-400"
                              : "bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300"
                          }`}
                          style={{ width: `${Math.max(4, progressPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Objective Description */}
                    <p className="text-xs text-gray-300 leading-relaxed">{obj.detail}</p>
                  </div>

                  {/* Expanded Details Section */}
                  {isExpanded && (
                    <div className="border-t border-gray-800/80 bg-black/30 p-3.5 sm:p-4 space-y-3">
                      {/* Subtasks List if available */}
                      {obj.subtasks && obj.subtasks.length > 0 ? (
                        <div className="space-y-1.5">
                          <h4 className="text-[10px] font-mono uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1">
                            <ListTodo className="h-3 w-3 text-amber-400" /> Teilziele & Aufgaben:
                          </h4>
                          <ul className="space-y-1 pl-1">
                            {obj.subtasks.map((task, idx) => {
                              const subCompleted = isCompleted || (obj.progress !== undefined && idx < Math.floor(obj.progress * obj.subtasks!.length));
                              return (
                                <li
                                  key={idx}
                                  className="flex items-center gap-2 text-xs text-gray-300 bg-black/40 rounded-lg p-2 border border-gray-800/60"
                                >
                                  {subCompleted ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                  ) : (
                                    <Circle className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                                  )}
                                  <span className={subCompleted ? "line-through text-gray-500" : "text-gray-200"}>
                                    {task}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-black/40 p-2.5 border border-gray-800/60 text-[11px] text-gray-400 flex items-center justify-between">
                          <span>Status im Aurion-Realm:</span>
                          <b className="text-cyan-300 font-mono">
                            {isCompleted ? "Vollständig abgeschlossen" : "Wird durch Realm-Ereignisse aktualisiert"}
                          </b>
                        </div>
                      )}

                      {/* Lore Quote if present */}
                      {obj.lore && (
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-2.5 text-xs text-cyan-200/90 italic">
                          <p className="flex items-center gap-1 text-[10px] font-mono not-italic text-cyan-400 uppercase font-bold mb-1">
                            <Sparkles className="h-3 w-3" /> Lore-Kontext
                          </p>
                          "{obj.lore}"
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-800/90 bg-black/60 px-4 sm:px-6 py-3 text-xs text-gray-400">
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-300">O</kbd> oder <kbd className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-[10px] text-gray-300">L</kbd> Schnellzugriff
            </span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-400">Deterministische Aurion-Progression</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-1.5 text-xs font-mono font-bold text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all"
          >
            Schließen
          </button>
        </footer>
      </section>
    </div>
  );
}
