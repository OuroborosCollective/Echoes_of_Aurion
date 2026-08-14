# Admin-Onboarding für Echoes of Aurion

## Zweck

Diese Anleitung beschreibt die sichere Ersteinrichtung eines **eigenen Admin-Kontos**. Echoes of Aurion verwendet keinen separaten lokalen Benutzernamen und kein selbst gewähltes Spielpasswort. Das Konto wird beim ersten erfolgreichen Anmelden über den bestehenden OAuth-Anbieter angelegt. [1]

> **Wichtig:** Bitte verwende für die erste Anmeldung das Konto, mit dem du das Projekt verwaltest. Gib weder Datenbankzugänge noch Anmeldedaten im Spiel, im Forum oder im Chat weiter.

## Ablauf

| Schritt | Aktion | Erwartetes Ergebnis |
|---|---|---|
| 1 | Öffne `https://arelogic.space/` und wähle **Anmelden**. | Die bestehende Anmeldeseite des OAuth-Anbieters öffnet sich. |
| 2 | Melde dich mit deinem eigenen Verwaltungs-Konto an und schließe die Rückleitung zur Spielseite ab. | Beim ersten Login wird der Benutzer-Datensatz automatisch angelegt. [1] |
| 3 | Öffne anschließend die Community- bzw. Operations-Bereiche. | Ein korrekt berechtigtes Konto sieht die redaktionellen Admin-Funktionen, etwa für Forum und Asset-Freigaben. [2] |
| 4 | Falls die Admin-Funktionen nicht sichtbar sind, sende mir hier **nur den angezeigten Spielnamen oder die Konto-E-Mail**, nachdem du dich einmal angemeldet hast. | Ich kann den konkret vorhandenen Benutzer-Datensatz gezielt auf `admin` setzen; es wird kein Testkonto angelegt. |

## Wann wird die Admin-Rolle automatisch vergeben?

Der als Projektbesitzer konfigurierte OAuth-Account erhält bei seinem ersten Login automatisch die Rolle `admin`. Dies gilt nur, wenn die OAuth-Identität exakt mit der hinterlegten Besitzer-Identität übereinstimmt. [1]

Wenn du stattdessen ein zweites Konto als Administration verwenden möchtest, ist eine gezielte Promotion erforderlich. Nach Schritt 2 kann ein vorhandener Administrator die Rolle über die Verwaltungsoberfläche vergeben; alternativ kann die Rolle mit einer gezielten Datenbankänderung des **bereits angelegten** Datensatzes auf `admin` gesetzt werden. Die Rollen sind auf `user` und `admin` begrenzt. [2] [3]

## Kurze Funktionsprüfung

Nach der Anmeldung sollte die Prüfung in dieser Reihenfolge erfolgen:

1. Erstelle keinen Test-Forumspost. Öffne nur den Bereich für redaktionelle Beiträge und stelle fest, ob Bearbeitungsaktionen sichtbar sind.
2. Öffne die Asset-Verwaltung und prüfe, ob eine Freigabe-/Ablehnaktion angeboten wird.
3. Falls diese Aktionen fehlen, melde dich ab, erneut an und teile danach den sichtbaren Namen oder die Konto-E-Mail in diesem Chat mit. Ich prüfe dann ausschließlich den passenden Datensatz.

## Sicherheitsregeln

| Regel | Begründung |
|---|---|
| Kein lokales Passwort anlegen oder teilen | Die Anmeldung wird über den vorhandenen OAuth-Ablauf abgewickelt. [1] |
| Keine Rolle für ein nicht angemeldetes Konto setzen | So wird ausgeschlossen, dass eine falsche oder nicht verifizierte Identität privilegiert wird. |
| Nur vertrauenswürdige Konten zu Administratoren machen | Administratoren dürfen redaktionelle Inhalte und Asset-Prüfungen verwalten. [2] |
| Rolle nach Einrichtung erneut prüfen | Die serverseitige Zugriffskontrolle erlaubt Admin-Verfahren nur für die Rolle `admin`. [3] |

## Referenzen

[1]: https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/main/server/_core/oauth.ts "OAuth-Login und Benutzeranlage"
[2]: https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/main/server/routers.ts "Geschützte Verwaltungs- und Community-Routen"
[3]: https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/main/server/_core/trpc.ts "Serverseitige Admin-Zugriffskontrolle"
