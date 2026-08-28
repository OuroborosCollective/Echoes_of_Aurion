# WASD → Aurion: Audit zu Loot, Meisterschaft und Gesellschaftsprogression

**Aurion-Kandidatenrevision:** `2ff19a2518583d0bfa1139d631c686785ce00ecf`
**WASD-Quellrevision:** `a4d99432e47b82ce98105eadb30360cd8040ad13`
**Status:** Audit abgeschlossen; die Erweiterung ist als additive Folgearbeit vorgesehen. Dieses Dokument ist kein Produktions- oder Freigabenachweis.

## Ergebnis in Kurzform

Der Kandidat besitzt bereits einen **serverseitigen, deterministischen und receiptgebundenen Lootpfad** für Quest- und Dungeonabschlüsse. Schatzklasse, Qualitätsband, Basistyp, Affixe, optionale Setzuordnung, Iteminstanz und idempotenter Dropreceipt sind vorhanden. Die tatsächliche aktuelle Contentbreite ist jedoch klein und endlich: drei waffenorientierte Schatzklassen, sechs Affixe und zwei Sets. Sie erfüllt deshalb **noch nicht** die gewünschte Diablo-ähnliche Variantenvielfalt über Waffen, Rüstung und Zubehör.

Die exakte Skillprogression arbeitet mit `BigInt` und einer nicht gedeckelten Kurve. Sie ist für die heutigen fünf Skillarten technisch cap-frei. Zugleich enthält der tatsächlich integrierte Charakter- und Waffenpfad weiterhin eine harte Levelobergrenze von 50 und nur vier Waffenfamilien. Rüstung, Zauberschulen, Formung sowie politische oder diplomatische Spielermeisterschaft und moralische Aura sind aktuell nicht als persistierte, serverautoritative Progressionsdomänen implementiert.

| Domäne | Istzustand im Kandidaten | Belegter Status | Zielabweichung |
| --- | --- | --- | --- |
| Deterministischer Drop | Quest/Dungeon leiten serverseitige Seed- und Rollwerte ab; Ergebnis benötigt einen akzeptierten Expeditionsreceipt und einen Idempotency-Key. | Vorhanden und integriert. | Eingaben enthalten derzeit keine explizite Zone, Monsterarchetyp, Aurion-Auflösungsindex oder bestätigtes Glücks-/Findestat-Readmodell. |
| Treasure Classes | Drei levelgebundene, waffenorientierte Klassen. | Vorhanden und begrenzt. | Keine datengesteuerten Klassen für Rüstung, Zubehör, Zauberfoki oder Formungskomponenten. |
| Affixe und Werte | Ein Prefix; bei Rare/Set/Unique zusätzlich ein Suffix. Die Affixe liegen als geprüfte Katalogdaten vor. | Vorhanden und begrenzt. | Keine skalierbaren Affixgruppen, Tiers, Ausschlüsse, Gewichtungen, Rollspannen oder mehrteiligen Suffix-/Prefix-Slots. |
| Sets und Boni | Zwei aktive Sets; Boni werden aus besessenen Instanzen abgeleitet. | Vorhanden und begrenzt. | Setbesitz wird nicht von ausgerüsteten Teilen getrennt; keine breiten Setfamilien und keine Slotvielfalt. |
| Kombinationstiefe | Die aktuelle Saatmenge erzeugt rechnerisch maximal 124, 93 bzw. 75 Resultattypen je Itemlevel in T2, T3 bzw. T4. Über die derzeitigen Levelbänder sind dies höchstens 5.018 Katalogvarianten. | Wolfram-geprüft. | Weit entfernt von einer absichtlich sehr großen, datengesteuert erweiterbaren Variantenfamilie. |
| Waffenmeisterschaft | Vier Tracks: Klinge, Stab, Speer, Fokus. | Vorhanden; persistiert. | Der integrierte Pfad leitet Ränge noch aus der gedeckelten Charakterkurve ab. |
| Exakte Skills | Holzfällen, Bergbau, Fischfang, Kampf und Crafting nutzen BigInt-XP, stable sort und Receiptbindung. | Vorhanden; technisch cap-frei. | Keine getrennten Tracks für Waffenfamilien, Rüstungsarten, Zauber, Formung, Regierung oder Diplomatie. |
| Crafting | Ein receiptgebundener Temperingpfad für einen Speer. | Vorhanden und E2E-gesichert. | Keine breite Rezept-, Berufs- oder Formungsmeisterschaft. |
| Zivilisation/Politik | Reine, deterministische Helfer für Siedlung, Märkte, Knappheit, Karawanen, Gilden und Weltreaktionen. | Vorhanden als begrenzte Weltsemantik. | Keine persistierte Rats-, Verwaltungs-, Herrschafts-, Diplomatie- oder Alignmentprogression. |
| Moral/Aura | Beziehungen und Aggressionsgefahr sind vorhanden. | Teilweise vorhanden. | Keine moralische Achse gut/neutral/böse, keine receiptgebundene Auraableitung und keine regelgebundene Erkennung extremer Verschiebungen. |

