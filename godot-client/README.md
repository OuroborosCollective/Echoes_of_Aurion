# Echoes of Aurion — Godot-Client

Godot 4.7.2/GDScript, derzeit eine offline Startansicht. `project.godot` enthält die fertige Startszene und InputMap. Kein Inspector-Schritt ist erforderlich. Online-Anmeldung, WSS, GLB-Welt und Gameplayprojektion folgen in ihren eigenen Migrationsschritten.

| Ordner | Grenze |
|---|---|
| `app/` | Startszene und Lebenszyklus |
| `config/` | geprüfte Serverbasis-URL, Buildidentität, Geräteprofile |
| `net/` | Wireverträge; später Auth-/HTTPS-/WSS-Adapter |
| `projection/` | Darstellung bestätigter Zustände, keine Simulation |
| `world/`, `actors/` | spätere Welt-/Akteursdarstellung |
| `ui/mobile/`, `ui/screens/` | spätere Touch- und Funktionsoberflächen |
| `assets/` | spätere gepinnte Darstellungsressourcen; keine Gameplayregeln |
| `addons/` | nur überprüfte und versionierte Erweiterungen |
| `tests/` | echte Godot-Tests und getrennte Software-Renderaufnahme |

Die leeren Modulordner sind ausdrücklich vorbereitete Grenzen und enthalten noch keine Funktion. Aurion bleibt alleinige Gameplay-, Welt- und Datenbankautorität. Kein Clientmodul importiert Servercode oder erhält Datenbankzugang.

Die Startansicht enthält den ersten nativen Anmeldeschritt hinter `aurion/native_auth_start_enabled`. Der Standard bleibt `false`, solange Aurions Produktionsroute absichtlich nicht bereit ist. Nur ein freigegebener Build sendet den flüchtigen State/PKCE-Startvertrag einmalig an Aurion und öffnet ausschließlich die streng validierte `arelogic.space`-Browser-URL; HTTP-, JSON-, Vertrags-, Redirect-, Timeout- und Browserfehler schließen den lokalen Vorgang. Token-Exchange, sicherer Refresh-Speicher und verifizierte Android-App-Link-Zustellung bleiben getrennte, noch nicht belegte Schritte.

`runtime_config.gd` akzeptiert die genaue HTTPS-Produktbasis `https://arelogic.space`. Lokale Testadressen sind nur bei expliziter Übergabe des Testparameters erlaubt. Benutzerinfo, fremde Hosts, HTTP-Produktion, Pfade und Querytokens werden abgewiesen. Buildidentitäten entsprechen dem bestehenden Zonenticket-Zeichensatz. Ungültige Konfiguration sperrt die Startansicht; es wird kein Verbindungsversuch simuliert.

Compatibility ist der Ausgangsrenderer. Die Oberfläche verwendet Container und Fenstermaße, damit ein schmales Display keine feste 1280er-Oberfläche verkleinert. Die Startansicht begrenzt die Framerate auf 30 und zeichnet den statischen Hintergrund nur bei Größenänderungen neu. Diese Einstellung ist kein FPS-Nachweis.

`.godot/` bleibt lokal; generierte `.gd.uid`-Dateien werden mitgeführt. Der GitHub-Workflow importiert aus einem frischen Checkout, testet Startszene und URLgrenzen und erzeugt echte PNGs unter Xvfb/llvmpipe. Software-Rendering ist weder Android- noch GPU-Leistungsevidence.

Der Agent führt Tests und Builds aus. Der Owner muss keine Dateien verschieben oder Engine-Einstellungen ändern. Eine installierbare APK folgt erst mit G08.
