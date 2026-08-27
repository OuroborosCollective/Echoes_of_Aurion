type TowerHomePanelProps = {
  playerName: string;
  onPrepare: () => void;
  onEnterExpanse: () => void;
  onSignal: (message: string) => void;
};

const homeActions = [
  { id: "rest", title: "Ruhe finden", detail: "Die Sternenwarte speichert deinen sicheren Ausgangspunkt.", message: "Ruhemodus bestätigt: Dein Hauptquartier bleibt als sicherer Rückkehrpunkt erhalten." },
  { id: "storage", title: "Items lagern", detail: "Dein persönliches Lager ist nur in deiner Instanz verfügbar.", message: "Lager geöffnet: Beute bleibt im serverbestätigten Hausinventar." },
  { id: "decorate", title: "Zimmer einrichten", detail: "Später stellst du Möbel, Trophäen und geprüfte Modelle auf.", message: "Einrichtung vorgemerkt: Dein persönliches Zimmer wartet auf deine Auswahl." },
  { id: "invite", title: "Besuch einladen", detail: "Lade andere User in deine Sternwarte ein, ohne die Weltinstanz zu verlassen.", message: "Besuchskanal bereit: Einladungen werden über die autorisierte Hausinstanz geführt." },
] as const;

export default function TowerHomePanel({ playerName, onPrepare, onEnterExpanse, onSignal }: TowerHomePanelProps) {
  return (
    <section className="tower-home-panel" aria-labelledby="tower-home-title">
      <div className="tower-home-panel__eyebrow">DEIN HAUS // STERNWARTE ASTERION</div>
      <div className="tower-home-panel__heading">
        <div><h2 id="tower-home-title">Willkommen zurück, <em>{playerName || "Explorer"}</em>.</h2><p>Du startest nicht in einer Arena. Dieser Turm ist dein persönliches Hauptquartier: ein ruhiger Blick über Aurion, ein einrichtbares Zimmer und das Tor in die Open World.</p></div>
        <div className="tower-home-panel__sigil" aria-hidden="true">✦</div>
      </div>
      <div className="tower-home-panel__path" aria-label="Geführter Gameplay-Einstieg"><span className="is-active">1 <b>ANWÄRMEN</b><small>Turm verstehen</small></span><i aria-hidden="true" /><span>2 <b>AUSRÜSTEN</b><small>Loadout wählen</small></span><i aria-hidden="true" /><span>3 <b>AUFBRECHEN</b><small>Expanse betreten</small></span></div>
      <div className="tower-home-panel__actions">{homeActions.map(action => <button type="button" key={action.id} onClick={() => onSignal(action.message)}><strong>{action.title}</strong><span>{action.detail}</span><small>ÖFFNEN ·</small></button>)}</div>
      <div className="tower-home-panel__footer"><div><span>INSTANZ</span><b>home:{playerName || "explorer"}</b><small>Ruhebereich · Lager · Besuch · Einrichtung</small></div><div className="tower-home-panel__cta"><button type="button" className="tower-home-panel__secondary" onClick={onPrepare}>LOADOUT VORBEREITEN</button><button type="button" className="tower-home-panel__primary" onClick={onEnterExpanse}>IN DIE OPEN WORLD</button></div></div>
    </section>
  );
}
