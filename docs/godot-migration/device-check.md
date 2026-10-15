---
description: "Kurzer, datenschutzsicherer Gerätecheck für das Samsung Galaxy Tab A9 ohne Engine- oder Skriptarbeit."
---

# Tab A9: Gerätecheck für den Owner

## Bereits erledigt

Der Owner hat am 15.10.2026 **4 GB RAM** bestätigt. Für die Planung ist jetzt keine Installation, kein Skript und keine Godot-Einstellung nötig.

## Einmaliger Check, wenn der erste APK-Kandidat bereitsteht

Der Agent fordert diese Angaben erst an, wenn sie eine konkrete Build- oder Diagnoseentscheidung beeinflussen:

1. **Einstellungen → Tablet-Info** öffnen und Modellname sowie Modellnummer mitteilen.
2. Unter **Softwareinformationen** die Android-Version nennen.
3. Unter **Akku und Gerätewartung → Speicher** den freien Speicher nennen. Die genaue Menübezeichnung kann je nach Android-Version abweichen.
4. Den bereitgestellten APK-Kandidaten installieren, starten und die sichtbare Diagnosezusammenfassung teilen.
5. Die geführte 20-Minuten-Spielprobe starten; Messung und Export übernimmt der Client.

Ein Screenshot ist optional. Vor dem Teilen Seriennummer, IMEI, Telefonnummer, Konten, WLAN-Namen und andere persönliche Kennungen abdecken. Diese Daten gehören weder in GitHub noch in Diagnoseexporte.

## Was der Agent übernimmt

Der Agent erstellt APK, Profil, Diagnoseansicht, Messstart, Auswertung und GitHub-Evidence. Der Owner muss keine ADB-Kommandos, Godot-Inspectorwerte oder Konfigurationsdateien bearbeiten. Wenn Android eine Systemfreigabe für die APK-Installation verlangt, erhält der Owner dafür eine einzelne konkrete Bildschirmanweisung.

## Gültiger Nachweis

- Herstellerdaten bezeichnen nur die Gerätefamilie.
- Die Ownerangabe belegt derzeit ausschließlich die RAM-Klasse.
- Die spätere Diagnoseansicht belegt Modell, OS, Renderer und Laufzeitwerte des konkreten Geräts.
- Ein Emulator oder Desktoplauf wird als solcher markiert und ersetzt die physische Probe nicht.

Die verbindlichen Grenzen und das Testszenario stehen im [Tab-A9-Zielprofil](tab-a9-profile.md).

