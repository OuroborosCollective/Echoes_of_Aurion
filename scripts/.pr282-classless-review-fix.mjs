import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`EXPECTED_ONE_MATCH:${path}:${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceExact("server/routers.ts", `    me: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.getOrCreatePlayerProfile(ctx.user.id);
      return {
        profile: {
          userId: profile.userId,
          level: profile.level,
          totalXp: profile.totalXp,
          aurionPoints: profile.aurionPoints,
          victories: profile.victories,
          // Compatibility sentinel for AX1 clients still carrying the legacy field.
          // It is deliberately constant and no longer reflects or authorizes a class.
          selectedClass: "unbound" as const,
        },
        progression: await readConfirmedProgressionTracks(ctx.user.id),
        weaponMasteries: await db.listWeaponMasteries(ctx.user.id),
        weaponLoadout: await db.getWeaponLoadout(ctx.user.id),
        guild: await db.getActiveGuildForUser(ctx.user.id),
        inventory: await db.listInventoryForUser(ctx.user.id),
        setBonuses: await db.listSetBonusesForUser(ctx.user.id),
      };
    }),`, `    me: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.getOrCreatePlayerProfile(ctx.user.id);
      return {
        profile: {
          userId: profile.userId,
          aurionPoints: profile.aurionPoints,
          victories: profile.victories,
          // Legacy class/aggregate level/XP are not current gameplay authority.
          // Until a canonical WASD aggregate snapshot is bound, fail closed by omission.
          selectedClass: "unbound" as const,
        },
        progression: await readConfirmedProgressionTracks(ctx.user.id),
        guild: await db.getActiveGuildForUser(ctx.user.id),
        inventory: await db.listInventoryForUser(ctx.user.id),
        setBonuses: await db.listSetBonusesForUser(ctx.user.id),
      };
    }),`);

replaceExact("client/src/xaurion/integration/AurionAuthorityHud.tsx", `        <button type="button" className="ax1-unit-portrait" aria-label="Charakter öffnen" onClick={() => openPanel("character")} style={{ borderColor: explorerView.color }}>
          <span className="ax1-unit-icon" aria-hidden="true">{explorerView.icon}</span>{profile && <span>{profile.level}</span>}
        </button>
        <div className="ax1-unit-values">
          {profile ? <>
            <div className="ax1-unit-heading"><b>{explorerView.name}</b><strong>◆ {profile.aurionPoints}</strong></div>
            <div className="ax1-confirmed-bar" data-live={player.state === "live"}><i /><span>{profile.totalXp} EP · {profile.victories} Siege</span></div>
            <div className="ax1-mastery-line">{mastery ? <><span>{mastery.trackId}</span><b>Stufe {mastery.levelExact}</b><em>bestätigt</em></> : <span>Waffenpfad wartet auf bestätigte Receipts</span>}</div>
          </> : <b>Charakterdaten ausstehend</b>}`, `        <button type="button" className="ax1-unit-portrait" aria-label="Charakter öffnen" onClick={() => openPanel("character")} style={{ borderColor: explorerView.color }}>
          <span className="ax1-unit-icon" aria-hidden="true">{explorerView.icon}</span>
        </button>
        <div className="ax1-unit-values">
          {profile ? <>
            <div className="ax1-unit-heading"><b>{explorerView.name}</b><strong>◆ {profile.aurionPoints}</strong></div>
            <div className="ax1-confirmed-bar" data-live={player.state === "live"}><i /><span>{player.data?.progression.tracks.length ?? 0} bestätigte Progressionspfade · {profile.victories} Siege</span></div>
            <div className="ax1-mastery-line">{mastery ? <><span>{mastery.trackId}</span><b>Stufe {mastery.levelExact}</b><em>Receipt verifiziert</em></> : <span>Waffenpfad wartet auf verifizierte Receipts</span>}</div>
          </> : <b>Charakterdaten ausstehend</b>}`);

replaceExact("client/src/pages/Operations.tsx", `<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="STUFE" value={state.profile.level} icon={Sparkles} /><Stat label="AURION-PUNKTE" value={state.profile.aurionPoints} icon={Trophy} /><Stat label="SIEGE" value={state.profile.victories} icon={Crown} /><Stat label="WAFFENPFAD" value={state.progression.tracks.filter(track => track.trackKind === "weapon").length} icon={Shield} /></section>`, `<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat label="PROGRESSIONS-TRACKS" value={state.progression.tracks.length} icon={Sparkles} /><Stat label="AURION-PUNKTE" value={state.profile.aurionPoints} icon={Trophy} /><Stat label="SIEGE" value={state.profile.victories} icon={Crown} /><Stat label="WAFFENPFAD" value={state.progression.tracks.filter(track => track.trackKind === "weapon").length} icon={Shield} /></section>`);
replaceExact("client/src/pages/Operations.tsx", `<Badge variant="outline">klassenlos</Badge><Badge variant="outline">XP: {state.profile.totalXp}</Badge>{state.progression.tracks.map`, `<Badge variant="outline">klassenlos</Badge><Badge variant="outline">Aggregate Level/XP: WASD-Snapshot ausstehend</Badge>{state.progression.tracks.map`);

replaceExact("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx", `type AurionPlayerProjection = Readonly<{
  profile?: {
    level?: number;
    totalXp?: number;
    aurionPoints?: number;
    victories?: number;
    selectedClass?: "unbound" | "vanguard" | "seer" | "warden";
  };
  weaponLoadout?: { weaponTrack?: "blade" | "staff" | "spear" | "focus" } | null;
}>;`, `type AurionPlayerProjection = Readonly<{
  profile?: {
    aurionPoints?: number;
    victories?: number;
    selectedClass?: "unbound";
  };
}>;`);
replaceExact("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx", `const weaponForAurion = (value: "blade" | "staff" | "spear" | "focus" | undefined) => {
  if (value === "staff" || value === "focus") return "arcane" as const;
  if (value === "spear") return "blade" as const;
  return "blade" as const;
};

`, ``);
replaceExact("client/src/xaurion/integration/AurionOpenWorldRuntime.tsx", `    if (Number.isSafeInteger(projection.profile.level) && (projection.profile.level ?? 0) > 0) engine.player.stats.level = projection.profile.level!;
    if (Number.isSafeInteger(projection.profile.totalXp) && (projection.profile.totalXp ?? -1) >= 0) engine.player.stats.xp = projection.profile.totalXp!;
    if (Number.isSafeInteger(projection.profile.aurionPoints) && (projection.profile.aurionPoints ?? -1) >= 0) engine.player.stats.score = projection.profile.aurionPoints!;
    if (Number.isSafeInteger(projection.profile.victories) && (projection.profile.victories ?? -1) >= 0) engine.player.stats.bossKills = projection.profile.victories!;
    engine.player.stats.activeWeaponType = weaponForAurion(projection.weaponLoadout?.weaponTrack);`, `    // Never project legacy Aurion aggregate level/XP or fixed weapon-loadout rows into AX1.
    // Those fields remain at AX1/WASD runtime defaults until canonical WASD truth is bound.
    if (Number.isSafeInteger(projection.profile.aurionPoints) && (projection.profile.aurionPoints ?? -1) >= 0) engine.player.stats.score = projection.profile.aurionPoints!;
    if (Number.isSafeInteger(projection.profile.victories) && (projection.profile.victories ?? -1) >= 0) engine.player.stats.bossKills = projection.profile.victories!;`);

fs.rmSync("scripts/.pr282-classless-review-fix.mjs");
fs.rmSync(".github/workflows/pr282-classless-review-fix.yml");
