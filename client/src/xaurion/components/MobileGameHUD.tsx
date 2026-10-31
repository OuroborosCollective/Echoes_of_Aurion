import { useEffect, useState } from "react";
import { HudCombatCluster, HudSystemRail } from "./hud/HudCombatCluster";
import { HudMetricsChip, HudMetricsPanel } from "./hud/HudCombatMetrics";
import { HudDeck, HudNav } from "./hud/HudMenu";
import { HudObjectiveTracker } from "./hud/HudObjectiveTracker";
import { HudPartyFrames } from "./hud/HudPartyFrames";
import { HudStatusChips, HudUnitFrame, HudZoneRow } from "./hud/HudUnitFrame";
import { useObjectiveEffects } from "./hud/useObjectiveEffects";
import type { GameHUDProps } from "./hud/hudTypes";
import "./hud/hud.css";

export type { Ax1HudCombatLog, Ax1HudObjective, Ax1HudPartyMember, Ax1HudSkill, GameHUDProps, HudContext } from "./hud/hudTypes";

/**
 * Aurion HUD composition. All behaviour and data contracts are unchanged; this file only wires
 * the focused modules in ./hud together. The deck and metrics panel are rendered at root level so
 * they always stack above the HUD regions.
 */
export function GameHUD(props: GameHUDProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const { effects, ledger } = useObjectiveEffects(props.objectives);
  const { onMenuOpenChange } = props;

  useEffect(() => {
    onMenuOpenChange?.(menuOpen);
  }, [menuOpen, onMenuOpenChange]);

  const closeThen = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div
      id="game-hud-root"
      data-testid="ax1-game-hud"
      data-source="aurion-confirmed-runtime-ui"
      data-density={props.context ?? "exploration"}
      aria-live="polite"
      className="xaurion-game-hud ax-hud absolute inset-0 z-20 pointer-events-none select-none overflow-hidden text-white"
    >
      <div className="ax-tl">
        <HudUnitFrame {...props} />
        <div className="ax-status">
          <HudStatusChips playerState={props.playerState} worldState={props.worldState} pending={props.pending} />
          <HudZoneRow {...props} />
        </div>
        <HudPartyFrames party={props.party} onOpenParty={props.onOpenParty} />
        <HudMetricsChip combat={props.combat} open={metricsOpen} onToggle={() => setMetricsOpen((value) => !value)} />
      </div>

      <div className="ax-tr">
        <div className="ax-cluster">
          <HudNav {...props} menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} closeThen={closeThen} />
          <div className="ax-minimap">{props.miniMap}</div>
        </div>
        <div className="ax-tracker-slot">
          <HudObjectiveTracker
            objectives={props.objectives}
            effects={effects}
            ledger={ledger}
            worldState={props.worldState}
            worldStateLabel={props.worldStateLabel}
            onOpenQuests={props.onOpenQuests}
            onOpenInvestigations={props.onOpenInvestigations}
          />
        </div>
      </div>

      <div className="ax-bl">
        <HudSystemRail onOpenChat={props.onOpenChat} onOpenControls={props.onOpenControls} onOpenParty={props.onOpenParty} />
        <div className="ax-move">{props.movementControl}</div>
      </div>

      <div className="ax-br">
        <HudCombatCluster {...props} />
      </div>

      {menuOpen && <HudDeck {...props} closeThen={closeThen} onClose={() => setMenuOpen(false)} />}
      {metricsOpen && <HudMetricsPanel combat={props.combat} onClose={() => setMetricsOpen(false)} />}
      {props.feedback && (
        <p className="ax-feedback" role="status">
          {props.feedback}
        </p>
      )}
    </div>
  );
}
