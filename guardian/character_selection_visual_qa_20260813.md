# Character Selection Visual QA — 2026-08-13

Die Desktop-Vollansicht zeigt die neue Auswahl **Wayfinder** und **Veilguard** unmittelbar zwischen dem Explorer/Echo-Tableau und der Team-Verbindung. Die aktive Option ist durch cyanfarbenen Rahmen und Bronzesignet klar von der zweiten Option getrennt.

Beide Karten bleiben innerhalb der bestehenden linksbündigen Sternwarten-Konsole, überdecken weder die Partnerauswahl noch die Verbindungsaktion und fügen sich über die vorhandene Bronze-/Petrol-/Cyan-Sprache in die Seite ein.

## Ergebnis

Die beiden riggten und animierten Standardcharaktere sind für Gastnutzer sichtbar und vor der Expedition auswählbar. Ein authentifiziertes, freigegebenes persönliches Charaktermodell bleibt als vorrangige Auswahl in der bestehenden Asset-Konsole erhalten.

## Browser-Smoke-Test

Die Testumgebung ohne WebGL-Unterstützung fiel zunächst in die vorhandene Fehlergrenze. Die Canvas-Initialisierung wurde daraufhin abgefangen; die Nicht-WebGL-Laufzeit liefert nun die Zugangsoberfläche ohne Browserfehler aus. Im echten Browser-Smoke-Test wurden anschließend beide Auswahlpfade nacheinander ausgeführt:

| Schritt | Erwartung | Ergebnis |
|---|---|---|
| Veilguard auswählen | Die Veilguard erhält den aktiven Auswahlzustand. | Bestanden; der aktive Button enthält `Veilguard` und die Konsole blieb fehlerfrei. |
| Wayfinder auswählen | Der Wayfinder übernimmt den aktiven Auswahlzustand. | Bestanden; der aktive Button enthält `Wayfinder` und die Konsole blieb fehlerfrei. |

Der Testbrowser meldete nach der Absicherung **keine Console Errors**. Beide GLBs sind zudem lokal gegen die 16-MiB-Grenze, Mesh, Skin und drei Animationsclips geprüft worden.

## Gastkatalog-Smoke-Test

Als nicht angemeldeter Nutzer wurde der Asset-Bereich geöffnet. Die reale Browseransicht zeigte ausschließlich den erklärten **„Öffentlichen Aurion-Katalog“**, Wayfinder und Veilguard sowie je einen lesenden Link „Modell ansehen“. Uploadfelder, Einreichungsformular, persönliche Einreichungen, Charakterausrüstung und private Informationen waren nicht vorhanden. Der Testbrowser meldete dabei **keine Console Errors**.

## Solo-Einstieg-Smoke-Test

Der Browser testete „Allein die Sternwarte betreten“ als nicht angemeldeter Nutzer. Der Einstieg führte ohne LLM-Token, Gateway-Session oder menschliches Team direkt zur Teamkonfiguration. Dort zeigte der Echo-Scout den Status `SOLO // ECHO-AUTOMATIK`; die auswählbaren Echo-Slots blieben direkt steuerbar. Der Testbrowser meldete **keine Console Errors**.
