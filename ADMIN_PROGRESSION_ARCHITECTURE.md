---
description: Serverautoritäre, klassenlose Skillprogression ohne Level-Cap.
---

# Echoes of Aurion — Administration, Skills und Asset-Governance

## Architekturentscheidung

Der Ausbau folgt einer einzigen Regel: **Der Browser zeigt Spielzustand an, aber er besitzt ihn nicht.** Punkte, Siege, Skill-XP, Skillstufen, Ranglistenplatz, aktivierte GLB-Assets und Werbe-Rewards entstehen ausschließlich durch serverseitige, nachvollziehbare Mutationen. Weder ein LLM-Client noch ein Webbrowser dürfen diese Werte direkt setzen.

| Bereich                      | Verbindliches Modell                                                                                                                   | Status |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Benutzerkonto                | Bestehendes OAuth-`users`-Objekt bleibt Identitätsbasis; zusätzliche Spielwerte liegen getrennt in `playerProfiles`.                   | ZIEL   |
| Fortschritt                  | Jeder serverseitige Fortschrittseffekt erzeugt einen idempotenten `progressionLedger`-Eintrag mit Quelle, Korrelation und Zeitstempel. | ZIEL   |
| Skills                       | Jeder Skill besitzt eigene exakte XP und eine eigene Stufe. Es gibt weder Klassen noch ein maximales Level.                            | ZIEL   |
| Ranglisten                   | Öffentliche, lesende Query aus serverautorisierten Profilwerten; keine clientseitige Rangberechnung.                                   | ZIEL   |
| GLB-Assets                   | Binärdatei liegt in S3; Datenbank enthält Schlüssel, Prüfsumme, Metadaten, Freigabestatus und Zuweisung.                               | ZIEL   |
| Werbung / Offerwalls / Votes | Konfiguration, Einwilligung und Reward-Nachweis sind getrennte Objekte; Provider-Geheimnisse bleiben ausschließlich serverseitig.      | ZIEL   |
| Vorhandene GLBs              | Im aktuellen Projekt- und Static-Asset-Bestand wurden keine `.glb` oder `.gltf`-Dateien gefunden.                                      | BELEGT |

## Fortschritt und Skills

Aurion nutzt ein klassenloses Fortschrittssystem. Charaktere wählen keine Klasse und erhalten keine globale Charakterstufe. Aktionen entwickeln stattdessen die jeweils verwendete Fähigkeit.

Die Logik folgt dem RuneScape-Prinzip: Jeder Skill führt eigene kumulative XP, deren Stufe aus einer monotonen Kurve abgeleitet wird. Hohe Stufen benötigen deutlich mehr XP. Die Progression endet nicht an einer Levelgrenze.

Skill-XP und abgeleitete Stufen werden als exakte Ganzzahlen gespeichert. Der Server berechnet die Stufe aus den XP. Der Client übermittelt niemals einen Skillstand oder ein Level als Wahrheit.

Builds entstehen aus der Kombination trainierter Skills, bestätigter Ausrüstung und Entscheidungen im Spiel. Ein Spieler kann mehrere Bereiche parallel trainieren. Keine frühere Wahl sperrt Inhalte oder Synergien dauerhaft.

| Bereich              | Fortschrittsquelle                                | Wirkung                                                |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Kampf und Waffen     | Bestätigte Kampfaktionen und Begegnungsabschlüsse | Verbessert die verwendete Waffen- oder Kampffähigkeit. |
| Sammeln und Handwerk | Bestätigte Ressourcen- und Herstellungsaktionen   | Erschließt Handwerks- und Wirtschaftsfortschritt.      |
| Entdeckung und Welt  | Bestätigte Quests, Erkundung und Weltaktionen     | Entwickelt passende Welt- und Sozialfähigkeiten.       |

Jeder Fortschrittseintrag bindet Skill-ID, XP-Menge, Quelle, Receipt, Regelversion und Idempotency-Key. Wiederholte Requests dürfen keine zusätzlichen XP erzeugen.

## Datenmodell

