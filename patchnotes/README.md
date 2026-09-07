---
description: Nachvollziehbare Änderungen aus zusammengeführten GitHub-Pull-Requests.
icon: list-check
---

# Patchnotes

## Patchnotes

Patchnotes zeigen nur Änderungen aus gemergten Pull Requests. Jeder Eintrag verlinkt auf seinen Pull Request und die zugehörige Revision.

### Veröffentlichung

Nach jedem Merge nach `main` erstellt die GitHub-Automation einen Patchnote-Eintrag. Der Ablauf verarbeitet außerdem alle bereits gemergten Pull Requests rückwirkend.

Ein Eintrag enthält immer:

* **Behoben oder geändert** — sichtbares Problem oder Funktion.
* **Umsetzung** — technische Maßnahme und betroffene Komponente.
* **Verbesserung** — konkreter Nutzen für Spiel, Betrieb oder Entwicklung.

{% hint style="info" %}
Entwürfe, geschlossene Pull Requests ohne Merge und reine Verwaltungsänderungen erscheinen nicht.
{% endhint %}

### Kategorien

* **Behoben** — Fehlerkorrekturen und Regressionen.
* **Verbessert** — Performance-, Bedienungs- und Stabilitätsverbesserungen.
* **Geändert** — neue oder angepasste Funktionen mit Nutzerwirkung.

Die [github-patchnotes-automation.md](github-patchnotes-automation.md "mention") definieren Backfill, Deduplizierung und Qualitätsprüfung.
