import { GameHUD as DesktopHUD } from "./LegacyGameHUD";
import { GameHUD as MobileHUD } from "./MobileGameHUD";
import { usePcHud } from "./hud/usePcHud";
import type { GameHUDProps } from "./hud/hudTypes";
export type { Ax1HudCombatLog, Ax1HudObjective, Ax1HudPartyMember, Ax1HudSkill, GameHUDProps, HudContext } from "./hud/hudTypes";

export function GameHUD(props: GameHUDProps) {
  const pc = usePcHud();
  return pc ? <DesktopHUD {...props} /> : <MobileHUD {...props} />;
}
