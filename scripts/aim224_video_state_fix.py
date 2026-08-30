from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1))


def extract_balanced_section(text: str, marker: str) -> tuple[str, str]:
    start = text.index(marker)
    depth = 0
    token = re.compile(r"</?section\b")
    for match in token.finditer(text, start):
        closing = text.startswith("</section", match.start())
        depth += -1 if closing else 1
        if depth == 0:
            end = text.index(">", match.end()) + 1
            return text[start:end], text[:start] + text[end:]
    raise SystemExit("open-world-card section did not balance")


home_path = Path("client/src/pages/Home.tsx")
home = home_path.read_text()

old_preview = '''  const previewHome = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("aurion_preview") === "tower-home";\n  const [screen, setScreen] = useState<Screen>(previewHome ? "home" : "gate");'''
new_preview = '''  const previewMode = import.meta.env.DEV && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("aurion_preview") : null;\n  const previewHome = previewMode === "tower-home";\n  const previewLoadout = previewMode === "loadout";\n  const previewOpenWorld = previewMode === "open-world";\n  const [screen, setScreen] = useState<Screen>(previewHome ? "home" : previewLoadout ? "loadout" : previewOpenWorld ? "open_world" : "gate");'''
if home.count(old_preview) != 1:
    raise SystemExit("preview anchor mismatch")
home = home.replace(old_preview, new_preview, 1)
home = home.replace('  const [connected, setConnected] = useState(false);', '  const [connected, setConnected] = useState(previewLoadout || previewOpenWorld);', 1)
home = home.replace('  const [soloMode, setSoloMode] = useState(false);', '  const [soloMode, setSoloMode] = useState(previewLoadout || previewOpenWorld);', 1)
home = home.replace('  const [zoneStatus, setZoneStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "rejected">("idle");', '  const [zoneStatus, setZoneStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "rejected">("idle");\n  const [worldDetailsOpen, setWorldDetailsOpen] = useState(false);', 1)

home = home.replace('''        gameplaySession.current = { id: session.id, nextSequence: session.nextSequence };\n        zoneClient.current?.close();''', '''        gameplaySession.current = { id: session.id, nextSequence: session.nextSequence };\n        setWorldDetailsOpen(false);\n        zoneClient.current?.close();''', 1)
home = home.replace('''        setWorldStreamAnchor(snapshot.globalWorld);\n        setWorldStreamCenter({ x: 0, z: 0 });''', '''        setWorldDetailsOpen(false);\n        setWorldStreamAnchor(snapshot.globalWorld);\n        setWorldStreamCenter({ x: 0, z: 0 });''', 1)
home = home.replace('''    zoneClient.current?.close();\n    setWorldStreamAnchor(null);''', '''    zoneClient.current?.close();\n    setWorldDetailsOpen(false);\n    setWorldStreamAnchor(null);''', 1)

begin_start = home.index('  const beginMission = (): void => {')
begin_end = home.index('  const toggleAudio = (): void => {', begin_start)
home = home[:begin_start] + home[begin_end:]

old_loadout_cta = '<button type="button" className="seal-button embark" onClick={beginMission}><Swords size={18} /> STERNWARTE BETRETEN</button>'
new_loadout_cta = '<button type="button" className="seal-button embark" disabled={enterOpenWorld.isPending} onClick={() => enterAurionExpanse(() => setScreen("open_world"))}><Compass size={18} /> {enterOpenWorld.isPending ? "WELT WIRD BESTÄTIGT" : "IN DIE OPEN WORLD"}</button>'
if home.count(old_loadout_cta) != 1:
    raise SystemExit("loadout CTA anchor mismatch")
home = home.replace(old_loadout_cta, new_loadout_cta, 1)

old_hud_end = '''        onConnectZone={connectAuthoritativeZone}\n        onMove={sendHumanCommand}\n        onInteract={() => sendHumanAction("E")}\n      />'''
new_hud_end = '''        onConnectZone={connectAuthoritativeZone}\n        onMove={sendHumanCommand}\n        onInteract={() => sendHumanAction("E")}\n        onOpenDetails={() => setWorldDetailsOpen(true)}\n      />'''
if home.count(old_hud_end) != 1:
    raise SystemExit("OpenWorldHud anchor mismatch")
home = home.replace(old_hud_end, new_hud_end, 1)

world_block, home = extract_balanced_section(home, '          <section className="open-world-card"')
world_block = world_block.replace('className="open-world-card"', 'className="open-world-card open-world-card--drawer"', 1)

hud_anchor = new_hud_end
insert = hud_anchor + '''\n      {screen === "open_world" && worldDetailsOpen && (\n        <div className="open-world-details-layer" role="dialog" aria-modal="true" aria-label="Welt-, Quest- und Begegnungsdetails">\n          <button type="button" className="open-world-details-layer__close" onClick={() => setWorldDetailsOpen(false)}>WELTDETAILS SCHLIESSEN</button>\n''' + world_block + '''\n        </div>\n      )}'''
if home.count(hud_anchor) != 1:
    raise SystemExit("HUD insertion anchor mismatch")
