# Admin- und Progressionsausbau — Nachweis

**Zeitpunkt:** 13. August 2026  
**Umfang:** Serverautorisiertes Spielerverzeichnis, GLB-Aufnahme mit S3-Speicherreferenz, Review/Zuweisung sowie geheimnisfreie Monetarisierungsplatzierungen.

## Bestätigte Schutzgrenzen

| Fläche | Nachweis | Ergebnis |
| --- | --- | --- |
| Adminzugriff | tRPC `adminProcedure` wurde für Spielerverzeichnis, Assets und Monetarisierung verwendet; Unit-Tests prüfen nicht administrative und anonyme Kontexte. | Bestanden |
| GLB-Aufnahme | Server prüft kanonisches Base64, GLB-v2-Magic, deklarierte Gesamtlänge, 24-MiB-Grenze und SHA-256 vor S3-Schreibzugriff und Metadaten-Readback. | Durch Unit-Tests und Quellvertrag belegt |
| Asset-Aktivierung | Nur freigegebene, typkompatible Assets werden in einer Transaktion einem Ziel zugewiesen; vorher aktive Zuweisungen für dasselbe Ziel werden deaktiviert. | Quellvertrag belegt |
| Monetarisierung | Placement-Konfigurationen akzeptieren nur JSON-Objekte und sperren credential-typische Schlüssel wie API-Key, Token, Secret oder Password. | Durch Unit-Tests belegt |

## Prüfung

| Check | Ergebnis |
| --- | --- |
| `pnpm check` | bestanden |
| `pnpm test` | bestanden: 6 Testdateien, 21 Tests |
| `git diff --check` | bestanden |
| Operationsroute, Desktop 1280 × 720 | Profilwerte, Seitenleiste und sichtbare Admin-Registerkarte in der authentifizierten Vorschau lesbar |
| Operationsroute, Android-ähnlich 375 × 812 | Mobile Kopfzeile und vertikal gestapelte Statistikblöcke ohne horizontales Abschneiden lesbar |

## Offene, bewusst nicht behauptete Nachweise

Ein echter GLB-Upload samt S3-/Datenbank-Readback, Review und Zielzuweisung wurde nicht mit einem Testasset ausgelöst. Auch die Speicherung einer echten Werbe-, Offerwall- oder Vote-Provider-Konfiguration wurde nicht ausgelöst. Die installierte Browserautomation konnte nicht gestartet werden, weil der konfigurierte Firefox-Browser nicht vorhanden war; daraus wurde kein Ersatztest abgeleitet. Diese Nachweise bleiben ausdrücklich offen.
