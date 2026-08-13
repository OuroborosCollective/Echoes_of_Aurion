# Echoes of Aurion — VPS Deployment

Die Produktionsfassung wird als statisches React-/Babylon-Bundle unter `/var/www/echoes-of-aurion/releases/<timestamp>` abgelegt. Der Symlink `current` verweist auf die aktive Freigabe; dadurch kann ein Rollback ohne erneuten Build auf eine frühere Release-Fassung erfolgen.

Die Hauptdomain `arelogic.space` wird ausschließlich für **Echoes of Aurion** geschaltet. Vor der Umschaltung werden die bisherige Nginx-Datei und der vorhandene Domain-Webroot unter `/var/backups/echoes-of-aurion/` gesichert. TLS wird über ein separates Zertifikat mit dem Namen `echoes-of-aurion-arelogic` ausgestellt, damit vorhandene abgelaufene Zertifikatsbestände nicht überschrieben werden.

Nach erfolgreicher Bereitstellung muss der Root-Passwortzugang in einem separaten Sicherheitsdurchgang durch einen dedizierten Deploy-Account mit SSH-Schlüssel ersetzt werden. Dieser Schritt verändert die derzeitige Fernzugriffsstrategie und wird daher erst nach der erfolgreichen Abnahme des Spiels ausgeführt.
