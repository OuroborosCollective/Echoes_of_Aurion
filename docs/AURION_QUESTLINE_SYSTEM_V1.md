# Aurion Questline-System v1

## Kanonische Grundidee

Die Handlung folgt nicht einer zufälligen Textgenerierung, sondern einem **versionierten Zustandsgraphen**. Jede Quest ist ein authored Datensatz mit stabilem Schlüssel, Fraktion, Region, Questtyp, Voraussetzungen, Entscheidungsschlüsseln und einer objektiven Beschreibung je Spielansatz. Der Server löst aus bestätigten Spielerentscheidungen, Fraktionsbindung, Abschlussledger und `resolutionIndex` das nächste gültige Readmodel auf.

> **Deterministische Leitregel:** Die Entscheidung des Spielers bestimmt den Pfad; die Laufzeit erzeugt nicht den Kanon. Ein Sprachmodell darf später alternative Formulierungen vorschlagen, aber niemals Questbedeutung, Belohnung, Fraktionswechsel oder Weltzustand festlegen.

## Die fünf Fraktionen

| Fraktion | Rolle | Leitkonflikt | Warfront-Boss |
| --- | --- | --- | --- |
| **Sunward Concord** | Schutz, Bau, Versorgung und offene Tore | Sicherheit darf nicht zur Ausgrenzung werden. | Wallheart Colossus |
| **Ironwardens** | Frontschutz, Disziplin und militärische Verantwortung | Stärke soll Zivilräume schützen, nicht Ruhm vermehren. | Bannerbreaker |
| **Veiled Covenant** | Aufklärung, Infiltration und kontrollierte Wahrheit | Geheimhaltung soll Leben retten, nicht Menschen verbrennen. | Mother of Masks |
| **Wayfarer Compact** | Erkundung, Wegrechte und Verbindung der Regionen | Wege gehören allen, aber jede Route kann zur Falle werden. | Stormwalker |
| **Free Haven** | Neutraler Schutz, Handel, Vermittlung und Versorgung | Neutralität muss handlungsfähig bleiben, ohne selbst ein Banner zu werden. | The Oathless |

Der Spieler kann im Freihafen beginnen, Nebenaufgaben für mehrere Lager erledigen und später einen Treueschwur ablegen. Nach dem Schwur werden die fraktionsgebundenen Haupt- und Nebenquestlinien freigeschaltet. Ein Wechsel der Treue ist kein stilles UI-Feld, sondern ein eigener serverautorisierter Storyentscheid mit Voraussetzungen und Receipt.

## Pfadlogik

Die fünf Ansätze sind **Handeln, Crafting, Kämpfen, Spionage und Abenteuer/Erkundung**. Für jede Quest existiert eine authored objektive Variante je Ansatz. Der bevorzugte Pfad ergibt sich aus dem stabil sortierten `approachScores`-Vektor; bei Gleichstand gilt die feste Reihenfolge `trade → craft → combat → espionage → exploration`. Die Auswahl ist damit reproduzierbar und bleibt trotzdem vom Spieler steuerbar.

| Ansatz | Typische Handlung am Tor | Typische Konsequenz |
| --- | --- | --- |
| Handeln | Material, Heilung, Arbeitskräfte und Wegrechte organisieren | Versorgung, Bündnisse und zivile Zugänge werden stabiler. |
| Crafting | Torbogen, Strebe, Brücke, Zisterne oder Signalgerät bauen | Schutz, Infrastruktur und Reparaturpfade werden verfügbar. |
| Kämpfen | Baustelle, Evakuierung oder Front halten | Bedrohung sinkt, aber Verletzungs- und Ressourcenfolgen bleiben sichtbar. |
| Spionage | Befehle, Signale, Riegel und Nachschub manipulieren | Der Gegner verliert Koordination; die Methode kann Vertrauen kosten. |
| Erkundung | Tunnel, Pässe, Sichtlinien und Rückzugswege entdecken | Neue Gebiete und sichere Alternativrouten werden eröffnet. |

