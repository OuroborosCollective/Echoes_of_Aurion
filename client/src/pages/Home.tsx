/**
 * Echoes of Aurion — Expedition console
 * Design philosophy: A vertical bronze-and-glass field device frames rather than
 * hides the isometric sky-city. Every LLM signal is visible, bounded and logged.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, ChevronRight, CircleDot, Copy,
  Compass, Cpu, Download, Gamepad2, LockKeyhole, Radio, ShieldCheck, Sparkles, Swords,
  Maximize2, Minimize2, UserRound, UsersRound, Volume2, VolumeX, X, Play,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import CommunityOverlay from "@/components/CommunityOverlay";
import TowerHomePanel from "@/components/TowerHomePanel";
import OpenWorldHud from "@/components/OpenWorldHud";
import { starterCharacters } from "@/game/starterCharacters";
import { appendLedger, exportLedger, readLedger, resetLedger, type LedgerEntry } from "@/lib/ledger";
import { AurionSoundscape } from "@/lib/soundscape";
import { isAudioEvent, type AudioEvent } from "@shared/audioProtocol";
import { aurionAssets, hasAurionApi } from "@/lib/aurionAssets";
import { wasdAurionSceneAssetAssignments } from "@/lib/wasdAurionSceneAssets";
import { trpc } from "@/lib/trpc";
import { ZoneMovementClient, type ZoneMovementInput } from "@/lib/zoneMovement";
import { companionActionAllowed, companionDatasetCount, exportCompanionDataset, loadCompanionSession, recordCompanionObservation, startCompanionSession, transitionCompanionSession, type CompanionAction, type CompanionStateMask, type CompanionStateVector } from "@/lib/companionLearning";
import { isFreshCompanionFrame, requestCompanionFrame } from "@/lib/companionFrameCapture";
import { COMPANION_FRAME_MAX_AGE_MS, type CompanionCommandOrigin, type CompanionSession } from "@shared/companionLearningProtocol";
import { matchesWorldChunkStreamSelection, orderedWorldChunkWindow, worldChunkCoordinateKey, worldChunkStreamingBudget, type WorldChunkStreamingTier } from "@shared/worldChunkStreamingProtocol";

type Screen = "gate" | "home" | "loadout" | "open_world" | "mission";
type Command = "W" | "A" | "S" | "D" | "E" | "F" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type MissionState = { arena: number; arenaName: string; objective: string; sentinelHp: number; sentinelMaxHp: number; explorerHp: number; echoHp: number; shield: boolean; marked: boolean; phase: "active" | "transition" | "quest_ready" | "dungeon_ready" | "victory" };

const audioEventFromLegacy = (kind: "system" | "command" | "combat" | "connection" | "warning", detail: string): AudioEvent => {
  if (kind === "combat") return { cue: "combat.attack.spear", category: "combat", weapon: "spear" };
  if (kind === "warning") return { cue: "combat.magic", category: "combat", element: "resonance" };
  if (detail.toLowerCase().includes("lyra")) return { cue: "interaction.npc.feminine", category: "interaction", voice: "feminine" };
  if (detail.toLowerCase().includes("orun")) return { cue: "interaction.npc.masculine", category: "interaction", voice: "masculine" };
  return { cue: "interaction.npc.neutral", category: "interaction", voice: "neutral" };
};
type GatewayPairing = { sessionId: string; pairingToken: string; mcpUrl: string; expiresAt: Date; allowedCommands: string[] };
type DialogueQuestPrompt = {
  dialogueReceiptId: string;
  npcId: "lyra" | "orun";
  actionKind: "offer_quest" | "request_turn_in";
  questKey: "astral_call" | "archive_of_echoes" | "ember_key";
};
type WorldStreamAnchor = {
  version: "aurion-global-world.v1";
  worldId: "echoes-of-aurion-global";
  worldSeed: string;
  epoch: number;
  unlockedSectorCount: number;
  nextExpansionAtPlayerCount: number | null;
  deterministicHash: string;
};

type PendingCompanionAction = { id: number; action: CompanionAction; issuedAt: number };
const companionMissionPhaseValue: Record<MissionState["phase"], number> = { active: 0, transition: 0.25, quest_ready: 0.5, dungeon_ready: 0.75, victory: 1 };

const initialMission: MissionState = { arena: 0, arenaName: "Sternwarte Asterion", objective: "Brich den ersten Resonanzanker des Sentinels.", sentinelHp: 112, sentinelMaxHp: 112, explorerHp: 100, echoHp: 100, shield: false, marked: false, phase: "active" };
const abilityDeck = [
  { code: "1", name: "Prisma-Schritt", detail: "Impulsbewegung", group: "Bewegung" },
  { code: "2", name: "Echoschild", detail: "Schutzimpuls", group: "Schutz" },
  { code: "3", name: "Sternenfaden", detail: "Bindung verstärken", group: "Taktik" },
  { code: "4", name: "Kartenblick", detail: "Sichtlinie scannen", group: "Aufklärung" },
  { code: "5", name: "Ruinenschnitt", detail: "Präzisionsstoß", group: "Angriff" },
  { code: "6", name: "Aegis-Knoten", detail: "Team-Schutzfeld", group: "Schutz" },
  { code: "7", name: "Ankerwurf", detail: "Gegner binden", group: "Kontrolle" },
  { code: "8", name: "Sonnenbruch", detail: "Flächenstoß", group: "Angriff" },
  { code: "9", name: "Aurion-Resonanz", detail: "Ultimatives Echo", group: "Signatur" },
];
const providers = ["ChatGPT", "Claude", "Gemini", "Mistral", "Lokales LLM", "Eigener MCP-Client"];
const heroTrailerUrl = aurionAssets.trailer;
const heroTrailerPoster = aurionAssets.trailerPoster;
const expanseReference = aurionAssets.expanseReference;
const GameCanvas = lazy(() => import("@/components/GameCanvas"));

function streamTierForViewport(): WorldChunkStreamingTier {
  if (typeof window === "undefined") return "phone";
  const smallestSide = Math.min(window.innerWidth, window.innerHeight);
  if (window.innerWidth >= 1_200 || smallestSide >= 1_000) return "desktop";
  return smallestSide >= 600 ? "tablet" : "phone";
}

function worldChunkCenterForZonePosition(position: { x: number; z: number }): { x: number; z: number } {
  return { x: Math.floor((position.x + 32_000) / 64_000), z: Math.floor((position.z + 32_000) / 64_000) };
}

function codeFromText(value: string): Command | null {
  const candidate = value.trim().toUpperCase();
  return /^[WASDEF1-9]$/.test(candidate) ? (candidate as Command) : null;
}

export default function Home() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const apiAvailable = hasAurionApi();
  const activeArenaAsset = trpc.assetSubmissions.activeArenaAsset.useQuery({ targetKey: "asterion_courtyard" }, { enabled: apiAvailable });
  const previewMode = import.meta.env.DEV && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("aurion_preview") : null;
  const previewHome = previewMode === "tower-home";
  const previewLoadout = previewMode === "loadout";
  const previewOpenWorld = previewMode === "open-world";
  const [screen, setScreen] = useState<Screen>(previewHome ? "home" : previewLoadout ? "loadout" : previewOpenWorld ? "open_world" : "gate");
  const [provider, setProvider] = useState(providers[0]);
  const [connected, setConnected] = useState(previewLoadout || previewOpenWorld);
  const [companionSession, setCompanionSession] = useState<CompanionSession | null>(() => loadCompanionSession());
  const [companionRows, setCompanionRows] = useState(() => companionDatasetCount());
  const [isPairing, setIsPairing] = useState(false);
  const [operatorName, setOperatorName] = useState("Mira Voss");
  const [commandText, setCommandText] = useState("");
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => readLedger());
  const [selectedSkills, setSelectedSkills] = useState(["1", "2", "9"]);
  const [lastSignal, setLastSignal] = useState("Warten auf die Partnerkopplung.");
  const [missionElapsed, setMissionElapsed] = useState(0);
  const [mission, setMission] = useState<MissionState>(initialMission);
  const [confirmedDrop, setConfirmedDrop] = useState<{ id: string; baseItemKey: string; quality: string; itemLevel: number } | null>(null);
  const [gatewayPairing, setGatewayPairing] = useState<GatewayPairing | null>(null);
  const [gatewaySequence, setGatewaySequence] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [humanTeamPartner, setHumanTeamPartner] = useState<string | null>(null);
  const [soloMode, setSoloMode] = useState(previewLoadout || previewOpenWorld);
  const [activeWorldNpc, setActiveWorldNpc] = useState<"lyra" | "orun" | null>(null);
  const [npcDialogueText, setNpcDialogueText] = useState("");
  const [dialogueQuestPrompt, setDialogueQuestPrompt] = useState<DialogueQuestPrompt | null>(null);
  const [starterCharacter, setStarterCharacter] = useState<(typeof starterCharacters)[number]>(starterCharacters[0]);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [zoneStatus, setZoneStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "rejected">("idle");
  const [worldDetailsOpen, setWorldDetailsOpen] = useState(false);
  const [worldStreamAnchor, setWorldStreamAnchor] = useState<WorldStreamAnchor | null>(null);
  const [bossMusicScope, setBossMusicScope] = useState<"dungeon" | "world" | null>(null);
  const [worldStreamTier, setWorldStreamTier] = useState<WorldChunkStreamingTier>(() => streamTierForViewport());
  const [worldStreamCenter, setWorldStreamCenter] = useState({ x: 0, z: 0 });
  const [worldStreamCursors, setWorldStreamCursors] = useState<Record<string, number>>({});
  const expeditionAudio = useRef<HTMLAudioElement | null>(null);
  const soundscape = useRef<AurionSoundscape | null>(null);
  const musicResetTimer = useRef<number | null>(null);
  const createGatewaySession = trpc.gateway.createSession.useMutation();
  const persistCompanionObservation = trpc.companion.persistObservation.useMutation();
  const revokeGatewaySession = trpc.gateway.revokeSession.useMutation();
  const gatewayCommandInput = useMemo(() => ({ sessionId: gatewayPairing?.sessionId ?? "unpaired_session", afterSequence: gatewaySequence }), [gatewayPairing?.sessionId, gatewaySequence]);
  const shouldPollGateway = Boolean(gatewayPairing) && (screen === "mission" || screen === "open_world");
  const gatewayCommands = trpc.gateway.pullCommands.useQuery(
    gatewayCommandInput,
    { enabled: shouldPollGateway, refetchInterval: shouldPollGateway ? 900 : false }
  );
  const teamSignals = trpc.community.team.signals.useQuery(undefined, {
    enabled: Boolean(humanTeamPartner) && (screen === "mission" || screen === "open_world"),
    refetchInterval: humanTeamPartner && (screen === "mission" || screen === "open_world") ? 900 : false,
  });
  const sendTeamSignal = trpc.community.team.sendSignal.useMutation();
  const characterAppearance = trpc.assetSubmissions.characterAppearance.useQuery(undefined, { enabled: apiAvailable && isAuthenticated });
  const gameplayProgress = trpc.gameplay.progress.useQuery(undefined, { enabled: isAuthenticated });
  const factionQuestline = trpc.factionQuestline.read.useQuery(undefined, { enabled: isAuthenticated && (screen === "mission" || screen === "open_world") });
  const pledgeFactionQuestline = trpc.factionQuestline.pledge.useMutation();
  const decideFactionQuestline = trpc.factionQuestline.decide.useMutation();
  const wasdCoverage = trpc.gameplay.wasdCoverage.useQuery(undefined, { enabled: isAuthenticated && (screen === "mission" || screen === "open_world") });
  const openWorld = trpc.gameplay.openWorld.useQuery(undefined, { enabled: isAuthenticated && (screen === "mission" || screen === "open_world") });
  const enterOpenWorld = trpc.gameplay.enterOpenWorld.useMutation();
  const currentStreamCoordinates = useMemo(() => orderedWorldChunkWindow(worldStreamCenter, worldChunkStreamingBudget(worldStreamTier).visibleRadius), [worldStreamCenter, worldStreamTier]);
  const worldChunkWindowInput = useMemo(() => ({
    worldVersion: "aurion-global-world.v1" as const,
    expectedBaseRevision: 1 as const,
    chunkX: worldStreamCenter.x,
    chunkZ: worldStreamCenter.z,
    tier: worldStreamTier,
    afterSequences: currentStreamCoordinates.flatMap(coordinate => {
      const afterSequence = worldStreamCursors[worldChunkCoordinateKey(coordinate)];
      return afterSequence && afterSequence > 0 ? [{ chunkX: coordinate.x, chunkZ: coordinate.z, afterSequence }] : [];
    }),
  }), [currentStreamCoordinates, worldStreamCenter.x, worldStreamCenter.z, worldStreamCursors, worldStreamTier]);
  const worldChunkWindow = trpc.gameplay.worldChunkWindow.useQuery(worldChunkWindowInput, { enabled: isAuthenticated && Boolean(worldStreamAnchor), refetchInterval: worldStreamAnchor ? 15_000 : false });
  const playerSnapshot = trpc.player.me.useQuery(undefined, { enabled: isAuthenticated });
  const choosePlayerClass = trpc.player.chooseClass.useMutation();
  const setWeaponLoadout = trpc.player.setWeaponLoadout.useMutation();
  const acceptGameplayQuest = trpc.gameplay.acceptQuest.useMutation();
  const completeGameplayQuest = trpc.gameplay.completeQuest.useMutation();
  const startGameplayEncounter = trpc.gameplay.startEncounter.useMutation();
  const applyGameplayAction = trpc.gameplay.act.useMutation();
  const interpretNpcDialogue = trpc.gameplay.interpretNpcDialogue.useMutation();
  const requestQuestActionFromDialogue = trpc.gameplay.requestQuestActionFromDialogue.useMutation();
  const gameplaySession = useRef<{ id: string; nextSequence: number } | null>(null);
  const zoneClient = useRef<ZoneMovementClient | null>(null);
  const activeCharacterUrl = characterAppearance.data?.storageUrl ?? starterCharacter.assetPath;
  const localWasdScenePreview = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return undefined;
    if (new URLSearchParams(window.location.search).get("wasd_scene_preview") !== "emberfall_water_source") return undefined;
    return wasdAurionSceneAssetAssignments.find(assignment => assignment.target === "emberfall_settlement_water_source");
  }, []);
  const processedTeamSignals = useRef(new Set<string>());
  const processedGatewaySequence = useRef(0);
  const issueZoneTicket = trpc.gameplay.issueZoneTicket.useMutation();
  const lastCompanionAction = useRef<PendingCompanionAction | undefined>(undefined);
  const companionActionSequence = useRef(0);
  const companionCaptureInFlight = useRef(false);

  useEffect(() => () => zoneClient.current?.close(), []);

  useEffect(() => {
    const updateTier = () => setWorldStreamTier(streamTierForViewport());
    window.addEventListener("resize", updateTier);
    return () => window.removeEventListener("resize", updateTier);
  }, []);

  useEffect(() => {
    if (!worldStreamAnchor || !worldChunkWindow.data) return;
    const { chunks, tier, center } = worldChunkWindow.data;
    if (!matchesWorldChunkStreamSelection({ center: worldStreamCenter, tier: worldStreamTier }, { center, tier })) return;
    const expectedChunkKeys = new Set(currentStreamCoordinates.map(worldChunkCoordinateKey));
    if (!chunks.every(chunk => expectedChunkKeys.has(worldChunkCoordinateKey(chunk.generation.coordinate)))) return;
    chunks.forEach(chunk => window.dispatchEvent(new CustomEvent("aurion:stream-world-chunk", { detail: { globalWorld: worldStreamAnchor, tier, center, chunk } })));
    setWorldStreamCursors(current => {
      let changed = false;
      const next = { ...current };
      chunks.forEach(chunk => {
        const key = worldChunkCoordinateKey(chunk.generation.coordinate);
        if (chunk.hasMore && chunk.nextAfterSequence > (current[key] ?? 0)) { next[key] = chunk.nextAfterSequence; changed = true; }
      });
      return changed ? next : current;
    });
  }, [currentStreamCoordinates, worldChunkWindow.data, worldStreamAnchor, worldStreamCenter, worldStreamTier]);

  useEffect(() => {
    setWorldStreamCursors({});
  }, [worldStreamCenter.x, worldStreamCenter.z, worldStreamTier]);

  useEffect(() => {
    const sendMovement = (event: Event) => zoneClient.current?.sendMovement((event as CustomEvent<ZoneMovementInput>).detail);
    const tapMovement = (event: Event) => {
      const input = (event as CustomEvent<ZoneMovementInput>).detail;
      zoneClient.current?.sendMovement(input);
      window.setTimeout(() => zoneClient.current?.sendMovement({ x: 0, z: 0 }), 110);
    };
    window.addEventListener("aurion:zone-movement-state", sendMovement);
    window.addEventListener("aurion:zone-movement-tap", tapMovement);
    return () => {
      window.removeEventListener("aurion:zone-movement-state", sendMovement);
      window.removeEventListener("aurion:zone-movement-tap", tapMovement);
    };
  }, []);

  const skillNames = useMemo(() => abilityDeck.filter((ability) => selectedSkills.includes(ability.code)), [selectedSkills]);
  const allowedGatewayCommands = useMemo(() => ["W", "A", "S", "D", "E", "F", ...selectedSkills], [selectedSkills]);
  const shapeMusic = (kind: LedgerEntry["kind"] | "victory"): void => {
    const audio = expeditionAudio.current;
    if (!audio || !audioEnabled) return;
    if (musicResetTimer.current) window.clearTimeout(musicResetTimer.current);
    const level: Record<LedgerEntry["kind"] | "victory", number> = { system: 0.30, command: 0.36, combat: 0.50, connection: 0.42, warning: 0.22, victory: 0.46 };
    audio.volume = level[kind];
    audio.playbackRate = kind === "combat" ? 1.035 : kind === "warning" ? 0.96 : 1;
    musicResetTimer.current = window.setTimeout(() => { if (expeditionAudio.current) { expeditionAudio.current.volume = 0.34; expeditionAudio.current.playbackRate = 1; } }, kind === "combat" ? 1600 : 900);
  };

  useEffect(() => {
    document.title = "Echoes of Aurion – LLM Koop-Action-Abenteuer";
  }, []);

  useEffect(() => {
    const audio = new Audio(aurionAssets.expeditionTheme);
    audio.loop = true;
    audio.volume = 0.34;
    expeditionAudio.current = audio;
    return () => { audio.pause(); expeditionAudio.current = null; };
  }, []);

  useEffect(() => {
    const mixer = new AurionSoundscape(aurionAssets.audio.sfx);
    soundscape.current = mixer;
    return () => { mixer.dispose(); soundscape.current = null; };
  }, []);

  useEffect(() => {
    const mixer = soundscape.current;
    if (!mixer) return;
    const url = bossMusicScope ? aurionAssets.audio.boss : screen === "home" ? aurionAssets.audio.tower : mission.arena === 3 ? aurionAssets.audio.cinderVault : mission.arena === 2 ? aurionAssets.audio.cave : mission.arena === 1 ? aurionAssets.audio.city : worldStreamAnchor ? aurionAssets.audio.forest : aurionAssets.audio.plains;
    void mixer.playAmbient(url, bossMusicScope ? 0.28 : 0.32).catch(() => { /* browser autoplay policy is handled by the visible audio control */ });
  }, [bossMusicScope, mission.arena, screen, worldStreamAnchor]);
  useEffect(() => {
    const onBossEncounter = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean; scope?: "dungeon" | "world" }>).detail;
      if (detail?.active === false) setBossMusicScope(null);
      else if (detail?.scope === "dungeon" || detail?.scope === "world") setBossMusicScope(detail.scope);
    };
    window.addEventListener("aurion:boss-encounter", onBossEncounter);
    return () => window.removeEventListener("aurion:boss-encounter", onBossEncounter);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setImmersiveMode(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const onLedger = (event: Event) => setLedger((event as CustomEvent<LedgerEntry[]>).detail);
    const onGameEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: LedgerEntry["kind"]; detail: string; audio?: AudioEvent }>).detail;
      setLastSignal(detail.detail);
      appendLedger({ kind: detail.kind ?? "system", title: "Sternwarte", detail: detail.detail });
      soundscape.current?.emit(detail.audio ?? audioEventFromLegacy(detail.kind ?? "system", detail.detail));
      shapeMusic(detail.kind ?? "system");
    };
    const onMissionState = (event: Event) => { const next = (event as CustomEvent<MissionState>).detail; setMission(next); if (next.phase === "victory") { soundscape.current?.emit({ cue: "progression.level_up", category: "progression", level: next.arena + 1 }); shapeMusic("victory"); } };
    window.addEventListener("aurion:ledger-updated", onLedger);
    window.addEventListener("aurion:game-event", onGameEvent);
    const onNpcInteraction = (event: Event) => { const npcId = (event as CustomEvent<{ npcId?: string }>).detail?.npcId; const voice = npcId === "lyra" ? "feminine" : npcId === "orun" ? "masculine" : "neutral"; soundscape.current?.emit({ cue: `interaction.npc.${voice}`, category: "interaction", voice } as AudioEvent); };
    const onAudioCue = (event: Event) => { const candidate = (event as CustomEvent<unknown>).detail; if (isAudioEvent(candidate)) soundscape.current?.emit(candidate); };
    window.addEventListener("aurion:mission-state", onMissionState);
    window.addEventListener("aurion:world-npc-interaction", onNpcInteraction);
    window.addEventListener("aurion:audio-cue", onAudioCue);
    return () => {
      window.removeEventListener("aurion:ledger-updated", onLedger);
      window.removeEventListener("aurion:game-event", onGameEvent);
      window.removeEventListener("aurion:mission-state", onMissionState);
      window.removeEventListener("aurion:world-npc-interaction", onNpcInteraction);
      window.removeEventListener("aurion:audio-cue", onAudioCue);
    };
  }, []);

  useEffect(() => {
    const onOffline = () => {
      const current = loadCompanionSession();
      if (!current || current.mode === "disconnected" || current.mode === "stopping") return;
      try { setCompanionSession(transitionCompanionSession("user_offline")); } catch { /* fail closed */ }
      setLastSignal("Offline: Der LLM-Companion wurde aus der Szene entfernt und darf nicht weiter handeln.");
    };
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, []);

  useEffect(() => {
    const onCompanionState = (event: Event) => setCompanionSession((event as CustomEvent<CompanionSession>).detail);
    const onDatasetUpdated = () => setCompanionRows(companionDatasetCount());
    window.addEventListener("aurion:companion-state", onCompanionState);
    window.addEventListener("aurion:companion-dataset-updated", onDatasetUpdated);
    return () => {
      window.removeEventListener("aurion:companion-state", onCompanionState);
      window.removeEventListener("aurion:companion-dataset-updated", onDatasetUpdated);
    };
  }, []);

  useEffect(() => {
    if (companionSession?.mode !== "learning") {
      lastCompanionAction.current = undefined;
      return;
    }
    const timer = window.setInterval(() => {
      const pending = lastCompanionAction.current;
      if (!pending || companionCaptureInFlight.current) return;
      const now = Date.now();
      if (now - pending.issuedAt > COMPANION_FRAME_MAX_AGE_MS) {
        if (lastCompanionAction.current?.id === pending.id) lastCompanionAction.current = undefined;
        return;
      }
      companionCaptureInFlight.current = true;
      void requestCompanionFrame().then(sample => {
        if (!sample || !isFreshCompanionFrame(sample, Date.now()) || lastCompanionAction.current?.id !== pending.id) return;
        const stateVector: CompanionStateVector = [
          mission.explorerHp / 100,
          mission.echoHp / 100,
          mission.sentinelHp / Math.max(1, mission.sentinelMaxHp),
          mission.shield ? 1 : 0,
          mission.marked ? 1 : 0,
          companionMissionPhaseValue[mission.phase],
        ];
        const stateMask: CompanionStateMask = [1, 1, 1, 1, 1, 1];
        const row = recordCompanionObservation({
          frameDataUrl: sample.frameDataUrl,
          featureVector: [...sample.featureVector],
          action: pending.action,
          stateVector,
          stateMask,
          capturedAt: sample.capturedAt,
          note: `Beobachtung in ${mission.arenaName}: ${mission.objective}`,
        });
        if (!row) return;
        if (lastCompanionAction.current?.id === pending.id) lastCompanionAction.current = undefined;
        void persistCompanionObservation.mutateAsync({
          sessionId: row.session_id,
          sequenceIndex: row.sequence_index,
          timestampEpoch: row.timestamp_epoch,
          sampleId: row.sample_id,
          featureVector: row.feature_vector,
          targetAction: row.target_action_chunk[0],
          stateVector: row.state_vector,
          stateMask: row.state_mask,
          note: row.note,
        }).catch(() => setLastSignal("Die Demonstration ist lokal gesichert; die serverseitige Companion-Memory-Bestätigung steht noch aus."));
      }).finally(() => { companionCaptureInFlight.current = false; });
    }, 100);
    return () => window.clearInterval(timer);
  }, [companionSession?.mode, mission, persistCompanionObservation]);

  useEffect(() => {
    if (screen !== "mission") return;
    const timer = window.setInterval(() => setMissionElapsed((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    const received = gatewayCommands.data?.filter((entry) => entry.sequence > processedGatewaySequence.current) ?? [];
    if (received.length === 0) return;
    received.forEach((entry) => {
      processedGatewaySequence.current = entry.sequence;
      if (!companionActionAllowed()) {
        appendLedger({ kind: "warning", title: `MCP-Impuls ${entry.command} gesperrt`, detail: "Der Companion muss zuerst Learn abschließen und über Play/Go gespawnt werden." });
        setLastSignal("MCP-Impuls gesperrt: Der Companion ist nicht im bestätigten Play-Zustand.");
        return;
      }
      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command, origin: "gateway" as const } }));
      appendLedger({ kind: "command", title: `Autorisierter MCP-Impuls ${entry.command}`, detail: `${gatewayPairing?.sessionId ?? "MCP"} bestätigte die Sequenz ${entry.sequence}.` });
    });
    const last = received[received.length - 1];
    setGatewaySequence(last.sequence);
    setLastSignal(`Autorisierter MCP-Partner: Impuls ${last.command} empfangen.`);
  }, [gatewayCommands.data, gatewayPairing?.sessionId]);

  useEffect(() => {
    if (!humanTeamPartner) return;
    const received = teamSignals.data?.filter(entry => entry.senderUserId !== user?.id && !processedTeamSignals.current.has(entry.id)) ?? [];
    received.forEach(entry => {
      processedTeamSignals.current.add(entry.id);
      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command, origin: "human_team" as const } }));
      appendLedger({ kind: /^[1-9]$/.test(entry.command) ? "combat" : "command", title: `Team-Impuls ${entry.command}`, detail: `${entry.senderName || humanTeamPartner} übermittelt einen sichtbaren Steuerimpuls.` });
    });
    if (received.length) setLastSignal(`${humanTeamPartner} koordiniert den nächsten Echo-Impuls.`);
  }, [teamSignals.data, humanTeamPartner, user?.id]);

  useEffect(() => {
    const onCharacterModelStatus = (event: Event) => {
      const status = (event as CustomEvent<{ active?: boolean; unavailable?: boolean; reason?: string }>).detail;
      if (!status) return;
      setLastSignal(status.active ? "Dein freigegebenes Charaktermodell ist in der Sternwarte aktiv." : status.unavailable ? "Diese Laufzeit unterstützt keine 3D-Szene. Aurion hält den Zugang und die Community-Funktionen sicher bereit." : status.reason ? `Das Charaktermodell wurde sicher übersprungen: ${status.reason}` : "Das Charaktermodell konnte nicht geladen werden. Aurion verwendet sicher das Standardmodell.");
    };
    window.addEventListener("aurion:character-model-status", onCharacterModelStatus);
    return () => window.removeEventListener("aurion:character-model-status", onCharacterModelStatus);
  }, []);

  useEffect(() => {
    const onWorldNpcInteraction = (event: Event) => {
      const npcId = (event as CustomEvent<{ npcId?: "lyra" | "orun" }>).detail?.npcId;
      if (!npcId) return;
      setActiveWorldNpc(npcId);
      setLastSignal(`${npcId === "lyra" ? "Lyra" : "Orun"} öffnet einen bestätigten Dialogpfad.`);
    };
    window.addEventListener("aurion:world-npc-interaction", onWorldNpcInteraction);
    return () => window.removeEventListener("aurion:world-npc-interaction", onWorldNpcInteraction);
  }, []);

  useEffect(() => {
    const onRequestedAction = (event: Event) => {
      const detail = (event as CustomEvent<{ command: Command; source: "human" | "gateway"; origin?: CompanionCommandOrigin }>).detail;
      const session = gameplaySession.current;
      if (!detail || !session) {
        setLastSignal("Die Aktion wartet auf eine bestätigte Quest- und Begegnungssitzung.");
        return;
      }
      applyGameplayAction.mutate({ sessionId: session.id, sequence: session.nextSequence, command: detail.command, source: detail.source }, {
        onSuccess: (result) => {
          gameplaySession.current = result.completed ? null : { id: result.sessionId, nextSequence: result.nextSequence };
          window.dispatchEvent(new CustomEvent("aurion:authoritative-action", { detail: { command: detail.command, source: detail.source, origin: detail.origin, damage: result.damage, bossHp: result.bossHp, completed: result.completed } }));
          if (result.completed) {
            void gameplayProgress.refetch();
            if (result.drop) setConfirmedDrop(result.drop);
            setLastSignal(result.completedQuest ? `Der Auftrag ist bereit. Kehre für die Belohnung zu ${gameplayProgress.data?.quests.find(quest => quest.key === result.completedQuest)?.giver ?? "deinem Questgeber"} zurück.` : result.drop ? `Dungeonfund bestätigt: ${result.drop.baseItemKey}.` : "Der Glutwächter ist bestätigt gefallen.");
          }
        },
        onError: () => setLastSignal("Die Aktion wurde nicht bestätigt. Die lokale Szene übernimmt keinen unbestätigten Schaden."),
      });
    };
    window.addEventListener("aurion:request-action", onRequestedAction);
    return () => window.removeEventListener("aurion:request-action", onRequestedAction);
  }, [applyGameplayAction, gameplayProgress]);

  const openAccountAccess = useCallback(() => {
    window.dispatchEvent(new Event("aurion:open-local-auth"));
    setLastSignal("Öffne den sicheren Aurion-Konto-Zugang für Anmeldung oder Registrierung.");
  }, []);

  const toggleImmersiveMode = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen?.().catch(() => setLastSignal("Der Browser konnte den Vollbildmodus nicht schließen."));
      return;
    }
    if (!document.documentElement.requestFullscreen) {
      setLastSignal("Dieser Browser unterstützt keinen Vollbildmodus. Die Touchsteuerung bleibt verfügbar.");
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
      setLastSignal("Spielmodus aktiviert: Vollbild und Touchsteuerung sind bereit.");
    } catch {
      setLastSignal("Der Browser hat Vollbild blockiert. Tippe auf das Vollbildsymbol, um es erneut zu versuchen.");
    }
  }, []);

  const activateHumanTeam = useCallback((partnerName: string) => {
    if (gatewayPairing) void revokeGatewaySession.mutateAsync({ sessionId: gatewayPairing.sessionId });
    processedTeamSignals.current.clear();
    processedGatewaySequence.current = 0;
    setGatewayPairing(null);
    setGatewaySequence(0);
    setHumanTeamPartner(partnerName);
    setSoloMode(false);
    setProvider(`TEAM // ${partnerName}`);
    setConnected(true);
    setLastSignal(`${partnerName} ist als menschlicher Team-Partner bestätigt. Keine LLM-Kopplung erforderlich.`);
  }, [gatewayPairing, revokeGatewaySession]);

  const clearHumanTeam = useCallback(() => {
    processedTeamSignals.current.clear();
    setHumanTeamPartner(null);
    setSoloMode(false);
    setProvider(providers[0]);
    setConnected(Boolean(gatewayPairing));
    setLastSignal("Das menschliche Team-Siegel wurde gelöst.");
  }, [gatewayPairing]);

  const pairPartner = (): void => {
    if (isPairing) return;
    if (humanTeamPartner) { setLastSignal("Dein menschliches Zweierteam ist bereits bereit für die Sternwarte."); return; }
    if (authLoading) { setLastSignal("Expeditionskonto wird geprüft. Bitte einen Moment warten."); return; }
    if (!isAuthenticated) { setLastSignal("Melde dich an, um einen autorisierten Partner-Slot auszustellen."); openAccountAccess(); return; }
    setSoloMode(false);
    setIsPairing(true); setLastSignal(`Autorisierter MCP-Slot für ${provider} wird ausgegeben.`);
    createGatewaySession.mutate({ providerLabel: provider, allowedCommands: allowedGatewayCommands }, {
      onSuccess: (pairing) => {
        processedGatewaySequence.current = 0; setGatewayPairing(pairing); setGatewaySequence(0); setConnected(true); setIsPairing(false);
        if (user?.id) {
          startCompanionSession(user.id, provider, pairing.sessionId);
          transitionCompanionSession("connect");
        }
        appendLedger({ kind: "connection", title: "LLM-Verbindung bestätigt", detail: `${provider} ist verbunden. Der Companion wird erst nach Learn und anschließendem Play gespawnt.` });
        setLastSignal(`${provider} kann jetzt über den autorisierten MCP-Steuervertrag beitreten.`);
      },
      onError: () => { setIsPairing(false); setLastSignal("Partner-Siegel konnte nicht ausgestellt werden. Prüfe die Konto-Verbindung erneut."); },
    });
  };
  const revokePartner = (): void => {
    if (!gatewayPairing || revokeGatewaySession.isPending) return;
    revokeGatewaySession.mutate({ sessionId: gatewayPairing.sessionId }, {
      onSuccess: () => {
        const current = loadCompanionSession();
        if (current && current.mode !== "disconnected" && current.mode !== "stopping") {
          try { transitionCompanionSession("stop"); } catch { /* already fail-closed */ }
        }
        if (loadCompanionSession()?.mode === "stopping") { try { transitionCompanionSession("disconnect"); } catch { /* already disconnected */ } }
        appendLedger({ kind: "connection", title: "LLM-Verbindung widerrufen", detail: "Der serverseitige Steuervertrag wurde beendet; der Companion wurde aus der Szene entfernt." });
        processedGatewaySequence.current = 0; setGatewayPairing(null); setGatewaySequence(0); setConnected(false); setSoloMode(false); setScreen("gate");
        setLastSignal("Partner-Siegel widerrufen. Eine neue Kopplung kann ausgestellt werden.");
      },
      onError: () => setLastSignal("Der Widerruf konnte nicht bestätigt werden. Bitte erneut versuchen."),
    });
  };
  const beginSoloAdventure = (): void => {
    if (authLoading) { setLastSignal("Dein Aurion-Konto wird noch geprüft. Bitte einen Moment warten."); return; }
    if (!isAuthenticated) { setLastSignal("Lege zuerst ein Aurion-Konto an oder melde dich an, um deine Expedition zu sichern."); openAccountAccess(); return; }
    if (gatewayPairing) void revokeGatewaySession.mutateAsync({ sessionId: gatewayPairing.sessionId });
    processedTeamSignals.current.clear(); processedGatewaySequence.current = 0;
    setGatewayPairing(null); setGatewaySequence(0); setHumanTeamPartner(null); setSoloMode(true); setProvider("SOLO // ECHO-AUTOMATIK"); setConnected(true);
    appendLedger({ kind: "system", title: "Solo-Expedition freigegeben", detail: "Du steuerst Explorer und Echo-Slots direkt; keine LLM- oder Team-Verbindung wird benötigt." });
    setLastSignal("Solo-Modus aktiv: Die Echo-Slots liegen vollständig in deiner Hand.");
    setScreen("home");
  };
  const unlockLoadout = (): void => { if (!connected) return; setScreen("loadout"); appendLedger({ kind: "system", title: "Menü freigeschaltet", detail: "Charakter- und Partner-Loadout sind jetzt verfügbar." }); };
  const toggleSkill = (code: string): void => setSelectedSkills((current) => { if (current.includes(code)) return current.filter((skill) => skill !== code); if (current.length >= 3) return [...current.slice(1), code]; return [...current, code]; });
  const startServerEncounter = (encounterKey: "asterion" | "archive" | "solarium" | "cinder_vault"): void => {
    if (!isAuthenticated) { setLastSignal("Melde dich für serverbestätigte Quest- und Belohnungsfortschritte an."); openAccountAccess(); return; }
    startGameplayEncounter.mutate({ encounterKey }, {
      onSuccess: ({ session }) => {
        gameplaySession.current = { id: session.id, nextSequence: session.nextSequence };
        setWorldDetailsOpen(false);
        zoneClient.current?.close();
        setWorldStreamAnchor(null);
        setWorldStreamCursors({});
        setScreen("mission");
        const arenaIndex = encounterKey === "asterion" ? 0 : encounterKey === "archive" ? 1 : encounterKey === "solarium" ? 2 : 3;
        window.dispatchEvent(new CustomEvent("aurion:load-encounter", { detail: { arenaIndex, dungeon: encounterKey === "cinder_vault" } }));
        setLastSignal(`${session.encounterKey} ist als serverseitige Begegnung bestätigt.`);
      },
      onError: () => setLastSignal("Die Begegnung ist noch nicht freigeschaltet. Sprich zuerst mit dem zuständigen Questgeber."),
    });
  };
  const enterAurionExpanse = (onConfirmed?: () => void): void => {
    if (!isAuthenticated) { setLastSignal("Melde dich an, um die serverbestätigte Aurion-Expanse zu betreten."); openAccountAccess(); return; }
    if (gameplaySession.current) { setLastSignal("Beende oder sichere zuerst die aktive serverseitige Begegnung."); return; }
    enterOpenWorld.mutate(undefined, {
      onSuccess: (snapshot) => {
        setWorldDetailsOpen(false);
        setWorldStreamAnchor(snapshot.globalWorld);
        setWorldStreamCenter({ x: 0, z: 0 });
        setWorldStreamCursors({});
        window.dispatchEvent(new CustomEvent("aurion:load-open-world", { detail: snapshot }));
        appendLedger({ kind: "system", title: "Aurion-Expanse bestätigt", detail: `${snapshot.displayName} wurde als Weltansicht der Revision ${snapshot.revision} geöffnet.` });
        setLastSignal(`${snapshot.displayName} ist bestätigt. ${snapshot.encounter.activeCount} Begegnungen sind im sichtbaren Bereich aktiv.`);
        void openWorld.refetch();
        onConfirmed?.();
      },
      onError: () => setLastSignal("Der Weltübergang wurde nicht bestätigt. Die Szene bleibt im sicheren Turmzustand."),
    });
  };
  const returnToTowerHome = (): void => {
    if (gameplaySession.current) { setLastSignal("Eine aktive serverbestätigte Begegnung muss vor der Rückkehr gesichert werden."); return; }
    zoneClient.current?.close();
    setWorldDetailsOpen(false);
    setWorldStreamAnchor(null);
    setWorldStreamCursors({});
    window.dispatchEvent(new Event("aurion:return-to-tower"));
    setScreen("home");
    appendLedger({ kind: "system", title: "Sichere Rückkehr zur Sternwarte", detail: "Der lokale Expanse-Stream wurde beendet; dein privates Hauptquartier bleibt der sichere Ausgangspunkt." });
    setLastSignal("Du bist sicher in deine private Sternwarte zurückgekehrt.");
  };
  const connectAuthoritativeZone = (): void => {
    if (!isAuthenticated || !user?.id) { openAccountAccess(); return; }
    issueZoneTicket.mutate({ zoneId: "observatory_threshold", clientBuild: "aurion-browser-movement-v1" }, {
      onSuccess: ({ ticket }) => {
        zoneClient.current?.close();
        const client = new ZoneMovementClient({
          onStatus: (status) => {
            setZoneStatus(status);
            if (status === "connected") window.dispatchEvent(new CustomEvent("aurion:zone-connected", { detail: { userId: user.id } }));
            if (status === "closed" || status === "rejected") window.dispatchEvent(new CustomEvent("aurion:zone-disconnected"));
          },
          onSnapshot: (snapshot) => {
            const self = snapshot.presences.find(presence => presence.userId === user.id);
            if (self) {
              window.dispatchEvent(new CustomEvent("aurion:zone-snapshot", { detail: { userId: user.id, position: self.position } }));
              setWorldStreamCenter(worldChunkCenterForZonePosition(self.position));
            }
          },
          onReject: (code) => setLastSignal(`Zonenbewegung wurde serverseitig verworfen: ${code}.`),
        });
        zoneClient.current = client;
        client.connect(ticket);
      },
      onError: () => setLastSignal("Das Zonenticket konnte nicht bestätigt werden."),
    });
  };
  const toggleAudio = (): void => {
    const audio = expeditionAudio.current;
    if (!audio) return;
    if (audioEnabled) { audio.pause(); setAudioEnabled(false); setLastSignal("Expeditionsmusik pausiert."); return; }
    void audio.play().then(() => { setAudioEnabled(true); setLastSignal("Expeditionsmusik aktiviert."); }).catch(() => setLastSignal("Der Browser blockiert Audio bis zur nächsten direkten Interaktion."));
  };
  const sendPartnerCommand = (raw?: string): void => {
    const code = codeFromText(raw ?? commandText);
    if (!code) { appendLedger({ kind: "warning", title: "Befehl verworfen", detail: "Erlaubt sind ausschließlich W, A, S, D, E, F und die Slots 1–9." }); setLastSignal("Ungültiger Steuerimpuls: erlaubt sind W, A, S, D, E, F, 1–9."); return; }
    if (humanTeamPartner) {
      sendTeamSignal.mutate({ command: code }, {
        onSuccess: () => setLastSignal(`Team-Impuls ${code} wurde an ${humanTeamPartner} übermittelt.`),
        onError: () => setLastSignal("Der Team-Impuls konnte nicht übermittelt werden. Prüfe das aktive Team-Siegel."),
      });
      appendLedger({ kind: "command", title: `Team-Impuls ${code} gesendet`, detail: `Der normalisierte Steuerimpuls wurde für ${humanTeamPartner} im gemeinsamen Team-Kanal hinterlegt.` });
      setCommandText("");
      return;
    }
    window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code, origin: "local_console" as const } }));
    const ability = abilityDeck.find((item) => item.code === code);
    appendLedger({ kind: /^[1-9]$/.test(code) ? "combat" : "command", title: `Partner-Impuls ${code}`, detail: ability ? `${provider} aktiviert ${ability.name}.` : `${provider} erhält den Bewegungsbefehl ${code}.` });
    setLastSignal(ability ? `${provider}: ${ability.name} ausgelöst.` : `${provider}: Kurs ${code} bestätigt.`); setCommandText("");
  };
  const queueCompanionAction = (action: CompanionAction): void => {
    if (loadCompanionSession()?.mode !== "learning") return;
    companionActionSequence.current += 1;
    lastCompanionAction.current = { id: companionActionSequence.current, action, issuedAt: Date.now() };
  };
  const sendHumanCommand = (code: "W" | "A" | "S" | "D"): void => {
    const coordinates: Record<string, [number, number]> = { W: [0.5, 0.25], A: [0.25, 0.5], S: [0.5, 0.75], D: [0.75, 0.5] };
    const [x, y] = coordinates[code];
    queueCompanionAction([x, y, 1, 1]);
    window.dispatchEvent(new CustomEvent("aurion:human-command", { detail: { code } }));
  };
  const sendHumanAction = (code: "F" | "E" = "F"): void => { queueCompanionAction([0.5, 0.5, 1, 1]); window.dispatchEvent(new CustomEvent("aurion:human-action", { detail: { code } })); setLastSignal(code === "F" ? "Explorer fordert ein Speersignal an." : "Explorer fordert eine Interaktion an."); };
  const beginCompanionLearn = (): void => {
    if (!companionSession) { setLastSignal("Verbinde zuerst ein LLM, bevor die Lernaufzeichnung startet."); return; }
    try {
      const next = companionSession.mode === "learning" ? transitionCompanionSession("finish_learning") : transitionCompanionSession("learn");
      setCompanionSession(next);
      if (next.mode !== "learning") lastCompanionAction.current = undefined;
      appendLedger({ kind: "connection", title: next.mode === "learning" ? "LLM-Lernen gestartet" : "LLM-Lernen beendet", detail: next.mode === "learning" ? "Aurion liest den sichtbaren Spiel-Canvas und bindet menschliche Aktionen als Dataset-Labels." : `${next.datasetRows} Beobachtungszeilen sind für den Play-Test bereit.` });
      setLastSignal(next.mode === "learning" ? "Learn/Record aktiv: Spiele jetzt vor, der Companion sammelt Bildschirm- und Aktionspaare." : "Lernphase beendet. Play/Go kann den gelernten Companion jetzt spawnen.");
    } catch { setLastSignal("Die Lernphase ist in diesem Companion-Zustand nicht zulässig."); }
  };
  const toggleCompanionPlay = (): void => {
    if (!companionSession) { setLastSignal("Verbinde zuerst ein LLM."); return; }
    try {
      const next = transitionCompanionSession(companionSession.mode === "playing" ? "stop" : "play");
      setCompanionSession(next);
      appendLedger({ kind: "connection", title: next.mode === "playing" ? "LLM-Companion gespawnt" : "LLM-Companion gestoppt", detail: next.mode === "playing" ? "Der gelernte Begleiter folgt dem Explorer und darf nur serverbestätigte Aktionen vorschlagen." : "Der Begleiter wurde sofort aus der Szene entfernt." });
      setLastSignal(next.mode === "playing" ? "Play/Go aktiv: Der Companion ist als levelbarer Echo-Charakter in der Szene." : "Stop aktiv: Der Companion ist verschwunden; weitere KI-Aktionen sind gesperrt.");
    } catch { setLastSignal("Play ist erst nach einer beendeten Lernphase zulässig."); }
  };
  const downloadCompanionDataset = (): void => { const blob = new Blob([exportCompanionDataset()], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "aurion-companion-dataset.json"; link.click(); URL.revokeObjectURL(url); };
  const downloadLedger = (): void => { const blob = new Blob([exportLedger()], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "aurion-memory-ledger.json"; link.click(); URL.revokeObjectURL(url); };
  const formatTime = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const bossPercent = Math.max(0, Math.min(100, (mission.sentinelHp / mission.sentinelMaxHp) * 100));
  const activeQuest = gameplayProgress.data?.quests.find(quest => quest.state === "active") ?? null;
  const visibleProfile = gameplayProgress.data?.profile;
  const activeWeaponTrack = playerSnapshot.data?.weaponLoadout?.weaponTrack ?? "spear";

  return (
    <main className={`aurion-app${immersiveMode ? " is-immersive" : ""}`} style={{ "--aurion-hero-poster": `url("${heroTrailerPoster}")` } as CSSProperties}>
      <Suspense fallback={<div className="aurion-canvas-boot" role="status"><span className="aurion-canvas-boot__sigil">✦</span><span>3D-Szene wird vorbereitet</span></div>}>
        <GameCanvas characterModelUrl={activeCharacterUrl} arenaModelUrl={localWasdScenePreview?.asset.sourceUrl ?? activeArenaAsset.data?.storageUrl} />
      </Suspense>
      <div className="atmosphere-vignette" aria-hidden="true" />
      <div className="ruin-constellation" aria-hidden="true"><span className="ruin-arch" /><span className="ruin-temple" /><span className="ruin-temple distant" /><span className="ruin-shard shard-one" /><span className="ruin-shard shard-two" /><span className="ruin-duo explorer" /><span className="ruin-duo scout" /><span className="ruin-thread" /></div>
      <header className="brand-bar"><div className="brand-lockup"><span role="img" aria-label="Aurion Siegel" className="brand-sigil"><i /><b /><i /></span><div><p className="brand-kicker">COOPERATIVE EXPEDITION // 01</p><h1>Echoes <span>of</span> Aurion</h1></div></div><div className="brand-status"><a href="/ops" className="mr-4 text-[10px] tracking-[.14em] text-cyan-100/75 hover:text-cyan-200">OPS</a><button type="button" className="audio-toggle header-audio" onClick={toggleAudio} aria-label={audioEnabled ? "Expeditionsmusik pausieren" : "Expeditionsmusik aktivieren"}>{audioEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}</button><span className={connected ? "signal-dot active" : "signal-dot"} /> {soloMode ? "Solo-Siegel aktiv" : connected ? "Partner-Siegel aktiv" : isAuthenticated ? "Konto verbunden" : "Konto erforderlich"}</div></header>
      <CommunityOverlay
        isAuthenticated={isAuthenticated}
        currentUserId={user?.id}
        onTeamReady={activateHumanTeam}
        onTeamCleared={clearHumanTeam}
        starterCharacterId={starterCharacter.id}
        onStarterCharacterSelected={setStarterCharacter}
      />
      <div className="account-game-tools" aria-label="Konto- und Spielmodus">
        {!isAuthenticated && screen !== "open_world" && <button type="button" className="account-game-tools__account" onClick={openAccountAccess}><UserRound size={15} /> KONTO ANLEGEN / ANMELDEN</button>}
        <button type="button" className="account-game-tools__fullscreen" onClick={() => void toggleImmersiveMode()} aria-label={immersiveMode ? "Vollbildmodus beenden" : "Vollbildmodus aktivieren"}>{immersiveMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span>{immersiveMode ? "VOLLBILD ENDE" : "VOLLBILD"}</span></button>
      </div>
      {screen === "gate" && (
        <section className="gate-panel" aria-labelledby="gate-title">
          <div className="gate-runes" aria-hidden="true">✦ &nbsp; ◌ &nbsp; ⟡</div><p className="eyebrow"><UserRound size={14} /> DEIN AURION-KONTO</p>
          <h2 id="gate-title">Deine Geschichte.<br /><em>Dein Aurion.</em><br />Eine letzte Sternwarte.</h2>
          <p className="gate-copy">Erstelle ein Aurion-Konto oder melde dich an, um Charakter, Questfortschritt, Beute und Weltstatus sicher zu speichern. Du kannst allein starten; einen MCP-Partner verbindest du nur dann, wenn du ihn später nutzen möchtest.</p>
          {!isAuthenticated ? <button type="button" className="gate-account-cta" onClick={openAccountAccess}><UserRound size={16} /><span><b>KONTO ANLEGEN / ANMELDEN</b><small>Start mit FusionAuth oder eigenem Aurion-Rufnamen</small></span><ChevronRight size={18} /></button> : <button type="button" className="gate-account-cta" onClick={beginSoloAdventure}><UserRound size={16} /><span><b>ALLEIN DIE STERNWARTE BETRETEN</b><small>Dein Konto ist bereit. Starte ohne Team oder MCP.</small></span><ChevronRight size={18} /></button>}
          <button type="button" className="trailer-link" onClick={() => setTrailerOpen(true)}><Play size={15} fill="currentColor" /> HERO TRAILER ANSEHEN <span>EN VO · DE SUBS</span></button>
          <div className="duo-tableau" aria-label="Explorer und Echo Scout bereiten eine Aurion-Expedition vor"><div className="duo-actor explorer-figure"><span className="actor-crown" /><span className="actor-body" /><small>EXPLORER</small></div><div className="split-seal" aria-hidden="true"><i /><b /><i /></div><div className="duo-actor scout-figure"><span className="actor-crown" /><span className="actor-body" /><small>ECHO SCOUT</small></div></div>
          {!characterAppearance.data && <div className="starter-character-select" aria-label="Standard-Charaktermodell wählen"><p>EXPLORER-MODELL // RIGGT + ANIMIERT</p><div>{starterCharacters.map(character => <button type="button" key={character.id} onClick={() => setStarterCharacter(character)} className={starterCharacter.id === character.id ? "active" : ""}><b>{character.name}</b><span>{character.role}</span><small>{character.detail}</small></button>)}</div></div>}
          {isAuthenticated && <details className="connection-form"><summary>OPTIONAL: MCP-PARTNER VERBINDEN</summary><p className="gate-copy">Ein MCP-fähiger Client erhält einen zeitlich begrenzten Steuervertrag für sichtbare Aurion-Befehle. Private Chat-Inhalte und Provider-Tokens werden nicht gelesen oder gespeichert.</p>{humanTeamPartner && <div className="human-team-ready"><UsersRound size={17} /><div><b>HUMAN-TEAM BESTÄTIGT</b><span>{humanTeamPartner} begleitet dich ohne LLM-Verbindung. Die Team-Impulse werden sichtbar über Aurion relaiert.</span></div></div>}<label><span>Wähle einen MCP-Partner</span><select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={connected}>{providers.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" className={connected ? "seal-button connected" : "seal-button"} onClick={pairPartner} disabled={isPairing || connected}>{connected ? <ShieldCheck size={18} /> : <Radio size={18} />}{isPairing ? "STEUERVERTRAG WIRD AUSGESTELLT" : connected ? humanTeamPartner ? "MENSCHLICHES TEAM-SIEGEL AKTIV" : "MCP-PARTNER-SIEGEL AKTIV" : "OPTIONALEN MCP-SLOT ERSTELLEN"}</button>{gatewayPairing && <div className="gateway-pairing"><div><span>DEIN MCP-ENDPUNKT</span><code>{gatewayPairing.mcpUrl}</code></div><div><span>BEARER-PAIRINGTOKEN // NUR JETZT SICHTBAR</span><code>{gatewayPairing.pairingToken}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(gatewayPairing.pairingToken); }}><Copy size={13} /> TOKEN KOPIEREN</button></div><small>Konfiguriere den Token ausschließlich als <b>Authorization: Bearer</b>-Header in deinem MCP-fähigen LLM-Client. Er gilt bis {gatewayPairing.expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} und steuert nur {gatewayPairing.allowedCommands.join(" · ")}.</small><button type="button" className="revoke-pairing" onClick={revokePartner}>{revokeGatewaySession.isPending ? "WIDERRUF WIRD BESTÄTIGT" : "PARTNER-SIEGEL WIDERRUFEN"}</button></div>}{connected && !soloMode && <button type="button" className="continue-link" onClick={unlockLoadout}>MCP-Expedition vorbereiten <ChevronRight size={18} /></button>}</details>}
          <div className="privacy-note"><ShieldCheck size={16} /><span><b>Dein Konto bleibt der Standard.</b> Aurion speichert geschützte Spielsitzungen und serverbestätigte Wirkung. Die MCP-Kopplung ist optional und überträgt nur normalisierte Befehle, Reihenfolge und Spielwirkung.</span></div>
        </section>
      )}
      {screen === "home" && <TowerHomePanel
        playerName={operatorName}
        onPrepare={unlockLoadout}
        onEnterExpanse={() => enterAurionExpanse(() => setScreen("open_world"))}
        onSignal={(message) => { appendLedger({ kind: "system", title: "Sternwarten-Handlung", detail: message }); setLastSignal(message); }}
      />}
      {screen === "open_world" && <OpenWorldHud
        displayName={openWorld.data?.displayName ?? "Aurion-Expanse"}
        narrative={openWorld.data?.entryNarrative ?? "Der bestätigte Weltstatus wird gelesen."}
        zoneTier={openWorld.data?.zoneTier ?? 0}
        activeEncounters={openWorld.data?.encounter.activeCount ?? 0}
        maximumVisible={openWorld.data?.encounter.maximumVisible ?? 0}
        worldEpoch={openWorld.data?.globalWorld.epoch ?? worldStreamAnchor?.epoch ?? null}
        unlockedSectors={openWorld.data?.globalWorld.unlockedSectorCount ?? worldStreamAnchor?.unlockedSectorCount ?? null}
        streamCenter={`${worldStreamCenter.x}:${worldStreamCenter.z}`}
        streamTier={worldStreamTier}
        zoneStatus={zoneStatus}
        connecting={issueZoneTicket.isPending}
        authenticated={isAuthenticated}
        onReturn={returnToTowerHome}
        onConnectZone={connectAuthoritativeZone}
        onMove={sendHumanCommand}
        onInteract={() => sendHumanAction("E")}
        onOpenDetails={() => setWorldDetailsOpen(true)}
      />}
      {screen === "open_world" && worldDetailsOpen && (
        <div className="open-world-details-layer" role="dialog" aria-modal="true" aria-label="Welt-, Quest- und Begegnungsdetails">
          <button type="button" className="open-world-details-layer__close" onClick={() => setWorldDetailsOpen(false)}>WELTDETAILS SCHLIESSEN</button>
          <section className="open-world-card open-world-card--drawer" aria-label="Bestätigte Aurion-Expanse" style={{ "--expanse-reference": `url("${expanseReference}")` } as CSSProperties}>
            <div className="open-world-card__veil" />
            <div className="open-world-card__head"><div><span>OPEN WORLD // SERVER SNAPSHOT</span><b>{openWorld.data?.displayName ?? "Weltkarte wird gelesen"}</b></div><em>REV {openWorld.data?.revision ?? "—"}</em></div>
            <p>{openWorld.data?.entryNarrative ?? "Der Sternwartenturm hält die äußeren Pfade stabil, bis dein bestätigter Weltstatus geladen ist."}</p>
            <div className="open-world-card__metrics"><span>ZONE TIER <b>{openWorld.data?.zoneTier ?? 0}</b></span><span>SICHTBAR <b>{openWorld.data ? `${openWorld.data.encounter.activeCount}/${openWorld.data.encounter.maximumVisible}` : "—"}</b></span><span>BUDGET <b>{openWorld.data?.encounter.budget ?? "—"}</b></span><span>TILES <b>{openWorld.data?.terrain ? `${openWorld.data.terrain.tiles.length}/${openWorld.data.terrain.atlas.surfaces.length}` : "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>WETTER <b>{openWorld.data?.world.reaction.weatherTone ?? "—"}</b></span><span>DIALOGTON <b>{openWorld.data?.world.reaction.dialogueTone ?? "—"}</b></span><span>RESOLUTION <b>{openWorld.data?.world.resolutionIndex ?? "—"}</b></span><span>POLITY <b>{openWorld.data?.polity.governmentType ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>SEKTOREN <b>{openWorld.data?.globalWorld.unlockedSectorCount ?? "—"}</b></span><span>WELTEPOCHE <b>{openWorld.data?.globalWorld.epoch ?? "—"}</b></span><span>STREAM-ZENTRUM <b>{worldChunkWindow.data ? `${worldChunkWindow.data.center.x}:${worldChunkWindow.data.center.z}` : "wird gelesen"}</b></span><span>TIER <b>{worldChunkWindow.data?.tier ?? worldStreamTier}</b></span></div>
            <div className="open-world-card__metrics"><span>SICHTCHUNKS <b>{worldChunkWindow.data ? `${worldChunkWindow.data.chunks.length}/${worldChunkStreamingBudget(worldStreamTier).maxVisibleChunks}` : "—"}</b></span><span>STREAM-DELTAS <b>{worldChunkWindow.data?.chunks.reduce((total, chunk) => total + chunk.deltas.length, 0) ?? "—"}</b></span><span>SEITENLIMIT <b>32/Chunk</b></span><span>CACHE-LIMIT <b>{worldChunkStreamingBudget(worldStreamTier).maxCachedChunks}</b></span></div>
            <div className="open-world-card__metrics"><span>WASD-REV <b>{wasdCoverage.data?.sourceRevision.slice(0, 7) ?? "—"}</b></span><span>REGELMODULE <b>{wasdCoverage.data?.adaptedModuleCount ?? "—"}</b></span><span>WELT-PFADE <b>{wasdCoverage.data?.domainCounts.world ?? "—"}</b></span><span>KATALOG <b>{wasdCoverage.data?.catalogHash.slice(0, 7) ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>SIEDLUNG <b>{openWorld.data?.civilization.settlement.kind ?? "—"}</b></span><span>MARKT: TONIC <b>{openWorld.data?.civilization.market[0]?.price ?? "—"}</b></span><span>GILDE <b>{openWorld.data?.civilization.guild.name ?? "—"}</b></span><span>KARAWANEN <b>{openWorld.data?.civilization.caravanMissions.length ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>KNAPPHEIT <b>{openWorld.data?.civilization.scarcityForecast.recommendedAction ?? "—"}</b></span><span>GEFAHR <b>{openWorld.data ? `${Math.round(openWorld.data.civilization.aggressionHazard.hazardIndex * 100)}%` : "—"}</b></span><span>GILDENTERRITORIUM <b>{openWorld.data?.civilization.territoryEffect.ownerGuildId ?? "—"}</b></span><span>GILDENKASSE <b>{openWorld.data?.civilization.guild.treasury ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>EXPEDITIONSRÄUME <b>{openWorld.data?.expedition.layout.rooms.length ?? "—"}</b></span><span>LEITMONSTER <b>{openWorld.data?.expedition.leadMonster.species ?? "—"}</b></span><span>ANGRIFF <b>{openWorld.data?.expedition.openingStrike.damage ?? "—"}</b></span><span>ZAUBER <b>{openWorld.data?.expedition.spellPreview.potency ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>LYRA-ALTER <b>{openWorld.data?.society.lyraAge.age ?? "—"}</b></span><span>VERTRAUEN <b>{openWorld.data ? `${Math.round(openWorld.data.society.playerRelationship.value * 100)}%` : "—"}</b></span><span>ERFOLGE <b>{openWorld.data?.society.achievements.unlocked.length ?? "—"}</b></span><span>PARTY <b>{openWorld.data?.society.party.party?.members.length ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>FELDSTUFE <b>{openWorld.data?.stewardship.farm.growthStage ?? "—"}</b></span><span>BAUAUFTRÄGE <b>{openWorld.data?.stewardship.construction.length ?? "—"}</b></span><span>TOREN <b>{openWorld.data?.stewardship.gate.canOpen ? "zugänglich" : "gesperrt"}</b></span><span>GEBÄUDE-HP <b>{openWorld.data?.stewardship.structure.hitpoints ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>INVENTARSTAPEL <b>{openWorld.data?.inventory.stacks.length ?? "—"}</b></span><span>TRAGLAST <b>{openWorld.data ? `${openWorld.data.inventory.totalWeight.toFixed(1)}${openWorld.data.inventory.overCapacity ? "!" : ""}` : "—"}</b></span><span>SEELENGEBUNDEN <b>{openWorld.data?.inventory.stacks.filter(stack => stack.boundOnAcquire).length ?? "—"}</b></span><span>TRANSFERSPERRE <b>{openWorld.data?.inventory.stacks.filter(stack => stack.nonTransferable || !stack.tradeable).length ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>ARE-KAPPA <b>{openWorld.data?.worldKernel.integrity.kappa ?? "—"}</b></span><span>REGELKERN <b>{openWorld.data?.worldKernel.integrity.ok ? "gültig" : "gesperrt"}</b></span><span>STADTSEKTOR <b>{openWorld.data?.worldKernel.cityLayout.sector ?? "—"}</b></span><span>LAYOUTFIXES <b>{openWorld.data?.worldKernel.cityLayout.fixes.length ?? "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>NPC-AI <b>{openWorld.data?.aiProposal.intent ?? "—"}</b></span><span>VORSCHLAG <b>{openWorld.data?.aiProposal.commandType ?? "keine Ausführung"}</b></span><span>AI-STATUS <b>{openWorld.data?.aiProposal.state ?? "—"}</b></span><span>KONFIDENZ <b>{openWorld.data ? `${Math.round(openWorld.data.aiProposal.confidence * 100)}%` : "—"}</b></span></div>
            <div className="open-world-card__metrics"><span>SKILLPFAD <b>{openWorld.data?.skillProgression.skillId ?? "—"}</b></span><span>EXAKT-XP <b>{openWorld.data?.skillProgression.progression.totalXpExact ?? "—"}</b></span><span>SKILLSTUFE <b>{openWorld.data?.skillProgression.progression.levelExact ?? "—"}</b></span><span>RECEIPTS <b>{openWorld.data?.skillProgression.appliedReceiptIds.length ?? "—"}</b></span></div>
            {factionQuestline.data && <section className="faction-story-card" aria-label="Persönliche Fraktionsgeschichte"><div className="faction-story-card__head"><div><span>PERSÖNLICHE QUESTLINE // SERVERBESTÄTIGT</span><b>{factionQuestline.data.factionStory.title}</b></div><em>{factionQuestline.data.faction.replaceAll("_", " ").toUpperCase()}</em></div><p>{factionQuestline.data.factionStory.coreQuestline}</p><div className="faction-story-card__people"><span><small>TRÄGER DER GESCHICHTE</small><b>{factionQuestline.data.factionStory.protagonist}</b></span><span><small>SICHTBARE NOT</small><b>{factionQuestline.data.factionStory.visibleNeed}</b></span><span><small>VERBORGENE WAHRHEIT</small><b>{factionQuestline.data.factionStory.humanTruth}</b></span></div><div className="faction-story-card__motifs">{factionQuestline.data.factionStory.signatureMotifs.map(motif => <span key={motif}>{motif}</span>)}</div>{factionQuestline.data.mode === "neutral" && factionQuestline.data.completedQuestIds.includes("free_haven.mainline") && <div className="faction-story-card__pledge"><small>DEIN NEUTRALER WEG HAT EINEN PREIS</small><p>Die vier Banner warten nicht auf Heldentum, sondern auf eine Entscheidung, die du später nicht zurücknehmen kannst.</p><div>{(["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact"] as const).map(targetFaction => <button type="button" key={targetFaction} disabled={pledgeFactionQuestline.isPending} onClick={() => pledgeFactionQuestline.mutate({ targetFaction, idempotencyKey: `faction-oath:${targetFaction}:${crypto.randomUUID()}` }, { onSuccess: () => { void factionQuestline.refetch(); setLastSignal(`Der Eid für ${targetFaction.replaceAll("_", " ")} wurde serverseitig bestätigt.`); }, onError: () => setLastSignal("Der Fraktionsschwur wurde nicht bestätigt.") })}>{targetFaction.replaceAll("_", " ")}</button>)}</div></div>}{factionQuestline.data.availableObjectives.map(objective => <div className="faction-story-card__objective" key={objective.questId}><div><b>{objective.title}</b><small>{objective.objective}</small></div><div>{objective.decisionKeys.map(decisionKey => <button type="button" key={decisionKey} disabled={decideFactionQuestline.isPending} onClick={() => decideFactionQuestline.mutate({ questId: objective.questId, decisionKey, approach: factionQuestline.data!.preferredApproach, idempotencyKey: `faction-decision:${objective.questId}:${decisionKey}:${crypto.randomUUID()}` }, { onSuccess: () => { void factionQuestline.refetch(); setLastSignal(`Die Entscheidung „${decisionKey}“ wurde als Receipt bestätigt.`); }, onError: () => setLastSignal("Die Questentscheidung wurde serverseitig verworfen.") })}>{decisionKey}</button>)}</div></div>)}</section>}
            <div className="open-world-card__pois">{openWorld.data?.pointsOfInterest.slice(0, 3).map(point => <span key={point.id} data-state={point.state}>{point.label}</span>)}</div>
            <div className="open-world-card__npcs">{openWorld.data?.npcs.map(npc => <div key={npc.id}><b>{npc.displayName} · {npc.autonomy.dialectId}</b><small>{npc.memory.quest[0] ?? npc.memory.local[0]}</small><small>ZIEL: {npc.autonomy.goal} · SICHERHEIT: {Math.round(npc.autonomy.needs.safety * 100)}%</small></div>)}</div>
            {openWorld.data?.primaryEncounter && <div className="world-encounter"><div><span>WELTBEGEGNUNG // BESTÄTIGT</span><b>{openWorld.data.primaryEncounter.label}</b><p>{openWorld.data.primaryEncounter.narrative}</p></div><button type="button" disabled={startGameplayEncounter.isPending || Boolean(gameplaySession.current)} onClick={() => startServerEncounter(openWorld.data!.primaryEncounter!.encounterKey)}>Begegnung beginnen</button></div>}
            {activeWorldNpc && (() => {
              const npc = openWorld.data?.npcs.find(candidate => candidate.id === activeWorldNpc);
              const availableQuest = gameplayProgress.data?.quests.find(quest => quest.state === "available" && quest.giver.toLowerCase() === activeWorldNpc);
              const readyNpcQuest = gameplayProgress.data?.quests.find(quest => quest.readyToTurnIn && quest.giver.toLowerCase() === activeWorldNpc);
              const activeNpcQuest = gameplayProgress.data?.quests.find(quest => quest.state === "active" && quest.giver.toLowerCase() === activeWorldNpc);
              return <div className="world-npc-dialogue" role="status"><div><span>NPC-INTERAKTION // {activeWorldNpc.toUpperCase()} · {npc?.autonomy.dialectId ?? "aurion"}</span><b>{npc?.displayName ?? activeWorldNpc}</b><p>{npc?.memory.quest[0] ?? npc?.memory.local[0] ?? "Der bestätigte Erinnerungskern wird gelesen."}</p><small>AKTIVES NPC-ZIEL: {npc?.autonomy.goal ?? "wird aufgelöst"} · VERSTÄNDNIS: {Math.round((npc?.autonomy.comprehensionThreshold ?? 0.6) * 100)}%</small></div>{readyNpcQuest ? <button type="button" disabled={completeGameplayQuest.isPending} onClick={() => completeGameplayQuest.mutate({ questKey: readyNpcQuest.key, giver: readyNpcQuest.giver }, { onSuccess: (result) => { void gameplayProgress.refetch(); void playerSnapshot.refetch(); void openWorld.refetch(); if (result.questDrop) setConfirmedDrop(result.questDrop); setLastSignal(`${readyNpcQuest.giver} hat „${readyNpcQuest.title}“ abgeschlossen und die Belohnung bestätigt.`); }, onError: () => setLastSignal("Die Questübergabe wurde nicht bestätigt.") })}>{readyNpcQuest.title} übergeben</button> : availableQuest ? <button type="button" disabled={acceptGameplayQuest.isPending} onClick={() => acceptGameplayQuest.mutate({ questKey: availableQuest.key }, { onSuccess: () => { void gameplayProgress.refetch(); void openWorld.refetch(); setLastSignal(`${availableQuest.giver} bestätigt „${availableQuest.title}“.`); }, onError: () => setLastSignal("Die Questannahme wurde nicht bestätigt.") })}>{availableQuest.title} annehmen</button> : activeNpcQuest ? <small>AKTIVER AUFTRAG: {activeNpcQuest.title}</small> : <small>KEIN ZULÄSSIGER AUFTRAG</small>}<div className="world-npc-dialogue__language"><input value={npcDialogueText} maxLength={280} onChange={(event) => setNpcDialogueText(event.target.value)} placeholder={`In ${npc?.autonomy.dialectId ?? "Aurion"} sprechen…`} /><button type="button" disabled={interpretNpcDialogue.isPending || npcDialogueText.trim().length === 0} onClick={() => interpretNpcDialogue.mutate({ npcId: activeWorldNpc, text: npcDialogueText, idempotencyKey: `dialogue:${activeWorldNpc}:${crypto.randomUUID()}` }, { onSuccess: (interpretation) => {
                  setNpcDialogueText("");
                  if (interpretation.state === "accepted" && (interpretation.semanticIntent === "ask_quest" || interpretation.semanticIntent === "turn_in_quest")) {
                    const actionKind = interpretation.semanticIntent === "ask_quest" ? "offer_quest" : "request_turn_in";
                    const questKey = interpretation.semanticIntent === "ask_quest" ? availableQuest?.key : readyNpcQuest?.key;
                    if (questKey) {
                      setDialogueQuestPrompt({ dialogueReceiptId: interpretation.receiptId, npcId: activeWorldNpc, actionKind, questKey });
                      setLastSignal(`Dialog bestätigt: ${interpretation.semanticIntent}. Prüfe die erlaubte Folgeaktion separat.`);
                    } else {
                      setDialogueQuestPrompt(null);
                      setLastSignal("Der Dialog wurde verstanden, aber für diesen NPC ist derzeit keine passende Questaktion verfügbar.");
                    }
                  } else {
                    setDialogueQuestPrompt(null);
                    setLastSignal(`Dialog ${interpretation.state}: ${interpretation.semanticIntent} (${Math.round(interpretation.confidence * 100)}%).`);
                  }
                }, onError: () => setLastSignal("Die Dialoginterpretation wurde sicher verworfen.") })}>Deutung anfragen</button></div>{dialogueQuestPrompt && dialogueQuestPrompt.npcId === activeWorldNpc && <div className="world-npc-dialogue__intent" role="status"><small>BESTÄTIGTE DIALOGABSICHT // {dialogueQuestPrompt.actionKind === "offer_quest" ? "QUESTANGEBOT" : "ÜBERGABEPRÜFUNG"}</small><button type="button" disabled={requestQuestActionFromDialogue.isPending} onClick={() => requestQuestActionFromDialogue.mutate({ dialogueReceiptId: dialogueQuestPrompt.dialogueReceiptId, actionKind: dialogueQuestPrompt.actionKind, questKey: dialogueQuestPrompt.questKey, idempotencyKey: `dialogue-command:${dialogueQuestPrompt.dialogueReceiptId}:${dialogueQuestPrompt.actionKind}:${dialogueQuestPrompt.questKey}` }, { onSuccess: (result) => { void gameplayProgress.refetch(); setLastSignal(result.receipt.outcome.state === "offer_available_quest" ? "Questangebot serverseitig bestätigt. Die Annahme bleibt deine separate Aktion." : "Übergabeprüfung bestätigt. Die Questübergabe bleibt deine separate Aktion."); }, onError: () => setLastSignal("Die Dialogfolgeaktion wurde sicher verworfen.") })}>{requestQuestActionFromDialogue.isPending ? "FOLGEAKTION WIRD GEPRÜFT" : dialogueQuestPrompt.actionKind === "offer_quest" ? "QUESTANGEBOT BESTÄTIGEN" : "ÜBERGABE PRÜFEN"}</button></div>}<button type="button" className="world-npc-dialogue__close" onClick={() => { setActiveWorldNpc(null); setDialogueQuestPrompt(null); }}>Dialog schließen</button></div>;
            })()}
            <button type="button" disabled={enterOpenWorld.isPending || Boolean(gameplaySession.current)} onClick={() => enterAurionExpanse()}><Compass size={16} /> {enterOpenWorld.isPending ? "WELTSTATUS WIRD BESTÄTIGT" : "DIE AURION-EXPANSE BETRETEN"}</button>
            <button type="button" disabled={Boolean(gameplaySession.current)} onClick={returnToTowerHome}><ChevronRight size={16} /> ZUR STERNWARTE ZURÜCK</button>
            <button type="button" disabled={issueZoneTicket.isPending || !isAuthenticated || zoneStatus === "connecting" || zoneStatus === "connected"} onClick={connectAuthoritativeZone}><Radio size={16} /> {zoneStatus === "connected" ? "ZONENPOSITION BESTÄTIGT" : zoneStatus === "connecting" ? "ZONENTICKET WIRD VERBUNDEN" : "ZONENBEWEGUNG VERBINDEN"}</button>
          </section>
        </div>
      )}
      {trailerOpen && <section className="trailer-modal" role="dialog" aria-modal="true" aria-labelledby="trailer-title"><div className="trailer-modal-backdrop" onClick={() => setTrailerOpen(false)} /><div className="trailer-modal-card"><header><div><p className="eyebrow">AURION // HERO TRAILER</p><h2 id="trailer-title">One Signal.<br /><em>Two Wills.</em></h2></div><button type="button" onClick={() => setTrailerOpen(false)} aria-label="Hero-Trailer schließen"><X size={20} /></button></header><video className="hero-trailer-video" src={heroTrailerUrl} poster={heroTrailerPoster} controls autoPlay playsInline preload="metadata">Dein Browser unterstützt die Hero-Trailer-Wiedergabe nicht.</video><footer><span>ENGLISH VOICE-OVER</span><b>DEUTSCHE UNTERTITEL</b><small>Autorisierte MCP-Koop · keine private Chat-Automatisierung</small></footer></div></section>}
      {screen === "loadout" && <section className="loadout-deck" aria-labelledby="loadout-title"><div className="loadout-heading"><p className="eyebrow"><Compass size={14} /> TEAMKONFIGURATION</p><h2 id="loadout-title">Setze den <em>Resonanzkurs.</em></h2><p>{soloMode ? "Rüste drei sichtbare Protokolle aus. Du steuerst alle Echo-Slots direkt." : "Rüste drei sichtbare Protokolle aus. Dein Partner erhält nur diese Slots im Expeditionsfeed."}</p></div><div className="loadout-grid"><label className="operator-field"><span>EXPLORER-KENNUNG</span><input value={operatorName} maxLength={20} onChange={(event) => setOperatorName(event.target.value)} /><small>WASD oder Touch-Brücke steuern diese Figur.</small></label><div className="partner-card"><Bot size={22} /><div><span>AKTIVER ECHO SCOUT</span><strong>{provider}</strong><small>{soloMode ? "Lokale Solo-Steuerung · WASD + Slots" : "Autorisierter MCP-Vertrag · WASD + Slots"}</small></div><span className="signal-dot active" /></div></div><div className="skill-shelf">{abilityDeck.map((ability) => { const equipped = selectedSkills.includes(ability.code); return <button type="button" key={ability.code} onClick={() => toggleSkill(ability.code)} className={equipped ? "skill-card equipped" : "skill-card"}><kbd>{ability.code}</kbd><span><strong>{ability.name}</strong><small>{ability.detail}</small></span>{equipped && <ShieldCheck size={17} />}</button>; })}</div><footer className="loadout-footer"><div><p>{soloMode ? "SOLO-DECK" : "PARTNER-DECK"} <b>{selectedSkills.length}/3</b></p><span>{skillNames.map((skill) => skill.name).join(" · ")}</span></div><button type="button" className="seal-button embark" disabled={enterOpenWorld.isPending} onClick={() => enterAurionExpanse(() => setScreen("open_world"))}><Compass size={18} /> {enterOpenWorld.isPending ? "WELT WIRD BESTÄTIGT" : "IN DIE OPEN WORLD"}</button></footer></section>}
      {screen === "mission" && (
        <section className="mission-ui" aria-label="Expeditionsoberfläche">
          <div className="mission-objective">
            <span>ARENA {mission.arena + 1}/4 // {mission.arenaName}</span>
            <b>{mission.phase === "victory" ? "Aurion ist stabilisiert" : mission.objective}</b>
            <div className="objective-meter"><i style={{ width: `${bossPercent}%` }} /></div>
          </div>

          <section className="companion-control-card" aria-label="LLM-Companion-Steuerung">
            <div><span>LLM COMPANION // {companionSession?.llmLabel ?? "NICHT VERBUNDEN"}</span><b>{companionSession?.mode ?? "disconnected"}</b><small>{companionRows} lokale Beobachtungszeilen · {companionSession?.notes ?? 0} Notizen · der Begleiter ist nur während Play/Go gespawnt</small></div>
            <div className="companion-control-card__actions">
              <button type="button" onClick={beginCompanionLearn} disabled={!companionSession}>{companionSession?.mode === "learning" ? "LEARN STOP / BEREIT" : "LEARN / RECORD"}</button>
              <button type="button" onClick={toggleCompanionPlay} disabled={!companionSession || !["ready", "playing"].includes(companionSession.mode)}>{companionSession?.mode === "playing" ? "STOP / DESPAWN" : "GO / PLAY"}</button>
              <button type="button" onClick={downloadCompanionDataset} disabled={companionRows === 0}><Download size={14} /> DATASET EXPORT</button>
            </div>
          </section>

          <div className="progression-readout" aria-label="Bestätigte Charakterentwicklung">
            <span>LEVEL <b>{visibleProfile?.level ?? 1}</b></span>
            <span>XP <b>{visibleProfile?.totalXp ?? 0}</b></span>
            <span>KLASSE <b>{visibleProfile?.selectedClass ?? "unbound"}</b></span>
            <span>WAFFE <b>{activeWeaponTrack}</b></span>
          </div>

          <section className="character-doctrine" aria-label="Klassen- und Waffenklasse">
            <div><span>CHARAKTERDOKTRIN // SERVERBESTÄTIGT</span><b>{visibleProfile?.selectedClass ? `${visibleProfile.selectedClass} · ${activeWeaponTrack}` : visibleProfile && visibleProfile.level >= 36 ? "Wähle deine Klassenresonanz" : `Klassenresonanz ab Level 36 · ${activeWeaponTrack}`}</b></div>
            {visibleProfile && visibleProfile.level >= 36 && !visibleProfile.selectedClass && <div className="character-doctrine__choices">{(["vanguard", "seer", "warden"] as const).map(playerClass => <button type="button" key={playerClass} disabled={choosePlayerClass.isPending} onClick={() => choosePlayerClass.mutate({ playerClass }, { onSuccess: () => { void gameplayProgress.refetch(); void playerSnapshot.refetch(); setLastSignal(`${playerClass} wurde serverseitig als Klassenresonanz bestätigt.`); }, onError: () => setLastSignal("Die Klassenwahl wurde nicht bestätigt.") })}>{playerClass}</button>)}</div>}
            <div className="character-doctrine__weapons">{(["blade", "staff", "spear", "focus"] as const).map(weaponTrack => <button type="button" key={weaponTrack} data-active={weaponTrack === activeWeaponTrack} disabled={setWeaponLoadout.isPending} onClick={() => setWeaponLoadout.mutate({ weaponTrack }, { onSuccess: () => { void playerSnapshot.refetch(); setLastSignal(`${weaponTrack} ist als Waffenpfad bestätigt.`); }, onError: () => setLastSignal("Der Waffenpfad wurde nicht bestätigt.") })}>{weaponTrack}</button>)}</div>
          </section>



          {mission.phase === "transition" && <p className="mission-transition" role="status">Bossabschluss wird serverseitig bestätigt…</p>}
          {mission.phase === "quest_ready" && (
            <div className="mission-victory quest-dialogue" role="status">
              <b>QUESTGEBER WARTET</b>
              <span>{gameplayProgress.data?.quests.find(quest => quest.state === "available") ? "Der nächste Auftrag ist freigeschaltet. Akzeptiere ihn bei Lyra oder Orun und öffne die nächste Instanz." : "Der Abschluss wurde verbucht. Prüfe deinen Questpfad oder kehre später zurück."}</span>
              {gameplayProgress.data?.quests.filter(quest => quest.state === "available").map(quest => (
                <button type="button" key={quest.key} disabled={acceptGameplayQuest.isPending} onClick={() => acceptGameplayQuest.mutate({ questKey: quest.key }, {
                  onSuccess: () => { void gameplayProgress.refetch(); setLastSignal(`${quest.giver} bestätigt „${quest.title}“. Die Begegnung kann gestartet werden.`); },
                  onError: () => setLastSignal("Die Questannahme wurde nicht bestätigt."),
                })}>
                  {quest.giver}: {quest.title} annehmen
                </button>
              ))}
            </div>
          )}
          {activeQuest && !gameplaySession.current && mission.phase !== "victory" && mission.phase !== "dungeon_ready" && (
            <div className="mission-victory quest-dialogue">
              <b>{activeQuest.giver.toUpperCase()} // AKTIVER AUFTRAG</b>
              <span>{activeQuest.title}: {activeQuest.objective}</span>
              <button type="button" onClick={() => startServerEncounter(activeQuest.key === "astral_call" ? "asterion" : activeQuest.key === "archive_of_echoes" ? "archive" : "solarium")}>
                Bestätigte Begegnung beginnen
              </button>
            </div>
          )}
          {mission.phase === "dungeon_ready" && (
            <div className="mission-victory" role="status">
              <b>GLUTSCHLÜSSEL GEBORGEN</b>
              <span>Lyra öffnet den Zugang zum Aschengewölbe. Der Schlüssel und der Questabschluss werden vor Eintritt erneut geprüft.</span>
              <button type="button" onClick={() => startServerEncounter("cinder_vault")}>Aschengewölbe betreten</button>
            </div>
          )}
          {mission.phase === "victory" && (
            <div className="mission-victory" role="status">
              <b>EXPEDITION ABGESCHLOSSEN</b>
              <span>Der Glutwächter ist gefallen. Eine neue Expedition kann vorbereitet werden.</span>
              <button type="button" onClick={() => { gameplaySession.current = null; setMission(initialMission); setMissionElapsed(0); setScreen("loadout"); setLastSignal("Neue Expedition kann vorbereitet werden."); }}>Neue Expedition vorbereiten</button>
            </div>
          )}
          {confirmedDrop && (
            <div className={`confirmed-drop ${confirmedDrop.quality}`} role="status">
              <span>BESTÄTIGTER DUNGEONFUND</span>
              <b>{confirmedDrop.baseItemKey.replaceAll("_", " ")}</b>
              <small>{confirmedDrop.quality.toUpperCase()} · GEGENSTANDSSTUFE {confirmedDrop.itemLevel}</small>
              <button type="button" onClick={() => { setConfirmedDrop(null); setLastSignal("Der bestätigte Fund liegt im Inventar- und Endgamebereich bereit."); }}>EINSAMMELN</button>
            </div>
          )}

          <div className="boss-readout"><CircleDot size={14} /><span>SENTINEL <b>{mission.sentinelHp}/{mission.sentinelMaxHp}</b></span><i className={mission.marked ? "marked" : ""} /></div>
          <div className="party-strip human"><UserRound size={17} /><div><span>EXPLORER</span><b>{operatorName || "Unbenannt"}</b></div><strong>{mission.explorerHp}</strong></div>
          <div className="party-strip echo"><Bot size={17} /><div><span>LLM-PARTNER // {provider}</span><b>Echo Scout</b></div><strong>{mission.echoHp}</strong></div>
          <div className="combat-timer"><Activity size={14} /> {formatTime(missionElapsed)}</div>

          <aside className="command-console">
            <div className="console-head"><div><span className="signal-dot active" /> LIVE COMMAND BRIDGE</div><button type="button" aria-label="Ledger exportieren" onClick={downloadLedger}><Download size={15} /></button></div>
            <p className="console-status"><Cpu size={14} /> {lastSignal}</p>
            <div className="command-input"><input aria-label="LLM-Befehl" value={commandText} onChange={(event) => setCommandText(event.target.value.slice(-1))} onKeyDown={(event) => { if (event.key === "Enter") sendPartnerCommand(); }} placeholder="W / A / S / D / E / F / 1–9" /><button type="button" onClick={() => sendPartnerCommand()}><ChevronRight size={18} /></button></div>
            <div className="quick-commands">{["W", "A", "S", "D", "E", "F", ...selectedSkills].map((code) => <button type="button" key={code} onClick={() => sendPartnerCommand(code)}>{code}</button>)}</div>
            <div className="ledger-list">{ledger.slice(-4).reverse().map((entry) => <div className={`ledger-row ${entry.kind}`} key={entry.id}><span>{entry.kind === "warning" ? <X size={13} /> : <Sparkles size={13} />}</span><p><b>{entry.title}</b><small>{entry.detail}</small></p></div>)}</div>
          </aside>

          <div className="player-control-bridge" aria-label="Touch-Steuerung für Explorer">
            <span>EXPLORER STEUERUNG</span>
            <div className="dpad"><button type="button" onClick={() => sendHumanCommand("W")} aria-label="Vorwärts"><ArrowUp size={20} /></button><button type="button" onClick={() => sendHumanCommand("A")} aria-label="Links"><ArrowLeft size={20} /></button><button type="button" onClick={() => sendHumanCommand("S")} aria-label="Rückwärts"><ArrowDown size={20} /></button><button type="button" onClick={() => sendHumanCommand("D")} aria-label="Rechts"><ArrowRight size={20} /></button></div>
            <button type="button" className="spear-action" onClick={() => sendHumanAction("F")}><Swords size={15} /> SPEER // 17</button>
            <button type="button" className="interact-action" onClick={() => sendHumanAction("E")}>E // INTERAGIEREN</button>
          </div>
          <div className="ability-rail"><span><Gamepad2 size={15} /> ECHO SLOTS</span>{skillNames.map((ability) => <button type="button" key={ability.code} onClick={() => sendPartnerCommand(ability.code)}><kbd>{ability.code}</kbd><small>{ability.name}</small></button>)}</div>
          <div className="arena-track" aria-label="Fortschritt durch die Ruinenarenen">{["ASTERION", "ARCHIV", "SOLARIUM", "GEWÖLBE"].map((label, index) => <span key={label} className={index < mission.arena ? "cleared" : index === mission.arena ? "current" : ""}>{index + 1}<small>{label}</small></span>)}</div>
          <button type="button" className="ledger-reset" onClick={() => { resetLedger(); setLastSignal("Lokales Ledger wurde geleert."); }}><X size={13} /> Ledger leeren</button>
        </section>
      )}
    </main>
  );
}