## Revisionsgebundene Befunde

Die konkrete Aurion-Implementierung erzeugt Loot in `server/db.ts` aus aktiven Schatzklassen, serverseitig validierten Expeditionsresultaten, einer regelgebundenen Qualität und geprüften Affixdaten. Ein Client kann weder den finalen Gegenstand noch die Affixliste oder den Receipt bestimmen. Quest- und Dungeonpfade binden die Drops an serverseitige Ergebnisreceipts. Das erfüllt die zentrale Autoritätsgrenze, ist aber nicht gleichbedeutend mit einer hohen Content- oder Variationsbreite.

Die Seeddatei `drizzle/0017_wasd_aurion_content_seed.sql` enthält drei Schatzklassen, insgesamt zehn waffenartige Basiseinträge über drei Levelbänder, drei Prefixe, drei Suffixe und zwei Sets. Der Resolver kombiniert höchstens einen Prefix und ein Suffix. Die oben genannte Obergrenze berücksichtigt die jeweiligen Levelbänder und Setzuordnungen. Wolfram bestätigte die Berechnung mit `124`, `93`, `75` und insgesamt `5.018` Varianten.

Die reine WASD-Referenz `server/src/core/ouroboros/OuroborosLootGenerator.ts` zeigt die gewünschte Richtung mit Basisfamilien für Waffen, Rüstung, Gürtel, Ringe und Amulette sowie mit Präfix-/Suffixachsen. Ihre tickgebundene Eingabe und ihre konkrete Runtime werden nicht übernommen. Aurion verwendet stattdessen serverbestätigte Encounter- und Auflösungsreceipts.

Die Aurion-Skillkurve für die bestehenden fünf Skills ist exakt und nicht begrenzt. Sie berechnet die abgerundete fünfte Wurzel `floor((50^5 × level^7)^(1/5))`; Wolfram bestätigt für Rang 1.000.000 den Wert `12.559.432.157` XP. Der separate alte Endgame-Charakterpfad besitzt dagegen `MAX_PLAYER_LEVEL = 50` und darf nicht als cap-freie Zielprogression ausgegeben werden.

## Additive Zielarchitektur

Die Erweiterung erfolgt ausschließlich Aurion-nativ und in einer Reihenfolge, die Clientautorität, ungebundene Zufallswerte und Tickabhängigkeit ausschließt.

| Baustein | Additiver Zielvertrag | Harte Grenze |
| --- | --- | --- |
| Lootkontext | `worldId`, Regel- und Contentversion, bestätigter Encounter-/Monsterreceipt, Zonenband, Spieler-/Itemlevel, Auflösungsindex und bestätigte Glücks-/Findestats. | Kein Clientseed, keine Clientzeit, kein `Math.random()`. |
| Katalog | Datengetriebene Basistypen mit Kategorien für Waffen, Rüstung, Zubehör, Foki, Rezept- und Formungskomponenten. | Jede Definition besitzt stabile ID, Slot, Levelband, zulässige Affixgruppen und Contentversion. |
| Affixgraph | Sortierte Pools, Ausschlüsse, Gewichtungen, Leveltiers und deterministische Rollspannen. | Slots, Tiers, Werte und Hash werden vollständig im immutable Dropresultat festgehalten. |
| Sets | Versionierte Teil- und Bonusstufen, die aus **ausgerüsteten** bestätigten Iteminstanzen abgeleitet werden. | Ein Bonus erzeugt keine neue Iteminstanz und entscheidet keine Belohnung. |
| Meisterschaft | BigInt-Ledger für Waffenfamilien, Rüstung, Zauberschulen, Crafting, Formung, Verwaltung und Diplomatie. | Jede Progression nennt Quelle, Receipt, Regel-/Contentversion und Auflösungsindex; keine UI-/Animations-XP. |
| Politik | Versionierte Amts- und Kompetenzmodelle für Rat, Verwaltung, Herrschaft und Diplomatie; ausschließlich fiktive, deeskalierende Spielkonflikte. | Keine reale Politikberatung; geschützte Räume und Spielerstrukturen bleiben geschützt. |
| Moral und Aura | Mehrere begrenzte, receiptgebundene Wertachsen ergeben eine abgeleitete Gesinnung und sichtbare Aura bei extremen, geprüften Schwellen. | Keine freie LLM-Deutung; Aura ist Readmodell, kein Client- oder Chat-Entscheid. |

