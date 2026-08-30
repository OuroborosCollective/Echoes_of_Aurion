# Echoes of Aurion — externe Veröffentlichungen

**Zweck:** Aufmerksamkeit, qualifizierte Playtester und konstruktives Feedback gewinnen.

**Kanonischer Einstieg:** https://arelogic.space/

**Technischer Beleg:** https://github.com/OuroborosCollective/Echoes_of_Aurion

## Veröffentlichungslogik

Jeder Beitrag hat einen eigenen Zweck und wird nicht wortgleich auf mehreren Plattformen wiederholt. Die zentrale Handlungsaufforderung lautet: **aktuellen Aurion-Playtest öffnen**. Der technische Beitrag richtet sich an Entwickler, der Reddit-Beitrag an MMO-Spieler, die itch.io-Fassung an neue Tester und die GitHub-Fassung an Personen, die den Entwicklungsverlauf nachvollziehen möchten.

| Kanal | Sprache | Primärer Zweck | Hauptlink | Status |
| --- | --- | --- | --- | --- |
| itch.io | Englisch | Spielseite und Playtest-Einstieg | https://arelogic.space/ | Entwurf |
| r/IndieMMORPG | Englisch | Diskussion und Feedback | https://arelogic.space/ | Entwurf |
| DEV Community | Englisch | Technischer Devlog | https://arelogic.space/ | Entwurf |
| GitHub Discussions/README | Deutsch/Englisch | Build-in-public und Belege | https://github.com/OuroborosCollective/Echoes_of_Aurion | Entwurf |
| Substack/Medium | Deutsch | Erklärender Leitartikel | https://arelogic.space/ | Entwurf |

---

## 1. itch.io — Spielbeschreibung

### Titel

**Echoes of Aurion — Browser 3D Co-op Adventure with an Optional AI Companion**

### Kurzbeschreibung

A browser-based, isometric 3D action adventure where a human Explorer and an Echo Scout face three evolving ruin arenas together. Play the current build, shape an actively developed world through reproducible feedback, and decide whether an optional AI companion should learn from your play.

### Beschreibung

**Aurion begins at the last observatory.**

Echoes of Aurion is a mobile-aware, isometric 3D action adventure for the browser. The first run takes you through the Observatory of Asterion, the Sunken Archive Hall and the Solarium of the Last Flame. Each arena changes the objective, Sentinel pressure and visible world state.

The core loop is direct: move your Explorer with WASD or the touch bridge, use the spear signal to create openings, equip three partner protocols and coordinate the Echo Scout through visible commands. The current standard loadout includes Prisma Step, Echo Shield and Aurion Resonance. The game is actively evolving, so the public build is a testable development state rather than a finished promise.

Aurion also experiments with an optional, player-controlled AI companion. The companion does not appear automatically. You connect an authorized partner, explicitly start **Learn / Record**, play while the system records normalized observation-and-action pairs, then finish learning before enabling **Go / Play**. **Stop / Despawn** removes the companion from the scene again. The player remains in control, and protected quest, loot and world state are confirmed by the game runtime rather than written directly by an LLM.

The project is built openly. Feedback is most useful when it includes your browser or device, exact reproduction steps, the expected result and what actually happened. Screenshots and arena names are helpful for rendering or quest issues.

**Open the current Aurion playtest:** https://arelogic.space/

**Follow the development repository:** https://github.com/OuroborosCollective/Echoes_of_Aurion

### Tags

`browser-game`, `indie-mmorpg`, `3d`, `co-op`, `action`, `fantasy`, `playtest`, `ai-companion`, `typescript`, `babylonjs`

---

## 2. r/IndieMMORPG — Playtest-Diskussion

### Titel

**We are testing a browser-based 3D co-op adventure where the AI companion has explicit Learn, Play and Stop states — what would you test first?**

### Beitrag

We are building **Echoes of Aurion**, an isometric 3D browser adventure with MMO ambitions. The current public build starts in the Observatory of Asterion and continues through the Sunken Archive Hall and the Solarium of the Last Flame. The player moves with WASD or touch controls, fights Sentinels with a spear signal and coordinates an Echo Scout through a visible command bridge.

