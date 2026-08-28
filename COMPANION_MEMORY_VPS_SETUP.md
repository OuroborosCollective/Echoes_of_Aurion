# Companion Memory VPS Setup

Der Companion nutzt eine **local-first** Memory-Pipeline. Jede gültige Beobachtung wird lokal als nutzergebundene JSONL-Episode gespeichert. Wenn `REDIS_URL` gesetzt ist, wird zusätzlich eine idempotente Redis-Replikation in einer separaten Datenbank und unter dem Namespace `aurion:companion:memory:<userId>:<sessionId>:<sequence>` ausgeführt.

Auf dem Ziel-VPS wurde der laufende Aurion-Container read-only inventarisiert. Der Container und `redis-comn-redis-1` teilen sich das Docker-Netzwerk `areloria_arelorian-network`; Milvus läuft in einem getrennten Storage-Netzwerk. Deshalb wird für diesen Integrationsstand Redis verwendet. Die Redis-URL enthält keine im Repository gespeicherten Zugangsdaten und wird nur im VPS-Environment gesetzt.

Die Produktionsumgebung `/opt/echoes-of-aurion/.env.production` wurde vor der Änderung mit einem UTC-Zeitstempel-Backup gesichert. Anschließend wurde `REDIS_URL` aus dem vorhandenen Redis-Container-Secret innerhalb des VPS erzeugt und der Aurion-Container mit dem bestehenden Image-Tag `production` kontrolliert recreated. Der Container meldete danach `Started`; die Secretwerte werden nicht dokumentiert.

Milvus bleibt als spätere Embedding-/Semantikschicht vorgesehen. Rohbilder werden nicht nach Redis repliziert; der Serveradapter speichert nur Feature-Vektoren, Aktionslabels, Zustandsmasken und kurze Notizen. Ein Redis-Ausfall führt nicht zum Verlust der lokalen Memory-Aufzeichnung.
