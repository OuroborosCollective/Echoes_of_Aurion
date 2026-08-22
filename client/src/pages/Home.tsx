/**
 * Echoes of Aurion — Expedition console
 * Design philosophy: A vertical bronze-and-glass field device frames rather than
 * hides the isometric sky-city. Every LLM signal is visible, bounded and logged.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bot, ChevronRight, CircleDot, Copy,
  Compass, Cpu, Download, Gamepad2, LockKeyhole, Radio, ShieldCheck, Sparkles, Swords,
  UserRound, UsersRound, Volume2, VolumeX, X, Play,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import CommunityOverlay from "@/components/CommunityOverlay";
import GameCanvas from "@/components/GameCanvas";
import { starterCharacters } from "@/game/starterCharacters";
import { appendLedger, exportLedger, readLedger, resetLedger, type LedgerEntry } from "@/lib/ledger";
import { AurionSoundscape } from "@/lib/soundscape";
import { aurionAssets, hasAurionApi } from "@/lib/aurionAssets";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

type Screen = "gate" | "loadout" | "mission";
type Command = "W" | "A" | "S" | "D" | "E" | "F" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type MissionState = { arena: number; arenaName: string; objective: string; sentinelHp: number; sentinelMaxHp: number; explorerHp: number; echoHp: number; shield: boolean; marked: boolean; phase: "active" | "transition" | "quest_ready" | "dungeon_ready" | "victory" };
type GatewayPairing = { sessionId: string; pairingToken: string; mcpUrl: string; expiresAt: Date; allowedCommands: string[] };

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

function codeFromText(value: string): Command | null {
  const candidate = value.trim().toUpperCase();
  return /^[WASDEF1-9]$/.test(candidate) ? (candidate as Command) : null;
}

export default function Home() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const apiAvailable = hasAurionApi();
  const activeArenaAsset = trpc.assetSubmissions.activeArenaAsset.useQuery({ targetKey: "asterion_courtyard" }, { enabled: apiAvailable });
  const [screen, setScreen] = useState<Screen>("gate");
  const [provider, setProvider] = useState(providers[0]);
  const [connected, setConnected] = useState(false);
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
  const [soloMode, setSoloMode] = useState(false);
  const [activeWorldNpc, setActiveWorldNpc] = useState<"lyra" | "orun" | null>(null);
  const [starterCharacter, setStarterCharacter] = useState<(typeof starterCharacters)[number]>(starterCharacters[0]);
  const expeditionAudio = useRef<HTMLAudioElement | null>(null);
  const soundscape = useRef<AurionSoundscape | null>(null);
  const musicResetTimer = useRef<number | null>(null);
  const createGatewaySession = trpc.gateway.createSession.useMutation();
  const revokeGatewaySession = trpc.gateway.revokeSession.useMutation();
  const gatewayCommandInput = useMemo(() => ({ sessionId: gatewayPairing?.sessionId ?? "unpaired_session", afterSequence: gatewaySequence }), [gatewayPairing?.sessionId, gatewaySequence]);
  const shouldPollGateway = Boolean(gatewayPairing) && screen === "mission";
  const gatewayCommands = trpc.gateway.pullCommands.useQuery(
    gatewayCommandInput,
    { enabled: shouldPollGateway, refetchInterval: shouldPollGateway ? 900 : false }
  );
  const teamSignals = trpc.community.team.signals.useQuery(undefined, {
    enabled: Boolean(humanTeamPartner) && screen === "mission",
    refetchInterval: humanTeamPartner && screen === "mission" ? 900 : false,
  });
  const sendTeamSignal = trpc.community.team.sendSignal.useMutation();
  const characterAppearance = trpc.assetSubmissions.characterAppearance.useQuery(undefined, { enabled: apiAvailable && isAuthenticated });
  const gameplayProgress = trpc.gameplay.progress.useQuery(undefined, { enabled: isAuthenticated });
  const openWorld = trpc.gameplay.openWorld.useQuery(undefined, { enabled: isAuthenticated && screen === "mission" });
  const enterOpenWorld = trpc.gameplay.enterOpenWorld.useMutation();
  const playerSnapshot = trpc.player.me.useQuery(undefined, { enabled: isAuthenticated });
  const choosePlayerClass = trpc.player.chooseClass.useMutation();
  const setWeaponLoadout = trpc.player.setWeaponLoadout.useMutation();
  const acceptGameplayQuest = trpc.gameplay.acceptQuest.useMutation();
  const startGameplayEncounter = trpc.gameplay.startEncounter.useMutation();
  const applyGameplayAction = trpc.gameplay.act.useMutation();
  const gameplaySession = useRef<{ id: string; nextSequence: number } | null>(null);
  const activeCharacterUrl = characterAppearance.data?.storageUrl ?? starterCharacter.assetPath;
  const processedTeamSignals = useRef(new Set<string>());
  const processedGatewaySequence = useRef(0);

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
    const mixer = new AurionSoundscape();
    soundscape.current = mixer;
    return () => { mixer.dispose(); soundscape.current = null; };
  }, []);

  useEffect(() => {
    const onLedger = (event: Event) => setLedger((event as CustomEvent<LedgerEntry[]>).detail);
    const onGameEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ kind: LedgerEntry["kind"]; detail: string }>).detail;
      setLastSignal(detail.detail);
      appendLedger({ kind: detail.kind ?? "system", title: "Sternwarte", detail: detail.detail });
      soundscape.current?.cue(detail.kind ?? "system");
      shapeMusic(detail.kind ?? "system");
    };
    const onMissionState = (event: Event) => { const next = (event as CustomEvent<MissionState>).detail; setMission(next); if (next.phase === "victory") shapeMusic("victory"); };
    window.addEventListener("aurion:ledger-updated", onLedger);
    window.addEventListener("aurion:game-event", onGameEvent);
    window.addEventListener("aurion:mission-state", onMissionState);
    return () => {
      window.removeEventListener("aurion:ledger-updated", onLedger);
      window.removeEventListener("aurion:game-event", onGameEvent);
      window.removeEventListener("aurion:mission-state", onMissionState);
    };
  }, []);

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
      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command } }));
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
      window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code: entry.command } }));
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
      const detail = (event as CustomEvent<{ command: Command; source: "human" | "gateway" }>).detail;
      const session = gameplaySession.current;
      if (!detail || !session) {
        setLastSignal("Die Aktion wartet auf eine bestätigte Quest- und Begegnungssitzung.");
        return;
      }
      applyGameplayAction.mutate({ sessionId: session.id, sequence: session.nextSequence, command: detail.command, source: detail.source }, {
        onSuccess: (result) => {
          gameplaySession.current = result.completed ? null : { id: result.sessionId, nextSequence: result.nextSequence };
          window.dispatchEvent(new CustomEvent("aurion:authoritative-action", { detail: { command: detail.command, damage: result.damage, bossHp: result.bossHp, completed: result.completed } }));
          if (result.completed) {
            void gameplayProgress.refetch();
            if (result.drop) setConfirmedDrop(result.drop);
            setLastSignal(result.completedQuest ? `Questabschluss bestätigt: ${result.completedQuest}. XP und Aurion-Punkte wurden serverseitig gebucht.` : result.drop ? `Dungeonfund bestätigt: ${result.drop.baseItemKey}.` : "Der Glutwächter ist bestätigt gefallen.");
          }
        },
        onError: () => setLastSignal("Die Aktion wurde nicht bestätigt. Die lokale Szene übernimmt keinen unbestätigten Schaden."),
      });
    };
    window.addEventListener("aurion:request-action", onRequestedAction);
    return () => window.removeEventListener("aurion:request-action", onRequestedAction);
  }, [applyGameplayAction, gameplayProgress]);

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
    if (!isAuthenticated) { setLastSignal("Melde dich an, um einen autorisierten Partner-Slot auszustellen."); startLogin(); return; }
    setSoloMode(false);
    setIsPairing(true); setLastSignal(`Autorisierter MCP-Slot für ${provider} wird ausgegeben.`);
    createGatewaySession.mutate({ providerLabel: provider, allowedCommands: allowedGatewayCommands }, {
      onSuccess: (pairing) => {
        processedGatewaySequence.current = 0; setGatewayPairing(pairing); setGatewaySequence(0); setConnected(true); setIsPairing(false);
        appendLedger({ kind: "connection", title: "MCP-Partner-Siegel ausgestellt", detail: `${provider} erhält einen zeitlich begrenzten, sichtbaren Steuervertrag. Der Token bleibt nur in dieser Sitzung sichtbar.` });
        setLastSignal(`${provider} kann jetzt über den autorisierten MCP-Steuervertrag beitreten.`);
      },
      onError: () => { setIsPairing(false); setLastSignal("Partner-Siegel konnte nicht ausgestellt werden. Prüfe die Konto-Verbindung erneut."); },
    });
  };
  const revokePartner = (): void => {
    if (!gatewayPairing || revokeGatewaySession.isPending) return;
    revokeGatewaySession.mutate({ sessionId: gatewayPairing.sessionId }, {
      onSuccess: () => {
        appendLedger({ kind: "connection", title: "MCP-Partner-Siegel widerrufen", detail: "Der serverseitige Steuervertrag wurde beendet; der Pairing-Token ist nicht mehr verwendbar." });
        processedGatewaySequence.current = 0; setGatewayPairing(null); setGatewaySequence(0); setConnected(false); setSoloMode(false); setScreen("gate");
        setLastSignal("Partner-Siegel widerrufen. Eine neue Kopplung kann ausgestellt werden.");
      },
      onError: () => setLastSignal("Der Widerruf konnte nicht bestätigt werden. Bitte erneut versuchen."),
    });
  };
  const beginSoloAdventure = (): void => {
    if (gatewayPairing) void revokeGatewaySession.mutateAsync({ sessionId: gatewayPairing.sessionId });
    processedTeamSignals.current.clear(); processedGatewaySequence.current = 0;
    setGatewayPairing(null); setGatewaySequence(0); setHumanTeamPartner(null); setSoloMode(true); setProvider("SOLO // ECHO-AUTOMATIK"); setConnected(true);
    appendLedger({ kind: "system", title: "Solo-Expedition freigegeben", detail: "Du steuerst Explorer und Echo-Slots direkt; keine LLM- oder Team-Verbindung wird benötigt." });
    setLastSignal("Solo-Modus aktiv: Die Echo-Slots liegen vollständig in deiner Hand.");
    setScreen("loadout");
  };
  const unlockLoadout = (): void => { if (!connected) return; setScreen("loadout"); appendLedger({ kind: "system", title: "Menü freigeschaltet", detail: "Charakter- und Partner-Loadout sind jetzt verfügbar." }); };
  const toggleSkill = (code: string): void => setSelectedSkills((current) => { if (current.includes(code)) return current.filter((skill) => skill !== code); if (current.length >= 3) return [...current.slice(1), code]; return [...current, code]; });
  const startServerEncounter = (encounterKey: "asterion" | "archive" | "solarium" | "cinder_vault"): void => {
    if (!isAuthenticated) { setLastSignal("Melde dich für serverbestätigte Quest- und Belohnungsfortschritte an."); return; }
    startGameplayEncounter.mutate({ encounterKey }, {
      onSuccess: ({ session }) => {
        gameplaySession.current = { id: session.id, nextSequence: session.nextSequence };
        const arenaIndex = encounterKey === "asterion" ? 0 : encounterKey === "archive" ? 1 : encounterKey === "solarium" ? 2 : 3;
        window.dispatchEvent(new CustomEvent("aurion:load-encounter", { detail: { arenaIndex, dungeon: encounterKey === "cinder_vault" } }));
        setLastSignal(`${session.encounterKey} ist als serverseitige Begegnung bestätigt.`);
      },
      onError: () => setLastSignal("Die Begegnung ist noch nicht freigeschaltet. Sprich zuerst mit dem zuständigen Questgeber."),
    });
  };
  const enterAurionExpanse = (): void => {
    if (!isAuthenticated) { setLastSignal("Melde dich an, um die serverbestätigte Aurion-Expanse zu betreten."); return; }
    if (gameplaySession.current) { setLastSignal("Beende oder sichere zuerst die aktive serverseitige Begegnung."); return; }
    enterOpenWorld.mutate(undefined, {
      onSuccess: (snapshot) => {
        window.dispatchEvent(new CustomEvent("aurion:load-open-world", { detail: snapshot }));
        appendLedger({ kind: "system", title: "Aurion-Expanse bestätigt", detail: `${snapshot.displayName} wurde als Weltansicht der Revision ${snapshot.revision} geöffnet.` });
        setLastSignal(`${snapshot.displayName} ist bestätigt. ${snapshot.encounter.activeCount} Begegnungen sind im sichtbaren Bereich aktiv.`);
        void openWorld.refetch();
      },
      onError: () => setLastSignal("Der Weltübergang wurde nicht bestätigt. Die Szene bleibt im sicheren Turmzustand."),
    });
  };
  const beginMission = (): void => {
    setScreen("mission"); setMissionElapsed(0); setMission(initialMission); setConfirmedDrop(null);
    soundscape.current?.unlock();
    if (audioEnabled) void expeditionAudio.current?.play().catch(() => setLastSignal("Die Expeditionmusik ist bereit; aktiviere sie über das Klangsymbol."));
    window.setTimeout(() => {
      const activeQuest = gameplayProgress.data?.activeQuest;
      if (isAuthenticated && activeQuest) startServerEncounter(activeQuest === "astral_call" ? "asterion" : activeQuest === "archive_of_echoes" ? "archive" : "solarium");
      else window.dispatchEvent(new CustomEvent("aurion:begin-expedition"));
    }, 120);
    appendLedger({ kind: "system", title: "Expedition eröffnet", detail: soloMode ? `${operatorName || "Unbenannter Explorer"} betritt die Sternwarte allein und führt die Echo-Slots direkt.` : `${operatorName || "Unbenannter Explorer"} und ${humanTeamPartner ? `Team-Partner ${humanTeamPartner}` : provider} betreten die Sternwarte Aurion.` });
    setLastSignal("Die Sternwarte öffnet ihre Resonanzschleuse.");
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
    window.dispatchEvent(new CustomEvent("aurion:command", { detail: { code } }));
    const ability = abilityDeck.find((item) => item.code === code);
    appendLedger({ kind: /^[1-9]$/.test(code) ? "combat" : "command", title: `Partner-Impuls ${code}`, detail: ability ? `${provider} aktiviert ${ability.name}.` : `${provider} erhält den Bewegungsbefehl ${code}.` });
    setLastSignal(ability ? `${provider}: ${ability.name} ausgelöst.` : `${provider}: Kurs ${code} bestätigt.`); setCommandText("");
  };
  const sendHumanCommand = (code: "W" | "A" | "S" | "D"): void => { window.dispatchEvent(new CustomEvent("aurion:human-command", { detail: { code } })); };
  const sendHumanAction = (code: "F" | "E" = "F"): void => { window.dispatchEvent(new CustomEvent("aurion:human-action", { detail: { code } })); setLastSignal(code === "F" ? "Explorer fordert ein Speersignal an." : "Explorer fordert eine Interaktion an."); };
  const downloadLedger = (): void => { const blob = new Blob([exportLedger()], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "aurion-memory-ledger.json"; link.click(); URL.revokeObjectURL(url); };
  const formatTime = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const bossPercent = Math.max(0, Math.min(100, (mission.sentinelHp / mission.sentinelMaxHp) * 100));
  const activeQuest = gameplayProgress.data?.quests.find(quest => quest.state === "active") ?? null;
  const visibleProfile = gameplayProgress.data?.profile;
  const activeWeaponTrack = playerSnapshot.data?.weaponLoadout?.weaponTrack ?? "spear";

  return (
    <main className="aurion-app" style={{ "--aurion-hero-poster": `url("${heroTrailerPoster}")` } as CSSProperties}>
      <GameCanvas characterModelUrl={activeCharacterUrl} arenaModelUrl={activeArenaAsset.data?.storageUrl} />
      <div className="atmosphere-vignette" aria-hidden="true" />
      <div className="ruin-constellation" aria-hidden="true"><span className="ruin-arch" /><span className="ruin-temple" /><span className="ruin-temple distant" /><span className="ruin-shard shard-one" /><span className="ruin-shard shard-two" /><span className="ruin-duo explorer" /><span className="ruin-duo scout" /><span className="ruin-thread" /></div>
      <header className="brand-bar"><div className="brand-lockup"><span role="img" aria-label="Aurion Siegel" className="brand-sigil"><i /><b /><i /></span><div><p className="brand-kicker">COOPERATIVE EXPEDITION // 01</p><h1>Echoes <span>of</span> Aurion</h1></div></div><div className="brand-status"><a href="/ops" className="mr-4 text-[10px] tracking-[.14em] text-cyan-100/75 hover:text-cyan-200">OPS</a><button type="button" className="audio-toggle header-audio" onClick={toggleAudio} aria-label={audioEnabled ? "Expeditionsmusik pausieren" : "Expeditionsmusik aktivieren"}>{audioEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}</button><span className={connected ? "signal-dot active" : "signal-dot"} /> {soloMode ? "Solo-Siegel aktiv" : connected ? "Partner-Siegel aktiv" : "Zugang versiegelt"}</div></header>
      <CommunityOverlay
        isAuthenticated={isAuthenticated}
        currentUserId={user?.id}
        onTeamReady={activateHumanTeam}
        onTeamCleared={clearHumanTeam}
        starterCharacterId={starterCharacter.id}
        onStarterCharacterSelected={setStarterCharacter}
      />
      {screen === "gate" && (
        <section className="gate-panel" aria-labelledby="gate-title">
          <div className="gate-runes" aria-hidden="true">✦ &nbsp; ◌ &nbsp; ⟡</div><p className="eyebrow"><LockKeyhole size={14} /> KOOP-VERBINDUNG ERFORDERLICH</p>
          <h2 id="gate-title">Ein Signal.<br /><em>Zwei Willen.</em><br />Eine letzte Sternwarte.</h2>
          <p className="gate-copy">Aurion kann mit einem sichtbar gekoppelten LLM, einem menschlichen Zweierteam oder allein betreten werden. Ein MCP-fähiger Client erhält ausschließlich einen zeitlich begrenzten Steuervertrag – keine private Chat-App wird gelesen oder ferngesteuert.</p>
          <button type="button" className="trailer-link" onClick={() => setTrailerOpen(true)}><Play size={15} fill="currentColor" /> HERO TRAILER ANSEHEN <span>EN VO · DE SUBS</span></button>
          <div className="duo-tableau" aria-label="Explorer und Echo Scout sind über ein Aurion-Siegel verbunden"><div className="duo-actor explorer-figure"><span className="actor-crown" /><span className="actor-body" /><small>EXPLORER</small></div><div className="split-seal" aria-hidden="true"><i /><b /><i /></div><div className="duo-actor scout-figure"><span className="actor-crown" /><span className="actor-body" /><small>ECHO SCOUT</small></div></div>
          {!characterAppearance.data && <div className="starter-character-select" aria-label="Standard-Charaktermodell wählen"><p>EXPLORER-MODELL // RIGGT + ANIMIERT</p><div>{starterCharacters.map(character => <button type="button" key={character.id} onClick={() => setStarterCharacter(character)} className={starterCharacter.id === character.id ? "active" : ""}><b>{character.name}</b><span>{character.role}</span><small>{character.detail}</small></button>)}</div></div>}
          {humanTeamPartner && <div className="human-team-ready"><UsersRound size={17} /><div><b>HUMAN-TEAM BESTÄTIGT</b><span>{humanTeamPartner} begleitet dich ohne LLM-Verbindung. Die Team-Impulse werden sichtbar über Aurion relaiert.</span></div></div>}<div className="gate-divider"><span /></div><div className="connection-form"><label><span>Wähle deinen Team-Partner</span><select value={provider} onChange={(event) => setProvider(event.target.value)} disabled={connected}>{providers.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" className={connected ? "seal-button connected" : "seal-button"} onClick={pairPartner} disabled={isPairing || connected}>{connected ? <ShieldCheck size={18} /> : <Radio size={18} />}{isPairing ? "STEUERVERTRAG WIRD AUSGESTELLT" : connected ? humanTeamPartner ? "MENSCHLICHES TEAM-SIEGEL AKTIV" : "MCP-PARTNER-SIEGEL AKTIV" : "AUTORISIERTEN MCP-SLOT ERSTELLEN"}</button>{gatewayPairing && <div className="gateway-pairing"><div><span>DEIN MCP-ENDPUNKT</span><code>{gatewayPairing.mcpUrl}</code></div><div><span>BEARER-PAIRINGTOKEN // NUR JETZT SICHTBAR</span><code>{gatewayPairing.pairingToken}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(gatewayPairing.pairingToken); }}><Copy size={13} /> TOKEN KOPIEREN</button></div><small>Konfiguriere den Token ausschließlich als <b>Authorization: Bearer</b>-Header in deinem MCP-fähigen LLM-Client. Er gilt bis {gatewayPairing.expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} und steuert nur {gatewayPairing.allowedCommands.join(" · ")}.</small><button type="button" className="revoke-pairing" onClick={revokePartner}>{revokeGatewaySession.isPending ? "WIDERRUF WIRD BESTÄTIGT" : "PARTNER-SIEGEL WIDERRUFEN"}</button></div>}{connected && <button type="button" className="continue-link" onClick={unlockLoadout}>Expeditionsteam zusammenstellen <ChevronRight size={18} /></button>}</div>
          <button type="button" className="solo-expedition-button" onClick={beginSoloAdventure}><UserRound size={15} /> ALLEIN DIE STERNWARTE BETRETEN <small>ohne LLM oder Team</small></button>
          <div className="privacy-note"><ShieldCheck size={16} /><span><b>Autorisierte Koopsitzung.</b> {user?.name ? `${user.name} stellt den Partner-Slot aus. ` : ""}Der Gateway speichert nur normalisierte Befehle, Reihenfolge und Spielwirkung – keine Chat-Inhalte oder Provider-Tokens.</span></div>
        </section>
      )}
      {trailerOpen && <section className="trailer-modal" role="dialog" aria-modal="true" aria-labelledby="trailer-title"><div className="trailer-modal-backdrop" onClick={() => setTrailerOpen(false)} /><div className="trailer-modal-card"><header><div><p className="eyebrow">AURION // HERO TRAILER</p><h2 id="trailer-title">One Signal.<br /><em>Two Wills.</em></h2></div><button type="button" onClick={() => setTrailerOpen(false)} aria-label="Hero-Trailer schließen"><X size={20} /></button></header><video className="hero-trailer-video" src={heroTrailerUrl} poster={heroTrailerPoster} controls autoPlay playsInline preload="metadata">Dein Browser unterstützt die Hero-Trailer-Wiedergabe nicht.</video><footer><span>ENGLISH VOICE-OVER</span><b>DEUTSCHE UNTERTITEL</b><small>Autorisierte MCP-Koop · keine private Chat-Automatisierung</small></footer></div></section>}
      {screen === "loadout" && <section className="loadout-deck" aria-labelledby="loadout-title"><div className="loadout-heading"><p className="eyebrow"><Compass size={14} /> TEAMKONFIGURATION</p><h2 id="loadout-title">Setze den <em>Resonanzkurs.</em></h2><p>Rüste drei sichtbare Protokolle aus. Dein Partner erhält nur diese Slots im Expeditionsfeed.</p></div><div className="loadout-grid"><label className="operator-field"><span>EXPLORER-KENNUNG</span><input value={operatorName} maxLength={20} onChange={(event) => setOperatorName(event.target.value)} /><small>WASD oder Touch-Brücke steuern diese Figur.</small></label><div className="partner-card"><Bot size={22} /><div><span>AKTIVER ECHO SCOUT</span><strong>{provider}</strong><small>Autorisierter MCP-Vertrag · WASD + Slots</small></div><span className="signal-dot active" /></div></div><div className="skill-shelf">{abilityDeck.map((ability) => { const equipped = selectedSkills.includes(ability.code); return <button type="button" key={ability.code} onClick={() => toggleSkill(ability.code)} className={equipped ? "skill-card equipped" : "skill-card"}><kbd>{ability.code}</kbd><span><strong>{ability.name}</strong><small>{ability.detail}</small></span>{equipped && <ShieldCheck size={17} />}</button>; })}</div><footer className="loadout-footer"><div><p>PARTNER-DECK <b>{selectedSkills.length}/3</b></p><span>{skillNames.map((skill) => skill.name).join(" · ")}</span></div><button type="button" className="seal-button embark" onClick={beginMission}><Swords size={18} /> STERNWARTE BETRETEN</button></footer></section>}
      {screen === "mission" && (
        <section className="mission-ui" aria-label="Expeditionsoberfläche">
          <div className="mission-objective">
            <span>ARENA {mission.arena + 1}/4 // {mission.arenaName}</span>
            <b>{mission.phase === "victory" ? "Aurion ist stabilisiert" : mission.objective}</b>
            <div className="objective-meter"><i style={{ width: `${bossPercent}%` }} /></div>
          </div>

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

          <section className="open-world-card" aria-label="Bestätigte Aurion-Expanse" style={{ "--expanse-reference": `url("${expanseReference}")` } as CSSProperties}>
            <div className="open-world-card__veil" />
            <div className="open-world-card__head"><div><span>OPEN WORLD // SERVER SNAPSHOT</span><b>{openWorld.data?.displayName ?? "Weltkarte wird gelesen"}</b></div><em>REV {openWorld.data?.revision ?? "—"}</em></div>
            <p>{openWorld.data?.entryNarrative ?? "Der Sternwartenturm hält die äußeren Pfade stabil, bis dein bestätigter Weltstatus geladen ist."}</p>
            <div className="open-world-card__metrics"><span>ZONE TIER <b>{openWorld.data?.zoneTier ?? 0}</b></span><span>SICHTBAR <b>{openWorld.data ? `${openWorld.data.encounter.activeCount}/${openWorld.data.encounter.maximumVisible}` : "—"}</b></span><span>BUDGET <b>{openWorld.data?.encounter.budget ?? "—"}</b></span></div>
            <div className="open-world-card__pois">{openWorld.data?.pointsOfInterest.slice(0, 3).map(point => <span key={point.id} data-state={point.state}>{point.label}</span>)}</div>
            <div className="open-world-card__npcs">{openWorld.data?.npcs.map(npc => <div key={npc.id}><b>{npc.displayName}</b><small>{npc.memory.quest[0] ?? npc.memory.local[0]}</small></div>)}</div>
            {openWorld.data?.primaryEncounter && <div className="world-encounter"><div><span>WELTBEGEGNUNG // BESTÄTIGT</span><b>{openWorld.data.primaryEncounter.label}</b><p>{openWorld.data.primaryEncounter.narrative}</p></div><button type="button" disabled={startGameplayEncounter.isPending || Boolean(gameplaySession.current)} onClick={() => startServerEncounter(openWorld.data!.primaryEncounter!.encounterKey)}>Begegnung beginnen</button></div>}
            {activeWorldNpc && (() => {
              const npc = openWorld.data?.npcs.find(candidate => candidate.id === activeWorldNpc);
              const availableQuest = gameplayProgress.data?.quests.find(quest => quest.state === "available" && quest.giver.toLowerCase() === activeWorldNpc);
              const activeNpcQuest = gameplayProgress.data?.quests.find(quest => quest.state === "active" && quest.giver.toLowerCase() === activeWorldNpc);
              return <div className="world-npc-dialogue" role="status"><div><span>NPC-INTERAKTION // {activeWorldNpc.toUpperCase()}</span><b>{npc?.displayName ?? activeWorldNpc}</b><p>{npc?.memory.quest[0] ?? npc?.memory.local[0] ?? "Der bestätigte Erinnerungskern wird gelesen."}</p></div>{availableQuest ? <button type="button" disabled={acceptGameplayQuest.isPending} onClick={() => acceptGameplayQuest.mutate({ questKey: availableQuest.key }, { onSuccess: () => { void gameplayProgress.refetch(); void openWorld.refetch(); setLastSignal(`${availableQuest.giver} bestätigt „${availableQuest.title}“.`); }, onError: () => setLastSignal("Die Questannahme wurde nicht bestätigt.") })}>{availableQuest.title} annehmen</button> : activeNpcQuest ? <small>AKTIVER AUFTRAG: {activeNpcQuest.title}</small> : <small>KEIN ZULÄSSIGER AUFTRAG</small>}<button type="button" className="world-npc-dialogue__close" onClick={() => setActiveWorldNpc(null)}>Dialog schließen</button></div>;
            })()}
            <button type="button" disabled={enterOpenWorld.isPending || Boolean(gameplaySession.current)} onClick={enterAurionExpanse}><Compass size={16} /> {enterOpenWorld.isPending ? "WELTSTATUS WIRD BESTÄTIGT" : "DIE AURION-EXPANSE BETRETEN"}</button>
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
