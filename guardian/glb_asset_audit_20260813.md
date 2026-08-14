# GLB-Assetaudit — Befund

**Zeitpunkt:** 13. August 2026
**Prüfbereich:** Aurion-Projektverzeichnis, statischer Medienbereich, Downloadbereich und produktiver `glbAssets`-Katalog.

| Quelle | Befund | Konsequenz |
| --- | --- | --- |
| Lokale Aurion-/Medien-/Downloadbereiche | Keine `.glb`-Datei gefunden | Keine Mesh-, Material-, Skelett- oder Animationsanalyse möglich |
| Produktiver GLB-Katalog | `glbAssets` existiert schema- und datenbankseitig, enthält aber keine Zeile | Kein registriertes S3-Modell ist für Review oder Zuweisung verfügbar |
| Live-Missionsszene | Verwendet weiterhin prozedurale Babylon-Figuren | Explorer-, Echo-Scout- und Sentinel-GLB-Austausch bleibt ein eigener Umsetzungsschritt |

Die frühere `glb_assets`-Fehlermeldung war eine fehlerhafte snake_case-Abfrage. Das tatsächliche Drizzle-Tabellenmodell nutzt `glbAssets` und ist produktiv vorhanden.

Für eine technische Modellfreigabe wird mindestens ein echtes GLB mit nachweisbarer Node-/Mesh-Struktur, einem riggbaren Skelett oder klarer statischer Zuordnung, PBR-Materialien und – bei Figuren – Idle-, Lauf-, Treffer- und Angriffsclips benötigt.
