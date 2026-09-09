---
description: "AX1: optionale Backend-Wahl, generationsgebundener Neustart und getrennte Prüfnachweise."
---

# AIM-290 — Renderer und Recovery

AX1 verwendet weiterhin WebGL2 als Standard. Die Renderer-Fabrik erhält keine Gameplaydaten. Nach expliziter WebGPU-Wahl prüft sie Browserfähigkeit und tatsächliche Initialisierung. Three.js' eigener WebGL-Fallback wird erkannt und durch den bestehenden WebGL2-Releasepfad ersetzt. Die Klasse `WebGPURenderer` allein gilt nicht als Backend-Nachweis.

Für eine gezielte Sitzung lässt sich vor dem Spielstart `sessionStorage.setItem("aurion:renderer", "webgpu")` setzen. `webgl2` beziehungsweise das Entfernen dieses Eintrags schaltet den optionalen Pfad aus. Ein expliziter `renderer`-Queryparameter auf `/play` hat Vorrang. Das ist eine Präsentationseinstellung ohne Gameplaywirkung.

## Lebenszyklus

Eine Generation besitzt Renderer, Abbruchsignal, Frame-Loops, GLB-/NPC-Projektionen, Weltasset-Cache und Zone-Ticket-Bindung. Nach asynchroner Initialisierung startet die Figur-/NPC-Ladung und eine neue authentifizierte Zone-Verbindung. Rendering beginnt erst nach dem eigenen bestätigten Positionssnapshot.

Context-/Device-Loss beendet die alte Generation einschließlich Inputs, Verbindungen und Projektionen. Recovery liest einen frischen authentifizierten Weltkontext, verwendet WebGL2, erstellt eine neue Engine und baut Asset-/Manifest-Projektionen erneut aus den bestätigten Quellen auf. Alte Tickets, Snapshots und verspätete Initialisierungen dürfen diese Generation nicht ersetzen. Pro Weltbesuch sind höchstens zwei automatische Wiederherstellungen erlaubt; weitere Fehler halten die Welt sichtbar an.

Die Material-Emission nutzt denselben externen Präsentationstakt und denselben Puls wie zuvor, über `emissiveIntensity` statt GLSL-`onBeforeCompile`. WebGPU-Partikel verwenden instanzierte TSL-Sprites mit den bestehenden Positions-, Farb-, Größen- und Alpha-Puffern. Die 18 Quellgeneratoren bleiben unverändert. Renderzeit, Materialintensität und Backend bestimmen keinen WASD-Tick und keinen Welt-/NPC-/Gameplayhash.

## Nachweise

`renderer-evidence` meldet angefordertes und initialisiertes Backend, Fallback-Grund, Generation, Wiederherstellungsversuch, Fehlerursache und Weltkontext. `rendering` wird erst nach einem tatsächlichen Frame gesetzt. Der separate Weltasset-Readback nennt Katalog-/Kollisionshash, Ladefehler und Ressourcenstand.

Die dedizierte `AIM-290 Renderer and Recovery`-Lane verwendet den gebauten Server, echte isolierte MariaDB, Registrierung, öffentlichen GLB-Upload und Zone/WebSocket-Verbindungen. Phone-, Tablet- und Desktop-Profile prüfen WebGL2, tatsächlichen Context-Loss, WebGPU-Initialisierung, tatsächliches `GPUDevice.destroy()` und den anschließenden WebGL2-Rebuild. Screenshots und JSON-Nachweise werden an den Commit gebunden veröffentlicht. Ein stiller WebGL2-Fallback erfüllt den WebGPU-Test nicht.

CI-SwiftShader ist echte Software-Rendering-Evidence; sie beweist keine Hardwareleistung, kein natives Mobilgerät und keinen authentifizierten Produktionslauf. Diese Grenzen bleiben getrennte Abnahmen. Source-/Unit-Tests beweisen ebenfalls keinen Live-Deploy.

## Primärquellen

- [Three.js WebGPU-Migrationsvertrag](https://threejs.org/manual/en/webgpurenderer.html)
- [Chromium SwiftShader-Verwendung](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)
- [Chrome WebGPU-Prüfung im Headless-Browser](https://developer.chrome.com/blog/supercharge-web-ai-testing)

Die konkrete Implementierung wurde gegen den gepinnten Three.js-Quellcode `0.185.1` geprüft.
