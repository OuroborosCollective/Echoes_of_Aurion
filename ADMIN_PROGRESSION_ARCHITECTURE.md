# Echoes of Aurion — Administration, Progression und Asset-Governance

## Architekturentscheidung

Der Ausbau folgt einer einzigen Regel: **Der Browser zeigt Spielzustand an, aber er besitzt ihn nicht.** Punkte, Siege, XP, Level, Klasse, Ranglistenplatz, aktivierte GLB-Assets und Werbe-Rewards werden ausschließlich über serverseitige, nachvollziehbare Mutationen erzeugt. Weder ein LLM-Client noch ein Webbrowser dürfen diese Werte direkt setzen.

| Bereich | Verbindliches Modell | Status |
| --- | --- | --- |
| Benutzerkonto | Bestehendes OAuth-`users`-Objekt bleibt Identitätsbasis; zusätzliche Spielwerte liegen getrennt in `playerProfiles`. | ZIEL |
| Fortschritt | Jeder serverseitige Fortschrittseffekt erzeugt einen idempotenten `progressionLedger`-Eintrag mit Quelle, Korrelation und Zeitstempel. | ZIEL |
| Klassen | Die einmalige Wahl wird ab **Stufe 36** serverseitig geprüft und in `playerClassChoices` festgehalten. | ZIEL |
| Ranglisten | Öffentliche, lesende Query aus serverautorisierten Profilwerten; keine clientseitige Rangberechnung. | ZIEL |
| GLB-Assets | Binärdatei liegt in S3; Datenbank enthält Schlüssel, Prüfsumme, Metadaten, Freigabestatus und Zuweisung. | ZIEL |
| Werbung / Offerwalls / Votes | Konfiguration, Einwilligung und Reward-Nachweis sind getrennte Objekte; Provider-Geheimnisse bleiben ausschließlich serverseitig. | ZIEL |
| Vorhandene GLBs | Im aktuellen Projekt- und Static-Asset-Bestand wurden keine `.glb` oder `.gltf`-Dateien gefunden. | BELEGT |

## Fortschritt und Klassenwahl

Für die erste Balance-Schleife wird eine monotone XP-Anforderung pro Level verwendet:

> `xpFürNächstesLevel(l) = 100 + 18 × l + 4 × l²`

Die mathematische Prüfung ergibt für die Level 1, 10, 35, 36 und 50 die Anforderungen **122**, **680**, **5.630**, **5.932** und **11.000** XP; die Differenz zur nächsten Stufe bleibt für `l ≥ 1` strikt positiv. Bis Stufe 35 summiert sich die Kurve auf 74.480 XP.[^wolfram]

Die Klassenwahl soll **nicht** die Basisklasse des Charakters ersetzen, sondern eine erste Spezialisierung nach einer bewussten Spielphase eröffnen. Der Spieler wählt ab Stufe 36 einmalig zwischen **Vanguard** (direkte Resonanz-/Nahkampfsynergien), **Seer** (Aufklärung, Markierung und Echo-Kontrolle) und **Warden** (Schutz, Teamresilienz und Defensive). Die konkrete Wirkung wird erst nach serverseitigem Entwurf der Kampfevents aktiviert; eine Wahl ist bis dahin nur eine autorisierte Profilentscheidung.

## Datenmodell

| Tabelle | Zweck | Wesentliche Schutzregel |
| --- | --- | --- |
| `playerProfiles` | Level, aktuelle XP, Punkte, Siege, Saison- und Updatezeitpunkt pro Nutzer. | Nur Servermutationen; `userId` eindeutig. |
| `progressionLedger` | Append-only-Nachweis jeder XP-, Punkte- und Siegänderung. | Eindeutiger Idempotency-Key verhindert doppelte Rewards. |
| `playerClassChoices` | Einmalige Spezialisierung mit gewählter Klasse und Zeitpunkt. | Insert nur bei `level >= 36` und ohne bestehende Wahl. |
| `glbAssets` | Asset-Metadaten für S3-Objekt, SHA-256, MIME-Typ, Größe, Status und Autor. | Erst `approved`-Assets sind zuweisbar. |
| `glbAssignments` | Aktivierung eines freigegebenen GLB-Assets für Spielfigur, Arena oder Gegner. | Exklusivität pro Ziel/Slot wird serverseitig erzwungen. |
| `monetizationPlacements` | Aktivierte Banner-, Offerwall- und Vote-Positionen ohne Provider-Geheimnisse. | Ausschließlich Admins ändern Providerkennung, Platzierung und Aktivstatus. |
| `rewardReceipts` | Idempotenter Nachweis eines validierten Vote-/Offerwall-Rewards. | Kein Reward ohne serverseitige Signatur-/Providerprüfung. |

