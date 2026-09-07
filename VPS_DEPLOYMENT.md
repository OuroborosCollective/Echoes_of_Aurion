---
description: Historischer statischer Fallbackpfad für Aurion-Releases auf dem VPS.
---

# VPS Deployment

## Status

Dieser statische Nginx-Pfad ist ein manuell auslösbarer Rückfallweg. Er ist nicht die aktuelle Produktionslaufzeit. Die verbindliche Bereitstellung erfolgt über den Docker-/Traefik-Containerdienst.

Der Pfad darf einen Container-Release nach einem Merge nicht überschreiben. Eine Aktivierung benötigt eine separate Freigabe und einen dokumentierten Rollbackplan.

## Historischer Ablauf

Die frühere Bereitstellung legt ein statisches React-/Babylon-Bundle unter `/var/www/echoes-of-aurion/releases/<timestamp>` ab. Der Symlink `current` verweist auf die aktive Fassung. Damit ist ein Rollback auf ein vorhandenes Release ohne neuen Build möglich.

Die Hauptdomain `arelogic.space` ist ausschließlich für **Echoes of Aurion** vorgesehen. Vor einer historischen Umschaltung werden die vorhandene Nginx-Konfiguration und der Domain-Webroot unter `/var/backups/echoes-of-aurion/` gesichert. TLS erhält ein separates Zertifikat namens `echoes-of-aurion-arelogic`.

## Sicherheitsnacharbeit

Nach einer erfolgreichen, ausdrücklich freigegebenen Aktivierung ersetzt ein separater Sicherheitsdurchgang Root-Passwortzugang durch einen dedizierten Deploy-Account mit SSH-Schlüssel. Dieser Schritt benötigt eine eigene Freigabe.
