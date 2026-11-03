# Aurion ↔ Godot: visueller Vergleich und Live-Nachweis

Der Workflow **Aurion / Godot first-start live parity** startet einen frischen Godot-Editor. Dieser öffnet über `EditorInterface.play_custom_scene` die echte `authoring_entry.tscn` und damit den tatsächlichen Spielclient. Verglichen wird dessen Welt-Viewport mit dem authentifizierten Browser-Spiel. Die primitive Vorschau des alten Bridge-Docks ist keine Spielansicht.

Der Collector verwendet zwei bereits angemeldete, getrennte Konten und den echten Native-Auth-PKCE-Ablauf. Aurion erlaubt nur eine aktive Spielverbindung pro Konto: Dasselbe Konto würde beim zweiten Start den ersten Client verdrängen und wird vor dem Spielstart abgewiesen. Beide Clients empfangen dieselben Aurion-Snapshots und nehmen den ersten gerenderten Snapshot nach einer gemeinsamen zukünftigen Tick-Untergrenze auf. Leerlauf-Ticks ohne Snapshot-Versand werden damit übersprungen. Unterschiedliche erste Aufnahme-Ticks werden rot; es gibt keine automatische Auswahl eines besser passenden Folgebildes. „Erststart“ bezeichnet hier die erste Spielsitzung mit dem ersten abgestimmten Aufnahmeversuch nach Anmeldung und Terrain-Eingang, nicht den Lade- oder Anmeldebildschirm.

## Grenze und Diagnose

Ein Pixel gilt als abweichend, sobald mindestens ein RGB-Kanal um mehr als 24 von 255 Stufen abweicht. **Mehr als 75% abweichende Originalpixel machen den Test rot. Genau 75% sind zulässig.** Die Entscheidung erfolgt mit ganzzahliger Pixelzahl vor jeder Rundung. Es gibt keine Skalierung, Bildausrichtung, Masken oder Farbkorrektur. MAE und SSIM des älteren Diagnose-Comparators sind Zusatzmetriken und ersetzen diese Grenze nicht.

Außerdem müssen die Aufnahmebedingungen stimmen: gleiche Revision und Runtime-Image vor und nach der Aufnahme, gleicher Tick und kanonischer Snapshot-Inhalt einschließlich Ressourcen, gleiche bestätigte Spielerposition, passende tatsächliche Kamera und Pixelmaße, aktive authentifizierte Verbindungen sowie vollständig geladenes Terrain und sichtbare Spieler-/NPC-Modelle. Die Godot-Datei wird gegen den SHA-256-Beleg des gesperrten Bootstrap-Archivs geprüft. Ein aus MariaDB gelesener Receipt und das unabhängige reine `causality.oracleRange`-Replay müssen zum aufgenommenen Tick passen. Der Receipt wird bei noch ausstehender Persistenz höchstens zehn Sekunden erneut gelesen; die Bilder bleiben unverändert. Gleiche schwarze oder leere Bilder reichen nicht aus.

Der Workflow zeigt Rot/Grün, Prozentwert und Ursachen im Job Summary. Sein Artefakt enthält:

- `aurion.png` und `godot.png`: unveränderte Welt-Viewport-Bilder;
- `difference.png`: hervorgehobene Bildunterschiede;
- `report.html`, `report.md` und `parity.json`: Status, Ursachen und Kamera-/Asset-/Terrain-Readbacks;
- `capture-index.json` und die beiden Observation-Dateien: Nonce, Bild-Hashes, Editor-/Spielprozess-Zuordnung, Revision und Receipt-/Replay-Readback.

