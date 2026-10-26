
# Security Policy — Echoes of Aurion

**Projekt:** Echoes of Aurion  
**Repository:** https://github.com/OuroborosCollective/Echoes_of_Aurion  
**Maintainer:** OuroborosCollective  
**Stand:** 26. Oktober 2026

## 1. Sicherheitsgrundsatz

Echoes of Aurion ist ein serverautoritatives,
deterministisches Spielsystem mit Godot-Client,
WebSocket-Kommunikation, persistenter Welt,
Authentifizierung und produktiver Server-Runtime.

Sicherheit, Datenintegrität und reproduzierbares
Systemverhalten haben Vorrang vor schneller
Fehlerbehebung oder scheinbar erfolgreichen Tests.

Grundregel:

> Keine Sicherheitsfreigabe ohne überprüfbare
> Revision, erfolgreiche relevante Tests und
> unabhängigen Evidence-Readback.

Ein erfolgreicher Build beweist keine sichere
Produktions-Runtime.

Ein CodeQL-Scan ohne neue Alerts beweist
keine vollständige Sicherheit.

Mocks, Stubs und synthetische Ergebnisse dürfen
niemals als echte Produktionsnachweise gelten.

## 2. Supported Versions

Sicherheitsupdates gelten für den aktuellen
Entwicklungsstand sowie ausdrücklich freigegebene,
nachweisbar unterstützte Releases.

| Version / Bereich | Security Support |
|---|---|
| Aktueller `main`-HEAD | ✅ |
| Aktuell freigegebene Produktionsrevision | ✅ * |
| Freigegebene Godot-Client-Releases | ✅ * |
| Historische, abgelöste Releases | ❌ ** |
| Nicht freigegebene Builds / APKs | ❌ |
| Veraltete Branches und lokale Snapshots | ❌ |

* Nur bei dokumentierter Freigabe und eindeutig
nachgewiesener Commit-/Artefakt-Identität.

** Ausnahmen nur bei ausdrücklich angekündigter
Sicherheitswartung.

Die Versionsnummer aus `package.json` ist allein
kein Nachweis für eine produktive Release-Freigabe.

Sicherheitsunterstützung bedeutet nicht, dass eine
Revision automatisch produktiv installiert wurde.

## 3. Reporting a Vulnerability

Sicherheitslücken müssen vertraulich gemeldet werden.

### Bevorzugter Meldeweg

GitHub Private Vulnerability Reporting:

https://github.com/OuroborosCollective/Echoes_of_Aurion/security/advisories/new

Dieser Meldeweg setzt voraus, dass Private
Vulnerability Reporting im Repository aktiviert ist.

Falls nicht verfügbar, muss zunächst über einen
bereits etablierten vertraulichen Kontaktkanal
Kontakt zum Repository-Maintainer aufgenommen werden.

**Sicherheitslücken niemals in öffentlichen Issues,
Discussions, Pull Requests oder Kommentaren
mit ausnutzbaren Details veröffentlichen.**

### Erforderliche Angaben

Eine Sicherheitsmeldung sollte enthalten:

1. Beschreibung der Schwachstelle.
2. Betroffene Komponente oder API.
3. Betroffene Version oder vollständige Commit-SHA.
4. Reproduzierbare Schritte.
5. Tatsächliche oder mögliche Auswirkungen.
6. Sanitisierten Proof of Concept, falls vorhanden.
7. Beobachtete Fehlermeldungen oder Logs.
8. Vorschlag zur Behebung, sofern bekannt.

Keine Passwörter, Tokens, privaten Schlüssel,
Session-Cookies oder personenbezogenen Daten
in Meldungen oder Logs weitergeben.

## 4. Response and Disclosure Policy

Angestrebte Reaktionszeiten:

| Vorgang | Zielzeit |
|---|---|
| Eingangsbestätigung | 3 Arbeitstage |
| Erste Sicherheitsbewertung | 7 Kalendertage |
| Statusaktualisierung | Spätestens alle 14 Tage |
| Kritische Schwachstelle | Priorisierte Bearbeitung |

Diese Zeiten sind Bearbeitungsziele und keine
garantierten Behebungsfristen.

### Bestätigte Schwachstellen

Bei Annahme einer Meldung:

1. Betroffene Revision und Komponente bestimmen.
2. Auswirkungen und Angriffsvoraussetzungen prüfen.
3. Schweregrad und Priorität dokumentieren.
4. Sicherheitskorrektur isoliert entwickeln.
5. Relevante Regressionstests ausführen.
6. GitHub-/CI-Evidence unabhängig zurücklesen.
7. Falls erforderlich, produktive Runtime prüfen.
8. Veröffentlichung koordiniert durchführen.

