---
description: "Implementierbare Entscheidung für native Anmeldung, Sitzung, Logout und Zonenticketübergabe des Godot-Clients."
---

# Native Anmeldung und Ticketübergabe

## Entscheidung

Der Godot-Client startet die Anmeldung in Androids Systembrowser. Aurion führt den vorhandenen OIDC-Code-Flow aus und gibt der App anschließend ausschließlich einen kurzlebigen, einmalig einlösbaren Übergabecode zurück. Die App bindet die Einlösung mit PKCE an die konkrete Loginanfrage. Nach erfolgreicher Einlösung stellt Aurion eine eigene, widerrufbare native Sitzung aus.

Die App kopiert weder `app_session_id` noch den OIDC-Transaktionscookie. Der bestehende `Authorization: Bearer`-Fallback aus `server/_core/sdk.ts` ist Preview-Kompatibilität und wird nicht als nativer Sitzungsvertrag verwendet. Das derzeitige, bis zu ein Jahr gültige HS256-Websession-JWT besitzt keine serverseitige Einzelwiderrufskette und ist daher kein geeignetes natives Refresh-Token.

Aurion bleibt Owner von Identität, Sitzung, Zonenticket und Autorisierung. Godot verwahrt nur die ausgegebenen nativen Credentials im Android-Keystore-gestützten sicheren Speicher und sendet Gameplay-Intents.

## Belegter Istpfad

| Schritt | Aktuelle Quelle | Tatsächliches Verhalten | Lücke für native Apps |
|---|---|---|---|
| OIDC-Start | `server/_core/oauth.ts` | `/api/oauth/start` erzeugt State, Nonce und S256-PKCE; die Transaktion liegt in `__Host-aurion_oidc_tx` | Start ist an den Browsercookie gebunden |
| OIDC-Callback | `server/_core/oauth.ts` | Code, State und Nonce werden geprüft; Provider-Tokens bleiben nicht als App-Session erhalten | Callback setzt Webcookie und leitet nur nach `/` weiter |
| Websession | `server/_core/sdk.ts` | signiertes HS256-JWT aus Cookie, Preview-Fallback aus Bearer-Header | lange Laufzeit; kein Sessiondatensatz für Rotation/Widerruf |
| lokale Anmeldung | `server/routers.ts` | Handle/Passwort erzeugt denselben Websession-Cookie | JSON-Antwort gibt keine native Session aus |
| Logout | `server/routers.ts` | löscht den Browsercookie | bereits kopiertes JWT würde dadurch nicht widerrufen |
| Zonenticket | `server/routers.ts`, `server/db.ts` | authentisierte Session erhält ein gehasht gespeichertes 60-Sekunden-Einmalticket | funktioniert, sobald native HTTPS-Auth sauber existiert |
| WSS-Eintritt | `server/zoneGateway.ts` | prüft Origin, konsumiert Ticket genau einmal, dann `welcome` | Android-Origin muss explizit festgelegt und getestet werden |

Die vier OIDC-Umgebungswerte `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` und `OIDC_REDIRECT_URI` sind im Code vorgesehen. Ihr produktiver Inhalt ist nicht aus dem Repository beweisbar und wird hier weder angenommen noch ausgegeben.

## Zielablauf

