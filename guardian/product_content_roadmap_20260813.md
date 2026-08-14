# Aurion: Produkt- und Content-Roadmap

Diese Roadmap trennt klar zwischen bereits ausgelieferten Kernfunktionen und bewussten Folgeschritten. Sie aktiviert **keine** Zahlung, verändert keine Echtgeldpreise und erzeugt keine weiteren 3D-Assets. Das Ziel ist eine spielerfreundliche Weiterentwicklung, bei der Solo-, Koop- und Community-Spiel gleichwertig bleiben.

## Priorisierung

| Reihenfolge | Erweiterung | Spielerischer Zweck | Abhängigkeiten | Erfolgsmerkmal |
|---:|---|---|---|---|
| 1 | Ember-Taverne | Sozialer Hub für Gesuche, Gruppen, Forumseinstieg und Gerüchte | Community- und Teamfunktionen | Spieler finden Solo-, Team- und Community-Einstiege an einem Ort |
| 2 | Persönliches Refugium | Kleines Housing mit rein kosmetischer Gestaltung | Modularer Siedlungs-/Tavernen-Baukasten | Wohnraum bleibt leichtgewichtig und ohne Marktvorteil |
| 3 | Archivhalle von Nym | Zweite Dungeonwelt mit Rätsel- und Reliktfokus | Asterion-Bodenkit und Structural Kit | Ein neues Wiederverwendungsset trägt eine klar andere Spielschleife |
| 4 | Solarium-Grenzland | Außenweltabschnitt mit Patrouillen und Weltboss-Ereignissen | Organische Randzone und Ereignissystem | Solo und Team erhalten skalierbare Zielketten |
| 5 | Expeditionen | Wiederholbare, kurze Instanzläufe mit wechselnden Modifikatoren | Belastbare Fortschritts- und Belohnungsdaten | Abwechslungsreiche 15- bis 25-Minuten-Sitzungen |
| 6 | Gilden-Observatorium | Langfristige soziale Ziele, nicht kampfstärkende Projekte | Reife Team- und Moderationslogik | Gemeinsame Ziele ohne Gruppenzwang |

## Ember-Taverne

Die Taverne ist kein zweites Forum, sondern ein räumlicher Community-Einstieg. Ein Spieler kann dort eine Partneranfrage, eine offene Gruppe, kommende Events und die jüngsten Admin-Ankündigungen sehen. Für Solospieler bleibt der unmittelbare Expeditionsstart sichtbar; eine soziale Oberfläche darf niemals das Spielen ohne andere Menschen oder ohne LLM erschweren.

Die erste Taverne nutzt später nur den Siedlungs- und Set-Dressing-Baukasten aus der Umgebungsroadmap. Dadurch entstehen keine neuen Einzelmodelle für jede Sitzbank, Flasche oder Lampe: Eine Grundfassade, ein Tresen, eine Bank, zwei Wandmodule und vier kleine Requisiten reichen für einen glaubwürdigen, wiederverwendbaren Hub.

## Persönliches Refugium und Housing

Housing beginnt klein: ein einzelner Raum, drei freischaltbare Oberflächenthemen und begrenzte, rasterbasierte Stellplätze. Möbel und Dekoration sind kosmetisch oder erzählerisch; sie erhöhen weder Kampfkraft noch Auktionshausvorteile. Die serverseitige Speicherung benötigt vor einer Umsetzung ein klares Platzierungsmodell, eine Objektquote pro Raum und eine Moderationsstrategie für öffentliche Besuche.

| Stufe | Inhalt | Serverseitige Grenze |
|---|---|---|
| Refugium 1 | Raumhülle, Lichtfarbe, drei Stellplätze | maximal 12 Dekorationen |
| Refugium 2 | Wand- und Bodenvariante, Vitrine | maximal 24 Dekorationen |
| Refugium 3 | kleiner Besuchsmodus und Erinnerungswand | maximal 36 Dekorationen |

## Neue Welten und Spielmodi

Die nächsten Welten unterscheiden sich über Zieltypen statt über immer größere Geometrie. Die Archivhalle fokussiert auf Schalterfolgen, Sichtlinien und Reliktsuche. Das Solarium-Grenzland fokussiert auf Patrouillen, Gebietssicherung und zeitlich begrenzte Ereignisse. Expeditionen kombinieren kleine Räume, ein Ziel und einen wählbaren Modifikator wie verringerte Sicht, verstärkte Gegner oder zusätzliche Reliktbeute.

| Modus | Solo | Team ohne LLM | Typische Dauer | Wiederverwendete Systeme |
|---|---|---|---:|---|
| Reliktlauf | Voll unterstützt | Rollen können Ziele teilen | 12–18 Minuten | Inventar, Charakterwahl, Zieltracker |
| Resonanzjagd | Voll unterstützt | Gemeinsame Markierungen | 15–22 Minuten | Partnerteam, Steuerimpulse |
| Archivrätsel | Voll unterstützt | Zwei simultane Interaktionen | 10–16 Minuten | Teamstatus, Chat, Forumhilfe |
| Weltboss-Ereignis | Begrenzte Solo-Variante | Skalierte Zweiergruppe | 20–25 Minuten | Auktionshaus, Belohnungsbelege, Community |

## Spätere Einmal-Premiumoption

Als spätere, freiwillige Option ist ein **einmaliger Premium-Zugang zu 5 €** vorgesehen. Der Zugang soll kosmetische und komfortorientierte Inhalte bieten, etwa ein alternatives Refugiumsthema, eine Archivchronik und zusätzliche Profilrahmen. Er darf weder Kampfkraft, Handelspreise, Drop-Raten noch Gruppenpriorität verändern. Der Kern des Spiels bleibt ohne Kauf vollständig spielbar.

Die Umsetzung ist bewusst noch nicht aktiv. Vor einer Integration müssen Zahlungsanbieter, Steuer-/Umsatzsteuerbehandlung, Widerrufs- und Erstattungsprozess, Datenschutzhinweise, Preiswährung sowie die genaue Berechtigungsdefinition festgelegt werden. Erst nach einer separaten Freigabe kann eine Bezahl-Integration eingerichtet und serverseitig mit einem überprüfbaren Kaufbeleg verbunden werden.

> Produktregel: Premium ist optional, einmalig, nicht übertragbar und frei von spielerischen Vorteilen.

## Entscheidungsreihenfolge

Zuerst werden Taverne und das kleinste Refugium als Oberflächen- und Datenmodellkonzept ausformuliert. Danach folgt die Archivhalle mit dem bereits spezifizierten Asterion-Bodenkit als visueller Basis. Erst wenn diese Schleifen getestet sind, wird eine neue Außenwelt oder eine Zahlungsintegration erwogen.
