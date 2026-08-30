from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


home = "client/src/pages/Home.tsx"

replace_once(
    home,
    'const shouldPollGateway = Boolean(gatewayPairing) && screen === "mission";',
    'const shouldPollGateway = Boolean(gatewayPairing) && (screen === "mission" || screen === "open_world");',
)
replace_once(
    home,
    'enabled: Boolean(humanTeamPartner) && screen === "mission",\n    refetchInterval: humanTeamPartner && screen === "mission" ? 900 : false,',
    'enabled: Boolean(humanTeamPartner) && (screen === "mission" || screen === "open_world"),\n    refetchInterval: humanTeamPartner && (screen === "mission" || screen === "open_world") ? 900 : false,',
)
replace_once(
    home,
    'const factionQuestline = trpc.factionQuestline.read.useQuery(undefined, { enabled: isAuthenticated && screen === "mission" });',
    'const factionQuestline = trpc.factionQuestline.read.useQuery(undefined, { enabled: isAuthenticated && (screen === "mission" || screen === "open_world") });',
)
replace_once(
    home,
    'const wasdCoverage = trpc.gameplay.wasdCoverage.useQuery(undefined, { enabled: isAuthenticated && screen === "mission" });',
    'const wasdCoverage = trpc.gameplay.wasdCoverage.useQuery(undefined, { enabled: isAuthenticated && (screen === "mission" || screen === "open_world") });',
)
replace_once(
    home,
    '''        gameplaySession.current = { id: session.id, nextSequence: session.nextSequence };
        const arenaIndex = encounterKey === "asterion" ? 0 : encounterKey === "archive" ? 1 : encounterKey === "solarium" ? 2 : 3;
        window.dispatchEvent(new CustomEvent("aurion:load-encounter", { detail: { arenaIndex, dungeon: encounterKey === "cinder_vault" } }));''',
    '''        gameplaySession.current = { id: session.id, nextSequence: session.nextSequence };
        zoneClient.current?.close();
        setWorldStreamAnchor(null);
        setWorldStreamCursors({});
        setScreen("mission");
        const arenaIndex = encounterKey === "asterion" ? 0 : encounterKey === "archive" ? 1 : encounterKey === "solarium" ? 2 : 3;
        window.dispatchEvent(new CustomEvent("aurion:load-encounter", { detail: { arenaIndex, dungeon: encounterKey === "cinder_vault" } }));''',
)
replace_once(
    home,
    '      {screen === "mission" && (\n        <section className="mission-ui" aria-label="Expeditionsoberfläche">',
    '      {(screen === "mission" || screen === "open_world") && (\n        <section className={screen === "open_world" ? "mission-ui is-open-world" : "mission-ui"} aria-label={screen === "open_world" ? "Open-World-Details" : "Expeditionsoberfläche"}>',
)

# Keep the source-contract test bound to preserved world functionality.
test_path = "client/src/pages/Home.openWorldState.test.ts"
replace_once(
    test_path,
    '''    expect(source).toContain('screen === "open_world" && <OpenWorldHud');
  });''',
    '''    expect(source).toContain('screen === "open_world" && <OpenWorldHud');
    expect(source).toContain('(screen === "mission" || screen === "open_world") && (');
    expect(source).toContain('screen === "open_world" ? "mission-ui is-open-world" : "mission-ui"');
    expect(source).toContain('setWorldStreamAnchor(null);');
    expect(source).toContain('setScreen("mission");');
  });''',
)
