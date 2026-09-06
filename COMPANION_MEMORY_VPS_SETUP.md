---
description: Persistenz- und Evidence-Grenze für Companion-Trainingsdaten.
---

# Companion Memory VPS Setup

## Ownership

Companion-Lernen ist von Gameplay-Authority getrennt:

- **AX1** erfasst im sichtbaren Spiel ausdrücklich freigegebene Trainingsbeobachtungen und Bedienaktionen.
- **WASD** bleibt Eigentümer jeder Gameplayentscheidung, auch wenn ein Companion später Vorschläge oder gelernte Aktionen nutzt.
- **Aurion** darf Trainingssamples, Feature-/State-Vektoren, Aktionslabels, Session-/Sequence-IDs und Receipts persistieren und auf der Accountseite **read-only** anzeigen.

Aurion, Redis oder eine Trainingsdatenbank dürfen niemals aus einem gespeicherten Sample eigenständig einen Gameplaybefehl ausführen.

## Persistenz

Die bestehende Pipeline ist local-first. Gültige Beobachtungen können nutzer- und sessiongebunden als append-only JSONL-Evidence gespeichert werden. Wenn `REDIS_URL` gesetzt ist, kann eine idempotente Redis-Replikation unter einem nutzer-/session-/sequenzgebundenen Namespace erfolgen.

Rohbilder werden nicht als allgemeine Redis-Memory repliziert. Der Serveradapter hält nur die für das Training vorgesehenen gebundenen Feature-/Action-/State-Daten und kurze Notizen.

Secrets und Connection Strings gehören ausschließlich in das nicht versionierte Runtime-Environment und werden weder in Dokumentation noch Receipts ausgegeben.

## Failure boundary

- Redis-Ausfall darf Gameplay nicht verändern.
- Trainingsspeicher-Ausfall darf keine WASD-Regel umgehen.
- Ein fehlendes Sample wird als fehlende Evidence behandelt, nicht synthetisch ersetzt.
- Replay/duplicate Sample IDs dürfen keine zweite Trainingsbeobachtung erzeugen.

## Aurion Account Readmodel

Die Website darf beispielsweise anzeigen:

- Anzahl bestätigter Samples;
- Session IDs;
- Sequence-/Sample IDs;
- Zeit-/Receipt-Metadaten;
- Trainings-/Dataset-Status.

Sie darf keinen Companion starten, stoppen, steuern, trainieren oder eine gelernte Aktion direkt ins Spiel senden.

## Evidence

Ein gespeichertes Sample beweist ausschließlich die gespeicherte Trainingsbeobachtung. Es beweist weder, dass ein Modell daraus gelernt hat, noch dass eine spätere Companion-Aktion korrekt ist. Lern-/Modellevidence und WASD-Gameplay-Evidence müssen separat geprüft werden.
