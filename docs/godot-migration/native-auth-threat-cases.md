---
description: "Fail-closed Bedrohungs- und Fehlerfallmatrix für Aurions native Godot-Anmeldung."
---

# Native Anmeldung: Bedrohungs- und Fehlerfälle

Diese Matrix ist die Test- und Reviewgrenze für G09. „Ablehnen“ bedeutet: keine Sitzung ausstellen oder verlängern, keine Zonenautorität erzeugen, Geheimnisse nicht protokollieren und einen stabilen, nicht sensitiven Fehlercode liefern.

| Fall | Erwartete Kontrolle | Ergebnis |
|---|---|---|
| Angreifer fängt App-Link-Code ab | App-PKCE und kurze Code-Laufzeit | Exchange ohne passenden Verifier abgelehnt |
| App-Link-Code wird zweimal eingelöst | atomare `consumedAt`-Bedingung | genau ein Erfolg, jeder weitere Versuch abgelehnt |
| Zwei Exchanges laufen parallel | DB-Transaktion/bedingtes Update | höchstens eine Sitzung entsteht |
| State stammt aus anderer Loginanfrage | konstante State-Prüfung und Transaktionsbindung | abgelehnt |
| Provider-State oder Nonce falsch | vorhandene OIDC-Prüfung | abgelehnt, keine Aurion-Identität |
| Provider-Callback ohne Browsertransaktion | kurzlebige serverseitige Transaktion | abgelehnt |
| PKCE-Downgrade auf `plain` | ausschließlich `S256` akzeptieren | Start/Exchange abgelehnt |
| Redirect-URI oder Rückkehr-ID frei wählbar | serverseitige exakte Allowlist | abgelehnt; kein Open Redirect |
| Fremde App beansprucht URI | verifizierter HTTPS-App-Link und Signaturfingerprint | Android ordnet Link nicht der fremden App zu |
| APK enthält Provider-Client-Secret | native App ist öffentlicher Client; kein Secret im APK | Build-/Secret-Scan scheitert |
| Webcookie wird in Godot importiert | kein Importpfad, HttpOnly bleibt Browsergrenze | nicht unterstützt |
| Preview-Bearer wird als Refresh genutzt | getrennte Tokenart, Audience/Prefix/Digestpfad | abgelehnt |
| Access-Token abgelaufen | kurze Laufzeit und serverseitige Prüfung | `401`, einmaliger Refreshversuch |
| Refresh-Token wiederverwendet | Rotation und Familien-Replay-Erkennung | gesamte Familie widerrufen |
| Refresh-Token aus anderem Gerät | Sitzungs-/Familienbindung | abgelehnt; betroffene Familie widerrufen |
| Logout bei Netzverbindung | authentisierter Revoke plus lokales Löschen | weitere Refreshs und Requests scheitern |
| Logout ohne Netz | lokales sofortiges Löschen, Access maximal 15 Minuten | kein lokaler Zugriff; Serverfenster begrenzt |
| Gerät verloren | „alle Geräte abmelden“/serverseitiger Global-Revoke | alle nativen Familien widerrufen |
| Uhr des Tablets falsch | Serverzeit entscheidet Ablauf | keine lokale Laufzeitverlängerung |
| Token in URL, Log oder Crashreport | Tokens nur Body/Header, zentrale Maskierung | Test/Scan schlägt fehl |
| Brute Force auf Übergabecode | mindestens 256 Bit Zufall, Digestablage, Rate Limit | kein erratbarer Code; Missbrauch gedrosselt |
| Fehlende DB | Authpfad fail closed | `503`, keine in-memory Ersatzsession |
| Unvollständige OIDC-Konfiguration | heutiger Konfigurationszustand plus stabiler Fehler | `503`, kein Legacy-Bypass für native Sitzung |
| App-Build nicht mehr zugelassen | serverseitige Mindestbuildregel | kontrolliertes Update-erforderlich |
| Origin erlaubt, Ticket fehlt | Origin ist keine Authentisierung | WSS 403/1008, kein Join |
| Ticket gültig, Origin falsch | beide Gates erforderlich | Upgrade oder Join abgelehnt |
| Zonenticket abgelaufen/erneut verwendet | vorhandene 60-Sekunden-/Einmalkonsumlogik | WSS-Join abgelehnt |
| Access-Revoke während bestehendem WSS | kurze Ticketbindung autorisiert den Join; Revoke-Policy in G09 explizit testen | definierter Socket-Abbruch oder kurze Revalidierungsgrenze, nie stille Dauerautorität |
| Provider nicht erreichbar | Timeout und keine halbe Transaktion | kontrollierter Fehler; erneuter Start möglich |
| Lokales Passwort wird von Godot abgefragt | Anmeldung nur auf Aurions HTTPS-Systembrowser-Seite | kein Passwortfeld und kein Passwortspeicher im Client |
| Unbekannter lokaler Handle | vorhandene Dummy-Scrypt-Arbeit und generische Fehlermeldung | keine Kontenaufzählung |
| App-Link öffnet Browser statt App | neutrale Abschlussseite ohne Tokenanzeige; Code bleibt kurzlebig | keine Session; Diagnose über App-Link-Verifikation |

## Stabile Fehlerklassen

G09 legt maschinenlesbare Codes fest, mindestens `NATIVE_AUTH_CONFIGURATION_UNAVAILABLE`, `NATIVE_AUTH_TRANSACTION_INVALID`, `NATIVE_AUTH_STATE_MISMATCH`, `NATIVE_AUTH_CODE_EXPIRED`, `NATIVE_AUTH_CODE_CONSUMED`, `NATIVE_AUTH_PKCE_FAILED`, `NATIVE_AUTH_SESSION_EXPIRED`, `NATIVE_AUTH_REFRESH_REUSED`, `NATIVE_AUTH_REVOKED`, `NATIVE_AUTH_BUILD_UNSUPPORTED` und `NATIVE_AUTH_RATE_LIMITED`.

Antworten unterscheiden gegenüber dem Client nur handlungsrelevante Zustände. Sie verraten weder, ob ein Benutzerkonto existiert, noch Providerdetails, Token-Digests oder interne Datenbankzustände.

## Evidence-Lane

1. Unit- und Vertragstests prüfen Parser, PKCE, Digests, Ablauf und Fehlercodes mit injizierter Zeit.
2. MariaDB-Integration beweist atomaren Einmalkonsum, Rotation, Parallelität und Revoke am exakten Schema.
3. HTTP-Integration beweist Header, Cookie-Abwesenheit, Redirect-Allowlist und Logmaskierung.
4. Ein signierter Android-Kandidat beweist App-Link-Verifikation, sicheren Speicher und Systembrowser-Rückkehr.
5. Das Tab A9 beweist den vollständigen Ablauf bis WSS-`welcome` und den negativen Readback nach Logout.

Kein Mock, grüner Build, Browserlogin oder CI-Produktionsprobe ersetzt den jeweils nächsten Evidence-Layer.