## Routen- und Berechtigungsmodell

| Route | Zielgruppe | Wirkung |
| --- | --- | --- |
| `player.me` | Angemeldeter Spieler | Liest ausschließlich das eigene Profil, die Klassenwahl und den Fortschrittsstand. |
| `leaderboard.list` | Öffentlich | Liest begrenzte, pseudonyme Ranglistenwerte aus serverautorisierten Profilen. |
| `admin.players.list` | Admin | Verwaltet Rollenansicht und prüfbare Spielerübersicht. |
| `admin.assets.*` | Admin | Legt GLB-Metadaten an, prüft Status und steuert Asset-Zuweisungen. |
| `admin.progression.*` | Admin / Spielserver | Vergibt nur durch erlaubte Quelle und Idempotency-Key Fortschritt; schreibt Ledger. |
| `admin.monetization.*` | Admin | Konfiguriert Platzierungen ohne Preisgabe von Provider-Geheimnissen. |
| `webhooks.vote` / `webhooks.offerwall` | Provider-Callback | Noch nicht freigeschaltet; müssen Signatur, Replay-Schutz und Receipt-Deduplizierung besitzen. |

## GLB-Upload-Workflow

1. Ein Admin initiiert einen Upload mit Asset-Name, Zieltyp und erwarteten Metadaten.
2. Der Server akzeptiert ausschließlich validierte GLB-Dateien und legt Bytes in S3 ab; der Client erhält keine Storage-Credentials.
3. Der Server speichert Dateigröße, SHA-256, MIME-Typ und den S3-Key als unveränderliche Assetversion.
4. Ein Admin prüft das Asset und setzt den Status explizit auf `approved` oder `rejected`.
5. Erst dann darf eine `glbAssignment` ein Asset für einen Character-, Boss- oder Arenaslot aktivieren.

## Monetarisierungsentscheidung

Banner, Offerwalls und Vote-Listen werden als **optionale Konfiguration**, nicht als vorab aktivierte SDKs umgesetzt. Der erste sichere Scope enthält Platzierungsdaten, eine Datenschutzeinwilligung pro Nutzer und serverseitige Reward-Receipts. Eine spätere Providerintegration benötigt für jede externe Plattform eine eigene Serververifikation und kann nicht aus einer bloßen Browsermeldung belohnt werden. Vote-Callbacks sollen eine Provider-ID, einen geheimen Callback-Nachweis und eine eindeutige Event-ID zur Idempotenzprüfung verlangen.[^vote]

## Meine Empfehlung

Zuerst werden **Profil, Ledger, Klassenwahl und Rangliste** umgesetzt. Das liefert einen spielbaren Kern, der später weder von Werbung noch von einem GLB-Upload abhängig ist. Danach folgt die Asset-Verwaltung. Forum und Community-Feed empfehle ich erst als nächste Iteration, wenn Moderation, Meldungen und Rollenregeln bereitstehen; ein unmoderiertes Forum vor dem Progressionskern erzeugt mehr Betriebsrisiko als Spielwert.

[^wolfram]: Berechnung durch die dokumentierte Wolfram-Auswertung der Kurve `100 + 18l + 4l²` im Projektarbeitslauf.
[^vote]: [Nostalgic.gg Vote Rewards Integration Guide](https://nostalgic.gg/en/docs/vote-rewards)
