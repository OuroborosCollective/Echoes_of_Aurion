# Aurion Nerva: opt-in Infrastrukturprüfung

- Eigenständiger `workflow_dispatch` in `.github/workflows/aurion-nerva-security.yml`.
- Vor jedem Scan laufen lokale Node.js-Regressionen und der unveränderte Memory-Workflow-Vertrag.
- Nerva-Version **v1.75.1**, Linux-amd64-Release-SHA256 `812b0ec0ec824ed97a09a2e670a53a2cc10d446da09788550f93a560db871ccd`.
- **Keine** auf Zuruf gesetzten Host- oder Port-Eingaben. Das Profil `public-web` umfasst ausschließlich `arelogic.space:443` und `arelogic.space:80`. Erweiterungen brauchen Code-Review und Freigabe des Zielbereichs.
- Rate limit 1/s, workers 1, timeout 2000 ms, `--scan-depth fast`, `--misconfigs` ohne `--deep`. Externe Scans werden **niemals** bei Pull Requests oder jedem Commit gestartet.
- Nur klassifizierte Befunde (ID/Schwere), Protokoll, Zielkennung, Quellrevision und Tool-Identität werden als JSON-Artefakt (14 Tage) gespeichert; niemals Rohantworten, Banner, Geheimnisse oder Netzwerkmetadaten.
- Scan-Ergebnisse: `PASS`, `FINDINGS`, `INCOMPLETE`, `ERROR`. Fehlende/ungültige Daten gelten **nicht** als erfolgreicher Scan.
- Diese Prüfung ist Sicherheitsanalyse, keine Gameplay-Authority, keine Godot-Runtime, kein Produktions-Readback. Weder PR-Regression noch Scan darf Godot/Android/Deployment blockieren. Kritische Befunde separat priorisieren und beheben.

## Start

[GitHub Actions → Aurion Nerva opt-in infrastructure security](https://github.com/OuroborosCollective/Echoes_of_Aurion/actions/workflows/aurion-nerva-security.yml) → Run workflow → profile `public-web`.

Das Workflow-Run-Artefakt `aurion-nerva-receipt-<sha>` trägt den Evidence-Snapshot. Ein `PASS` bedeutet **nur**: die definierten Netzwerkziele wurden ohne Nerva-Befund beobachtet. Es belegt keine vollständige Sicherheit, kein Android-Deployment und keine funktionierende WebSocket-Welcome-Kette.

## Verifikation

```bash
node --check .github/nerva/run-nerva.mjs
node --test .github/nerva/run-nerva.test.mjs
node scripts/append-post-merge-memory.test.mjs
```

Die Integration hat bewusst keinen automatischen externen Netzwerkscan. Für Datenbank/SSH/Docker-Netzwerkoberflächen ist ein separater, ausdrücklich freigegebener privater Runner samt Ziel- und Netzwerk-Access-Policy nötig; diese gehören **nicht** auf öffentliche GitHub-hosted Runner.

Bei diesem PR schreibt `post-merge-memory.yml` automatisch genau einen append-only-Eintrag in `Memory.md` und synchronisiert die Arbeitsspiegelung. Kein vorzeitiger Erfolgsanspruch ohne CI-Readback.
