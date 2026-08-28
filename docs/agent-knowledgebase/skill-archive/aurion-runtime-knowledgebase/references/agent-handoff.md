# Agentenübergabe und Arbeitsprotokoll

## Sessionstart

Lies zuerst `docs/agent-knowledgebase/INDEX.md`, dann das relevante Referenzdokument, den aktuellen Ledger und den Git-Status. Prüfe, ob ein vorheriger Agent einen Kandidatenbranch, offenen Draft-PR oder ungemergte lokale Änderungen hinterlassen hat.

## Arbeitsnotiz

Jede größere Änderung soll fünf Punkte festhalten: Ziel, Basisrevision, betroffene Verträge/Dateien, ausgeführte Nachweise und offene Grenzen. Schreibe Zwischenbefunde in Repository-Dateien, sobald sie für spätere Entscheidungen relevant sind.

## Keine stillen Annahmen

Unbekannte Runtimepfade, fehlende serverseitige Receipts, nicht reproduzierbare Assets, Compositor-Limits und nicht aktivierte Kandidaten als offen kennzeichnen. Nicht aus einer UI-Vorschau auf Serverzustand schließen.

## Übergabeformat

Am Sessionende dokumentieren:

| Feld | Inhalt |
|---|---|
| Branch/Commit | exakte Revision und Remotezustand |
| Ziel | erledigte und nicht erledigte Arbeit |
| Dateien | geänderte, neue und absichtlich unberührte Pfade |
| Nachweise | Tests, Readbacks, Hashes, Linear-/PR-Links |
| Grenzen | bekannte technische oder organisatorische Einschränkungen |
| Nächster Schritt | kleinster sicherer Fortsetzungsschritt |

Keine Zugangsdaten, Tokens oder Passwörter in Knowledgebase, Logs, Commitmessages oder Linear-Kommentare schreiben.