## Abnahmekriterien für die Folgearbeit

Die Erweiterung gilt erst als übernommen, wenn reine Contracts, negative und Replaytests, isolierte Datenbank-E2E, geschützte Befehle, Spieler-Readmodelle und Browsernachweise für jede neue Domäne vorliegen. Insbesondere müssen gleiche Lootkontexte nach Neustart exakt dasselbe Resultat ergeben, veränderte Zone/Monster/Auflösungsindex/Glückswerte nachvollziehbar andere Resultate liefern, manipulierter Clientinput verworfen werden und alle Levelkurven oberhalb von `Number.MAX_SAFE_INTEGER` ihren exakten Stringzustand behalten. Politik-, Diplomatie- und Auraeffekte müssen ausschließlich aus bestätigten, stabil sortierten Receipts entstehen und extremen Wertverschiebungen eindeutig zugeordnet werden können.

Bis dahin ist es korrekt, die aktuelle Implementierung als **deterministischen, begrenzten Loot- und Fortschrittskern** zu bezeichnen, nicht als nahezu unendliches Diablo-/RuneScape-System.

## Kandidatenfortschritt nach dem Audit

Der Kandidat enthält nun als additive Grundlage `server/aurionLootProtocol.ts` und `server/aurionMasteryEthosProtocol.ts`. Der Lootvertrag besitzt serverbestätigte Kontextbindungen für Welt, Zone, Monsterarchetyp, Encounterreceipt, Regel- und Contentversion, Auflösungsindex, exakte Levelwerte und bestätigte Glücksbasis. Wolfram bestätigt: Ein späterer Katalog mit 48 Basistypen, 72 Affixgruppen, fünf Slots, sechs Qualitätsstufen und 200 Levelbändern eröffnet rechnerisch `96.709.552.128.000` Konfigurationspfade. Dies ist eine geprüfte Planungsobergrenze, nicht der aktuelle Contentstand. Er unterstützt datengetriebene Familien für Waffen, Rüstung, Zubehör, Foki, Relikte und Formungskomponenten sowie bis zu fünf getrennte Affixslots mit Gruppen- und Ausschlussregeln. Der Meisterschaftsvertrag ergänzt getrennte, BigInt-basierte Disziplinen für weitere Waffenfamilien, Rüstung, sechs Zauberschulen, Crafting, Formung, Rat, Verwaltung, Herrschaft, Diplomatie und Weltpflege. Ethosereignisse leiten gut/neutral/böse und eine sichtbare Aura bei prüfbarer Extremschwelle ausschließlich aus stabil sortierten Receipts ab.

Die neuen reinen Verträge sind durch fokussierte Typprüfung und zehn Regressionstests gesichert; Serena meldete für den Meisterschafts-/Ethosvertrag keine Befunde. `drizzle/0025_aurion_loot_mastery_ethos.sql` und die entsprechenden Drizzle-Tabellen bereiten die persistente Katalog-, Ausrüstungs-, Mastery- und Ethosschicht additiv vor. **Nicht behauptet:** Die Migration wurde noch nicht gegen die isolierte Testdatenbank ausgeführt, die neuen Datenkataloge sind noch nicht produktiv gesät und die neuen Meisterschafts-/Ethosereignisse sind noch nicht an zusätzliche geschützte Gameplayintents gebunden. Das bleibt vor Merge, Produktion und Linear-Schließung als Abnahmepunkt offen.
