---
description: "ChatGPT-Zugang zum Aurion Admin-MCP mit einer eigenen kostenlosen FusionAuth-Anwendung."
---

# Aurion Admin-MCP in ChatGPT

Der Remote-MCP liegt unter `https://arelogic.space/admin-mcp`. Die hier beschriebene Konfiguration verwendet eine eigene FusionAuth-Anwendung mit Anwendungsrollen. Dafür sind keine benutzerdefinierten OAuth-Scopes und keine Funktion aus Advanced OAuth Scopes erforderlich.

| ChatGPT-Einstellung | Wert |
| --- | --- |
| Name | Aurion Admin |
| MCP-URL | `https://arelogic.space/admin-mcp` |
| Authentifizierung | OAuth |
| Client-ID | `91097c69-cf11-42ae-8be2-1d0a821e7758` |
| Client-Secret | leer; öffentlicher Client mit verpflichtendem PKCE |
| OAuth-Scopes | `openid profile offline_access` |

Die OAuth-Rückleitungsadresse muss exakt mit der im ChatGPT-Dialog angezeigten Adresse übereinstimmen. Neue Connectors können `https://chatgpt.com/connector/oauth/{callback_id}` verwenden. Die bereits bekannte ältere Adresse `https://chatgpt.com/connector_platform_oauth_redirect` ist in der Anwendung eingetragen. Individuelle Rückleitungsadressen müssen vor der Verbindung ergänzt werden; Wildcards sind deaktiviert.

## Berechtigungen

Der Nutzer muss für die Anwendung **Aurion Admin ChatGPT** registriert sein und die gewünschten Rollen ausdrücklich erhalten. Keine dieser Rollen ist eine Standard- oder Super-Rolle.

| FusionAuth-Anwendungsrolle | Aurion-Berechtigung |
| --- | --- |
| `aurion_admin_read` | Admin-Daten und Nachweise lesen; erforderlich |
| `aurion_admin_assets_write` | Validierte Asset-Pläne und bestätigte Asset-Befehle verwenden |
| `aurion_admin_authoring_write` | Validierte Welt-, Dungeon- und Quest-Befehle verwenden |

Zusätzlich muss derselbe OIDC-Nutzer in der kanonischen Aurion-Datenbank `role=admin` haben. Eine allgemeine FusionAuth-Rolle `admin` reicht nicht aus. Aurion-Schreibbefehle behalten ihre bestehenden Plan-, Hash- und Bestätigungsprüfungen.

## Token und Betrieb

Die Autorisierungsanfrage und der Authorization-Code-Austausch müssen beide `resource=https://arelogic.space/admin-mcp` übergeben. Aurion prüft Signatur, Issuer, Ablaufzeit, Ressourcen-Audience, Client-Audience und die exakte `applicationId`. Nur die drei freigegebenen Anwendungsrollen werden in Aurion-Berechtigungen übersetzt. Übermittelte benutzerdefinierte OAuth-Scopes können im Rollenmodus keine Schreibrechte erzeugen.

Die Anwendung verwendet Authorization Code mit PKCE S256, verpflichtende Registrierung, exakte Rückleitungsadressen und Refresh Tokens. Access Tokens sind eine Stunde gültig. Der MCP-Client verwendet Access Tokens. ID Tokens können ebenfalls eine Ressourcen-Audience enthalten; ohne passende `applicationId` und explizite Anwendungsrollen werden sie als Admin-Zugang abgelehnt.

Der explizite Rollenmodus wird über `AURION_ADMIN_MCP_AUTH_MODE=application_roles` und `AURION_ADMIN_MCP_CLIENT_ID` aktiviert. Ohne diesen Modus bleibt das ursprüngliche Verfahren mit `aurion.admin.read`, `aurion.admin.assets.write` und `aurion.admin.authoring.write` aktiv. Die öffentliche Protected-Resource-Metadatei veröffentlicht im Rollenmodus die unterstützten Standard-Scopes sowie die öffentliche Anwendungsbindung unter `aurion_admin_authorization`.

Die Docker-Konfiguration bindet den produktiven Rollenmodus an die oben genannte Anwendung. Der Release-Readback prüft dieselbe Anwendung und alle drei Rollen. Deployment, Schema-, Approval- und Runtime-Gates bleiben Bestandteil des vorhandenen Aurion-Releasewegs.

Ein Repository-Test oder eine erfolgreiche FusionAuth-Anmeldung belegt noch keinen produktiven MCP-Zugang. Die Abnahme erfordert ein erfolgreiches `initialize`, `tools/list`, `aurion_admin_get_capabilities` und einen unabhängigen Runtime-Readback nach dem Deployment.
