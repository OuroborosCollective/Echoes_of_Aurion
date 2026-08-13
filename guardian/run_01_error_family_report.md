# Guardian Error-Family Run 01

**Basisrevision:** `064f24411aea1e820bd4609e647b3fc1f83c8a50` (`origin/main` zum Laufbeginn)
**Lokale Arbeitsrevision:** `169c495b6ec64f9465339ba46d61598c1d7a0f1f` vor diesem Fixsatz
**Scope:** MCP-Gateway, React↔Babylon-Lebensdauer, Touch-Bewegung und Operationsoberfläche.
**Status:** Fixsatz implementiert; PR-, Mirror- und exakte Produktionsrevision-Nachweise sind noch offen.

| Familie | Befundklasse | Evidenz | Minimaler Fix | Prüfung | Status |
| --- | --- | --- | --- | --- | --- |
| F1: MCP-Proxy-Hostvertrag | Vertrags-/Deploymentdrift | Der externe Gateway-Aufruf erhielt `Invalid Host` für den verifizierten Plattformhost; dieselbe Host-Initialisierung war lokal nach Allowlist-Anpassung erfolgreich. | Explizite, getestete Hostauflösung für direkte und erlaubte weitergeleitete Hosts statt einer nur am Ursprungshost orientierten Prüfung. | Drei Unit-Tests für erlaubten Plattformhost, erlaubten Forwarded Host und fremden Ursprungshost. | **BELEGT im lokalen Runtimepfad; externe Revision offen.** |
| F2: Canvas-Initialisierungsrennen | Lebensdauer-/Ressourcenfehler | `createGameScene` war asynchron; das Cleanup konnte Engine und Canvas vor dem `then` entsorgen, während der Callback danach dennoch den Render-Loop starten konnte. | Disposed-Gate, sofortige Entsorgung eines späten Scene-Handles und explizites Stoppen des Render-Loops. | TypeScript-Prüfung; frischer Seitenreload rendert nach Modulinitialisierung die Startoberfläche. | **BELEGT statisch und im Startpfad.** |
| F3: Touch ohne Laufzustand | Eingabe↔Animationsvertrag | Pointer-Befehle bewegen den Explorer direkt, setzen aber keinen Tastaturzustand; die Laufanimation leitete Bewegung ausschließlich aus `keys` ab. | Kurzlebiger, an bestätigte Touch-Befehle gebundener Bewegungszeitraum wird in die Laufanimation einbezogen. | TypeScript-Prüfung; genaue Eventbindung in `aurion:human-command`. | **BELEGT statisch; Missions-E2E offen.** |
| F4: Operations ohne Fehlerhülle | UI↔tRPC-Resilienz | Die Route verwendete Profile direkt als optionale Werte, ohne getrennte Lade- und Fehleroberfläche; bei fehlender/unterbrochener Sitzung blieb der Verwaltungszustand unklar. | Explizite serverbezogene Lade- und Fehleransichten vor der Verwaltungskonsole. | TypeScript-Prüfung; bestehendes Auth-Gate bleibt serverseitig. | **BELEGT im Quellvertrag; angemeldete E2E-Prüfung offen.** |

## Abgeleitete Folgeflächen

Die angrenzenden Konsumenten wurden gegenprüft: Gateway-Token verbleiben serverseitig als Digest; Operations-Adminabfragen bleiben über `user.role === "admin"` aktiviert; der Canvas-Cleanup entfernt Listener weiterhin symmetrisch. Für diesen Lauf wurde **kein** neuer DB-Write-Pfad, keine Provider-Logik und keine Berechtigungsumgehung ergänzt.

## Checks

| Check | Ergebnis |
| --- | --- |
| `pnpm check` | bestanden |
| `pnpm test` | bestanden: 4 Testdateien, 15 Tests |
| Host-Initialisierung lokal mit verifiziertem Host | HTTP 200, MCP-Initialisierung bestätigt |
| Frischer Browserstart | Startoberfläche nach Modulinitialisierung sichtbar |

## Guardian-Verdikt

**Fix-Branch zulässig, aber nicht produktionsverifiziert.** Der lokale Runtime- und Testnachweis ist vorhanden. Eine Gleichsetzung mit der externen Runtime ist bis zum revisionsgleichen Publish-Readback ausdrücklich **OFFEN**.
