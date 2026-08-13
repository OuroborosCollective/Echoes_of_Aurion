# Echoes of Aurion — Design Exploration

## Drei Richtungen

### 1. Ruinenlicht-Expedition

**Theme Name:** Ruinenlicht-Expedition  
**Very Brief Intro:** Ein isometrisches Action-Abenteuer in einer versunkenen Himmelsstadt aus warmem Stein, türkisfarbenen Energieströmen und schwebenden Trümmern. Die Stimmung ist heroisch, klar lesbar und konzentriert sich auf die sichtbare Bindung von Mensch und KI-Begleiter.  
**Probability:** 0.037

### 2. Laternen im Nebelwald

**Theme Name:** Laternen im Nebelwald  
**Very Brief Intro:** Ein poetisches, aquarellartiges Erkundungsspiel zwischen uralten Bäumen und biolumineszierenden Geistern. Der LLM-Partner wirkt als vorsichtiger Pfadfinder, während der Mensch mit Intuition und Timing führt.  
**Probability:** 0.062

### 3. Solaris-Drift

**Theme Name:** Solaris-Drift  
**Very Brief Intro:** Ein dramatischer Weltraum-Bergungsraid in einem ringförmigen Sonnensegel-Friedhof. Der Stil setzt auf harte Silhouetten, Solarstaub und präzise Bewegungen statt auf typisches Neon-Cyberpunk.  
**Probability:** 0.081

---

## Gewählte Richtung: Ruinenlicht-Expedition

### Design Movement

**Cinematic Stylized Action Adventure** mit Anleihen aus hochwertiger mobiler Unreal-Ästhetik, dioramatischer Isometrie und der Materialpoesie antiker Sternenwarte. Die Welt ist kein dunkler Neonraum: Sie lebt von honigfarbenem Gestein, tiefem Petrol und einem einzigen elektrischen Aurion-Türkis.

### Core Principles

1. **Zwei Akteure, ein Bild:** Mensch und LLM-Begleiter stehen stets sichtbar als gleichwertiges Duo in der Szene.
2. **Lesbare filmische Tiefe:** Gestaffelte Ruinen, VFX-Energie und lange Blickachsen liefern Premium-Atmosphäre bei mobiler Lesbarkeit.
3. **Taktische Ruhe vor Aktion:** Interfaces wirken wie ein Expeditionsgerät; Entscheidungen sind klar, klein und unmittelbar.
4. **Materielle Glaubwürdigkeit:** Stein, Messing, Stoff, Energie und Vegetation haben eigene Formen und Oberflächen statt austauschbarer Boxen.

### Color Philosophy

Der Hintergrund ist ein gedämpftes **Mitternachts-Petrol**, damit das warme Ruinengestein wie ein sicherer Zufluchtsort wirkt. **Aurion-Türkis** markiert alles, was der Partnerschaft und den steuerbaren KI-Aktionen gehört: es ist präzise, selten und funktional, nie bloß dekorativ. Signal-Orange erscheint nur bei Gefahr und gegnerischer Präsenz.

### Layout Paradigm

Die App arbeitet wie ein **vertikales Feldgerät**: Am unteren Rand liegt eine haptische Steuerbrücke, die linke Seite trägt den menschlichen Status, die rechte Seite den sichtbaren LLM-Link. Menüs fahren nicht als gleichförmige Kartenwand auf, sondern als geschichtete Bronzeplatten aus den Bildschirmkanten in den Blickraum. Das eigentliche Spiel belegt konsequent die gesamte verfügbare Fläche.

### Signature Elements

1. Ein geteiltes **Aurion-Siegel** als leuchtende Schleife zwischen Spieler und Begleiter.
2. Schmale, kartografische **Koordinatenlinien** und Messmarken in Interfaces und Welt.
3. Durchscheinende **Bronze-Glas-Platten** mit feinem Korn und unregelmäßigen, leicht abgeschrägten Kanten.

### Interaction Philosophy

Die Verbindung des LLM-Partners ist transparent und zustimmungsbasiert. Jede eingehende Aktion wird als knapper, sichtbarer Steuerimpuls protokolliert, und der Spieler kann sie pausieren, prüfen oder mit dem Teamplan abgleichen. Auf Mobilgeräten fungieren große Touch-Controls als Entsprechung zu WASD und den Slots 1–9; auf Desktop bleiben die Tasten sichtbar.