### Abgelehnte oder nicht bestätigte Meldungen

Meldungen können abgelehnt werden, wenn sie:

- nicht reproduzierbar sind,
- keinen relevanten Sicherheitsbezug aufweisen,
- außerhalb des Projektumfangs liegen,
- bereits nachweisbar behoben wurden,
- ausschließlich auf unbelegten Annahmen beruhen.

Der Melder erhält nach Möglichkeit eine Begründung.

Eine öffentliche Veröffentlichung bestätigter
Sicherheitsdetails erfolgt koordiniert mit dem
Maintainer, sobald eine angemessene Absicherung
oder Korrektur bereitsteht.

## 5. Security Scope

Folgende Komponenten sind sicherheitsrelevant:

### Server und Runtime

- Serverautoritatives Gameplay
- Tick-basierte Simulation
- Deterministische World-State-Berechnung
- World Seeds, Chunks und Revisionen
- Entity- und NPC-Autorisierung
- Kampf-, Skill-, Inventar- und Questaktionen
- Administrative Aktionen und Berechtigungen
- Runtime-Konfiguration und Produktionsendpunkte

### Netzwerk und Authentifizierung

- HTTP- und API-Endpunkte
- WebSocket-Verbindungen
- Native Auth und OAuth/OIDC-Integrationen
- Session- und Token-Verwaltung
- Zone Tickets und Welcome-Verifikation
- Eingabevalidierung und Rate Limiting
- CORS, Security Headers und Host-Validierung
- Replay- und Manipulationsschutz

### Persistenz

- Datenbankverbindungen
- Migrationen
- Zugriffskontrolle
- Transaktionsintegrität
- Persistente Spielzustände
- Schutz vor SQL-/Path-Injection
- Schutz vertraulicher Daten

### Godot und Assets

- Godot-4-Client
- Native Android-Authentifizierung
- APK-Signierung
- Client-/Server-Protokolle
- GLB-/3D-Asset-Importe
- Ressourcen- und Pfadvalidierung
- Clientseitige Eingaben und Netzwerkaktionen

### Infrastruktur und Lieferkette

- GitHub Actions und CI/CD
- Docker und Deployment-Konfiguration
- Abhängigkeiten und Supply Chain
- Build-Artefakte und Image-Digests
- Secrets und Umgebungsvariablen
- Signierschlüssel und Release-Provenienz
- VPS-Konfiguration und Zugriffsrechte

## 6. Code Scanning and Dependency Security

GitHub CodeQL und weitere verfügbare
Sicherheitsprüfungen sollen relevante
JavaScript-/TypeScript-Codepfade überwachen.

Besonders zu untersuchen sind:

- Injection-Schwachstellen
- Unsichere Parameterverarbeitung
- Path Traversal und Path Injection
- ReDoS
- Fehlendes Rate Limiting
- Unsichere CORS-Konfiguration
- Unzureichende Eingabevalidierung
- Unsichere HTTP-Sicherheitsheader
- Authentifizierungs- und Berechtigungsfehler
- Verwundbare Abhängigkeiten

Ein Scanner-Fund ist zunächst ein Befund,
kein automatisch bestätigter Exploit.

Jeder relevante Fund wird anhand von Code,
betroffener Revision, Erreichbarkeit und
reproduzierbarem Verhalten bewertet.

Warnungen dürfen nicht allein deshalb
unterdrückt werden, um CI grün erscheinen
zu lassen.

Begründete False Positives werden dokumentiert.

## 7. Deterministic Runtime Integrity

Sicherheitskorrekturen dürfen die kanonische
deterministische Spielsimulation nicht beschädigen.

Die bestehende Tick-Invariante beträgt:

- 100 Millisekunden pro Tick
- 10 Hz

In deterministischen Kernpfaden dürfen
nichtdeterministische Quellen nicht heimlich
die Simulation beeinflussen.

Insbesondere:

- `Date.now()`
- `Math.random()`
- `crypto.randomUUID()`
- `performance.now()`
- unseeded randomness
- ungeordnete externe Iteration
- wall-clock-abhängige Simulation

Stattdessen müssen bestehende deterministische
Zeit-, Seed- und Randomness-Verträge verwendet werden.

Security Fixes dürfen keine zweite Autorität
für Weltzustände, Berechtigungen oder
Spielaktionen einführen.

## 8. Security Fix Verification

Eine Schwachstelle gilt erst dann als behoben,
wenn die jeweils relevanten Nachweise vorliegen.

