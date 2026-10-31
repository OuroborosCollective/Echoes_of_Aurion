import type { ReactNode } from "react";
import { useScrollHint } from "./useScrollHint";
import {
  Activity,
  Coins,
  Crown,
  Gamepad2,
  Hammer,
  Landmark,
  Languages,
  Map as MapIcon,
  Menu,
  MessageSquare,
  Package,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  UserRound,
  Users,
  Volume2,
  X,
} from "lucide-react";
import type { GameHUDProps } from "./hudTypes";

type NavProps = Pick<GameHUDProps, "party" | "onOpenCharacter" | "onOpenInventory" | "onOpenCrafting" | "onOpenQuests" | "onOpenParty" | "onOpenMap"> &
  Readonly<{
    menuOpen: boolean;
    onToggleMenu: () => void;
    /** Wraps a navigation callback so the deck closes first (same order as before: close, then act). */
    closeThen: (action: () => void) => () => void;
  }>;

/** Quick navigation: six frequent destinations plus the "Weitere Menüs" toggle. */
export function HudNav(props: NavProps) {
  const { closeThen } = props;
  return (
    <nav aria-label="Schnellnavigation" className="ax-nav">
      <NavButton label="Char" shortcut="C" title="Charakter [C]" ariaLabel="Charakter" onClick={closeThen(props.onOpenCharacter)}>
        <UserRound />
      </NavButton>
      <NavButton label="Inventar" shortcut="I" title="Inventar [I/B]" ariaLabel="Inventar" onClick={closeThen(props.onOpenInventory)}>
        <Package />
      </NavButton>
      <NavButton label="Craft" title="Handwerk" ariaLabel="Handwerk" onClick={closeThen(props.onOpenCrafting)}>
        <Hammer />
      </NavButton>
      <NavButton label="Quests" shortcut="J" title="Aufträge [J]" ariaLabel="Aufträge" onClick={closeThen(props.onOpenQuests)}>
        <ScrollText />
      </NavButton>
      <NavButton label="Party" title="Gruppe" ariaLabel="Gruppe" badge={props.party?.length} onClick={closeThen(props.onOpenParty)}>
        <Users />
      </NavButton>
      <NavButton label="Map" shortcut="M" title="Weltatlas [M]" ariaLabel="Weltatlas" onClick={closeThen(props.onOpenMap)}>
        <MapIcon />
      </NavButton>
      <NavButton label={props.menuOpen ? "Schließen" : "Mehr"} shortcut="/" title="Weitere Menüs" ariaLabel="Weitere Menüs" active={props.menuOpen} onClick={props.onToggleMenu}>
        <Menu />
      </NavButton>
    </nav>
  );
}

type DeckProps = Pick<
  GameHUDProps,
  | "onOpenContacts"
  | "onOpenDungeonFinder"
  | "onOpenControls"
  | "onOpenDisciplines"
  | "onOpenCompanion"
  | "onOpenChat"
  | "onOpenGuild"
  | "onOpenEconomy"
  | "onOpenDialogue"
  | "onOpenTerritory"
  | "onOpenHomestead"
  | "onOpenDeterminism"
  | "onOpenResearch"
  | "onOpenQuests"
  | "onOpenInvestigations"
> &
  Readonly<{
    closeThen: (action: () => void) => () => void;
    onClose: () => void;
  }>;

type DeckItem = Readonly<{ title: string; icon: ReactNode; run: () => void }>;

/** Lower-frequency systems, grouped. Rendered at HUD root level so it always stacks above the world UI. */
export function HudDeck(props: DeckProps) {
  const { closeThen } = props;
  const { ref: scrollRef, more } = useScrollHint<HTMLDivElement>([]);
  const sections: ReadonlyArray<Readonly<{ title: string; items: readonly DeckItem[] }>> = [
    {
      title: "Character & Progression",
      items: [
        { title: "Steuerung", icon: <Gamepad2 />, run: props.onOpenControls },
        { title: "Disziplinen", icon: <Swords />, run: props.onOpenDisciplines },
        { title: "Companion", icon: <Sparkles />, run: props.onOpenCompanion },
      ],
    },
    {
      title: "World & Adventure",
      items: [
        { title: "Dungeons", icon: <ShieldCheck />, run: props.onOpenDungeonFinder },
        { title: "NPC", icon: <Languages />, run: props.onOpenDialogue },
        { title: "Territorium", icon: <Landmark />, run: props.onOpenTerritory },
        { title: "Homestead", icon: <Hammer />, run: props.onOpenHomestead },
        { title: "Research", icon: <Sparkles />, run: props.onOpenResearch },
        { title: "Ermittlungen", icon: <ScrollText />, run: props.onOpenInvestigations ?? props.onOpenQuests },
      ],
    },
    {
      title: "Social & Holdings",
      items: [
        { title: "Chat", icon: <MessageSquare />, run: props.onOpenChat },
        { title: "Ton umschalten", icon: <Volume2 />, run: () => window.dispatchEvent(new Event("aurion:audio-toggle")) },
        { title: "Kontakte", icon: <Users />, run: props.onOpenContacts },
        { title: "Gilde", icon: <Crown />, run: props.onOpenGuild },
        { title: "Ökonomie", icon: <Coins />, run: props.onOpenEconomy },
      ],
    },
    { title: "Evidence", items: [{ title: "Evidence", icon: <Activity />, run: props.onOpenDeterminism }] },
  ];

  return (
    <>
      <div className="ax-scrim" aria-hidden="true" onClick={props.onClose} />
      <section role="dialog" aria-label="Weitere Menüs" className="ax-deck ax-glass">
        <header className="ax-deck__head">
          <div>
            <p className="ax-deck__title">Aurion Command Deck</p>
            <p className="ax-deck__sub">UI focus · World input held</p>
          </div>
          <span className="ax-deck__badge">Expanded</span>
          <button type="button" className="ax-deck__close" aria-label="Menü schließen" onClick={props.onClose}>
            <X aria-hidden />
          </button>
        </header>
        <div ref={scrollRef} className="ax-deck__scroll" data-more={more}>
          {sections.map((section) => (
            <section key={section.title} aria-label={section.title} className="ax-deck__section">
              <h3>{section.title}</h3>
              <div className="ax-deck__grid">
                {section.items.map((item) => (
                  <button type="button" key={`${section.title}:${item.title}`} title={item.title} aria-label={item.title} className="ax-tile" onClick={closeThen(item.run)}>
                    {item.icon}
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <p className="ax-deck__foot">Menü geöffnet · World-Actions gesperrt · Mutationen bleiben bis zum bestätigten Readback Pending.</p>
      </section>
    </>
  );
}

function NavButton({
  label,
  shortcut,
  title,
  ariaLabel,
  onClick,
  children,
  active = false,
  badge,
}: {
  label: string;
  shortcut?: string;
  title: string;
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  badge?: number;
}) {
  return (
    <button type="button" onClick={onClick} title={title} aria-label={ariaLabel} aria-current={active ? "page" : undefined} className="ax-navbtn" data-active={active}>
      <span className="ax-navbtn__icon">{children}</span>
      {typeof badge === "number" && badge > 0 ? <span className="ax-badge">{badge}</span> : null}
      <span className="ax-navbtn__label">{label}</span>
      {shortcut ? <kbd className="ax-kbd">{shortcut}</kbd> : null}
    </button>
  );
}
