# Aurion ↔ Godot: echte Live-Bild-Parität, fail-closed

## Zweck

Der Workflow `.github/workflows/aurion-live-godot-view-parity.yml` darf **nur grün** werden, wenn zwei tatsächlich aufgenommene, nicht simulierte Welt-Viewports auf demselben laufenden Aurion-Quellzustand beruhen **und** visuell übereinstimmen. Er trennt:

1. **Autorität:** dieselbe live Docker-Image-ID und volle Aurion-Source-Revision, World-/Zone-ID, Tick, kausaler Receipt-Hash und State-Hash.
2. **Sicht:** exakt gleicher Kamerastandort, Kameraziel, Sichtfeld und Pixel-Viewport.
3. **Weltgehalt:** mindestens ein bestätigter Terrain-Chunk, mindestens zwei echte Welt-/Actor-Assets, ein bestätigter Actor und sichtbare Himmelsprojektion auf **beiden** Clients. Platzhalter und ein einzelner Clockwork Stalker reichen ausdrücklich nicht.
4. **Bild:** lokale tile-basierte SSIM ≥ 0,62 und normalisierter mittlerer Pixelfehler ≤ 0,22 bei identischen Pixelmaßen. Diese beiden Schwellen sind ein **konservatives Diagnose-Gate**, keine wissenschaftliche Garantie zweier äquivalenter Engines. Bei unterschiedlichen Licht-/Shader-Pipelines kann ein echter Gleichstand rot bleiben; niemals wird die Schwelle abgesenkt, um einen Lauf grün zu machen.
5. **Frische:** beide Aufnahmen maximal 120 Sekunden alt und höchstens zwei Sekunden auseinander. Synthetische Tests belegen nur Comparator-Logik, niemals Live-Parität.

Der Aurion-Server ist die **einzige** Welt-Autorität. Der Browser und Godot liefern jeweils ausschließlich rendernde Projektionen. Es gibt keine serverseitige "Referenz-PNG" ohne einen echten visuellen Renderer und keine lokale Seed-/Terrain-Rekonstruktion als Ersatz.

## Status am 31.10.2026, read-only VPS-Diagnose

- `echoes-of-aurion-aurion-1` läuft mit dem beobachteten aktiven Image (per Docker separat neu lesen); dies allein beweist keine sichtbare Welt.
- Godot 4.7.2 läuft per `serverin-aurion-godot-editor.service` mit `--editor` und Xvfb.
- `aurion-godot-bridge.service` war **inactive**, und es gab keinen Listener auf `127.0.0.1:8765` sowie keinen veröffentlichen Godot-Feed-Listener auf `39220`.
- Die Editor-Bridge `server/godotBridge/aurionAdapter.ts` sendet derzeit Spieler, Monster und eine flache Zone/Region, aber **keine** bestätigten Terrain-/Asset-/Himmelsdaten. `godot-client/addons/aurion_bridge/entity_3d.gd` rendert Kapseln, Kugeln, Würfel und Labels. Dies ist nicht die volle Webgame-Welt.
- Die im VPS-Editor laufende Godot-Projektkopie ist kein durch `.git` nachgewiesener Source-Checkout. Die lokale Editor-Ansicht ist zudem nicht identisch mit dem eigenen spielbaren Godot-Viewport `godot-client/app/main.tscn`.
- Eine rohe Xvfb-Bildschirmaufnahme ohne die bestehende X11-Autorisierung wurde korrekt abgewiesen. Keine Umgehung der privaten Display-Authentifizierung.
- Mit der **vorhandenen** `aurion-deploy`-X11-Berechtigung wurde anschließend eine echte Xvfb-Bildschirmaufnahme des VPS-Editors read-only geprüft. Der aktuelle Bildschirm zeigte den Aurion-Anmeldedialog, **keinen Welt-Viewport**. Im automatisierten Bildpaar ist `observedScreen: "login"` deshalb ein expliziter FAIL mit `GODOT_LIVE_EDITOR_LOGIN_SCREEN_NOT_WORLD`; die Aufnahme gehört nicht als Weltbild in ein grünes Vergleichspaar.

**Bis eine autorisierte, servergebundene Capture-Lane existiert, muss der echte Workflow rot bleiben.** Ein grüner Fixture-Test ist nie ein Produktionsbeweis.

## Voraussetzung: zwei originale, bestätigte Capture-Sets

Der private Capture-Operator muss zwei **unmanipulierte Welt-Viewport-PNGs** bei exakt demselben kanonischen Receipt und gleicher Kamera erzeugen und zusammen mit dessen verifizierbaren Herkunftsdaten in einer durch den Runner lesbaren Sitzung ablegen:

```text
/srv/serverin/evidence/aurion-live-view-parity/<capture_id>/
  aurion.png           # tatsächlich im authentifizierten Aurion-Webspiel gerendert
  aurion.json          # Provenienz aus genau diesem Live-Frame
  godot.png            # tatsächlich im Live-Godot-Viewport gerendert
  godot.json           # Provenienz aus genau diesem Live-Frame
```

