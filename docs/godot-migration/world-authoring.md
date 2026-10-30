# Godot-Weltentwürfe mit Aurion prüfen

Der Entwicklungsstand verbindet einen lokalen Godot-Szenenentwurf mit dem vorhandenen Aurion-Authoring-Vertrag. Aurion prüft und speichert Weltänderungen; der Godot-Editor und der Client erzeugen keine Spiel- oder Persistenzautorität.

## Szenenentwurf vorbereiten

Das optionale Editor-Plugin `addons/aurion_world_bridge` kann in den Projekteinstellungen aktiviert werden. Es ergänzt den Knotentyp **AurionWorldMarker** und den Dock **Aurion Weltentwurf**. Bestehende Editor-Plugins bleiben aktiviert. Das Plugin ist im Repository nicht automatisch eingeschaltet.

1. In einer Godot-Szene für jede Platzierung einen Marker anlegen und `placement_key` sowie die bestätigte Aurion-`asset_id` eintragen. Ein lokales Modell kann als Kind zur Orientierung dienen.
2. Position und gleichmäßige Skalierung einstellen; Drehungen sind in 90-Grad-Schritten um Y möglich. Der Export ist vorerst auf ±8192 m vom Szenenursprung begrenzt, um die Genauigkeit der Godot-Koordinaten einzugrenzen.
3. Im Dock Schlüssel, Titel, Version und die aktuelle bestätigte Katalogrevision eintragen und **Szenenentwurf kopieren** wählen. Das Ergebnis ist ein unverbindlicher JSON-Entwurf. Kindknoten, Skripte, Texturen und Kollisionen werden nicht übertragen. Die endgültige Darstellung kann von der Editorvorschau abweichen, da der Client Katalogmodelle normalisiert und auf bestätigtem Terrain platziert.

## In Aurion prüfen

Im verbundenen Godot-Client liegt das Weltstudio im mobilen Menü beziehungsweise im Desktop-HUD. Eine aktive native Sitzung mit Aurion-Adminrolle ist erforderlich. Dort kann der Entwurf eingefügt oder ein unverbindlicher KI-Vorschlag angefordert werden.

Ein Serverplan bindet den konkreten Entwurf, den erwarteten vorherigen Designhash und eine zufällige Kennung dieses Versuchs an einen Planhash. Jede Änderung am Entwurf verwirft den Plan. Der Bestätigungsdialog zeigt den vollständigen Plan; erst seine Bestätigung sendet einmalig `worldApply`. Ein passendes Receipt wird für dieselbe Sitzung, denselben Actor, Plan, Versuch, Vorgänger und Ziel geprüft. Ein danach neu angeforderter, gültiger Weltstand zeigt, ob das Ergebnis noch aktiv ist oder inzwischen verändert wurde. Die aktuelle bestätigte Antwort wird über die bestehende Weltprojektion dargestellt. Das Studio lehnt Pläne älterer Server ohne diese Bindungen ab; nach einer Serveraktualisierung ist eine neue Planung nötig.

Wenn die Apply-Antwort verloren geht, bleibt das Ergebnis **unklar**. Ein später gelesener Weltstand allein beweist nicht, dass genau dieser Apply erfolgreich war. Vor dem Senden wird deshalb eine lokale, credentialfreie Vormerkung angelegt, die bei normalem Sitzungswechsel erhalten bleibt und weitere Applies blockiert. Über **Offenes Receipt bei Aurion suchen** kann derselbe bestätigte Admin das exakt zu Actor, Ziel, Version, Versuch und Plan gehörende Receipt anfordern. Erst ein passendes Receipt und ein danach neu gelesener gültiger Weltstand entfernen die Vormerkung. Ist der Entwurf inzwischen verändert oder entfernt, zeigt das Studio dies ausdrücklich an und projiziert den aktuellen Stand. Wird kein Receipt gefunden, bleibt das Ergebnis ungeklärt, auch wenn die Anfrage möglicherweise nie committed wurde. Vormerkungen des älteren v1-Formats bleiben zur manuellen Klärung gesperrt. Es gibt keinen automatischen Apply-Retry. Die Vormerkung ist keine geräteübergreifende Exactly-once-Garantie. Der vorhandene tRPC-Pfad prüft die Aurion-Adminrolle; die getrennten Admin-MCP-Scopes sind ein anderer Zugangsweg.

## Nachweise und offene Arbeit

Die bisherige Godot-Prüfung verwendet lokale HTTP-, Szenen- und Transport-Fixtures. Serverseitige Guards, Receipt-Suche und ein isolierter MariaDB-Testlauf für Vorgänger, 64 aktive Entwürfe, TEXT-Spaltengrenze sowie Katalog- und Rollenänderungen sind in diesem Entwicklungsstand ergänzt; ihre Ergebnisse müssen am exakten PR-Head geprüft werden. Echte native Anmeldung, ein serverseitiger Apply samt unabhängigem Receipt-/Datenbank-Readback, ein produktiver Deployment-Nachweis und die physische Tablet-Abnahme stehen aus. Die optionale Editoroberfläche ist nicht automatisch auf dem VPS installiert.