home = home.replace(hud_anchor, insert, 1)

old_wrapper = '''      {(screen === "mission" || screen === "open_world") && (\n        <section className={screen === "open_world" ? "mission-ui is-open-world" : "mission-ui"} aria-label={screen === "open_world" ? "Open-World-Details" : "Expeditionsoberfläche"}>'''
new_wrapper = '''      {screen === "mission" && (\n        <section className="mission-ui" aria-label="Expeditionsoberfläche">'''
if home.count(old_wrapper) != 1:
    raise SystemExit("mission wrapper anchor mismatch")
home = home.replace(old_wrapper, new_wrapper, 1)

home_path.write_text(home)

# Remove the legacy client event that could activate Arena 0 without a server-confirmed encounter.
scene_path = Path("client/src/game/scene.ts")
scene = scene_path.read_text()
on_start = '  const onStart = (): void => { clearOpenWorld(); started = true; dungeonUnlocked = false; dungeonActive = false; victory = false; awaitingQuest = false; sentinel.root.setEnabled(true); emitGameEvent("system", "Sternwarten-Instanz geöffnet. Die erste Sentinel-Phase reagiert auf das Team-Siegel."); applyArena(0); };\n'
if scene.count(on_start) != 1:
    raise SystemExit("scene onStart anchor mismatch")
scene = scene.replace(on_start, '', 1)
scene = scene.replace(' window.addEventListener("aurion:begin-expedition", onStart);', '', 1)
scene = scene.replace(' window.removeEventListener("aurion:begin-expedition", onStart);', '', 1)
scene_path.write_text(scene)

# Update the source contracts so this exact regression cannot be reintroduced.
Path("client/src/pages/Home.openWorldState.test.ts").write_text('''import { readFile } from "node:fs/promises";\nimport path from "node:path";\nimport { describe, expect, it } from "vitest";\n\ndescribe("Aurion home/open-world state separation", () => {\n  it("keeps Open World structurally separate from legacy mission chrome", async () => {\n    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");\n    expect(source).toContain('type Screen = "gate" | "home" | "loadout" | "open_world" | "mission";');\n    expect(source).toContain('onEnterExpanse={() => enterAurionExpanse(() => setScreen("open_world"))}');\n    expect(source).toContain('screen === "open_world" && <OpenWorldHud');\n    expect(source).toContain('screen === "open_world" && worldDetailsOpen');\n    expect(source).toContain('open-world-card open-world-card--drawer');\n    expect(source).toContain('{screen === "mission" && (');\n    expect(source).not.toContain('(screen === "mission" || screen === "open_world") && (');\n    expect(source).not.toContain('mission-ui is-open-world');\n  });\n\n  it("never starts a legacy arena from loadout", async () => {\n    const source = await readFile(path.resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");\n    expect(source).toContain('onClick={() => enterAurionExpanse(() => setScreen("open_world"))}');\n    expect(source).toContain('IN DIE OPEN WORLD');\n    expect(source).not.toContain('onClick={beginMission}');\n    expect(source).not.toContain('const beginMission');\n    expect(source).not.toContain('aurion:begin-expedition');\n  });\n\n  it("keeps the tower scene free of the legacy arena and sentinel", async () => {\n    const source = await readFile(path.resolve(process.cwd(), "client/src/game/scene.ts"), "utf8");\n    expect(source).toContain("const showTowerHome = (): void => {");\n    expect(source).toContain("arenaSets.forEach(set => set.setEnabled(false));");\n    expect(source).toContain("sentinel.root.setEnabled(false);");\n    expect(source).toContain("showTowerHome();");\n  });\n\n  it("allows Arena activation only through a confirmed encounter event", async () => {\n    const source = await readFile(path.resolve(process.cwd(), "client/src/game/scene.ts"), "utf8");\n    expect(source).toContain('window.addEventListener("aurion:load-encounter", onLoadEncounter)');\n    expect(source).toContain("sentinel.root.setEnabled(true); applyArena(detail.arenaIndex);");\n    expect(source).not.toContain('aurion:begin-expedition');\n  });\n});\n''')

companion_test = Path("client/src/game/sceneCompanionAuthority.test.ts")
companion_source = companion_test.read_text()
if companion_source.count('section(sceneSource, "  const onCommand = ", "  const onStart = ")') != 1:
    raise SystemExit("companion source marker mismatch")
companion_test.write_text(companion_source.replace('section(sceneSource, "  const onCommand = ", "  const onStart = ")', 'section(sceneSource, "  const onCommand = ", "  const onEnterDungeon = ")', 1))
