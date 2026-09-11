import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

// Authoring only: source views are copied, never source engines, DBs or scripts.
const REVISION = '286c575d3d0050ffa77b794d5b7a7e24858acee8';
const sourceRoot = resolve(process.argv[2] ?? '');
const hostRoot = resolve(process.argv[3] ?? '.');
const destination = resolve(hostRoot, 'client/src/xaurion/ax1Interface');
const hostEngineRoot = resolve(hostRoot, 'client/src/xaurion');
assert.notEqual(sourceRoot, hostRoot, 'Separate source and host worktrees required');
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim();
assert.equal(git('rev-parse', 'HEAD'), REVISION, 'AX1_SOURCE_REVISION_MISMATCH');
assert.equal(git('status', '--porcelain'), '', 'AX1_SOURCE_DIRTY');
const tracked = git('ls-tree', '-r', '--name-only', REVISION, 'src').split('\n');
const components = tracked.filter(p => p.startsWith('src/components/') && p.endsWith('.tsx')).sort();
assert.equal(components.length, 19, 'AX1_COMPONENT_SET_CHANGED');
const referenceOnly = new Map([
  ['src/components/DeterminismDebugOverlay.tsx', 'Synthetic server mirror, fallback entities and invented benchmarks are non-executable reference, not live diagnosis.'],
  ['src/components/MariaDbAndGlbConsole.tsx', 'Operator/credential surface requires the existing host capability boundary before execution.'],
]);
const files = new Map(), boundaryImports = new Map(), metadata = [];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const blob = value => createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0`).update(value).digest('hex');
function replaceExactly(text, old, replacement) {
  assert.equal(text.split(old).length - 1, 1, `AMBIGUOUS_SOURCE_ANCHOR: ${old.slice(0, 80)}`);
  return text.replace(old, replacement);
}
function replaceRange(text, start, end, replacement) {
  assert.equal(text.split(start).length - 1, 1, `AMBIGUOUS_START: ${start}`);
  assert.equal(text.split(end).length - 1, 1, `AMBIGUOUS_END: ${end}`);
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert(b > a, 'INVALID_SOURCE_RANGE');
  return text.slice(0, a) + replacement + text.slice(b);
}
function replaceInitializer(text, variable, initializer) {
  const tree = ts.createSourceFile('view.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), found = [];
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variable && node.initializer) found.push(node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(found.length, 1, `AX1_HANDLER_NOT_UNIQUE: ${variable}`);
  return text.slice(0, found[0].getStart(tree)) + initializer + text.slice(found[0].end);
}
function addProps(text, definitions, destructured) {
  text = replaceExactly(text, '  isOpen: boolean;', '  isOpen: boolean;\n' + definitions);
  return replaceExactly(text, '  isOpen,', '  isOpen,\n' + destructured);
}
function sanitize(path, input) {
  let text = input;
  const adaptations = [];
  if (path === 'src/components/CraftingModal.tsx') {
    text = addProps(text, '  onCraftRequest?: (recipeId: string) => Promise<{ confirmed: boolean; message: string }>;\n  onGatherRequest?: (professionId: GatheringProfessionId) => Promise<{ confirmed: boolean; message: string }>;', '  onCraftRequest,\n  onGatherRequest,');
    text = replaceInitializer(text, 'handleStartCraft', `async () => {
    if (!canCraft || isCrafting || !onCraftRequest) return;
    setIsCrafting(true); setCraftProgress(0); setFeedbackNotice(null);
    try { const r = await onCraftRequest(selectedRecipe.id); setCraftProgress(r.confirmed ? 100 : 0); setFeedbackNotice(r.message); }
    catch { setFeedbackNotice('Herstellung nicht bestätigt.'); }
    finally { setIsCrafting(false); }
  }`);
    text = replaceInitializer(text, 'handleStartGathering', `async (professionId: GatheringProfessionId) => {
    if (activeGatheringId || !onGatherRequest) return;
    setActiveGatheringId(professionId); setGatherProgress(0); setFeedbackNotice(null);
    try { const r = await onGatherRequest(professionId); setGatherProgress(r.confirmed ? 100 : 0); setFeedbackNotice(r.message); }
    catch { setFeedbackNotice('Sammeln nicht bestätigt.'); }
    finally { setActiveGatheringId(null); }
  }`);
    adaptations.push('Request handlers replace client crafting/gathering XP, yield, clock and RNG. Original JSX retained.');
  }
  if (path === 'src/components/CharacterModal.tsx') {
    text = replaceExactly(text, '  onEquipSkill?: (slotIndex: number, skill: ClassSkill) => void;', '  onEquipSkill?: (slotIndex: number, skill: ClassSkill) => Promise<{ success: boolean; message: string }>;');
    text = replaceInitializer(text, 'handleEquipToHotbar', `async (skill: ClassSkill) => {
    if (!onEquipSkill) return;
    try { const r = await onEquipSkill(0, skill); setFeedbackMessage({ text: r.message, isError: !r.success }); }
    catch { setFeedbackMessage({ text: 'Skill-Zuweisung nicht bestätigt.', isError: true }); }
  }`);
    for (const attr of ['strength', 'agility', 'intelligence', 'defense']) text = replaceExactly(text, `stats.attributes?.${attr} || 10`, `stats.attributes?.${attr} ?? '—'`);
    adaptations.push('Await actual skill assignment; no fabricated attributes. Original layout/styles retained.');
  }
  if (path === 'src/components/DungeonFinderModal.tsx') {
    text = addProps(text, "  confirmedQueue?: DungeonQueueState;\n  onQueueRequest?: (dungeonId: string, role: 'tank' | 'healer' | 'dps') => Promise<void>;\n  onLeaveQueueRequest?: () => Promise<void>;\n  onRequestError?: (message: string) => void;", '  confirmedQueue,\n  onQueueRequest,\n  onLeaveQueueRequest,\n  onRequestError,');
    text = replaceExactly(text, '  onEnterDungeon: (dungeon: DungeonDefinition, rewardXP: number, rewardGold: number) => void;', '  onEnterDungeon: (dungeon: DungeonDefinition) => Promise<boolean>;');
    text = replaceRange(text, '  const [queueState, setQueueState] =', '  if (!isOpen) return null;', "  const queueState: DungeonQueueState = confirmedQueue ?? { dungeonId: null, selectedRole: 'dps', status: 'idle', queueStartTime: null, elapsedSeconds: 0, matchedParty: { tank: null, healer: null, dps: [] } };\n\n");
    text = replaceInitializer(text, 'handleStartQueue', "async () => { if (levelTooLow || !confirmedQueue || !onQueueRequest) return; try { await onQueueRequest(selectedDungeon.id, selectedRole); } catch { onRequestError?.('Gruppensuche nicht bestätigt.'); } }");
    text = replaceInitializer(text, 'handleLeaveQueue', "async () => { if (!onLeaveQueueRequest) return; try { await onLeaveQueueRequest(); } catch { onRequestError?.('Verlassen der Gruppensuche nicht bestätigt.'); } }");
    text = replaceInitializer(text, 'handleAcceptDungeon', "async () => { try { if (await onEnterDungeon(selectedDungeon)) onClose(); } catch { onRequestError?.('Dungeon-Eintritt nicht bestätigt.'); } }");
    text = replaceExactly(text, 'disabled={levelTooLow}', 'disabled={levelTooLow || !confirmedQueue || !onQueueRequest}');
    text = replaceExactly(text, ' (Durchschnitt: 00:08)', '');
    adaptations.push('Original finder with controlled server queue/entry; no fake timed party, reward or average wait.');
  }
  if (path === 'src/components/GuildManagementModal.tsx') {
    text = addProps(text, "  confirmedGuild?: GuildData | null;\n  controlledLands?: ControlledTerritorySummary[];\n  onGuildRequest?: (request: { kind: 'deposit-gold' | 'withdraw-gold' | 'deposit-item' | 'withdraw-item' | 'consolidate-kingdom' | 'upgrade-building' | 'donate-resources'; amount?: number; itemId?: string; buildingId?: string; kingdomName?: string; chunkKeys?: string[]; capitalChunkKey?: string; resources?: Record<string, number> }) => Promise<{ confirmed: boolean; message: string }>;", '  confirmedGuild,\n  controlledLands = [],\n  onGuildRequest,');
    text = replaceExactly(text, '  const [guild, setGuild] = useState<GuildData>(() => createDefaultGuildData());', '  const guild = confirmedGuild;');
    text = replaceExactly(text, '  const [loading, setLoading] = useState(false);', '  const loading = confirmedGuild === undefined;');
    text = replaceRange(text, '  // Load guild data on open', '  // Auto-select first 6', '  // Ownership/territories are supplied by the confirmed host readback.\n  const availableControlledLands = controlledLands;\n\n');
    const actions = [
      ['handleDepositGold', 'amountToDeposit: number', "kind: 'deposit-gold', amount: amountToDeposit", 'if (!Number.isSafeInteger(amountToDeposit) || amountToDeposit <= 0) return;'],
      ['handleWithdrawGold', 'amountToWithdraw: number', "kind: 'withdraw-gold', amount: amountToWithdraw", 'if (!Number.isSafeInteger(amountToWithdraw) || amountToWithdraw <= 0) return;'],
      ['handleDepositItem', '', "kind: 'deposit-item', itemId: selectedInventoryItem.id", 'if (!selectedInventoryItem) return;'],
      ['handleWithdrawItem', 'bankItem: GuildBankItem', "kind: 'withdraw-item', itemId: bankItem.id", ''],
      ['handleConsolidateKingdom', '', "kind: 'consolidate-kingdom', kingdomName: customKingdomName.trim(), chunkKeys: Array.from(selectedChunkKeys).sort(), capitalChunkKey: capitalKey", ''],
      ['handleUpgradeBuilding', 'buildingId: string', "kind: 'upgrade-building', buildingId", ''],
      ['handleDonateResources', '', "kind: 'donate-resources', resources: { wood: 100, stone: 80, aether: 50, crops: 60 }", ''],
    ];
    for (const [name, params, payload, guard] of actions) text = replaceInitializer(text, name, `async (${params}) => {
    ${guard}
    if (!onGuildRequest || !guild) { setActionNotice('Gildenaktion benötigt einen bestätigten Serverpfad.'); return; }
    if (isConsolidating) return;
    setIsConsolidating(true);
    try { const r = await onGuildRequest({ ${payload} }); setActionNotice(r.message); }
    catch { setActionNotice('Gildenaktion nicht bestätigt.'); }
    finally { setIsConsolidating(false); }
  }`);
    text = replaceExactly(text, '  if (!isOpen) return null;', '  if (!isOpen || !guild) return null;');
    adaptations.push('Original guild UI; controlled actual membership/territories, request-only mutations. No default guild, fabricated Hero, local fallback treasury/inventory or clock IDs.');
  }
  if (path === 'src/components/WorldMapModal.tsx') {
    text = addProps(text, '  logicalNowMs?: number;', '  logicalNowMs,');
    text = replaceExactly(text, '  worldBosses = INITIAL_WORLD_BOSSES,', '  worldBosses = [],');
    text = replaceExactly(text, '  const [now, setNow] = useState<number>(Date.now());', '  const now = logicalNowMs ?? 0;');
    text = replaceRange(text, '  // Ticker for live boss countdown timers', '  useEffect(() => {\n    if (!isOpen) return;\n    if (chunkManager)', '');
    text = replaceExactly(text, "    if (!timestamp) return 'Noch nicht bezwungen';", "    if (logicalNowMs === undefined) return 'Zeit nicht bestätigt';\n    if (!timestamp) return 'Noch nicht bezwungen';");
    adaptations.push('Original atlas; externally supplied logical time and boss state, not client clock/timer.');
  }
  if (path === 'src/components/NPCEconomyModal.tsx') {
    text = addProps(text, "  logicalNowMs?: number;\n  onMarketRequest?: (request: { kind: 'sell-item' | 'buyback' | 'buy' | 'sell' | 'fulfill-quest'; hubId: string; itemId?: string; recordId?: string; commodityId?: number; quantity?: number; questId?: string }) => Promise<{ confirmed: boolean; message: string }>;", '  logicalNowMs,\n  onMarketRequest,');
    for (const [name, params, body] of [
      ['handleSellInventoryItem', 'itemToSell: RPGItem', "kind: 'sell-item', itemId: itemToSell.id"],
      ['handleBuybackItem', 'record: SoldBuybackItem', "kind: 'buyback', recordId: record.id"],
      ['handleBuy', 'commodityId: number', "kind: 'buy', commodityId, quantity: tradeQuantity"],
      ['handleSell', 'commodityId: number', "kind: 'sell', commodityId, quantity: tradeQuantity"],
    ]) text = replaceInitializer(text, name, `async (${params}) => {
    if (!onMarketRequest) { onShowMessage('Marktaktion benötigt eine bestätigte Serververbindung.'); return; }
    try { const r = await onMarketRequest({ hubId: selectedHubId, ${body} }); onShowMessage(r.message); }
    catch { onShowMessage('Marktaktion nicht bestätigt.'); }
  }`);
    text = replaceRange(text, '  // Force re-render periodically while open to reflect live economy ticks', '  if (!isOpen || !economy) return null;', '  // Render only from the externally confirmed economy readback.\n\n');
    text = replaceExactly(text, 'const timeAgoMin = Math.max(0, Math.floor((Date.now() - record.soldAtTimestamp) / 60000));', "const timeAgoMin = logicalNowMs === undefined ? '—' : Math.max(0, Math.floor((logicalNowMs - record.soldAtTimestamp) / 60000));");
    text = replaceRange(text, 'onClick={() => {\n                              // Fulfill procurement quest', '                            }}', `onClick={async () => {
                              if (!onMarketRequest) { onShowMessage('Lieferung benötigt eine bestätigte Serververbindung.'); return; }
                              try { const r = await onMarketRequest({ kind: 'fulfill-quest', hubId: selectedHubId, questId: quest.id }); onShowMessage(r.message); }
                              catch { onShowMessage('Lieferung nicht bestätigt.'); }
`);
    adaptations.push('Original market UI; request-only trades/buyback/quest fulfillment, external clock; no client stock/gold/receipt/quest mutation.');
  }
  assert(!/\bMath\s*\.\s*random\s*\(|\bDate\s*\.\s*now\s*\(/.test(text), `AMBIENT_RANDOM_OR_CLOCK: ${path}`);
  return { text, adaptations };
}
function findFile(root, stem) {
  for (const suffix of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']) {
    const p = resolve(root, stem + suffix);
    if (existsSync(p)) { try { readFileSync(p); return p; } catch {} }
  }
  return null;
}
function stage(sourcePath) {
  if (files.has(sourcePath)) return;
  assert(tracked.includes(sourcePath), `UNTRACKED_SOURCE: ${sourcePath}`);
  assert(!referenceOnly.has(sourcePath), `PLAYER_IMPORTS_UNADAPTED_OPS_VIEW: ${sourcePath}`);
  const input = readFileSync(resolve(sourceRoot, sourcePath), 'utf8');
  assert.equal(blob(input), git('rev-parse', `${REVISION}:${sourcePath}`), 'AX1_BLOB_MISMATCH');
  const { text, adaptations } = sanitize(sourcePath, input);
  files.set(sourcePath, text);
  metadata.push({ sourcePath, sourceBlob: blob(input), sourceSha256: sha256(input), importedSha256: sha256(text), adaptations });
  for (const { fileName } of ts.preProcessFile(text, true, true).importedFiles) {
    if (!fileName.startsWith('.')) continue;
    const upstreamFile = findFile(dirname(resolve(sourceRoot, sourcePath)), fileName);
    assert(upstreamFile, `UPSTREAM_IMPORT_MISSING: ${sourcePath} -> ${fileName}`);
    const repoPath = relative(sourceRoot, upstreamFile).split(sep).join('/');
    assert(!repoPath.startsWith('..'), 'SOURCE_PATH_ESCAPE');
    if (repoPath.startsWith('src/components/') || repoPath.startsWith('src/data/') || repoPath.startsWith('src/types/') || repoPath === 'src/types.ts') stage(repoPath);
    else {
      const hostPath = resolve(hostEngineRoot, repoPath.slice(4));
      assert(existsSync(hostPath), `HOST_BOUNDARY_MODULE_MISSING: ${repoPath}`);
      const shimPath = resolve(destination, repoPath.slice(4));
      let specifier = relative(dirname(shimPath), hostPath).split(sep).join('/').replace(/\.(tsx?|mjs|js)$/, '');
      if (!specifier.startsWith('.')) specifier = './' + specifier;
      boundaryImports.set(repoPath, `// Existing integrated host module; not a copied AX1 runtime.\nexport * from ${JSON.stringify(specifier)};\n`);
    }
  }
}
for (const path of components.filter(p => !referenceOnly.has(p))) {
  const candidates = readFileSync(resolve(sourceRoot, path), 'utf8').split('\n').flatMap((line, i) => /Math\.random|Date\.now|setInterval|setTimeout|executePlayer|acceptQuest|completeQuest|onPlayerGoldChange\(/.test(line) ? [{ line: i + 1, text: line.trim() }] : []);
  if (candidates.length) console.log('AX1_SOURCE_BOUNDARY_AUDIT', JSON.stringify({ path, candidates }));
}
for (const component of components) if (!referenceOnly.has(component)) stage(component);
for (const [path, text] of [...files, ...boundaryImports]) {
  const output = resolve(destination, path.slice(4));
  assert(output.startsWith(destination + sep), 'DESTINATION_PATH_ESCAPE');
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, text);
}
const opsReferences = [];
for (const [path, reason] of referenceOnly) {
  const input = readFileSync(resolve(sourceRoot, path), 'utf8');
  assert.equal(blob(input), git('rev-parse', `${REVISION}:${path}`));
  const output = resolve(destination, 'reference-only', path.slice(4) + '.txt');
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, input);
  opsReferences.push({ sourcePath: path, sourceBlob: blob(input), sourceSha256: sha256(input), reason, executable: false });
}
metadata.sort((a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0);
writeFileSync(resolve(destination, 'SOURCE_MANIFEST.json'), JSON.stringify({ schemaVersion: 1, repository: 'OuroborosCollective/-ax1', sourceRevision: REVISION, sourceComponents: components, files: metadata, hostBoundaryReexports: [...boundaryImports.keys()].sort(), opsReferences, productParityProven: false }, null, 2) + '\n');
console.log(JSON.stringify({ originalPlayerComponents: components.length - referenceOnly.size, quarantinedOpsReferences: referenceOnly.size, importedSourceFiles: files.size, hostBoundaryReexports: [...boundaryImports.keys()], manifestSha256: sha256(readFileSync(resolve(destination, 'SOURCE_MANIFEST.json'))), productParityProven: false }, null, 2));