The unusual part is the companion lifecycle. The optional AI teammate is not an instant party member. The player must connect an authorized partner, start **Learn / Record**, demonstrate actions in the game, finish the learning phase and then choose **Go / Play**. **Stop / Despawn** removes the companion immediately. The goal is to make the boundary visible and testable instead of hiding autonomous behavior behind a chat interface.

We are looking for focused playtest feedback rather than generic promotion. In particular, we want to know whether the three states are understandable, whether the action feedback is legible on mobile, whether the three arenas feel meaningfully different and whether the companion adds useful team presence without taking control away from the human player.

The current build is here: **https://arelogic.space/**

If you test it, please report browser/device, steps, expected result and actual result. The repository and development evidence are here: **https://github.com/OuroborosCollective/Echoes_of_Aurion**.

**Question for MMO players:** Which boundary would make you trust an AI party member more: an explicit spawn state, a visible action log, a one-button despawn, or all three together?

---

## 3. DEV Community — technischer Devlog

### Titel

**Designing a Player-Controlled AI Companion for a Browser Game**

### Einleitung

An AI companion is easy to describe and difficult to bound. In Echoes of Aurion, we are treating it as a visible game-system lifecycle rather than a chat box with hidden control. The companion begins disconnected, enters an explicit learning phase, becomes eligible for play only after learning finishes and disappears again when the player stops it or goes offline.

### Beitrag

Echoes of Aurion is a React, TypeScript, Vite and Babylon.js browser game. Its first public run uses an Explorer and an Echo Scout across three ruin arenas. The human controls movement and the spear signal. A partner can receive a small allowlisted command vocabulary and three equipped ability slots.

The central design decision is to separate **observation**, **learning** and **play**. During Learn / Record, the runtime captures a fresh visual frame, a normalized feature vector, the human action and a bounded state vector. The local dataset row is linked to the session, sequence index, timestamp, sample identifier and a short note. The server stores the normalized observation only after schema validation and keeps the game authority separate from the learning record.

The lifecycle is intentionally strict. A connected partner is not enough to spawn a character. Play requires a completed learning state. A stop action transitions the companion out of the scene, and an offline event closes the active session fail-closed. Incoming partner commands are rejected unless the companion is in the confirmed play state. Gameplay damage, quest completion and loot remain server-confirmed.

This architecture is less flashy than an autonomous demo, but it gives the player a legible contract: **the system can observe only during Learn, can act only during Play, and can be removed with Stop**. That distinction is particularly important for a browser game where the same UI needs to work on desktop and mobile.

The current build is available at **https://arelogic.space/**. The implementation and tests are public in the repository at **https://github.com/OuroborosCollective/Echoes_of_Aurion**.

For the next test cycle we are interested in three questions: does the interface communicate state transitions without technical knowledge, does the action log make companion behavior auditable, and do mobile users understand which actions are human input versus partner input?

### Tags

`showdev`, `typescript`, `babylonjs`, `architecture`, `ai`, `gamedev`, `indiedev`, `webdev`

---

## 4. GitHub — Entwicklungsupdate

### Titel

**Public playtest update: three arenas, explicit companion lifecycle, and focused feedback requests**

### Text

Echoes of Aurion has a public browser build for the current expedition loop. The first run covers the Observatory of Asterion, the Sunken Archive Hall and the Solarium of the Last Flame. The Explorer uses WASD or touch controls; the Echo Scout uses a visible, allowlisted command bridge and equipped ability slots.

The companion flow is now documented as three explicit states: **Learn / Record**, **Go / Play** and **Stop / Despawn**. Learning records normalized observation-and-action pairs. Play is available only after learning finishes. Stop removes the companion and blocks further partner actions. The game runtime remains authoritative for protected gameplay effects.

Play the current build at **https://arelogic.space/**. When reporting an issue, include device/browser, exact steps, expected result, actual result and the arena or quest name. This is especially useful for mobile HUD readability, scene loading, companion despawn and quest-state transitions.

