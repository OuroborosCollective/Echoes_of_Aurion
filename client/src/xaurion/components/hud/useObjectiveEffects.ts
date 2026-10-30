import { useEffect, useRef, useState } from "react";
import type { Ax1HudObjective } from "./hudTypes";

export type ObjectiveEffect = "shake" | "pulse";

/**
 * Presentation reaction to confirmed objective snapshots. Behaviour is unchanged from the
 * former inline GameHUD effect: the first snapshot is a baseline (no cue, no effect); later
 * snapshots compare by stable id and content, never by array identity.
 */
export function useObjectiveEffects(objectives: readonly Ax1HudObjective[]) {
  const previousRef = useRef<readonly Ax1HudObjective[] | null>(null);
  const [effects, setEffects] = useState<Map<string, ObjectiveEffect>>(new Map());
  const [ledger, setLedger] = useState<Ax1HudObjective[]>([]);

  useEffect(() => {
    const next = new Map<string, ObjectiveEffect>();
    const completed: Ax1HudObjective[] = [];
    const previous = previousRef.current;

    objectives.forEach((objective) => {
      const before = previous?.find((candidate) => candidate.id === objective.id);
      if (previous && objective.completed && !before?.completed) {
        window.dispatchEvent(new CustomEvent("aurion:audio-cue", { detail: { cue: "progression.quest_complete", category: "progression" } }));
        completed.push(objective);
      }
      if (!previous) return;
      if (!before) next.set(objective.id, "shake");
      else if (before.label !== objective.label || before.detail !== objective.detail || before.progress !== objective.progress || before.completed !== objective.completed)
        next.set(objective.id, "pulse");
    });

    previousRef.current = objectives;
    if (completed.length > 0) setLedger((prev) => [...completed, ...prev].slice(0, 5));
    if (next.size > 0) {
      setEffects(next);
      const timer = setTimeout(() => setEffects(new Map()), 1500);
      return () => clearTimeout(timer);
    }
  }, [objectives]);

  return { effects, ledger } as const;
}
