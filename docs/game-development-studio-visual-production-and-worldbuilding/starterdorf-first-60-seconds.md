---
description: >-
  First-60-Seconds-Blueprint für das Starterdorf: sofortiges Presentation-Feedback
  auf einer weiterhin vollständig serverautoritativen 10-Hz-Gameplay-Spur.
---

# Starterdorf — First 60 Seconds

## Zweck

Diese Seite bindet die UX-/Game-Feel-Arbeit an die echte Aurion-Starterdorf-Spur aus [PR #739](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/739). Sie ist **keine neue Gameplay-Authority** und führt weder Unity noch Game Development Studio, Wolfram, alphaXiv, Exa oder ein LLM als Runtime-Abhängigkeit ein.

Die kanonische Journey bleibt:

`Return Stone / Spawn → Nordtor → bestätigter NPC → Quest-Annahme → Encounter → Turn-in → Restart-Readback`

Der vollständige Pilot in PR #739 verifiziert darüber hinaus sechs kanonische Encounter sowie Quest-/Inventory-Persistenz nach einem echten Anwendungsneustart.

{% hint style="warning" %}
Presentation darf Absicht sofort sichtbar machen. Position, Questzustand, Combat, Rewards, Inventory und World-Truth werden dadurch niemals vorweggenommen oder lokal wahr.
{% endhint %}

## Truth Boundary

```text
Pointer / Joystick
      ↓
lokales Presentation-Feedback
(knob, marker, easing, audio, haptic, particles)
      ↓
Input Intent
      ↓
Aurion 10-Hz Zone / Gameplay Authority
      ↓
bestätigter Readback / Receipt
      ↓
kanonische UI-Projektion
```

Bei 10 Hz beträgt ein Tick 100 ms. Eine gleichverteilte Ankunft innerhalb eines Ticks ergibt rechnerisch eine mittlere Wartezeit von **50 ms** bis zum nächsten Tick und p95 **95 ms**. Bei 60 FPS liegen etwa **6 Darstellungsframes** zwischen zwei autoritativen Ticks. Diese Frames dürfen für rekonstruierbares Feedback genutzt werden; sie dürfen keine bestätigte Weltänderung vortäuschen.

## First-60-Seconds-Slices

### 1. Bewegung erklärt sich selbst

Für den bereits vorhandenen Joystick:

- Knob folgt dem Pointer sofort lokal.
- Direction/Intensity darf rein visuell verstärkt werden.
- Release springt deterministisch auf neutral zurück.
- Kein lokaler Player-Position-Commit.
- Serverbestätigte Position bleibt die einzige World-Truth.

Für Touch-to-Move:

- Joystick und Touch-to-Move bleiben klar getrennte Modi.
- Ein Zielmarker darf den Touch-Intent sofort anzeigen.
- Marker und Kamera-Easing sind Presentation; der Zielpunkt wird erst durch den kanonischen Bewegungs-/Navigationspfad wirksam.

### 2. Erster NPC als Onboarding-Buddy

Der erste **serverbestätigt verfügbare** NPC kann als räumliche Orientierung dienen:

- dezente POI-/Outline-/Licht-Führung,
- ein kurzer kontextueller Hinweis statt Tutorial-Modal,
- sichtbares nächstes Ziel,
- keine erfundene NPC-Verfügbarkeit,
- keine lokale Questannahme.

Die Browser-Onboarding-Literatur liefert hierfür eine Designhypothese: kurze, in-world Begleitung kann anfängliche Verwirrung reduzieren. Das ist externe Research-Evidence, kein Aurion-Runtime-Beweis.

### 3. Bestätigte Ereignisse verstärken

Nach serverbestätigtem Readback dürfen beispielsweise ausgelöst werden:

- Quest-Accept-Impuls,
- bestätigter Encounter-Treffer,
- Quest-Step-Completion,
- Turn-in,
- Reward-/Inventory-Bestätigung.

Geeignete Mittel sind Audio, Haptik, Partikel, Color Flashing, kurze Trails oder UI-Easing. Diese Effekte sind rekonstruierbare Presentation und besitzen keine Persistenz- oder Kausalautorität.

## Research-Evidence

Die Survey-Arbeit [Designing Game Feel](https://arxiv.org/abs/2011.09201) strukturiert Game Feel als **Tuning**, **Amplification/Juicing** und **Support/Streamlining**. Für Aurion sind vor allem sofortige Rückmeldung, temporale Konsistenz, Points of Interest und klare Ereignisverstärkung relevant, solange die Gameplay-Authority unverändert bleibt.

Wolfram wurde ausschließlich für deterministische Berechnungen der 10-Hz-Zeitgrenzen verwendet. alphaXiv und Exa dienen ausschließlich als externe Recherche-/Quellenschicht.

## CI- und Evidence-Gate

PR #739 darf erst als Beweis gelten, wenn der exakte Head Folgendes erfolgreich ausführt:

- MariaDB-Migration + Build,
- 10-Hz-Return-Stone-/Movement-Regressions,
- runtime-spezifisch blockierten externen Egress bei weiter funktionierendem Runner-Control-Plane,
- authentifizierte HTTP/tRPC + Zone-WebSocket-Journey,
- Neustart der kompilierten Runtime,
- unabhängigen Quest-/Inventory-Readback,
- Browser-Acceptance für Phone, Tablet, Desktop und Landscape,
- revisionsgebundene Evidence-Dateien + SHA256SUMS.

Chromium-Viewport-Emulation ist ausdrücklich **kein** physischer Android-/GPU-Beweis.

## Arbeitsnachweise

- GitHub: [PR #739](https://github.com/OuroborosCollective/Echoes_of_Aurion/pull/739)
- Linear: [THO-5](https://linear.app/thorsu/issue/THO-5/aurion-starterdorf-pr-739-runtime-scoped-egress-isolation-evidence)
- Canva: [Aurion Starterdorf — First 60 Seconds](https://canva.link/2vrudhairjpeaz4)

## Dauerregel

`Memory.md lesen → Integration → Runtime/Regression/Evidence → exakt einen kurzen Memory-Eintrag mit Änderung + Erkenntnis + Evidence → erst dann Merge`

Bis die vollständige Evidence grün ist, bleibt der Status **PARTIAL**.
