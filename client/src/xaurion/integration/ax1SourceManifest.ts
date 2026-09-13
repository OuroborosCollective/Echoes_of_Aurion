export const AX1_VISIBLE_SOURCE_REVISION = "f24e3bbb452bd6991c8365fc7827ce6dbcc16d95" as const;
export const AX1_NPC_ENGINE_SOURCE_REVISION = "cf9cd7a9e197a110724d4f517655a63168ed63e0" as const;
export const AX1_PARTICLE_EFFECTS_SHA256 = "ed63e2c94bea0ff7c472a4c4224ec1aa4b997cf98d795740528bb89ba483faac" as const;

export type Ax1SourceDecision = "adapted" | "projected" | "excluded";

export type Ax1SourceEntry = Readonly<{
  component: string;
  sourcePath: `src/components/${string}.tsx`;
  sha256: string;
  decision: Ax1SourceDecision;
  authority: "presentation" | "aurion-readback" | "ax1-gameplay";
  note: string;
}>;

/**
 * Hashes are calculated from the actual AX1 files at the pinned Git revision.
 * They intentionally do not copy AX1's stale in-repository manifest values for
 * files changed after that manifest was generated.
 */
export const AX1_VISIBLE_SOURCE_MANIFEST = Object.freeze(Object.freeze([
  ["GameHUD", "efd3bf694fd8c1a8e182d81730c34051855067b4c30fba4ee86c142c1f649248", "adapted", "aurion-readback", "Visible shell; values come only from confirmed readbacks and zone events."],
  ["CharacterModal", "90f2e7f34926b0534c415eac72f5a8e5235161fd4e37665557ec768f9243425b", "projected", "aurion-readback", "Mastery identities are projected from confirmed progression receipts."],
  ["InventoryModal", "48dfffbb7a213aee3d34e420ba0302b8803ded3a2acb96f23f0e5168b7b5ee4f", "projected", "aurion-readback", "Paperdoll and bag project server-confirmed inventory; mutations require readback."],
  ["CraftingModal", "f6338c3e5a8da602ccaabc596cc99a77b19feca169af84a2bf6e03354d6ccc36", "projected", "aurion-readback", "Local rolls and rewards excluded; committed crafting receipts are displayed."],
  ["GuildManagementModal", "205d3bbb825dd7275fe01e19f18906f01a000b6879e930ebeac7543252a0bcec", "adapted", "ax1-gameplay", "Visible surface retained fail-closed until the AX1 guild contract has executable WASD logic."],
  ["NPCEconomyModal", "2eeaba88f7dbd5655d8d616689a4841f3dd18d812273966e9e09dc12c69b0f4f", "adapted", "ax1-gameplay", "Local prices, buyback and merchant mutation excluded."],
  ["HomesteadBuilderModal", "6f3a9eb1a33af9290e8158b1132d595d6b5b4918f3b33e7ea77145f29574ee92", "adapted", "ax1-gameplay", "Builder remains visible but placement is disabled without confirmed state."],
  ["QuestLogModal", "8bd7e0e0fecd1d6bd8cf596364aec47a02c6df6cb09a5e696f591d55e41d0af2", "projected", "ax1-gameplay", "Lore is presentational; legacy Aurion quest mutation is excluded on /play."],
  ["MiniMap", "04c8865ee6476ceda37d65bb9f1820a70a61dc6d9e9ae53e962a5e879cb3556d", "projected", "aurion-readback", "Only confirmed position and world POIs are rendered."],
  ["WorldMapModal", "5dcf7d5e13bb78eb98da0f314228c08e254fa5a8a2ffe9cda195a3fe0ff15b2b", "projected", "aurion-readback", "Generated client chunks and wallclock countdowns are excluded."],
  ["NPCDialogueModal", "1123bb3e1929a54903c8c882005eef0d0f5a9c3f77224e37c46abf4418bf84b0", "adapted", "aurion-readback", "Confirmed standing and decision memory only; client relationship mutation excluded."],
  ["TerritoryPoliticsModal", "c3527d22b8d1f21e6357a2831e57d51fa63a78a43df0ac02b2797fa71411f67e", "adapted", "ax1-gameplay", "Client ownership, tax and stability writes are excluded."],
  ["PartyModal", "3d1a6cad8c512fe364671a348fb00e8dbcb42238d486ce712ba172977c2bdb3e", "projected", "aurion-readback", "Simulated champions and local party buffs are replaced by the confirmed group readmodel."],
  ["DungeonFinderModal", "0c78d7a8b569864084241b389971383219a0b870d2a268943c8e64209e932bdc", "projected", "aurion-readback", "Fake timer matching is replaced by server-confirmed queue and instance receipts."],
  ["ClassSelectModal", "4a9ecabc70fca04f636daf8452713e2dee73f744bb2e18072f07362b4ff9eeea", "adapted", "ax1-gameplay", "Class authoring is replaced by a read-only classless discipline projection."],
  ["DeterminismDebugOverlay", "6d0910070afec24923ffb6140ed36f10dfe872c66b18ac8dbf586256471ca6af", "adapted", "aurion-readback", "Only confirmed tick/source/hash evidence is displayed."],
  ["MariaDbAndGlbConsole", "ce7ecff4251ea753c2e3223e640d80fd1ddba06d6127f37d317c40903b2cb3c0", "excluded", "aurion-readback", "Admin/database console is not a visible gameplay surface."],
  ["VirtualJoystick", "e619c6df4c6b44c8ba5e0d08749c68ecec647a401bb8786de18fbb1a5995a1b0", "projected", "presentation", "Input only; the zone server accepts or rejects movement."],
  ["ErrorBoundary", "ee8def482428b225fcb05159cfb586a2cd761257b1cc8ae6f2c98c27b6514e07", "adapted", "presentation", "Presentation failure boundary; never fabricates gameplay state."],
] as const satisfies readonly (readonly [string, string, Ax1SourceDecision, Ax1SourceEntry["authority"], string])[]).map(([component, sha256, decision, authority, note]) => Object.freeze({
  component,
  sourcePath: `src/components/${component}.tsx` as const,
  sha256,
  decision,
  authority,
  note,
})));
