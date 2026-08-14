# Sicherheitsmodell — Aurion-eigene Anmeldung

## Identität und Sitzung

Lokale Konten erhalten einen eindeutigen, kanonisch kleingeschriebenen Spiel-Handle. Der bestehende technische Identitätsanker bleibt erhalten und verwendet für diese Konten das Format `local:<handle>`. Die bestehenden geschützten tRPC-Verfahren arbeiten dadurch weiter mit demselben `users`-Datensatz und derselben serverseitig signierten Cookie-Sitzung.

| Bereich | Festlegung |
|---|---|
| Handle | 3–32 Zeichen, nur Kleinbuchstaben, Ziffern, Unterstrich und Bindestrich; eindeutig gespeichert. |
| Passwort | Mindestens 12 Zeichen; serverseitig mit pro Konto zufälligem Salt per `scrypt` abgeleitet; niemals im Klartext gespeichert oder geloggt. |
| Cookie | Bestehendes HTTP-only, Secure Cookie auf HTTPS; keine Session- oder Zugangstoken in URL, Local Storage oder Query-Parametern. |
| Anmeldung | Einheitliche Fehlermeldung bei unbekanntem Handle und falschem Passwort; rate-limitiert pro Handle/IP. |
| Abmeldung | Nutzt das bestehende serverseitige Löschen des Sitzungscookies. |

## Rollenmodell

Die öffentliche Registrierung kann ausschließlich die Rolle `user` erzeugen. Die Erst-Adminrolle wird **nicht** über Browserdaten, einen URL-Parameter oder die Registrierungsmaske vergeben. Nach einer echten Registrierung wird der vom Projekteigentümer bestätigte Handle einmalig und gezielt in der bestehenden Aurion-Datenbank auf `admin` gesetzt. Jede spätere Rollenverwaltung bleibt durch `adminProcedure` geschützt.

> Es gibt keinen offenen „erster Registrant wird Admin“-Mechanismus. Dadurch kann kein Dritter durch einen früheren Registrierungszeitpunkt die Administration übernehmen.

## Runtime-Grenze

Die Umsetzung ergänzt nur den vorhandenen Aurion-Express-/tRPC-Prozess, die bestehende `users`-Tabelle, den Aurion-Nginx-Host und den Aurion-GitHub-Releasepfad. Der Prozess wird an `127.0.0.1:3101` gebunden. Bestehende Ports, Docker-Proxys, `/mcp` und fremde VPS-Dienste werden nicht geändert.