| Tabelle                  | Zweck                                                                         | Wesentliche Schutzregel                                                    |
| ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `playerProfiles`         | Punkte, Siege, Saison- und Updatezeitpunkt pro Nutzer.                        | Nur Servermutationen; `userId` eindeutig.                                  |
| `playerSkills`           | Exakte XP und abgeleitete Stufe je Nutzer und Skill.                          | Eindeutig pro `userId` und Skill-ID; keine Levelobergrenze.                |
| `progressionLedger`      | Append-only-Nachweis jeder Skill-XP-, Punkte- und Siegänderung.               | Skill, Receipt und Idempotency-Key verhindern doppelte Rewards.            |
| `glbAssets`              | Asset-Metadaten für S3-Objekt, SHA-256, MIME-Typ, Größe, Status und Autor.    | Erst `approved`-Assets sind zuweisbar.                                     |
| `glbAssignments`         | Aktivierung eines freigegebenen GLB-Assets für Spielfigur, Arena oder Gegner. | Exklusivität pro Ziel/Slot wird serverseitig erzwungen.                    |
| `monetizationPlacements` | Aktivierte Banner-, Offerwall- und Vote-Positionen ohne Provider-Geheimnisse. | Ausschließlich Admins ändern Providerkennung, Platzierung und Aktivstatus. |
| `rewardReceipts`         | Idempotenter Nachweis eines validierten Vote-/Offerwall-Rewards.              | Kein Reward ohne serverseitige Signatur-/Providerprüfung.                  |

## Routen- und Berechtigungsmodell

| Route                                  | Zielgruppe           | Wirkung                                                                                        |
| -------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| `player.me`                            | Angemeldeter Spieler | Liest ausschließlich das eigene Profil und die Skillstände.                                    |
| `leaderboard.list`                     | Öffentlich           | Liest begrenzte, pseudonyme Ranglistenwerte aus serverautorisierten Profilen.                  |
| `admin.players.list`                   | Admin                | Verwaltet Rollenansicht und prüfbare Spielerübersicht.                                         |
| `admin.assets.*`                       | Admin                | Legt GLB-Metadaten an, prüft Status und steuert Asset-Zuweisungen.                             |
| `admin.progression.*`                  | Admin / Spielserver  | Vergibt nur durch erlaubte Quelle und Idempotency-Key Fortschritt; schreibt Ledger.            |
| `admin.monetization.*`                 | Admin                | Konfiguriert Platzierungen ohne Preisgabe von Provider-Geheimnissen.                           |
| `webhooks.vote` / `webhooks.offerwall` | Provider-Callback    | Noch nicht freigeschaltet; müssen Signatur, Replay-Schutz und Receipt-Deduplizierung besitzen. |

## GLB-Upload-Workflow

1. Ein Admin initiiert einen Upload mit Asset-Name, Zieltyp und erwarteten Metadaten.
2. Der Server akzeptiert ausschließlich validierte GLB-Dateien und legt Bytes in S3 ab; der Client erhält keine Storage-Credentials.
3. Der Server speichert Dateigröße, SHA-256, MIME-Typ und den S3-Key als unveränderliche Assetversion.
4. Ein Admin prüft das Asset und setzt den Status explizit auf `approved` oder `rejected`.
5. Erst dann darf eine `glbAssignment` ein Asset für einen Character-, Boss- oder Arenaslot aktivieren.

## Monetarisierungsentscheidung

Banner, Offerwalls und Vote-Listen werden als **optionale Konfiguration**, nicht als vorab aktivierte SDKs umgesetzt. Der erste sichere Scope enthält Platzierungsdaten, eine Datenschutzeinwilligung pro Nutzer und serverseitige Reward-Receipts. Eine spätere Providerintegration benötigt für jede externe Plattform eine eigene Serververifikation und kann nicht aus einer bloßen Browsermeldung belohnt werden. Vote-Callbacks sollen eine Provider-ID, einen geheimen Callback-Nachweis und eine eindeutige Event-ID zur Idempotenzprüfung verlangen.

## Meine Empfehlung

Zuerst werden **Profil, Skill-Ledger und Rangliste** umgesetzt. Das liefert einen spielbaren Kern, der später weder von Werbung noch von einem GLB-Upload abhängig ist. Danach folgt die Asset-Verwaltung. Forum und Community-Feed folgen erst, wenn Moderation, Meldungen und Rollenregeln bereitstehen.