Fehler vor der Aufnahme erzeugen ebenfalls einen roten Bericht. Beispielsweise unterscheiden sich eine unerreichbare Anmeldung, fehlendes Terrain, falsche Kameraprojektion, ausstehende GLBs und eine tatsächliche Bildabweichung. Zugangsdaten, PKCE-Rückgaben, Browser-Traces und Cookies werden nicht als Artefakte gespeichert. Vollständige Zone-Snapshots bleiben im privaten Aufnahmeprozess: Ein temporärer, nicht exportierter HMAC-Schlüssel bindet deren kanonischen Inhalt für den Paarvergleich. Die Artefakte enthalten nur die Vergleichsdigests und Zähler; Spieler-IDs, individuelle Positionen und Kampfdatensätze werden nicht exportiert. Auch absolute Kameraposition und Blickziel bleiben privat: getrennte HMAC-Werte erhalten ihren exakten Vergleich. Für die Perspektivdiagnose bleiben der relative Abstand zwischen Kamera und Blickziel sowie das Sichtfeld lesbar. Eine gemeinsame Verschiebung beider Kamerapunkte bleibt ein Fehler, selbst wenn Abstand und Sichtfeld übereinstimmen.

## Geschützter Live-Lauf

Der Workflow wird nach Auslieferung derselben geprüften Revision auf dem Default-Branch manuell gestartet. Er läuft ausschließlich im Environment `production` auf dem vorhandenen Runner mit den Labels `self-hosted`, `Linux`, `X64`, `aurion-static`. PR- und fremde Dispatch-Refs dürfen diesen Runner nicht über diesen Workflow erreichen.

Für den Arbeitsplatz sind folgende Environment-Variablen zu konfigurieren:

| Variable | Bedeutung |
| --- | --- |
| `AURION_PARITY_CDP_URL` | Nur lokales HTTP-CDP, z. B. `http://127.0.0.1:9222`, mit einer bereits angemeldeten, zum Receipt-Lesen berechtigten Aurion-Sitzung |
| `AURION_PARITY_NATIVE_CDP_URL` | Separater lokaler Browser, z. B. `http://127.0.0.1:9223`, mit einem anderen bereits angemeldeten Aurion-Konto für die echte Native-Anmeldung |
| `AURION_GODOT_EXECUTABLE` | Absoluter Pfad zum mit `scripts/godot/bootstrap.mjs` installierten Editor; der zugehörige `editor-receipt.json` muss vorhanden sein |
| `AURION_PARITY_DISPLAY` | Vorhandenes X-Display des Testarbeitsplatzes |

Für den Test entsteht eine private Projektkopie mit aktivierter Aurion-Bridge; Spielskripte und Assets bleiben identisch. Es wird ein eigener Editor-Prozess gestartet und nur diese Prozessgruppe beendet. Der vorhandene Benutzer-Editor bleibt unangetastet. Eine fehlende Konfiguration, abgelaufene Sitzung, nicht abgeschlossene Charakterauswahl oder andere ausgelieferte Revision ist ein konkreter roter Blocker und keine bestandene Live-Abnahme.

## Regression und Vertrauensgrenze

PR-CI prüft die 75%-Grenze, Bildintegrität, unvollständige Captures, Kontentrennung, Editor-Hash, Persistenzverzögerung, Ressourcen, Kamera-/Asset-/Terrain-Diagnosen und den einmaligen Aufnahmezeitpunkt mit ausdrücklich synthetischen Kontrollen. Godot-CI importiert die tatsächlichen Editor-Skripte und prüft mit einem Display den frischen Editor-Spielstart sowie die Original-Texturmaße. Diese grünen Tests beweisen keine Produktionsparität.

Nur der geschützte Workflow erzeugt und prüft die Live-Aufnahmen selbst. Ein lokal mit frei bearbeiteten Sidecars aufgerufenes `startup_view_report.py` kann deren Herkunft nicht beweisen. Der ältere `live_view_parity.py` bleibt entsprechend ein Diagnosewerkzeug für bereitgestellte Dateien.

Aurion bleibt alleinige Autorität für Welt und Gameplay. Die Aufnahme führt keine Bewegungs-, Kampf- oder WorldStudio-Schreibaktionen aus. Nach einem roten Live-Lauf wird der zuerst belegte Fehler im zuständigen Client oder Transport korrigiert und derselbe Test mit unveränderter Grenze erneut ausgeführt. Erst ein tatsächlicher grüner Live-Lauf belegt die angeforderte visuelle Abnahme.
