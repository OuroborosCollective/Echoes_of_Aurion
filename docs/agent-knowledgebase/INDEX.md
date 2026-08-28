# Aurion Agent Knowledgebase

Dieses Verzeichnis ist ein **versioniertes Arbeitswissen-Archiv für zukünftige Agenten**. Es beschreibt Regeln, Übergaben und Nachweisstandards; es ersetzt keine serverseitige Autorität und wird nicht automatisch zu Produktionslogik.

## Einstieg

1. Lies `skill-archive/aurion-runtime-knowledgebase/SKILL.md`.
2. Lies je nach Aufgabe genau eine oder mehrere Dateien unter `skill-archive/aurion-runtime-knowledgebase/references/`.
3. Prüfe danach den aktuellen Code, den Git-Status und relevante Ledger/Linear-/PR-Evidenz.
4. Ergänze neue Erkenntnisse in der passenden Referenzdatei, nicht in verstreuten Sessionnotizen.

## Archivkarte

| Pfad | Zweck |
|---|---|
| `skill-archive/aurion-runtime-knowledgebase/SKILL.md` | Trigger, verbindlicher Agentenablauf und harte Leitplanken |
| `skill-archive/aurion-runtime-knowledgebase/references/world-and-content.md` | Seed, Chunks, Deltas, Serverautorität, Migration und Tower |
| `skill-archive/aurion-runtime-knowledgebase/references/rendering-and-home.md` | Babylon, Mehrchunk-Streaming, Fog, Assets und Rückkehr zum Tower |
| `skill-archive/aurion-runtime-knowledgebase/references/audio-system.md` | Busse, Ambient/Boss, SFX, Receipts, Fallbacks und Mixregeln |
| `skill-archive/aurion-runtime-knowledgebase/references/verification-and-release.md` | Tests, Readbacks, Linear/GitHub-Evidenz und Releasegrenzen |
| `skill-archive/aurion-runtime-knowledgebase/references/agent-handoff.md` | Sessionstart, Notizen, Übergabe und Geheimnisgrenzen |
| `BEST_PRACTICES.md` | Kurzfassung der verbindlichen Arbeitsstandards |

## Aktualisierungsregel

Jede inhaltliche Änderung braucht eine Basisrevision, eine kurze Begründung und eine nachvollziehbare Repository-Historie. Veraltete Regeln nicht löschen, wenn sie für Migration oder Rückverfolgbarkeit relevant sind; stattdessen als superseded markieren und auf die neue Regel verweisen.

## Nicht im Archiv speichern

Keine Passwörter, API-Schlüssel, OAuth-Tokens, privaten Browserdaten oder unbestätigte Produktionsannahmen. Große Detailmengen gehören in Referenzdateien; das Skill-Hauptdokument bleibt kurz und navigierbar.