1. Godot erzeugt einen zufälligen PKCE-`code_verifier`, dessen S256-`code_challenge`, einen lokalen Request-Bezeichner und einen CSRF-State. Nur der Verifier verbleibt auf dem Gerät.
2. Godot ruft `POST /api/native-auth/start` über HTTPS auf. Eingabe: Challenge, `S256`, App-Build, Plattform und die fest registrierte Rückkehr-ID. Aurion legt eine kurzlebige, gehasht beziehungsweise nicht rückrechenbar gebundene Logintransaktion an und liefert eine Systembrowser-URL.
3. Godot öffnet diese URL im Systembrowser. Die Aurion-Seite bietet den konfigurierten OIDC-Weg und den vorhandenen lokalen Handle-/Passwort-Weg an. Passwörter werden ausschließlich an Aurions HTTPS-Seite übergeben und nie von Godot erfasst oder gespeichert. Beim OIDC-Weg startet Aurion den vorhandenen Authorization-Code-Flow mit Provider-State, Nonce und dem serverseitigen Provider-PKCE. App-PKCE und Provider-PKCE sind getrennte Bindungen.
4. Der vorhandene OIDC-Callback validiert Provider-Code, State, Nonce, Issuer und Signatur und ordnet die Aurion-Identität zu. Der lokale Weg verwendet unverändert die vorhandene Scrypt-Prüfung, Sperrlogik und generische Fehlermeldung. Nach erfolgreicher Identifizierung erzeugt Aurion in beiden Fällen einen zufälligen Übergabecode mit höchstens 60 Sekunden Laufzeit und einmaliger Konsumierbarkeit.
5. Aurion leitet auf den verifizierten HTTPS-App-Link `https://arelogic.space/app/auth/callback?code=<one-time-code>&state=<request-state>` um. Der Querywert ist nur der kurzlebige Übergabecode, nie Access-, Refresh-, Provider- oder Websession-Token. Ohne installierte App zeigt dieselbe URL eine neutrale Abschlussseite.
6. Godot prüft den lokalen State und sendet Übergabecode plus `code_verifier` im JSON-Body an `POST /api/native-auth/exchange`. Aurion prüft Ablauf, Einmaligkeit, PKCE, App-Build und Transaktionsbindung atomar.
7. Aurion liefert ein kurzlebiges Access-Token und ein rotierendes Refresh-Token. Beide sind opaque Zufallswerte; serverseitig liegen nur Digests und Metadaten. Empfohlene Startwerte: Access 15 Minuten, Refresh 30 Tage absolute Laufzeit, 7 Tage Inaktivitätsgrenze. Diese Werte werden vor G09 als benannte Konstanten festgelegt.
8. Godot verwendet `Authorization: Bearer <native-access-token>` nur über HTTPS. `sdk.authenticateRequest` erhält dafür einen getrennten nativen Validator; der Preview-JWT-Pfad bleibt technisch und semantisch getrennt.
9. `gameplay.issueZoneTicket` bleibt unverändert geschützt. Das erhaltene 60-Sekunden-Ticket wird nur im ersten WSS-`hello` gesendet und nicht persistiert. Reconnect fordert ein neues Ticket an.
10. `POST /api/native-auth/refresh` rotiert das Refresh-Token atomar. Wiederverwendung eines bereits rotierten Tokens widerruft die gesamte Tokenfamilie. `POST /api/native-auth/revoke` widerruft die konkrete Sitzung; „alle Geräte abmelden“ widerruft alle nativen Sitzungen der Identität.

## Lebenszyklus und Clientverhalten

| Zustand | Clientaktion | Serverentscheidung |
|---|---|---|
| kein Login | Systembrowser-Flow beginnen | neue Transaktion oder kontrollierter Konfigurationsfehler |
| gültiger Access | tRPC/HTTPS aufrufen, danach Zonenticket beziehen | Benutzer aus nativer Sitzung auflösen |
| Access abgelaufen | genau einen Refresh synchronisieren, wartende Requests bündeln | Tokenpaar rotieren |
| Refresh abgelaufen/widerrufen | lokale Credentials löschen, Login anzeigen | `401` mit stabilem Fehlercode |
| App im Hintergrund | Access nicht vorsorglich endlos verlängern | absolute und Inaktivitätsgrenze bleiben wirksam |
| Logout | Revoke aufrufen, Antwort abwarten, lokalen sicheren Speicher löschen | Sitzung/Tokenfamilie widerrufen |
| Revoke offline | lokale Credentials sofort löschen; Server-Revoke beim nächsten Netz nur best effort | kurze Access-Laufzeit begrenzt Restfenster |

Die App speichert Refresh-Token nur verschlüsselt über Android Keystore. Access-Token darf ausschließlich im Speicher liegen. Logs, Crashreports, Telemetrie, URLs, Issues und Screenshots maskieren sämtliche Codes und Tokens.

## Rückweg und Android-Nachweis

Für Android wird ein verifizierter App Link unter `arelogic.space` gewählt. G08/G09 müssen den Manifest-Intent-Filter mit `android:autoVerify="true"`, den endgültigen Paketnamen und den SHA-256-Fingerprint des tatsächlichen Signierschlüssels mit `https://arelogic.space/.well-known/assetlinks.json` verbinden. Ein Custom-Scheme ist nur lokale Entwicklungsreserve und kein Produktionsweg.

**Noch offene externe Tatsache:** Paketname, Release-Signierzertifikat und produktive OIDC-Konfiguration sind im aktuellen Repository-Readback nicht belegt. Die kleinste Owner-Aktion ist später die Bestätigung des endgültigen Android-Paketnamens und des Release-Signing-Fingerprints im sicheren Build-/Store-Kontext. Es werden keine privaten Schlüssel oder Provider-Secrets im Chat benötigt.

## Origin und WSS