---

## 5. Substack oder Medium — deutschsprachiger Leitartikel

### Titel

**Echoes of Aurion: Warum ein guter KI-Spielpartner zuerst Grenzen braucht**

### Teaser

Ein browserbasiertes 3D-Koop-Abenteuer testet nicht nur Kämpfe und Quests, sondern auch eine neue Form des Teamplays: Ein optionaler KI-Begleiter darf erst beobachten, dann lernen und erst danach spielen. Der Spieler entscheidet jederzeit, wann der Echo Scout erscheint und wann er wieder verschwindet.

### Text

Echoes of Aurion beginnt in der letzten Sternwarte. Von dort führt der aktuelle Run durch drei Ruinenarenen: die Sternwarte Asterion, die versunkene Archivhalle und das Solarium der letzten Flamme. Der Spieler bewegt seine Figur über WASD oder eine Touch-Brücke, setzt mit dem Speersignal Angriffsfenster und rüstet sichtbare Protokolle für den Echo Scout aus.

Der Companion ist nicht als versteckter Autopilot gedacht. Nach der Verbindung startet der Spieler ausdrücklich **Learn / Record**. Während dieser Phase werden Spielbeobachtungen mit menschlichen Aktionen verbunden. Erst wenn die Lernphase beendet ist, kann **Go / Play** den Echo Scout als sichtbaren Charakter in die Szene bringen. Mit **Stop / Despawn** endet die Phase sofort. Auch bei einem Offline-Ereignis wird der Begleiter aus dem Spiel genommen.

Diese Trennung ist nicht nur eine technische Einzelheit. Sie beantwortet eine wichtige Vertrauensfrage: Wer entscheidet, wann eine KI im Spiel handelt? In Aurion soll die Antwort sichtbar beim Menschen liegen. Der Companion kann Vorschläge und erlaubte Befehle liefern, aber Questfortschritt, Beute, Schaden und Weltzustand werden von der Spielregel bestätigt.

Das Projekt befindet sich in aktiver Entwicklung. Genau deshalb ist der öffentliche Playtest wertvoll. Ein guter Testbericht braucht keine große Analyse: Browser oder Gerät, kurze Reproduktionsschritte, erwartetes Ergebnis und tatsächliches Ergebnis reichen oft aus, um aus einem Gefühl einen überprüfbaren Fehler zu machen.

**Aktuellen Aurion-Playtest öffnen:** https://arelogic.space/

**Entwicklungsverlauf ansehen:** https://github.com/OuroborosCollective/Echoes_of_Aurion

---

## Veröffentlichungs- und Messhinweise

Vor dem Versand werden Titel, Communityregeln, Bildrechte und Linkziel je Plattform manuell geprüft. Es werden keine identischen Massenposts, künstlichen Kommentare oder ungefragten Direktnachrichten eingesetzt. Pro Beitrag genügt ein Hauptlink zu arelogic.space und höchstens ein ergänzender Beleglink.

Für die erste Auswertung werden ausschließlich nachvollziehbare Signale protokolliert: Klicks aus dem jeweiligen Beitrag, neue Konten, gestartete Playtests, reproduzierbare Bugreports und wiederkehrende Tester. Suchvolumen, Reichweite oder Conversion-Raten werden nicht behauptet, solange keine verlässlichen First-Party-Daten vorliegen.

## Quellen

[1]: https://arelogic.space/ "Echoes of Aurion — öffentliche Website"
[2]: https://github.com/OuroborosCollective/Echoes_of_Aurion "Echoes of Aurion — öffentliches Repository"
[3]: https://github.com/OuroborosCollective/Echoes_of_Aurion/blob/main/COMPANION_MEMORY_VPS_SETUP.md "Companion Memory VPS Setup"
[4]: https://www.reddit.com/r/IndieMMORPG/ "r/IndieMMORPG"
[5]: https://dev.to/ "DEV Community"
[6]: https://itch.io/developers "itch.io Developers"
