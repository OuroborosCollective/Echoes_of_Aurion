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

## Alternative: Supabase OAuth

Der optionale Modus `AURION_ADMIN_MCP_AUTH_MODE=supabase_oauth` verwendet Supabase Auth als OAuth-Server. `OIDC_ISSUER_URL` muss den exakten Auth-Issuer enthalten, `AURION_ADMIN_MCP_CLIENT_ID` die UUID eines ausschließlich für diese Integration registrierten Clients und `AURION_ADMIN_MCP_RESOURCE_URL` die exakte MCP-Adresse. Aurion verlangt eine gültige Signatur, diesen Issuer, den Client und die Ressourcenadresse in `aud`. Die allgemeine Supabase-Audience `authenticated` allein reicht nicht für den MCP-Zugang.

Supabase kann die Audience mit einem Custom Access Token Hook je OAuth-Client setzen. Das installierbare SQL in `scripts/supabase/aurion-admin-mcp-audience.sql` legt dafür eine geschützte Zuordnung und eine Hook-Funktion an; es aktiviert weder den Hook noch trägt es einen Client ein. Nach Prüfung des Auth-Stacks und seiner Sicherung kann eine berechtigte Datenbank-Administration für den vorgesehenen Client eine Zeile in `aurion_admin_mcp_auth.client_audiences` mit dessen UUID und der exakten MCP-Ressourcen-URL einrichten. Der Hook `pg-functions://postgres/aurion_admin_mcp_auth/access_token_hook` verändert nur Tokens zu zugeordneten Clients. Nicht zugeordnete Clients und gewöhnliche Nutzersitzungen behalten ihre vorhandene Audience.

Supabase Auth hat nur einen Custom Access Token Hook. Ein bereits vorhandener Hook darf nicht überschrieben werden; die Aurion-Funktion muss in diesem Fall mit der bestehenden Logik kombiniert und zusammen geprüft werden. Auch die Rechte auf die Zuordnung und die unveränderte Anmeldung anderer Anwendungen müssen geprüft werden. Der Modus ist ohne eingerichteten und getesteten Hook absichtlich nicht nutzbar.

Die Zugriffsrollen stehen ausschließlich in vertrauenswürdig verwalteten `app_metadata.aurion_admin_roles`; `user_metadata` gewährt keine Rechte. Zusätzlich bleibt Aurions eigener Datenbank-Adminstatus verpflichtend. Ein Issuerwechsel ändert die berechnete OIDC-Identität: Vor einer Umstellung müssen bestehende Konten und Charakterzuordnungen mit Rückfallweg erhalten und unabhängig überprüft werden. Die Laborprüfung ersetzt weder diese Migration noch einen produktiven Login.
