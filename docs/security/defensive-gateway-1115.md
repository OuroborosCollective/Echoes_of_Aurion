---
description: "Plan für die schrittweise Absicherung des Aurion-HTTP- und Zone-Gateways."
---
<!-- coderabbit-ai-generated:v1 -->


# Defensive Gateway: Umsetzungs- und Nachweisplan

Stand: Source-Baseline `dd14bfe65f30abce4ee8a9e6c8087c6e5255c6e0`; Issue [#1115](https://github.com/OuroborosCollective/Echoes_of_Aurion/issues/1115). Dieser Plan autorisiert keinen Produktionsrollout. Zahlen und Betriebszustände müssen vor einer Aktivierung gemessen werden.

## Bekannter Stand und offene Betriebsdaten

| Bereich | Source-Befund | Grenzen der Aussage |
| --- | --- | --- |
| HTTP | `_core/index.ts`: global 3.000 Anfragen je 15 Minuten; Native Auth 20/Minute; Production Probe 30/Minute. Der globale Limiter steht vor den Health-Routen. | Prozesslokale Grenzwerte sind keine nachgewiesene gemeinsame Sperre mehrerer Instanzen. |
| Proxy | Produktion setzt Express `trust proxy` über `TRUST_PROXY_HOPS`, bei fehlender Einstellung auf einen Hop. | Route, direkte Erreichbarkeit und vertrauenswürdige Hops sind im Live-Betrieb nicht geprüft. Eine Hop-Anzahl allein belegt keine sichere Herkunft. |
| Zone | `zoneGateway.ts`: Origin-Prüfung, maximal 2.048 Bytes und fünf Sekunden bis zur ersten Nachricht; Ticket wird nach gültigem Hello konsumiert. | Die Hello-Frist wird beim Eingang der ersten Nachricht aufgehoben, bevor Ticketprüfung und Recovery abgeschlossen sind. Eine Grenze für gleichzeitig ausstehende Handshakes ist dort nicht erkennbar. |
| Browser/Health | `client/src/main.tsx` liest einen Bearer-Fallback aus `sessionStorage`; öffentliche Health-Endpunkte liefern ausführliche Betriebsdaten. | Kein tatsächlicher Datenabfluss oder sicherer Ersatzvertrag ist dadurch belegt. Bestehende Release- und Login-Verbraucher sind vor Änderungen zu erfassen. |

Phase 0 muss lesend belegen: laufende Image-Digests und eingebettete FusionAuth-Version, Release-SHA, Proxy-Routen und TLS-Endpunkte, direkte Backend-Erreichbarkeit, tatsächliche Hop-Kette und Weiterleitungsheader, Anzahl Instanzen und verwendete Rate-Limit-Stores. Zusätzlich Speicherplatz, Backup-/Restore-Beleg, Auth-Schema, freigegebenen Rückrollstand und verfügbare Staging-Ressourcen erfassen. Versionsspezifische Vendor-Hinweise erst nach belegter Version prüfen. Keine Angriffstests gegen echte Konten durchführen. Fehlender Zugang bleibt ein offener Nachweis.

## Erster separater Implementierungsschnitt

1. **Beobachten:** In Staging einen standardmäßig deaktivierten HTTP- und Handshake-Beobachter einbauen. Nur feste Regelkategorie, Entscheidung `observe`, Zeit und servererzeugte Korrelations-ID erfassen; keine IP, Header, URL-Abfrage, Tokens, Nutzlasten, E-Mail oder Passwörter. Speicher, Eventrate und Aufbewahrung begrenzen; voller oder nicht verfügbarer Beobachter darf Anfragen weder blockieren noch Gameplay beeinflussen. Nicht mit Client-supplied IDs korrelieren.
2. **Identität:** Netzwerkidentität erst nach belegter Infrastrukturgrenze auswählen. Weiterleitungsheader nur von ausdrücklich vertrauenswürdigen Proxy-Adressen übernehmen; direkte oder unerwartete Peers und gefälschte Header dürfen keine andere Identität erzeugen. IPv4/IPv6 und gemeinsam genutzte NAT-Adressen berücksichtigen. Bei ungeklärtem Trust-Vertrag keine IP-basierte Durchsetzung aktivieren. Ein Multi-Instanz-Entwurf muss einen gemeinsamen, begrenzten Store und dessen Ausfallverhalten festlegen.
3. **Handshake:** Im Gateway ausstehende Upgrades und noch nicht abgeschlossene Authentisierung zählen; auch Ticketprüfung und Zone-Recovery müssen zeitlich und mengenmäßig begrenzt sein. <!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:eac0d0a990d08cd15fc2864b1059a6ff2bfca1c5d5538f194445af86aac9985b -->

Bei Ablehnung durch die vorgelagerte Admission muss ein gültiges Ticket unverbraucht bleiben; der bestehende einmalige Konsum danach bleibt erhalten.

<!-- /coderabbit-ai-generated:v1 --> Abschluss, Fehler, Timeout, Socket-Close und Shutdown geben Plätze genau einmal frei. Eine verspätete asynchrone Antwort darf keinen abgelaufenen Socket verbinden. Bestehende Version-Reject-Nachricht, zulässige Origins, Android/Godot-Reconnect und eine einzige Aurion-Authority bewahren.
4. **HTTP:** Sensible unauthentifizierte Pfade anhand einer festen Route-Tabelle erfassen, nicht anhand eines vom Client gelieferten Auth-Claims. Unbekannte Pfade erhalten keine privilegierte Ausnahme. Health-Probes nur nach tatsächlich belegtem Netzwerkweg berücksichtigen. Schwellwerte aus Staging-Baseline und Fehlalarmdaten festlegen; Durchsetzung mit kurzem `429` und `Retry-After` erst in einem gesondert überprüften Schritt. Keine dauerhaften IP-Sperren.
5. **Freigabe und Rücknahme:** Feature-Flag und operativer Kill-Switch standardmäßig aus. Entscheidung und Konfigurationsrevision dokumentieren; Rücknahme durch Deaktivieren und vorheriges geprüftes Image. Falls das Wegfallen eines gemeinsamen Stores die Sicherheitsgrenze beeinträchtigt, privilegierte Vorgänge gemäß ihrer bestehenden Autorisierung fail-closed halten; Spieltraffic darf nicht in eine zweite Welt umgeleitet werden.

Diese Schritte sind Entwurf und keine aktivierten Schutzmechanismen. Konkrete Limits und ein Speicherformat stehen erst nach Messung und Datenschutzprüfung fest.

## Mess- und Testplan

Vor Festlegung von Schwellen denselben Commit und dieselbe Umgebung mit normalem 10-Hz-Zonenverkehr messen: gleichzeitige angemeldete Spieler, Handshake-/Reconnect-Rate, p50/p95/p99 für Hello→Welcome und Snapshot, Tick-Latenz, CPU, RSS, Pending-Handshake-Zahl und Queue-Tiefe. Gleiche Messung mit Beobachter und anschließend mit einem isolierten Flood-Generator wiederholen; Lastprofil, Dauer, Hardware, Stichprobengröße und Unsicherheit festhalten. Akzeptanzgrenzen vor der Durchsetzung aus den gemessenen Werten festlegen, nicht nachträglich lockern.

Pflichtfälle im isolierten Test: manipuliertes `X-Forwarded-For`, direkte und erlaubte Proxy-Peers, IPv4/IPv6 und gemeinsames NAT; ungültiger/abgelaufener Hello, verzögerte Ticketprüfung und Recovery, Disconnect und Timeout, doppelte und wiederverwendete Tickets, Mengenlimit und Freigabe nach Timeout, Überlastung und Store-Ausfall. Ein zulässiger Spieler muss nach Freigabe wieder verbinden können; kein Ticket darf vor Admission verbraucht werden.

Echte WebSocket-Regression: Hello→Welcome→Snapshot, Bewegung, Angriff, Skill und Cooldown, Gruppen-Reentry, Neustart/Reconnect und inkompatible Protokollversion. Auth-Grenzen: Browser-OAuth, Native PKCE/Refresh, CSRF, App-Link und echte Anmeldung in geeigneter Testumgebung. Logtests prüfen explizit, dass keine Credentials, Header, Voll-URLs oder Payloads ausgegeben werden. Tests mit Fakes belegen nur einzelne Schnittstellen, keine Produktionsbereitschaft.

## Weitere getrennte Schritte

- CSP zunächst Report-Only mit begrenzter, redigierter Auswertung; danach Regeln anhand tatsächlicher Browser- und OIDC-Verbraucher festlegen. Ersatz für den Browser-Bearer erst nach Prüfung von WebView, Native- und OIDC-Sitzung entwerfen.
- Minimale öffentliche Liveness und berechtigte detaillierte Readiness zuerst gegen alle bestehenden Container-, Release- und Readback-Verbraucher abgleichen. Die aktuelle `/healthz`-Antwort und deren Consumer sind bestehende Verträge; eine Umstellung braucht einen kompatiblen Migrationspfad.
- Deception bleibt eine eigene spätere Entscheidung: ausschließlich synthetischer HTTP-Dienst, Vorabbeobachtung und hoher Konfidenzgrad; getrennte Netz-/Credential-Grenzen, standardmäßig kein Egress, Ressourcenlimits, keine echten Daten, eigenständiger Rollback und ausdrückliche Freigabe. Bestehende authentifizierte WebSockets bleiben bei Aurion.

## Abschlussbelege

Für jeden Implementierungsschnitt Source-SHA, unveränderte Integritäts-/Sicherheitsprüfungen, Test- und echte Runtime-Readbacks, Messwerte, Artefakt-/Image-Digest und Rücknahmebeleg festhalten. Staging und Live ausdrücklich unterscheiden. Vor einem späteren Merge verlangt das Repository einen kurzen `Memory.md`-Eintrag mit Änderung, Erkenntnis und Evidence; ein Draft allein ist kein Merge- oder Rollout-Nachweis.
