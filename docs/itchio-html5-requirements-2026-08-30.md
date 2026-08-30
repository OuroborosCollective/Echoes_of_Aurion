# itch.io HTML5 Anforderungen

Quelle: https://itch.io/docs/creators/html5

Ein HTML5-Spiel mit mehreren Dateien muss als ZIP mit `index.html` im ZIP-Stamm hochgeladen werden; alle Pfade zu mitgelieferten Ressourcen müssen relativ sein und Dateinamen sind case-sensitive. itch.io bettet den Client in ein iframe ein. Externe Ressourcen oder APIs müssen über HTTPS erreichbar sein. Die offiziellen Standardgrenzen sind höchstens 1.000 Dateien, höchstens 500 MB entpackter Gesamtinhalt und höchstens 200 MB pro Datei. Mobile HTML5-Projekte können als „Mobile Friendly“ markiert werden; itch.io verwendet auf mobilen Geräten den Vollbild-Startmodus.

Für Aurion folgt daraus: Der Client darf die zentrale Online-API über eine konfigurierte HTTPS-Origin ansprechen; alle mitgelieferten Assets müssen dagegen relativ aus dem ZIP geladen werden. Der Build muss `index.html` im ZIP-Stamm, eine SHA-/Revision-Markierung und einen reproduzierbaren Upload-Workflow erzeugen.
