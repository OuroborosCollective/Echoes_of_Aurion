---
description: >-
  Verbindlicher Ablauf für die rückwirkende und fortlaufende Übernahme gemergter
  Pull Requests.
icon: arrows-rotate
---

# GitHub-Patchnotes-Automation

## GitHub-Patchnotes-Automation

Die Automation verarbeitet den Ziel-Repository `OuroborosCollective/Echoes_of_Aurion`. Sie übernimmt jeden Pull Request, der nach `main` gemergt wurde.

### Ablauf

{% stepper %}
{% step %}
#### Bestehende Pull Requests erfassen

Ein einmaliger Backfill lädt alle gemergten Pull Requests paginiert. Er beginnt beim ältesten Merge und speichert die Pull-Request-Nummer als eindeutigen Schlüssel.

Bereits übernommene Einträge werden übersprungen. Wiederholte Läufe erzeugen keine Duplikate.
{% endstep %}

{% step %}
#### Neue Merges erkennen

Ein GitHub-Workflow reagiert auf `pull_request` mit Aktion `closed`. Er fährt nur fort, wenn der Pull Request tatsächlich gemergt wurde und das Zielbranch `main` ist.

Der Lauf lädt Pull-Request-Nummer, Titel, Beschreibung, Labels, Merge-SHA, Merge-Zeitpunkt und geänderte Dateien.
{% endstep %}

{% step %}
#### Eintrag erzeugen oder aktualisieren

Die Automation erstellt einen Eintrag unter **Patchnotes**. Bei erneutem Lauf aktualisiert sie den Eintrag mit derselben Pull-Request-Nummer.

Jeder Eintrag trägt Datum, Kategorie, Komponenten und Links auf Pull Request und Merge-Revision.
{% endstep %}

{% step %}
#### Veröffentlichung prüfen

Ein Eintrag wird veröffentlicht, wenn alle Pflichtfelder vorhanden sind. Fehlende oder unklare Angaben markieren den Eintrag als **Review erforderlich**.

Ein Review korrigiert den Text. Die Referenzen auf Pull Request und Merge-Revision bleiben unverändert.
{% endstep %}
{% endstepper %}

### Pflichtinhalt je Eintrag

Die Automation erstellt diese Struktur:

```
## PR #<Nummer> — <kurzer Titel>

**Kategorie:** Behoben | Verbessert | Geändert
**Komponenten:** Aurion | AX1 | WASD | Betrieb
**Revision:** <Merge-SHA>

### Behoben oder geändert
<Welches Problem oder Verhalten betrifft die Änderung?>

### Umsetzung
<Welche technische Maßnahme löst es?>

### Verbesserung
<Welchen konkreten Nutzen bringt es?>

[Pull Request](<GitHub-URL>) · [Merge-Revision](<GitHub-URL>)
```

Die Zusammenfassung beschreibt beobachtbares Verhalten. Sie kopiert keine Commit-Nachrichten oder interne Diskussionen ungeprüft.

### Kategorisierung

Labels steuern die Kategorie. Mehrere Labels sind möglich, aber jeder Eintrag erhält genau eine Hauptkategorie.

| GitHub-Label                                | Hauptkategorie |
| ------------------------------------------- | -------------- |
| `bug`, `fix`, `regression`                  | Behoben        |
| `performance`, `stability`, `ux`            | Verbessert     |
| `feature`, `enhancement`, `breaking-change` | Geändert       |

Ohne passendes Label setzt die Automation **Review erforderlich**. Ein Reviewer legt dann Kategorie und Komponenten fest.

### Qualitätsregeln

* Beschreibe Ursache und Wirkung. Nenne keine unbestätigten Vermutungen.
* Verweise bei Architekturänderungen auf den betroffenen Vertrag.
* Dokumentiere Sicherheitsdetails nur auf Ebene der Wirkung. Keine Geheimnisse oder Angriffswege.
* Überspringe Änderungen ohne Produkt-, Betriebs- oder Entwicklerwirkung.

### Einrichtung

Der Workflow benötigt diese Zugänge als geschützte Geheimnisse:

* einen GitHub-Token mit Leserechten auf Pull Requests und Repository-Inhalte;
* einen GitBook-API-Token mit Schreibrechten für diesen Bereich, gespeichert als `GITBOOK_PATCHNOTES_TOKEN`;
* die GitBook-Zielkennung für die Patchnotes-Sammlung.

Der Token bleibt ausschließlich in den Geheimnissen des GitHub-Repositories. Er erscheint weder in Pull Requests noch in Patchnotes.

Nach der Einrichtung startet der Backfill einmalig. Anschließend verarbeitet die Automation jeden neuen Merge nach `main`.
