# Aurion OIDC-Konfiguration für FusionAuth

Diese Anleitung beschreibt ausschließlich die **Konfigurationsvorbereitung** für den additiven Aurion-OIDC-Adapter. Sie ist kein Auftrag zum Deployment und enthält keine Geheimniswerte.

## Sicherheitseigenschaften

Der Adapter startet den OAuth-Flow ausschließlich über die gleichoriginäre Serverroute `/api/oauth/start`. Der Server erzeugt und hält `state`, `nonce` und PKCE-`code_verifier` in einem kurzlebigen, `HttpOnly`- und `Secure`-Cookie. Der Browser erhält weder ein Client-Secret noch Provider-Tokens. Im Callback werden Discovery-Issuer, ID-Token-Signatur über das JWK-Set, Audience, Nonce und die PKCE-Bindung geprüft. Der externe Nutzer wird als SHA-256 über `(issuer, subject)` in Aurions vorhandenes, eindeutiges `users.openId` abgebildet.

## Dedizierte FusionAuth-Anwendung

Lege in FusionAuth eine **neue, ausschließlich für Aurion bestimmte Anwendung bzw. einen neuen OAuth-Client** an. Der vorhandene Client aus den Referenzscreenshots darf nicht weiterverwendet werden.

| Einstellung | Geforderter Wert |
| --- | --- |
| Protokoll | OpenID Connect / Authorization Code |
| Client-Typ | Vertraulicher Server-Client |
| Client-Authentifizierung | Erforderlich; Token-Endpunkt über `client_secret_basic` |
| PKCE | Erforderlich, ausschließlich `S256` |
| Autorisierte Redirect-URI | Exakt `https://arelogic.space/api/oauth/callback` |
| Autorisierte Origin | `https://arelogic.space`, sofern FusionAuth sie separat verlangt |
| Scopes | Mindestens `openid profile email` |
| Refresh-Tokens | Nicht erforderlich für den aktuellen Aurion-Adapter |
| Client-Secret | Neu erzeugen; nur in der VPS-Umgebung ablegen, niemals in Git, Screenshots oder Client-Code |

> Der vorhandene OIDC-Issuer ist erst nach einem produktiven TLS-Readback als verwendbar zu bestätigen. Eine Selbstsignatur auf `arelogic.space` blockiert die sichere Browser- und Callback-Abnahme.

## VPS-Umgebung

Nach Erstellung der dedizierten FusionAuth-Anwendung werden die folgenden Werte ausschließlich in der lokalen, nicht versionsverwalteten Datei `/opt/echoes-of-aurion/.env.production` hinterlegt.

```dotenv
# Bestehende Aurion-Werte bleiben erhalten und werden nicht hier dokumentiert.
OIDC_ISSUER_URL=https://<fusionauth-issuer>
OIDC_CLIENT_ID=<dedizierte-aurion-client-id>
OIDC_CLIENT_SECRET=<neu-generiertes-client-secret>
OIDC_REDIRECT_URI=https://arelogic.space/api/oauth/callback
OIDC_SCOPE=openid profile email
```

Die alte Variable `OAUTH_SERVER_URL` bleibt für den bisherigen Legacy-Callback unverändert. Sobald alle vier `OIDC_*`-Pflichtwerte gesetzt sind, übernimmt `/api/oauth/callback` ausschließlich den OIDC-Pfad; bei einer Teilkonfiguration verweigert der Server die Anmeldung kontrolliert mit `503`.

## Abnahmeprotokoll nach expliziter Deploymentfreigabe

1. Die öffentliche `/.well-known/openid-configuration`-Antwort muss einen HTTPS-Issuer, `authorization_endpoint`, `token_endpoint` und `jwks_uri` **derselben Origin** liefern.
2. Der FusionAuth-Client muss die exakte Aurion-Callback-URI akzeptieren und PKCE `S256` erzwingen.
3. `https://arelogic.space/healthz` muss mit einer öffentlichen, gültigen Zertifikatskette antworten.
4. Ein Browser-Readback muss `Login → Provider → Callback → geschützte Aurion-Sitzung → Spiel-Readmodell` belegen.
5. Erst nach erfolgreichem Readback dürfen weitere persistente Gameplayaktionen als OIDC-Nutzer freigegeben werden.

## Rückkehrpunkt

Der OIDC-Adapter ist additiv. Ohne gesetzte `OIDC_*`-Pflichtwerte verbleiben der bestehende lokale Login und der bisherige Legacy-OAuth-Callback unverändert. Bei Fehlverhalten wird der Kandidatenbranch verworfen; weder Datenbankmigration noch Assetaktivierung sind Teil dieser Änderung.
