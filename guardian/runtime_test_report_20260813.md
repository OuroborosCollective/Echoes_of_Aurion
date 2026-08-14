# Aurion Runtime- und Smoke-Testbericht

Der Spielclient schützt die Canvas-Initialisierung gegen nicht verfügbare WebGL-Laufzeiten. Statt die gesamte Anwendung zu verlieren, bleibt die Zugangsebene bedienbar und meldet einen sicheren Modell-Fallback. Die globale Fehlergrenze verdeckt keine technischen Stack-Traces mehr; sie zeigt einen nicht sensiblen Vorgangscode und erlaubt einen lokalen Wiederherstellungsversuch.

| Prüfebene | Abdeckung | Ergebnis |
|---|---|---|
| Statische Prüfung | `pnpm check` | Bestanden |
| Vertrags-, Einheits- und Datenbank-Smoke-Tests | 10 Testdateien, 41 Tests | Bestanden |
| Runtime-Verträge | Befehlskanon, GLB-Quellen, nicht sensibler Vorgangscode | Bestanden |
| E2E-Gastkatalog | Auswahl Wayfinder/Veilguard, rein lesender Katalog, kein Upload und keine Ausrüstung | Bestanden |
| E2E-Solo-Einstieg | Start ohne Anmeldung, LLM oder menschliches Team bis zum Solo-Loadout | Bestanden |
| E2E-WebGL-Fallback | Erzwungener Nicht-WebGL-Pfad lässt Zugang und Community sichtbar und bedienbar | Bestanden |

Der reproduzierbare Befehl für die Browserprüfung lautet:

```bash
AURION_E2E_BASE_URL=http://127.0.0.1:3000 pnpm test:e2e -- --workers=1
```

Der Test wird absichtlich mit **einem Worker** und dem vorhandenen Chromium ausgeführt, damit er innerhalb der begrenzten Laufzeitressourcen stabil bleibt. Die Browser-Suite umfasst drei Smoke-Tests und wurde vollständig bestanden.
