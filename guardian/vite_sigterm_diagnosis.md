# Vite-SIGTERM-Diagnose in der Sandbox

## Ergebnis

Der frühere Abbruch beim Vite-Chunk-Rendering ist mit hoher Wahrscheinlichkeit ein **Ausführungszeitbudgetproblem der Buildhülle**, nicht ein nachgewiesener TypeScript-, Rollup- oder Assetfehler. Der kontrollierte Produktionsbuild benötigte **46,28 Sekunden**; ein Vite-Frontendlauf benötigte **45,82 Sekunden**. Ein pauschales 30-Sekunden-Limit kann daher die Vite-Phase `rendering chunks...` per `SIGTERM` beenden, obwohl der Build korrekt weiterläuft.

## Kontrollierter Nachweis vom 2026-08-26

| Prüfung | Einstellung | Ergebnis |
| --- | --- | --- |
| Ressourcenbereinigung | Browser und der ausschließlich für den GLB-Readback gestartete lokale Dev-Server beendet | durchgeführt |
| Frontend | `NODE_OPTIONS=--max-old-space-size=1536 pnpm vite build --logLevel=warn` mit 300-Sekunden-Zeitbudget | bestanden, 45,82 s |
| Vollständige Pipeline | `NODE_OPTIONS=--max-old-space-size=1536 pnpm build` mit 300-Sekunden-Zeitbudget | bestanden, 46,28 s |
| Clienttransformation | Vite | 3.030 Module transformiert |
| Serverartefakt | esbuild | `dist/index.js`, 427,0 kB |

Die Sandbox hatte vor der Bereinigung rund 1,93 GiB verfügbaren RAM und 2,00 GiB freien Swap. Es gibt keinen beobachteten Out-of-Memory-Nachweis.

## Reproduzierbarer Befehl

```bash
pnpm build:sandbox
```

Der Befehl verwendet `NODE_OPTIONS=--max-old-space-size=1536`. Das aufrufende Ausführungssystem muss ihm mindestens **120 Sekunden**, für Diagnosen besser **300 Sekunden**, Zeit geben. Vor dem Build sollten lokale Browserinstanzen, parallele Vite-Dev-Server und andere speicherintensive Aufgaben beendet werden.

> Die Speichergrenze ist eine Schutzmaßnahme gegen unkontrolliertes V8-Wachstum. Der entscheidende Befund ist das erhöhte Zeitbudget: Der erfolgreiche Vite-Lauf benötigt ungefähr 46 Sekunden.

## Verbleibende, nicht blockierende Warnungen

| Befund | Wirkung | Empfohlene Folgearbeit |
| --- | --- | --- |
| Zwei nicht gesetzte Umami-Variablen | Warnungen in `index.html`; kein Buildfehler | Analytics-Konfiguration in der Zielumgebung setzen oder Script bedingt rendern |
| `vendor-babylon` 3.604,40 kB minifiziert / 835,81 kB gzip | Mobiler Erstlade- und Cachingbedarf | Babylon-Importpfade und featurebasierte dynamische Imports separat optimieren |
| Vite-Chunkwarnung über 500 kB | Warnung, kein Buildfehler | Weitere Route-/Feature-Splittinganalyse nach dem Integrationscheckpoint |

## Freigabegrenze

Der erfolgreiche Sandboxbuild beseitigt den bisherigen **Buildblocker**, ersetzt aber weder die übersprungenen OAuth-/Datenbank-/Zonen-E2E-Tests noch eine Review-/Mergefreigabe. Es wurden keine Datenbankmigration, kein Deployment und kein Merge ausgeführt.