`<capture_id>` ist 1–64 Zeichen `[A-Za-z0-9_-]`, keine Pfade. **Keine Tokens, Cookies, JWTs, internen Header, privaten Editor-Leisten oder Login-Bildschirme** in PNGs/JSONs. Diese vier Dateien stammen aus zwei unabhängigen Live-Render-Captures. Die Pipeline erstellt sie **nicht selbst** und ersetzt sie ausdrücklich nicht durch vorhandene Fixture-PNGs, Godot-Editor-Screenshots mit Werkzeugleisten oder aus dem Server berechnete Attrappen. Die Capture-Produzenten sind eine **noch offene Integration**.

JSON-Vertrag pro Aufnahme (die Werte unten sind ausschließlich Feld-/Typbeispiele, **keine** Laufzeitbelege):

```json
{
  "schema": "aurion.live-view.capture.v1",
  "source": "aurion-web",
  "captureKind": "world-viewport",
  "captureMode": "authenticated-live",
  "observedScreen": "gameplay-world",
  "capturedAtUtc": "<UTC-Z-Zeitstempel>",
  "identity": {
    "worldId": "<server-bestätigte Welt>",
    "zoneId": "<server-bestätigte Zone>",
    "sourceRevision": "<40-stellige aktive Server-SHA>",
    "runtimeImageId": "sha256:<64-stellige Docker-Image-ID>",
    "tick": 1,
    "receiptHash": "sha256:<64 Hex-Zeichen>",
    "stateHash": "sha256:<64 Hex-Zeichen>"
  },
  "camera": {
    "positionMm": [0, 2000, 6000],
    "targetMm": [0, 1000, 0],
    "fovMilliDeg": 60000,
    "viewportPx": [1280, 720]
  },
  "projection": {
    "confirmedChunks": ["<serverseitige Chunk-Identität und Hash>"],
    "visibleEntityIds": ["<bestätigte Entity-ID>"],
    "renderedAssetIds": ["<freigegebenes Terrain-Asset>", "<freigegebenes Modell>"],
    "skyType": "procedural",
    "skyVisible": true
  },
  "imageSha256": "<SHA256 der unveränderten zugehörigen PNG-Bytes>"
}
```

In `godot.json` ist `source` **`godot-live-editor`**, alle übrigen Werte müssen aus dem tatsächlichen Godot-Readback stammen, **nicht** aus der Aurion-Datei kopiert werden. Die SHA des Produktionscontainers sowie dessen Image-ID liest der CI-Runner unabhängig direkt via `docker inspect`. Das sind Identitätskontrollen, keine kryptografische Attestation des Screenshots. Ein manipulierender Capture-Produzent kann mit diesem ersten Gate noch nicht ausgeschlossen werden; für eine starke fälschungssichere Beweiskette ist ein serververifizierter Capture-Receipt-Export in beiden Renderern nötig.

## Aufruf, fehlgeschlagene Nachweise und Diagnose

GitHub → **Actions** → **Aurion/Godot live-world visual parity** → **Run workflow** → `capture_id`. **Nur `workflow_dispatch`** löst die echte Paritätsprüfung aus. Dieser Workflow kann ausschließlich dann grün werden, wenn Unit-Gate **und echter Live-Bildvergleich** bestanden haben. Die separate `.github/workflows/aurion-live-godot-parity-contract.yml` führt bei Pull Requests ausschließlich synthetische Negativtests aus. Deren grüner Status ist **kein Live-Welt-Beweis**. Die reale Parität läuft auf dem freigegebenen VPS-Runner `[self-hosted, Linux, X64, aurion-static]`.

Fehlende Bridge, Stale-Capture, falsche Server-SHA/Receipt-/Kameradaten, schwarzer Himmel, Neutralboden, fehlende Chunks oder inkompatible Pixel ergeben **FAIL**, nicht `skipped` oder „Probe erfolgreich". Immer wird ein Report erzeugt, soweit der Python-Schritt überhaupt starten konnte:

- `report.md`: deutsche Fehlercodes und Diagnose, was der Godot-Viewport erkennbar zeigte;
- `parity.json`: maschinenlesbare Wahrheits-/Sichtbarkeits- und Bildmetriken;
- `aurion-web-preview.png` und `godot-live-editor-preview.png` jeweils **nur falls originales PNG verfügbar**;
- `difference.png` **nur bei zwei verwendbaren, gleich großen PNGs**.

Die Analyse nennt beispielsweise „nur ein Modell“, „keine bestätigten Chunks“, „schwarzer Himmel“, „Bridge nicht erreichbar“, „abweichende Kamera“ oder „andere Pixel“. Es gibt keine pauschale grüne Abnahme bei vorhandener Verbindung und kein Schreiben an Produktionsdatenbank, Godot-Szenen oder Tick-Runtime.

## Nächste Integrationsgrenzen

1. Produktions-Aurion-Feed und Godot-Bridge revisions-/digestgebunden tatsächlich aktivieren und unabhängig zurücklesen, ohne einen zusätzlichen Authority-Pfad.
2. Aurion-World-Chunk-/Authoring-Readbacks einschließlich Terrain, GLB-Assets, Objekten und Sky der Godot-Bildprojektion zuführen; derzeit sendet die reine Bridge nur Actor-Primitive.
3. Zwei authorisierte, reproduzierbare read-only Viewport-Capture-Produzenten integrieren, die Camera/Receipt/Asset-Provenienz **aus den jeweiligen echten Laufzeiten** exportieren. Keine Secret-Ausgabe.
4. Erst dann den Dispatch gegen die aktive Revision ausführen, beide PNGs + Receipts zurücklesen und einen echten PASS bewerten.
