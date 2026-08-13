# Game Plan: Echoes of Aurion

## Risk Tasks

### 1. Mobile 3D-Inszenierung mit einer spielbaren isometrischen Kamera
- **Why isolated:** Eine performante 3D-Szene muss auf kleinen Displays lesbar bleiben und gleichzeitig merklich komplexere Formen als Platzhalterwürfel liefern.
- **Approach:** Babylon rendert eine begrenzte Diorama-Arena aus prozeduralen Zylindern, Kapseln, Torusringen, Säulen, Bögen, Sternwartenfragmenten und emissiven Effekten. Die Kamera bleibt in einer gedämpften isometrischen Perspektive und wird an die Displaygröße angepasst.
- **Verify:** Die Szene enthält zwei unterscheidbare Teamfiguren, einen Sentinel, nichtkubische Ruinen und eine klare Bildtiefe; die Kamera bleibt bei Touch und Resize stabil.

### 2. Transparenter LLM-Befehlsadapter statt einer nicht autorisierten Chat-App-Steuerung
- **Why isolated:** Ein reines Frontend kann keine privaten Apps des Nutzers lesen oder verdeckt eine frei gewählte MCP-Verbindung betreiben.
- **Approach:** Der Prototyp erzwingt einen sichtbaren Verbindungsfluss vor der Freigabe des Menüs. Ein lokaler, eng begrenzter Adapter akzeptiert ausschließlich `W`, `A`, `S`, `D`, `1`–`9`, schreibt jeden Impuls in ein Browser-Ledger und löst sofort eine Begleiter-Aktion aus. Eine reale autorisierte Gateway-Anbindung ist klar als spätere Server-Erweiterung markiert.
- **Verify:** Ohne gekoppelten Partner erscheint kein Loadout und keine Mission; erlaubte Befehle bewegen oder aktivieren den Begleiter sichtbar, ungültige Befehle werden abgewiesen und protokolliert.

### 3. Mobile Eingaben und Desktop-Tastatur ohne konkurrierende Steuerpfade
- **Why isolated:** Touch-Steuerung, Bildschirmgrößen und die klassische WASD-Logik müssen gleichzeitig verständlich und konfliktfrei funktionieren.
- **Approach:** Die menschliche Figur reagiert auf WASD und eine Touch-Steuerbrücke. Der Begleiter erhält Kommandos über das sichtbare Gateway und die ausgerüsteten Slots. Die Schnittstelle wechselt am Breakpoint zu einer vertikalen Feldgerät-Anordnung.
- **Verify:** WASD bewegt die Expedition, Touch-Pad-Impulse bewegen den Menschen, KI-Kommandos bewegen nur den Begleiter bzw. erzeugen Aktionsimpulse; die HUD-Elemente bleiben ohne Überlagerung lesbar.

## Main Build

Der erste Build ist ein Singleplayer-Koop-Abenteuer. Nach der Wahl eines LLM-Partners und einer sichtbaren lokalen Testkopplung werden Charakter, drei Partnerfähigkeiten und die Mission freigeschaltet. Der Spieler bewegt den Explorer durch eine Ruinenarena und koordiniert den Sentinel-Kampf über einen protokollierten Partner-Feed.

- **Assets needed:** Key-Art als visuelle Leitlinie; Himmelstadt-Backdrop; Sentinel-Cutout für den Verbindungsbereich; Aurion-Siegel als App-Icon; Konsolendetail als Menu-Textur.
- **Verify:**
  - Bewegung folgt der Eingabe und die Teamfiguren bleiben klar getrennt.
  - Partner-Befehle führen zu sichtbarer Bewegung oder Fähigkeitseffekten.
  - Das lokale Ledger wächst während Verbindung, Missionsstart und Kommandos.
  - Die 3D-Szene enthält keine offensichtlichen Fallback-Flächen oder fehlenden Texturen.
  - Das HUD ist auf Desktop und Mobilansicht lesbar und zeigt den Kopplungsstatus.
  - Die Bildsprache stimmt mit der Key-Art überein: isometrischer Blick, Petrol, Messing, Aurion-Türkis und hohe Ruinendichte.
  - Während eines captured Runs treten keine Konsolenfehler auf.
