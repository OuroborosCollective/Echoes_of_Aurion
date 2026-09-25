---
description: Aktueller Spieler-Einstieg in die Aurion-Living-World.
---

# Spieler-Einstieg — Echoes of Aurion

Die Startseite ist eine **Spieler-Einstiegsseite**, keine separate Portalarchitektur. Aurion besitzt den gesamten aktiven Produktfluss.

## Route ownership

| Route/Fläche | Kanonischer Owner | Zweck |
| --- | --- | --- |
| `/` | Aurion | Spielbeschreibung, Gameplay, Living World, Zugang und Spielstart |
| `/account` | Aurion | Account und bestätigte Readmodels |
| `/community` | Aurion | Community, Forum und Events |
| `/play` | Aurion | kanonische Spielruntime; Client/Renderer projiziert bestätigten Aurion-State |

AX1 ist hier keine Runtime-Authority. Der aktuelle Client enthält historische AX1-Namen aus der Migration, aber sie tragen keine Wahrheit oder Pflicht. WASD ist ebenfalls keine aktive Regelinstanz; bereits migrierte deterministische Logik läuft als Aurion-Code.

## Einstieg

1. Gäste sehen die Gameplay- und Living-World-Beschreibung und können Zugang anlegen.
2. Authentifizierung erzeugt ausschließlich bestätigten Aurion-Account-/Session-State.
3. Ein Startwunsch löst einen Aurion-Spielstart aus.
4. Der Client sendet ausschließlich Intents und rendert bestätigte Aurion-Ergebnisse.
5. Alle dauerhaften Folgen bleiben in Aurion-State, Aurion-Receipts und Aurion-Persistenz.

## Living World

Die Einstiegsseite stellt die zentralen Spielsysteme dar:

- selbständig handelnde NPCs;
- Bedürfnisse, Ziele und deterministische Entscheidungen;
- Erfahrung, Erinnerung, Kommunikation und begrenztes Vertrauen;
- Ressourcen, Handwerk, Handel und verknüpfte Ökosysteme;
- Quests und World Events als persistente Ursachen;
- Konsequenzen, die später weitere Entscheidungen auslösen.

Die Produktbeschreibung darf keine historische AX1-/WASD-Ownership als Gameplay-Versprechen darstellen.

## Account

Die Accountseite zeigt nur bestätigte Aurion-Readmodels. Sie ist keine zweite Gameplay- oder Datenbankautorität.
