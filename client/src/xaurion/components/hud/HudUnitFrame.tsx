import type { CSSProperties } from "react";
import { CheckCircle2, Clock3, Compass, History, Hourglass } from "lucide-react";
import { Ax1HpMeter } from "../Ax1HpMeter";
import { confirmedXpFraction, projectionLabel } from "./hudProjection";
import type { GameHUDProps } from "./hudTypes";

type FrameProps = Pick<
  GameHUDProps,
  | "playerName"
  | "playerIcon"
  | "playerColor"
  | "points"
  | "victories"
  | "progressionCount"
  | "mastery"
  | "playerState"
  | "selfHealth"
  | "lifeStatus"
  | "playerStateLabel"
  | "connected"
  | "remotePlayerCount"
  | "onOpenCharacter"
>;

/** Top-left unit frame: portrait ring, confirmed HP, path stats and a data-driven mastery bar. */
export function HudUnitFrame(props: FrameProps) {
  const xp = confirmedXpFraction(props.mastery?.xpPercent);
  return (
    <section id="player-unit-frame" aria-label="Serverbestätigter Charakter" data-state={props.playerState} className="ax-unit ax-glass">
      <button type="button" onClick={props.onOpenCharacter} aria-label="Charakter öffnen" className="ax-portrait" style={{ "--ax-player": props.playerColor } as CSSProperties}>
        <span className="ax-portrait__icon">{props.playerIcon}</span>
      </button>
      <div className="ax-unit__body">
        <div className="ax-unit__title">
          <b className="ax-unit__name">{props.playerName}</b>
          <strong className="ax-unit__points">◆ {props.points ?? "—"}</strong>
        </div>
        {props.selfHealth && (
          <div data-testid="aurion-self-hp" aria-label={`Lebenspunkte ${props.selfHealth.hp} von ${props.selfHealth.maxHp}`} className="ax-unit__hp">
            <Ax1HpMeter hp={props.selfHealth.hp} maxHp={props.selfHealth.maxHp} className="ax-hpbar" />
            {props.lifeStatus !== "alive" && (
              <span data-testid="aurion-self-life-status" role="status" className="ax-unit__life" data-life={props.lifeStatus}>
                {props.lifeStatus === "dead" ? "Kampfunfähig · Wiederbelebung abwarten" : "Wiederbelebt · Kampfbereit"}
              </span>
            )}
          </div>
        )}
        <div className="ax-unit__paths">
          {props.progressionCount ?? "—"} bestätigte Pfade · {props.victories ?? "—"} Siege
        </div>
        <div className="ax-mastery" data-confirmed={xp !== undefined}>
          <span className="ax-mastery__fill" style={{ width: `${(xp ?? 0) * 100}%` }} />
          <span className="ax-mastery__text">
            <span className="ax-ellipsis">{props.mastery?.name ?? "Waffenpfad ausstehend"}</span>
            <span>{props.mastery ? `Stufe ${props.mastery.level}` : props.playerStateLabel}</span>
          </span>
        </div>
        <span data-testid="confirmed-remote-player-count" className="sr-only">
          {props.connected ? `${props.remotePlayerCount} andere Explorer verbunden` : "Mitspieler werden verbunden"}
        </span>
      </div>
    </section>
  );
}

type StatusProps = Pick<GameHUDProps, "playerState" | "worldState" | "pending">;

/** Explicit player/world projection states: an icon AND a word, never colour alone. */
export function HudStatusChips({ playerState, worldState, pending }: StatusProps) {
  const WorldIcon = worldState === "live" ? CheckCircle2 : worldState === "stale" ? History : Clock3;
  return (
    <div className="ax-chips" aria-label="Projection state">
      <span className="ax-chip" data-tone="ok">
        <CheckCircle2 aria-hidden /> Player · {projectionLabel(playerState)}
      </span>
      <span className="ax-chip" data-tone="signal">
        <WorldIcon aria-hidden /> World · {projectionLabel(worldState)}
      </span>
      {pending && (
        <span data-testid="pending-state-badge" className="ax-chip" data-tone="warn">
          <Hourglass className="ax-spin" aria-hidden /> Mutation · Pending
        </span>
      )}
    </div>
  );
}

type ZoneProps = Pick<GameHUDProps, "zoneName" | "coordinates" | "worldStateLabel" | "connected" | "remotePlayerCount">;

export function HudZoneRow({ zoneName, coordinates, worldStateLabel, connected, remotePlayerCount }: ZoneProps) {
  return (
    <div className="ax-zone">
      <div className="ax-pill ax-pill--zone">
        <Compass aria-hidden />
        <b className="ax-ellipsis">{zoneName}</b>
        <span className="ax-pill__sep">·</span>
        <span className="ax-ellipsis">{coordinates ?? worldStateLabel}</span>
      </div>
      <div className="ax-pill ax-pill--realm" data-connected={connected}>
        <span className="ax-dot" aria-hidden />
        <b>{connected ? "Realm verbunden" : "Verbinde Realm"}</b>
        {connected && <span>👥 {remotePlayerCount + 1}</span>}
      </div>
    </div>
  );
}
