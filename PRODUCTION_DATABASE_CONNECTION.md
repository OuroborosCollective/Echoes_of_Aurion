---
description: Architektur und Verbindungsregeln für die Produktionsdatenbank MariaDB auf dem VPS.
---
# Production Database Connection

## VPS und Infrastruktur
- **VPS IP:** 46.202.154.25
- **MariaDB Host:** TCP 3306
- **VPS Login User:** root

## Verbindungsarchitektur
Der Weg vom Aurion Server zur Datenbank sieht wie folgt aus:

```text
Aurion Server
  | DATABASE_URL
Docker DNS: mariadb
  | TCP 3306
echoes-of-aurion-internal (privates Docker-Netz)
  |
echoes-of-aurion-mariadb-1 (Produktions-DB-Container)
  |
MariaDB / <DATABASE_NAME>
```

**Wichtig:** `https://arelogic.space` ist NICHT der Datenbank-Endpunkt. Diese Domain geht über Traefik an den Aurion-Web-/Servercontainer auf intern Port 3000. MariaDB bleibt auf dem separaten privaten Docker-Netz.

## Konfigurations-Details
- **Connection-Variable:** `DATABASE_URL`
- **Schema:** `mysql://`
- **Interner Hostname:** `mariadb`
- **Port:** `3306`
- **Format:** `mysql://<USER>:<PASSWORD>@mariadb:3306/<DATABASE_NAME>`
- **Privates Docker-Netz:** `echoes-of-aurion-internal`
- **Produktions-DB-Container:** `echoes-of-aurion-mariadb-1`
- **Production-Env-Datei:** `/opt/echoes-of-aurion/.env.production`

Die Aurion-App hängt gleichzeitig am privaten DB-Netz (`echoes-of-aurion-internal`) und am Traefik-Netz (`areloria_arelorian-network`).

## Runtime-Verifier
Der Runtime-Verifier ist streng:
Die `DATABASE_URL` muss das `mysql:` Schema, den Host `mariadb` und den Port `3306` verwenden und Benutzer, Passwort sowie einen DB-Namen enthalten.
