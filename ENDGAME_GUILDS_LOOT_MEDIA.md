# Echoes of Aurion — Gilden, Endgame, Loot und Medien

## Langfristige Spielschleife

Die langfristige Motivation soll nicht allein aus höheren Schadenswerten bestehen. Sie verbindet vier gleichwertige Pfade: **Meisterschaft** über genutzte Waffen, **Sammlung** über Sets und Relikte, **Kooperation** über Gildenaufgaben sowie **Entdeckung** über wöchentliche Aurion-Expeditionen. Jede Schleife speist sich aus serverseitig bestätigten Events und kann deshalb weder durch den Browser noch durch einen LLM-Partner direkt manipuliert werden.

| Pfad | Kurzfristiges Ziel | Langfristiges Ziel | Serverseitiger Nachweis |
| --- | --- | --- | --- |
| Waffenmeisterschaft | Eine Waffe im Kampf gezielt einsetzen. | Meisterränge und alternative Build-Slots freischalten. | `weaponMasteryLedger` mit Kampfquelle und Idempotency-Key. |
| Loot und Sets | Ein Item aus einer bestätigten Expedition erhalten. | Set-Boni, Reliktbau und visuelle Ausrüstungskombinationen sammeln. | `lootDropReceipts` plus eindeutige Iteminstanz. |
| Gilde | Eine gemeinsame Aufgabe abschließen. | Gildenstufe, saisonales Sternwartenprojekt und kosmetische Banner. | `guildContributionLedger` mit Mitglieds- und Saisonbezug. |
| Expedition | Einen Sentinel-Run mit Zielvorgabe beenden. | Wöchentliche Varianten, Ranglisten und Gildenpunkte. | Serverbestätigtes Expeditionsresultat. |

## Gildenmodell

Eine Gilde beginnt mit einer kleinen, kontrollierbaren Struktur: **Gründer**, **Offizier**, **Mitglied** und **Anwärter**. Der Gründer kann nur Rollen, Aufnahme- und Bannerregeln verwalten; weder Gründer noch Offiziere können Punktestände, Loot oder Klassen anderer Mitglieder setzen. Gildenfortschritt entsteht ausschließlich durch bestätigte Beiträge aus Expeditionen, gemeinschaftlichen Reliktsammlungen und saisonalen Zielen.

Die erste soziale Schleife heißt **Sternwartenpakt**. Jede Woche erhalten Gilden drei öffentliche Ziele: einen Resonanzanker reinigen, eine Schatzklasse aus einer definierten Expedition sichern und ein Erkundungsziel erfüllen. Damit bekommen Einzelspieler weiterhin einen sinnvollen Solo-Run, während Gilden durch Koordination zusätzliche kosmetische und Archiv-Belohnungen erhalten.

## Prozeduraler Loot

Der Drop folgt einer festen, nachvollziehbaren Kette:

> **Treasure Class → Qualität → Basistyp → Affixe → Set-Prüfung → Iteminstanz → Drop-Receipt**

| Stufe | Regel | Beispiel |
| --- | --- | --- |
| Treasure Class | Expedition, Sentinel-Rang und Levelband bestimmen den Kandidatenpool. | `asterion_t2_weapons` |
| Qualität | Der Server würfelt nur aus der erlaubten Ordnung **normal → magic → rare → set → unique**. | Set-Chance nur bei hoher Expeditionstufe. |
| Basistyp | Waffengattung und Itemlevel grenzen mögliche Grundobjekte ein. | Aurion-Speer, Archivstab, Solariumklinge. |
| Affixe | Präfixe/Suffixe stammen aus einer levelgebundenen, serverseitigen Tabelle. | `Resonant`, `des Wächters`. |
| Set-Prüfung | Set-Teile werden an eigene Drop-Tabellen gebunden, nicht nachträglich clientseitig erzeugt. | Drei Teile des Asterion-Sets. |
| Receipt | Ein eindeutiger, idempotenter Nachweis bindet Quelle, Seed, Player und Instanz. | Kein doppelter Retry-Drop. |

Die Zufallsquelle bleibt pro Drop serverseitig und wird durch einen Receipt-Hash gebunden. Der Client erhält nur das entschiedene Ergebnis und die zur Darstellung nötigen Itemattribute. **Loot-Vorschauen dürfen nicht den serverseitigen Seed offenlegen.**

## Runescape-artige Waffenmeisterschaft

Statt starrer Klassen zu Beginn steigt jede Waffengattung durch bestätigte Nutzung. Die ersten Meisterschaften sind **Klinge**, **Stab**, **Speer** und **Fokus**. Jede gewertete Kampfaktion kann nur dann Fortschritt geben, wenn sie Teil eines validierten Expeditionsresultats ist. Ab Stufe 36 ergänzt die bereits geplante Klassenwahl diese Meisterschaft als Spezialisierung: Vanguard verstärkt Klinge/Speer, Seer Stab/Fokus und Warden Schutz-/Kontrollaspekte. Es entsteht keine Sackgasse: Die Grundmeisterschaften bleiben für alle trainierbar, die Spezialisierung verändert nur bevorzugte Synergien.

## Sounddesign

| Ebene | Klangidee | Gameplay-Einsatz |
| --- | --- | --- |
| Aurion-Identität | Tiefe Bronze-Drones, gläserne Obertöne und entfernte Sternwarte. | Einstieg, Pause und LLM-Paarung. |
| Kampf | Präzise Transienten für Speer, Schild und Sentinel-Resonanz. | Klarer Treffer-, Parier- und Phasenwechsel. |
| Loot | Dezente metallische Intervalle je Seltenheit. | Drop, Identifikation und Set-Vervollständigung. |
| Gilde | Warme Chorflächen ohne Stimme und Flaggen-/Banner-Fanfare. | Gildenabschluss und saisonaler Meilenstein. |
| Adaptiv | Dichte und Percussion reagieren auf Sentinel-Integrität und Teamrisiko. | Arena-Intensität statt Dauerschleife. |

## Drei Social-Media-Trailer

| Trailer | Dauer und Format | Inhalt | Call-to-Action |
| --- | --- | --- | --- |
| **1. „Die Sternwarte ruft“** | 20–25 Sekunden, 9:16 | Schneller Gameplay-Run mit Sentinel, Echo-Skillrail, Loot-Glint und einem Set-Piece. | „Betritt Aurion mit deinem Echo.“ |
| **2. „Zwei Stimmen, ein Team“** | 30 Sekunden, 16:9 und 9:16 Cut | Cinematic von Ruinen, Explorer und Echo Scout; Team-Tether wird zur Sternenkarte. | „Dein LLM. Dein Mitspieler.“ |
| **3. „LLM-Koop in 30 Sekunden“** | 30–40 Sekunden, 9:16 | Sichtbare Pairing-Schritte, erlaubte Befehle, Ledger und sofortige Reaktion im Kampf. | „Verbinden. Befehlen. Gemeinsam bestehen.“ |

Die Clips sollen als **Hybridproduktionen** entstehen: generierte aurionische B-Roll und Spielaufnahmen werden mit editierbaren UI-, Caption- und Markenframes zusammengesetzt. Das Tutorial zeigt keine verdeckte Steuerung und keine privaten Anbieterlogins, sondern ausschließlich das explizite, autorisierte MCP-Pairing.