### Animation

Die Szene erhält eine sehr langsame Kameraparallaxe, schwebende Staubpartikel und pulsierende Aurion-Ströme. UI-Platten fahren innerhalb von 220–320 ms mit einem markanten, physisch anmutenden Ease-out ein. Kampfimpulse sind kurz, hell und gerichtet; der Begleiter hinterlässt beim Ausführen einer Aktion eine türkisfarbene Fadenspur. Alle nicht essenziellen Bewegungen beachten `prefers-reduced-motion`.

### Typography System

**Cinzel** liefert die mythologische, gemeißelte Display-Stimme für Ortsnamen und Kapitel, **Manrope** schafft moderne mobile Lesbarkeit für Status, Optionen und Dialog. Überschriften sind in Versalien mit erhöhtem Letterspacing gehalten; technische Daten sind kompakt und tabellarisch.

### Brand Essence

**Echoes of Aurion ist ein mobiles Action-Abenteuer für Menschen, die mit ihrem selbst gewählten LLM-Partner sichtbar, taktisch und erinnerungsfähig durch eine verlorene Himmelsstadt reisen wollen.**  
**Persönlichkeit:** filmisch, kooperativ, präzise.

### Brand Voice

Headlines sprechen wie ein klarer Expeditionsauftrag; CTAs wie verantwortliche Teamentscheidungen. Die Mikrocopy benennt nachvollziehbar, was verbunden, gespeichert und ausgelöst wird.

> „Ein Signal. Zwei Willen. Eine letzte Sternwarte.“

> „Partner koppeln — erst dann öffnet sich Aurion.“

### Wordmark & Logo

Die Marke nutzt ein **gespaltenes Aurion-Siegel**: zwei unvollständige, asymmetrische Messingbögen, die durch einen schwebenden türkisfarbenen Energiekern verbunden werden. Der Wordmark ist individuell gesperrt und trägt eine leichte, steingemeißelte Bruchkante; das Zeichen funktioniert allein als App-Icon.

### Signature Brand Color

**Aurion-Türkis — #2DE2CF.**

### Produkt- und Integrationsgrenzen

Die erste Veröffentlichung ist ein **Singleplayer-Browser-Spiel für itch.io** mit lokaler Speicherung im Browser. Die Spieloberfläche darf weder auf die private Chat-App eines Nutzers zugreifen noch Aktionen „blind“ oder unsichtbar an externe Dienste senden. Der Prototyp implementiert deshalb einen transparenten, simulatorfähigen Befehlsadapter: Er akzeptiert die erlaubten Kürzel `W`, `A`, `S`, `D`, `1`–`9`, protokolliert sie lokal im JSON-Ledger und lässt eine spätere, vom Nutzer autorisierte MCP-/API-Anbindung über eine sichere Server-Komponente zu. Eine echte Echtzeit-MCP-Anbindung und Werbenetzwerk-Integration erfordern vor Release eine Backend-Erweiterung, Datenschutzinformationen, Einwilligungsfluss sowie dienstspezifische Schlüssel.

## Style Decisions

- Jede Einstiegsansicht zeigt das menschliche Teammitglied und den Echo Scout – oder ihre sichtbar verbundene Aurion-Schleife – als erste visuelle Aussage, nicht bloß als Formulartext.
- Das Interface bleibt ein physisches Feldgerät: Mitternachts-Petrol liegt hinter geschichteten Bronze-Glas-Platten; unregelmäßige Abschrägungen, Messmarken, Steinkanten und feines Korn ersetzen neutrale rechteckige Karten.
- **Aurion-Türkis #2DE2CF** bleibt funktional und selten: Es erscheint am Bindungsfaden, im Siegelkern, bei der aktiven Kopplung und auf sichtbaren Befehlsimpulsen. Stein und Messing tragen die Atmosphäre.
- Die rechte Bildhälfte des Einstiegs zeigt immer eine lesbare Sternwarten-Diorama-Silhouette mit warmem Ruinenstein, Messingringen und fernem Schutt. Die heroische Teambeziehung ist im Feldgerät und zugleich als Weltmotiv sichtbar.
