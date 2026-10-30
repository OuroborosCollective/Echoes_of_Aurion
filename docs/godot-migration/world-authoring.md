# Godot-Weltentwürfe mit Aurion prüfen

Der Entwicklungsstand verbindet einen lokalen Godot-Szenenentwurf mit dem vorhandenen Aurion-Authoring-Vertrag. Aurion prüft und speichert Weltänderungen; der Godot-Editor und der Client erzeugen keine Spiel- oder Persistenzautorität.

## Szenenentwurf vorbereiten

Das optionale Editor-Plugin `addons/aurion_world_bridge` kann in den Projekteinstellungen aktiviert werden. Es ergänzt den Knotentyp **AurionWorldMarker** und den Dock **Aurion Weltentwurf**. Bestehende Editor-Plugins bleiben aktiviert. Das Plugin ist im Repository nicht automatisch eingeschaltet.

1. In einer Godot-Szene für jede Platzierung einen Marker anlegen und `placement_key` sowie die bestätigte Aurion-`asset_id` eintragen. Ein lokales Modell kann als Kind zur Orientierung dienen.
2. Position und gleichmäßige Skalierung einstellen; Drehungen sind in 90-Grad-Schritten um Y möglich. Der Export ist vorerst auf ±8192 m vom Szenenursprung begrenzt, um die Genauigkeit der Godot-Koordinaten einzugrenzen.
3. Im Dock Schlüssel, Titel, Version und die aktuelle bestätigte Katalogrevision eintragen und **Szenenentwurf kopieren** wählen. Das Ergebnis ist ein unverbindlicher JSON-Entwurf. Kindknoten, Skripte, Texturen und Kollisionen werden nicht übertragen. Die endgültige Darstellung kann von der Editorvorschau abweichen, da der Client Katalogmodelle normalisiert und auf bestätigtem Terrain platziert.

## In Aurion prüfen

Im verbundenen Godot-Client liegt das Weltstudio im mobilen Menü beziehungsweise im Desktop-HUD. Eine aktive native Sitzung mit Aurion-Adminrolle ist erforderlich. Dort kann der Entwurf eingefügt oder ein unverbindlicher KI-Vorschlag angefordert werden.

Ein Serverplan bindet den konkreten Entwurf und den erwarteten vorherigen Designhash an einen Planhash. Jede Änderung am Entwurf verwirft den Plan. Der Bestätigungsdialog zeigt den vollständigen Plan; erst seine Bestätigung sendet einmalig `worldApply`. Ein passendes Receipt und ein anschließend neu angeforderter Weltstand müssen für dieselbe Sitzung, denselben Actor, Plan, Vorgänger, Ziel und Designhash übereinstimmen. Die bestätigte Antwort wird über die bestehende Weltprojektion dargestellt. Das Studio lehnt Pläne älterer Server ab, die den Vorgänger nicht binden; nach einer Serveraktualisierung ist eine neue Planung nötig.

Wenn die Apply-Antwort verloren geht, bleibt das Ergebnis **unklar**. Ein später gelesener Weltstand allein beweist nicht, dass genau dieser Apply erfolgreich war. Vor dem Senden wird deshalb eine lokale, credentialfreie Vormerkung angelegt, die bei normalem Sitzungswechsel erhalten bleibt und weitere Applies blockiert. Es gibt keinen automatischen Apply-Retry. Die Vormerkung ist keine geräteübergreifende Exactly-once-Garantie. Der vorhandene tRPC-Pfad prüft die Aurion-Adminrolle; die getrennten Admin-MCP-Scopes sind ein anderer Zugangsweg.

## Nachweise und offene Arbeit

Die bisherige Godot-Prüfung verwendet lokale HTTP-, Szenen- und Transport-Fixtures. Serverseitige Guards und ein isolierter MariaDB-Testlauf für Vorgänger, 64 aktive Entwürfe, TEXT-Spaltengrenze sowie Katalog- und Rollenänderungen sind in diesem Entwicklungsstand ergänzt; ihre Ergebnisse müssen am exakten PR-Head geprüft werden. Echte native Anmeldung, ein serverseitiger Apply samt unabhängigem Receipt-/Datenbank-Readback, ein produktiver Deployment-Nachweis und die physische Tablet-Abnahme stehen aus. Ein serverseitiger Receipt-Recovery-Pfad für verlorene Antworten fehlt noch. Die optionale Editoroberfläche ist nicht automatisch auf dem VPS installiert.
