import type { CSSProperties } from "react";
import { Gamepad2, Hand, MessageSquare, Repeat, ShieldCheck, Sparkles, Swords } from "lucide-react";
import { arcSlots, SKILL_ARC, UTILITY_ANGLES_DEG } from "./hudGeometry";
import type { GameHUDProps } from "./hudTypes";

type ClusterProps = Pick<
  GameHUDProps,
  "hotbar" | "autoLoot" | "autoAttack" | "actionsDisabled" | "controlsDisabled" | "onAttack" | "onCastSkill" | "onInteract" | "onToggleAutoAttack" | "onToggleAutoLoot"
>;

const slotAt = (angleDeg: number) => arcSlots(1, angleDeg, angleDeg)[0]!;
const at = (slot: { x: number; y: number }) => ({ "--x": slot.x, "--y": slot.y }) as CSSProperties;

/**
 * Thumb-zone combat cluster (bottom-right): the big attack button is the anchor, the hotbar
 * fans out on an arc around it and the three situational buttons sit on an inner ring.
 * Every position is a unit vector from hudGeometry multiplied by a CSS ring radius.
 */
export function HudCombatCluster(props: ClusterProps) {
  const skillSlots = arcSlots(props.hotbar.length, SKILL_ARC.fromDeg, SKILL_ARC.toDeg);
  return (
    <div className="ax-combat" data-auto-attack={props.autoAttack} aria-label="Kampfsteuerung" role="group">
      <button
        type="button"
        disabled={props.actionsDisabled}
        onClick={props.onAttack}
        className="ax-orb ax-orb--attack min-h-14 min-w-14"
        title="Angriff [R]"
        aria-label="Angriff [R]"
      >
        <Swords className="ax-orb__icon" aria-hidden />
        <kbd className="ax-kbd">R</kbd>
        <span className="ax-orb__cap">ANGRIFF</span>
      </button>

      {props.hotbar.map((skill, index) => (
        <button
          type="button"
          key={`${skill.command}:${index}`}
          disabled={props.actionsDisabled}
          onClick={() => props.onCastSkill(skill.command)}
          className="ax-orb ax-orb--skill min-h-11 min-w-11"
          style={{ ...at(skillSlots[index]!), "--skill": skill.color } as CSSProperties}
          title={skill.name}
          aria-label={`${skill.name} · Hotbar ${index + 1}`}
        >
          <span className="ax-orb__glyph" style={{ color: skill.color }}>
            {skill.icon}
          </span>
          <kbd className="ax-kbd">{index + 1}</kbd>
          <small className="sr-only">{skill.name}</small>
        </button>
      ))}

      <button
        type="button"
        disabled={props.actionsDisabled}
        onClick={props.onInteract}
        aria-label="Interaktion"
        className="ax-orb ax-orb--util ax-orb--interact min-h-11 min-w-11"
        style={at(slotAt(UTILITY_ANGLES_DEG.interact))}
        title="Interaktion [F]"
      >
        <Hand className="ax-orb__icon" aria-hidden />
        <kbd className="ax-kbd">F</kbd>
        <span className="ax-orb__cap">ACTION</span>
      </button>
      <button
        type="button"
        disabled={props.actionsDisabled}
        onClick={props.onToggleAutoAttack}
        aria-pressed={props.autoAttack}
        aria-label="Auto-Angriff umschalten"
        className="ax-orb ax-orb--util ax-orb--toggle min-h-11 min-w-11"
        data-on={props.autoAttack}
        style={at(slotAt(UTILITY_ANGLES_DEG.autoAttack))}
        title="Auto-Angriff"
      >
        <Repeat className="ax-orb__icon" aria-hidden />
        <span className="ax-orb__cap">{props.autoAttack ? "AUTO AN" : "AUTO"}</span>
      </button>
      <button
        type="button"
        disabled={props.controlsDisabled}
        onClick={props.onToggleAutoLoot}
        aria-pressed={props.autoLoot}
        aria-label="Auto-Loot umschalten"
        className="ax-orb ax-orb--util ax-orb--toggle ax-orb--loot min-h-11 min-w-11"
        data-on={props.autoLoot}
        style={at(slotAt(UTILITY_ANGLES_DEG.autoLoot))}
        title="Auto-Loot"
      >
        <Sparkles className="ax-orb__icon" aria-hidden />
        <span className="ax-orb__cap">A-LOOT</span>
      </button>
    </div>
  );
}

type RailProps = Pick<GameHUDProps, "onOpenChat" | "onOpenControls" | "onOpenParty">;

/** Small system rail above the joystick: chat, controls, group. */
export function HudSystemRail({ onOpenChat, onOpenControls, onOpenParty }: RailProps) {
  return (
    <div className="ax-rail">
      <button type="button" onClick={onOpenChat} className="ax-railbtn ax-railbtn--chat" title="Realm Chat">
        <MessageSquare aria-hidden />
        <span className="ax-railbtn__text">Realm Chat</span>
      </button>
      <button type="button" onClick={onOpenControls} aria-label="Steuerung öffnen" className="ax-railbtn" title="Steuerung">
        <Gamepad2 aria-hidden />
        <span className="sr-only">Steuerung</span>
      </button>
      <button type="button" onClick={onOpenParty} aria-label="Gruppe öffnen" className="ax-railbtn" title="Gruppe">
        <ShieldCheck aria-hidden />
        <span className="sr-only">Gruppe</span>
      </button>
    </div>
  );
}
