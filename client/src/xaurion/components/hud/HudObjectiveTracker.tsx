import { useState } from "react";
import { Award, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { prefersCompactPanels, projectionLabel, splitObjectives } from "./hudProjection";
import { useScrollHint } from "./useScrollHint";
import type { Ax1HudObjective, GameHUDProps } from "./hudTypes";
import type { ObjectiveEffect } from "./useObjectiveEffects";

type TrackerProps = Readonly<
  {
    objectives: readonly Ax1HudObjective[];
    effects: ReadonlyMap<string, ObjectiveEffect>;
    ledger: readonly Ax1HudObjective[];
  } & Pick<GameHUDProps, "worldState" | "worldStateLabel" | "onOpenQuests">
>;

/** World objectives. Collapsed = one readable line with the primary objective; expanded = full card. */
export function HudObjectiveTracker({ objectives, effects, ledger, worldState, worldStateLabel, onOpenQuests }: TrackerProps) {
  const [collapsed, setCollapsed] = useState(prefersCompactPanels);
  const { primary, nearby } = splitObjectives(objectives);
  const worldProjection = projectionLabel(worldState);
  const { ref: bodyRef, more } = useScrollHint<HTMLDivElement>([collapsed, objectives, ledger]);

  return (
    <section data-collapsed={collapsed} className="ax1-objective-tracker ax-tracker ax-glass">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="ax-tracker__head"
        aria-label={collapsed ? "Ziele öffnen" : "Ziele schließen"}
        aria-expanded={!collapsed}
      >
        <Award aria-hidden />
        <span className="ax-tracker__title">Weltziele</span>
        {collapsed && primary ? (
          <span data-testid="collapsed-primary-objective" className="ax-tracker__peek ax-ellipsis">
            {primary.label}
          </span>
        ) : (
          <span className="ax-tracker__spacer" />
        )}
        {collapsed ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
      </button>

      {!collapsed && (
        <div ref={bodyRef} className="ax-tracker__body" data-more={more}>
          {primary ? (
            <section className="ax-objective" aria-label="Hauptziel" data-effect={effects.get(primary.id) ?? "none"}>
              <div className="ax-objective__meta">
                <span className="ax-eyebrow">PRIMARY · SERVER PROJECTION</span>
                {primary.completed ? (
                  <span className="ax-chip" data-tone="ok">
                    <CheckCircle2 aria-hidden /> Confirmed
                  </span>
                ) : (
                  <span className="ax-objective__state">Active</span>
                )}
              </div>
              <h2 className="ax-objective__label">{primary.label}</h2>
              <p className="ax-objective__detail">{primary.detail}</p>
              {primary.progress !== undefined ? (
                <div className="ax-progress">
                  <div className="ax-progress__track">
                    <div className="ax-progress__fill" style={{ width: `${primary.progress * 100}%` }} />
                  </div>
                  <span>{Math.round(primary.progress * 100)}%</span>
                </div>
              ) : null}
              <div className="ax-objective__foot">
                <span>World state · {worldProjection}</span>
                <button type="button" onClick={onOpenQuests} className="ax-link">
                  Journal <kbd className="ax-kbd ax-kbd--inline">J</kbd>
                </button>
              </div>
            </section>
          ) : (
            <div className="ax-empty">{worldState === "live" ? "Keine bestätigten aktiven Hauptziele." : worldStateLabel}</div>
          )}

          {nearby.length > 0 ? (
            <section className="ax-nearby" aria-label="Nearby objectives">
              <div className="ax-nearby__head">
                <span className="ax-eyebrow">Nearby · {nearby.length}</span>
                <span className="ax-nearby__poi">POI</span>
              </div>
              <div className="ax-nearby__list">
                {nearby.slice(0, 4).map((objective) => (
                  <Collapsible key={objective.id} data-effect={effects.get(objective.id) ?? "none"}>
                    <CollapsibleTrigger asChild>
                      <button type="button" className="ax-nearby__item" aria-label={`${objective.label} · ${objective.kind}`}>
                        <span className="ax-diamond" aria-hidden />
                        <span className="ax-nearby__text">
                          <span className="ax-nearby__label ax-ellipsis">{objective.label}</span>
                          <span className="ax-nearby__detail ax-ellipsis">{objective.detail}</span>
                        </span>
                        {objective.completed ? <CheckCircle2 className="ax-ok" aria-hidden /> : <ChevronDown aria-hidden />}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="ax-nearby__more">
                      {objective.subtasks?.length ? (
                        <ul>
                          {objective.subtasks.map((task, i) => (
                            <li key={i}>{task}</li>
                          ))}
                        </ul>
                      ) : null}
                      {objective.lore ? <p>{objective.lore}</p> : null}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </section>
          ) : null}

          {ledger.length > 0 ? (
            <section className="ax-ledger" aria-label="Recently confirmed objectives">
              <p className="ax-eyebrow">Recently confirmed</p>
              {ledger.slice(0, 3).map((obj) => (
                <div key={obj.id} className="ax-ledger__row">
                  <ShieldCheck aria-hidden />
                  <span className="ax-ellipsis">{obj.label}</span>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
