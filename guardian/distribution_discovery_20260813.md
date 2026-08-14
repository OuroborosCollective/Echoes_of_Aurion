# Distribution Discovery — 2026-08-13

Die Projektquellen verwenden Babylon.js und enthalten keine PlayCanvas-Abhängigkeit, kein PlayCanvas-Projekt und keine PlayCanvas-Client-Konfiguration. Die öffentliche PlayCanvas-Projektübersicht sowie eine aktuelle Namenssuche lieferten keinen auffindbaren Eintrag für „Echoes of Aurion“. Damit ist das Spiel derzeit weder als PlayCanvas-Projekt eingerichtet noch in der öffentlichen Übersicht nachweisbar.

Für eine PlayCanvas-Präsenz braucht es ein separates PlayCanvas-Projekt, einen Import oder Neuaufbau der Szenen für die PlayCanvas-Engine, eine Veröffentlichung im PlayCanvas-Editor und einen öffentlich teilbaren Play-Link. Die sichtbare Aufnahme in eine kuratierte Projektübersicht ist von der Veröffentlichung und redaktionellen Auswahl der Plattform abhängig.

Das Repository besitzt bereits eine statische itch.io-Build-Konfiguration und einen Build-Befehl. Nach den offiziellen itch.io-Anforderungen muss das Release als ZIP mit `index.html` im Archivwurzelpunkt, relativen Asset-Pfaden und allen benötigten Laufzeitdateien ausgeliefert werden. Die bestehende `vite.itch.config.ts` erfüllt die relative Basisadressierung; der bestehende GitHub-Workflow erzeugt bereits ein statisches Release-Artefakt, publiziert aber noch nicht zu itch.io.