Origin ist ein zusätzlicher Browser-/Transportfilter, keine Benutzeranmeldung. Der bestehende Gateway lehnt fehlende Origins ab und erlaubt produktiv `https://arelogic.space`. Vor G09 wird mit der tatsächlich von Godot 4 auf Android gesendeten Upgrade-Anfrage geprüft, ob ein Origin-Header gesetzt werden kann und welcher Wert ankommt.

- Belegt Godot `Origin: https://arelogic.space`, bleibt die vorhandene Prüfung bestehen.
- Kann die native WebSocket-Implementierung keinen Origin senden, wird kein beliebiger oder fehlender Origin global erlaubt. Stattdessen erhält der native Handshake einen expliziten, eng begrenzten Transportvertrag; das echte 60-Sekunden-Einmalticket bleibt zwingend und wird vor dem Zonenbeitritt konsumiert.
- Ein statischer Wert in APK, User-Agent, Paketname oder Origin ersetzt niemals Ticket oder native Session.

## Geplante Implementierungsflächen für G09

Die folgenden Pfade sind **Planungsziele**, keine Behauptung über bereits vorhandene Dateien:

| Pfad | Änderung |
|---|---|
| `shared/nativeAuthContract.ts` | Eingaben, Antworten, stabile Fehlercodes und Laufzeitgrenzen |
| `server/nativeAuthProtocol.ts` | Zufallswerte, PKCE-Prüfung, Digestbildung, Rotation und Replay-Sperre |
| `server/nativeAuthRoutes.ts` | Start, App-Link-Callback, Exchange, Refresh und Revoke |
| `server/_core/oauth.ts` | bestehende Provider-Verifikation an native Transaktion anbinden |
| `server/localAuth.ts`, `server/routers.ts` | vorhandene lokale Prüfung ohne Passwortübergabe an Godot in den Browserflow einbinden |
| `server/_core/sdk.ts` | getrennte native Bearer-Authentisierung vor geschützten Prozeduren |
| `drizzle/schema.ts` plus neue Migration | Transaktionen, Übergabecodes, native Sitzungen und Tokenfamilien; nur Digests |
| `public/.well-known/assetlinks.json` | Domain-/App-Zuordnung aus finalem Paket und Release-Zertifikat |
| `godot-client/net/auth/native_auth_client.gd` | Systembrowser, PKCE, Exchange, Refresh-Synchronisierung, Logout |
| `godot-client/platform/android/secure_token_store.gd` | Keystore-gestützte Refresh-Token-Ablage über geprüfte Android-Schnittstelle |
| `godot-client/net/api/aurion_api.gd` | native Bearer-Header, 401-Refresh genau einmal, Zonenticketabruf |

Die Datenbankmigration und Serverrouten sind Auth-/Transportänderungen. Gameplay-, NPC-, Quest-, Wirtschafts- und Simulationslogik bleiben unverändert.

## Verbindliche G09-Tests

- Provider-State, Nonce und beide PKCE-Bindungen: positiv sowie falscher/vertauschter Verifier.
- Lokale Anmeldung bleibt in der Systembrowser-Seite, behält Scrypt, Lockout und kontenneutrale Fehler; das Passwort erreicht Godot nie.
- Übergabecode: einmaliger Erfolg; Replay, Ablauf, Parallelkonsum und falsche Transaktion scheitern.
- Session: Access-Ablauf, Refresh-Rotation, altes Refresh-Replay, absolute/Inaktivitätsgrenze, Einzel- und Global-Revoke.
- App Link: richtiger Host/Pfad/Paket/Fingerprint; falsche Signatur öffnet die App nicht als verifizierten Handler.
- Geheimnisfreiheit: keine Tokens in Redirect-Logs, tRPC-Fehlern, Telemetrie oder Testartefakten.
- Auth-Grenze: Preview-Bearer wird nicht zu nativer Refresh-Autorität; Browser-Logout und Native-Logout sind explizit getrennte Sitzungen.
- Zonenticket: nur authentisierte native Sitzung kann ausstellen; Ablauf und zweiter Konsum scheitern.
- WSS: erlaubter Produkt-Origin plus echtes Ticket; Origin allein, falsches Ticket und fehlendes Ticket scheitern.
- Echte Android-Probe auf dem Samsung Galaxy Tab A9: Systembrowser → App Link → Session → Ticket → WSS-Welcome → Logout → geschützter Request scheitert.

Die Produktionsprobe aus #833/#904 ist eine getrennte, revisionsgebundene Admin-/CI-Freigabekette. Sie liefert weder Spielerlogin noch native App-Sitzung und darf nicht als G09-Evidence wiederverwendet werden.

## Referenzen

- [RFC 8252 — OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252.html)
- [RFC 7636 — Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636.html)
- [Android Developers — App Links](https://developer.android.com/training/app-links/about)
