# Aurion ↔ Godot: visueller Vergleich und Live-Nachweis

Der Workflow **Aurion / Godot first-start live parity** startet einen frischen Godot-Editor. Dieser öffnet über `EditorInterface.play_custom_scene` die echte `authoring_entry.tscn` und damit den tatsächlichen Spielclient. Verglichen wird dessen Welt-Viewport mit dem authentifizierten Browser-Spiel. Die primitive Vorschau des alten Bridge-Docks ist keine Spielansicht.

Der Collector verwendet die bestehende Browser-Sitzung und den echten Native-Auth-PKCE-Ablauf. Beide Clients empfangen Aurion-Snapshots und nehmen genau einen gemeinsamen zukünftigen Tick auf. Ein verpasster Tick wird rot; es gibt keine automatische Auswahl eines besser passenden Folgebildes. „Erststart“ bezeichnet hier die erste Spielsitzung mit dem ersten abgestimmten Aufnahmeversuch nach Anmeldung und Terrain-Eingang, nicht den Lade- oder Anmeldebildschirm.

## Grenze und Diagnose

Ein Pixel gilt als abweichend, sobald mindestens ein RGB-Kanal um mehr als 24 von 255 Stufen abweicht. **Mehr als 75% abweichende Originalpixel machen den Test rot. Genau 75% sind zulässig.** Die Entscheidung erfolgt mit ganzzahliger Pixelzahl vor jeder Rundung. Es gibt keine Skalierung, Bildausrichtung, Masken oder Farbkorrektur. MAE und SSIM des älteren Diagnose-Comparators sind Zusatzmetriken und ersetzen diese Grenze nicht.

Außerdem müssen die Aufnahmebedingungen stimmen: gleiche Revision und Runtime-Image vor und nach der Aufnahme, gleicher Tick und kanonischer Snapshot-Inhalt, passende tatsächliche Kamera und Pixelmaße, aktive authentifizierte Verbindungen sowie sichtbares Terrain und Modelle. Ein aus MariaDB gelesener Receipt und das unabhängige reine `causality.oracleRange`-Replay müssen zum aufgenommenen Tick passen. Gleiche schwarze oder leere Bilder reichen nicht aus.

Der Workflow zeigt Rot/Grün, Prozentwert und Ursachen im Job Summary. Sein Artefakt enthält:

- `aurion.png` und `godot.png`: unveränderte Welt-Viewport-Bilder;
- `difference.png`: hervorgehobene Bildunterschiede;
- `report.html`, `report.md` und `parity.json`: Status, Ursachen und Kamera-/Asset-/Terrain-Readbacks;
- `capture-index.json` und die beiden Observation-Dateien: Nonce, Bild-Hashes, Editor-/Spielprozess-Zuordnung, Revision und Receipt-/Replay-Readback.

Fehler vor der Aufnahme erzeugen ebenfalls einen roten Bericht. Beispielsweise unterscheiden sich eine unerreichbare Anmeldung, fehlendes Terrain, falsche Kameraprojektion, ausstehende GLBs und eine tatsächliche Bildabweichung. Zugangsdaten, PKCE-Rückgaben, Browser-Traces und Cookies werden nicht als Artefakte gespeichert. Vollständige Zone-Snapshots bleiben im privaten Aufnahmeprozess: Ein temporärer, nicht exportierter HMAC-Schlüssel bindet deren kanonischen Inhalt für den Paarvergleich. Die Artefakte enthalten nur die Vergleichsdigests und Zähler; Spieler-IDs, individuelle Positionen und Kampfdatensätze werden nicht exportiert. Kamerakoordinaten bleiben für die angeforderte Perspektivdiagnose erhalten.

## Geschützter Live-Lauf

Der Workflow wird nach Auslieferung derselben geprüften Revision auf dem Default-Branch manuell gestartet. Er läuft ausschließlich im Environment `production` auf dem vorhandenen Runner mit den Labels `self-hosted`, `Linux`, `X64`, `aurion-static`. PR- und fremde Dispatch-Refs dürfen diesen Runner nicht über diesen Workflow erreichen.

Für den Arbeitsplatz sind folgende Environment-Variablen zu konfigurieren:

| Variable | Bedeutung |
| --- | --- |
| `AURION_PARITY_CDP_URL` | Nur lokales HTTP-CDP, z. B. `http://127.0.0.1:9222`, mit einer bereits angemeldeten, zum Receipt-Lesen berechtigten Aurion-Sitzung |
| `AURION_GODOT_EXECUTABLE` | Absoluter Pfad zum geprüften Godot-Editor |
| `AURION_PARITY_DISPLAY` | Vorhandenes X-Display des Testarbeitsplatzes |

Für den Test entsteht eine private Projektkopie mit aktivierter Aurion-Bridge; Spielskripte und Assets bleiben identisch. Es wird ein eigener Editor-Prozess gestartet und nur diese Prozessgruppe beendet. Der vorhandene Benutzer-Editor bleibt unangetastet. Eine fehlende Konfiguration, abgelaufene Sitzung, nicht abgeschlossene Charakterauswahl oder andere ausgelieferte Revision ist ein konkreter roter Blocker und keine bestandene Live-Abnahme.

## Regression und Vertrauensgrenze

PR-CI prüft die 75%-Grenze, Bildintegrität, unvollständige Captures, Metadatenfehler, Kamera-/Asset-/Terrain-Diagnosen und den einmaligen Aufnahmezeitpunkt mit ausdrücklich synthetischen Kontrollen. Godot-CI importiert und prüft die tatsächlichen Editor-Skripte. Diese grünen Tests beweisen keine Produktionsparität.

Nur der geschützte Workflow erzeugt und prüft die Live-Aufnahmen selbst. Ein lokal mit frei bearbeiteten Sidecars aufgerufenes `startup_view_report.py` kann deren Herkunft nicht beweisen. Der ältere `live_view_parity.py` bleibt entsprechend ein Diagnosewerkzeug für bereitgestellte Dateien.

Aurion bleibt alleinige Autorität für Welt und Gameplay. Die Aufnahme führt keine Bewegungs-, Kampf- oder WorldStudio-Schreibaktionen aus. Nach einem roten Live-Lauf wird der zuerst belegte Fehler im zuständigen Client oder Transport korrigiert und derselbe Test mit unveränderter Grenze erneut ausgeführt. Erst ein tatsächlicher grüner Live-Lauf belegt die angeforderte visuelle Abnahme.