## Haupt- und Nebenqueststruktur

Jede Fraktion erhält eine Einstiegs- oder Oath-Quest, eine Hauptquest, mindestens eine Nebenquest und eine eigene Warfront-Quest. Die Nebenquests sind keine austauschbaren Füllaufgaben: Sie verändern die Art, wie die Hauptquest erlebt wird. Wer bei der Concord die Nebenquest **Namen im Mörtel** löst, bringt an das Tor die Bürger zurück, die geschützt werden sollen. Wer bei den Ironwardens **Die Klinge, die nicht bricht** abschließt, erhält eine Schutzstrebe und kann die Front mit weniger Kollateralschaden halten.

Die vier fraktionsspezifischen Hauptgeschichten lauten: **Das Tor, das standhält** für die Concord, **Die Linie im roten Staub** für die Ironwardens, **Hinter dem feindlichen Tor** für den Veiled Covenant und **Jenseits der siebten Markierung** für den Wayfarer Compact. Die neutrale Hauptgeschichte **Der fünfte Weg** verbindet diese Konflikte, solange der Spieler noch keinen endgültigen Schwur geleistet hat.

## Beispielhafte Spielerentscheidungen

Bei der Concord kann derselbe Konflikt als Bau-, Front-, Handels-, Infiltrations- oder Erkundungsauftrag erscheinen. Der Crafter verstärkt den Torbogen, der Kämpfer hält die Baustelle, der Händler organisiert Material und Evakuierung, der Spion öffnet den gegnerischen Versorgungseingang und der Erkunder findet einen alten Fluchttunnel. Diese Varianten ändern nicht rückwirkend die Weltregeln, sondern schreiben deterministisch unterschiedliche Receipts und Folgeziele in das Questledger.

Beim Veiled Covenant erreicht ein Spion das innere Tor und ersetzt den Angriffsbefehl durch eine Evakuierung. Ein Crafter baut dafür eine lautlose Hebevorrichtung; ein Händler kauft den Quartiermeister nicht mit beliebigem Gold, sondern mit einem überprüfbaren Ausweg; ein Kämpfer sichert den Rückzug. Alle Wege führen zur gleichen Wahrheit, aber die Fraktion erinnert sich an die gewählte Methode.

## Warfront-Konvergenz

Nach dem Abschluss der fraktionsgebundenen Hauptquest öffnet sich die gemeinsame **Warfront**. Alle fünf Fraktionen treffen auf demselben Schlachtfeld ein, jedoch mit eigenem Boss, eigener Frontrolle und eigenen aus den Receipts abgeleiteten Verstärkungen. Die fünf Bosse sind keine zufälligen Namen, sondern stabile Schlüssel: `boss.wallheart_colossus`, `boss.bannerbreaker`, `boss.mother_of_masks`, `boss.stormwalker` und `boss.the_oathless`.

Die Warfront ist eine Konvergenz, kein globaler Überschreibevorgang. Die Questline darf den Kampf vorschlagen und die sichtbaren Ziele aus dem Readmodel anzeigen; Schaden, Loot, Belohnung, Fraktionsstatus und Weltreaktionen bleiben serverautorisiert. Die neutrale Route schützt den Freihafen und die Zivilräume, ohne den Spieler zu zwingen, den Freihafen als dauerhafte militärische Fraktion zu behandeln.

## Technische Grenzen und Folgearbeit

Die erste Fassung liefert den deterministischen Storygraphen und die reine Auflösung. Für eine vollständige Spielintegration folgen additive geschützte Quest-Intent-Routen, persistierte Questentscheidungen, Fraktionsledger, Gebiets- und Warfront-Readmodels sowie Browser-Readbacks. Keine dieser späteren Schichten darf Questabschluss, Loot oder Kriegsausgang aus Clienttext oder LLM-Antworten ableiten.
