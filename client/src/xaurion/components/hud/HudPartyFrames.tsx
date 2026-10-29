import { useState } from "react";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import { Ax1HpMeter } from "../Ax1HpMeter";
import { isShortLandscape, prefersCompactPanels } from "./hudProjection";
import { useScrollHint } from "./useScrollHint";
import type { Ax1HudPartyMember } from "./hudTypes";

export function HudPartyFrames({ party, onOpenParty }: { party?: readonly Ax1HudPartyMember[]; onOpenParty: () => void }) {
  const [collapsed, setCollapsed] = useState(prefersCompactPanels);
  const { ref: listRef, more } = useScrollHint<HTMLDivElement>([collapsed, party]);
  if (!party || party.length === 0) return null;
  return (
    <section className="ax-party ax-glass" aria-label="Gruppe">
      <button
        type="button"
        onClick={() => (isShortLandscape() ? onOpenParty() : setCollapsed((value) => !value))}
        className="ax-party__head"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Party öffnen" : "Party schließen"}
      >
        <span className="ax-party__title">
          <Users aria-hidden /> Party ({party.length})
        </span>
        {collapsed ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
      </button>
      {!collapsed && (
        <div ref={listRef} className="ax-party__list" data-more={more}>
          {party.map((member) => (
            <button type="button" key={member.id} onClick={onOpenParty} className="ax-party__member">
              <span className="ax-party__row">
                <b className="ax-ellipsis">{member.name}</b>
                <span>
                  {member.role}
                  {member.ready ? " · bereit" : ""}
                </span>
              </span>
              {member.hp !== undefined && member.maxHp !== undefined ? (
                <Ax1HpMeter hp={member.hp} maxHp={member.maxHp} className="ax-hpbar ax-hpbar--slim" />
              ) : (
                <small>{member.weaponTrack ?? "Bestätigte Werte ausstehend"}</small>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