### Verbindliche Nachweise

1. Vollständige Commit-SHA der Korrektur.
2. Konkreter Code-Diff.
3. Reproduzierbarer Regressionstest.
4. Erfolgreiche relevante CI-Prüfungen.
5. Unabhängiger GitHub-Readback.
6. Bei Deployment: Build-/Artefakt-Provenienz.
7. Bei Deployment: aktives Image und Revision.
8. Bei Runtime-Betroffenheit: echter Runtime-Test.
9. Bei Persistenz-Betroffenheit: Datenbank-Readback.
10. Dokumentierter Abschlussstatus.

Es dürfen keine Assertions entfernt,
Prüfungen deaktiviert oder Validierungen
umgangen werden, nur um einen Test
erfolgreich abzuschließen.

### Statusklassifikation

| Status | Bedeutung |
|---|---|
| GEPRÜFT | Aussage tatsächlich überprüft; Ergebnis ausweisen |
| UNBELEGT | Erforderliche Evidence fehlt |
| BLOCKIERT | Konkretes Hindernis verhindert die Prüfung |

Ein grüner CI-Status ist kein Beweis
für ein erfolgreiches Deployment.

Ein erfolgreiches Deployment beweist nicht
automatisch eine funktionierende Authentifizierung
oder sichere Gameplay-Aktionen.

## 9. Secrets and Sensitive Data

Folgende Informationen dürfen niemals
unverschlüsselt im öffentlichen Repository stehen:

- Datenbankpasswörter
- Zugangstokens
- API-Schlüssel
- OAuth Client Secrets
- Signierschlüssel
- Private Schlüssel
- Session Secrets
- Produktive Zugangsdaten
- Unredigierte persönliche Nutzerdaten

Werden Secrets versehentlich veröffentlicht,
muss der Vorfall unabhängig von einer
nachfolgenden Git-Bereinigung bewertet werden.

Erforderliche Maßnahmen können umfassen:

1. Betroffene Zugangsdaten sperren.
2. Schlüssel oder Tokens rotieren.
3. Berechtigungen und Zugriffsprotokolle prüfen.
4. Betroffene Systeme absichern.
5. Möglichen Datenzugriff untersuchen.
6. Maßnahmen mit Evidence dokumentieren.

Das Entfernen eines Secrets aus einem Commit
macht ein zuvor veröffentlichtes Secret
nicht wieder geheim.

## 10. Responsible Security Research

Sicherheitsforschung ist willkommen, sofern
sie verantwortungsvoll und mit möglichst
geringem Risiko durchgeführt wird.

Bitte:

- Nur autorisierte Systeme untersuchen.
- Keine fremden Accounts oder Daten verwenden.
- Keine produktiven Daten verändern oder löschen.
- Keine DoS-/DDoS- oder Lastangriffe durchführen.
- Keine Zugangsdaten veröffentlichen.
- Sicherheitslücken zunächst privat melden.
- Nur den erforderlichen Minimalnachweis erstellen.

Produktive Eingriffstests benötigen eine
ausdrückliche Freigabe.

Diese Richtlinie gewährt keine zusätzliche
Zugriffs- oder Testberechtigung.

## 11. Security Release Requirements

Ein Security Release muss die bestehenden
Projekt- und Deployment-Verträge respektieren.

Erforderlich sind je nach betroffener Grenze:

- Aktueller, nachgewiesener Repository-HEAD
- Gültige Code- und Architekturverträge
- Relevante Security- und Regressionstests
- Eindeutig zugeordnete Build-Artefakte
- Dokumentierte Commit-/Release-Identität
- Unveränderliche Artefakt-/Image-Digests
- Unabhängiger Readback des Zielzustands
- Eintrag im bestehenden Evidence-Logbuch

Eine produktive Veröffentlichung, Datenmigration,
Signierung oder Installation darf nicht allein
durch die Einstufung als Sicherheitskorrektur
autorisiert werden.

Bestehende Freigabe- und Deployment-Grenzen
bleiben verbindlich.

## 12. Security Maintenance

Der Maintainer überprüft relevante
Sicherheitsmeldungen und priorisiert bestätigte
Probleme anhand von Auswirkungen, Ausnutzbarkeit
und erreichbaren Angriffspfaden.

Sicherheitsentscheidungen und technische
Korrekturen müssen nachvollziehbar bleiben.

Historische Evidence wird nicht überschrieben,
sondern durch neue revisionsgebundene
Nachweise ergänzt.

**Grundsatz:**

> Security without evidence is not verified security.

---

Maintained by OuroborosCollective  
Echoes of Aurion — Security Policy
