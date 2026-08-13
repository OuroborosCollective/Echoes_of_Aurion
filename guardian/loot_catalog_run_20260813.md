# Produktiver Lootkatalog — Nachweis

**Zeitpunkt:** 13. August 2026  
**Umfang:** Aktivierung des ersten serverseitigen Aurion-Katalogs für Treasure Classes, Affixe und Setdefinitionen.

## Katalogbestand

| Bereich | Konfiguration |
| --- | --- |
| Treasure Classes | `asterion_t2_weapons` für Stufen 1–20 mit vier Grundtypen; `archive_t3_weapons` für 21–36 mit drei Grundtypen; `solarium_t4_weapons` für 37–50 mit drei Grundtypen |
| Affixe | Je drei aktive Präfixe und Suffixe über die zulässigen Gegenstandsstufen hinweg |
| Sets | `asterion_regalia` und `archive_vigil`, jeweils drei Teile und zwei serverseitig gespeicherte Bonusschwellen |

## Readback und Tests

Der Datenbank-Readback bestätigte alle drei aktiven Treasure Classes mit durchgehenden Levelbändern 1–50, drei Präfix- und drei Suffixeinträgen sowie zwei aktive Sets mit je drei Teilen und zwei Bonusschwellen. TypeScript, Whitespace-Gate und die Testsuite sind grün; der deterministische Endgame-Test prüft zusätzlich die Archive-/Solarium-Pools und beide Setauswertungen (**23 Tests** insgesamt).

## Abgrenzung

Der Katalog aktiviert keine browserseitige Lootvergabe. Eine Instanz kann weiter ausschließlich durch eine serverbestätigte Expedition und den idempotenten Drop-Receipt entstehen. Dieser Ereignisweg und der Waffen-XP-Readback bleiben gesonderte Aufgaben.
