import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Database, Radio } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ZoneMovementClient, type ZoneMovementInput } from "@/lib/zoneMovement";
import { runtimeIssueCode } from "@shared/runtimeContracts";
import { MMOEngine } from "../core/MMOEngine";
import { GameHUD } from "../components/GameHUD";
import { InventoryModal } from "../components/InventoryModal";
import { CharacterModal } from "../components/CharacterModal";
import { ClassSelectModal } from "../components/ClassSelectModal";
import { NPCDialogueModal } from "../components/NPCDialogueModal";
import { QuestLogModal } from "../components/QuestLogModal";
import { WorldMapModal } from "../components/WorldMapModal";
import { PartyModal } from "../components/PartyModal";
import {
  ax1MovementToAurionIntent,
  aurionClassForAx1,
  aurionQuestKey,
  bindAurionAuthorityProjection,
  type AurionGameplayCommand,
} from "./aurionAuthorityAdapter";
import type {
  CharacterClassId,
  ChatMessage,
  DayNightInfo,
  EquipmentState,
  FloatingCombatText,
  LootDropEntity,
  NPCCharacter,
  PartyMember,
  PlayerStats,
  Quest,
  RPGItem,
  SimulatedPlayer,
  WorldMobEntity,
} from "../types";
import "./aurionOpenWorldRuntime.css";

type ActivationSnapshot = Readonly<{
  displayName?: string;
  entryNarrative?: string;
  zoneTier?: number;
  globalWorld?: { epoch?: number; worldSeed?: string };
}>;

type AurionPlayerProjection = Readonly<{
  profile?: {
    level?: number;
    totalXp?: number;
    aurionPoints?: number;
    victories?: number;
    selectedClass?: "unbound" | "vanguard" | "seer" | "warden";
  };
  weaponLoadout?: { weaponTrack?: "blade" | "staff" | "spear" | "focus" } | null;
}>;

const classForAurion = (value: "unbound" | "vanguard" | "seer" | "warden" | undefined): CharacterClassId => {
  if (value === "seer") return "mage";
  if (value === "warden") return "ranger";
  return "knight";
};

const weaponForAurion = (value: "blade" | "staff" | "spear" | "focus" | undefined) => {
  if (value === "staff" || value === "focus") return "arcane" as const;
  if (value === "spear") return "blade" as const;
  return "blade" as const;
};

function validActivation(detail: unknown): ActivationSnapshot {
  if (!detail || typeof detail !== "object") return Object.freeze({ displayName: "Aurion Open World" });
  const value = detail as Record<string, unknown>;
  return Object.freeze({
    displayName: typeof value.displayName === "string" ? value.displayName : "Aurion Open World",
    entryNarrative: typeof value.entryNarrative === "string" ? value.entryNarrative : undefined,
    zoneTier: typeof value.zoneTier === "number" ? value.zoneTier : undefined,
    globalWorld: value.globalWorld && typeof value.globalWorld === "object" ? value.globalWorld as ActivationSnapshot["globalWorld"] : undefined,
  });
}

export default function AurionOpenWorldRuntime() {
  const { user, isAuthenticated } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MMOEngine | null>(null);
  const zoneClientRef = useRef<ZoneMovementClient | null>(null);
  const keysRef = useRef(new Set<string>());
  const virtualInputRef = useRef({ forward: 0, right: 0 });

  const [activation, setActivation] = useState<ActivationSnapshot | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [zoneStatus, setZoneStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "rejected">("idle");
  const [currentClassId, setCurrentClassId] = useState<CharacterClassId>("knight");
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [equipment, setEquipment] = useState<EquipmentState | null>(null);
  const [inventory, setInventory] = useState<RPGItem[]>([]);
  const [targetMob, setTargetMob] = useState<WorldMobEntity | null>(null);
  const [nearbyNPC, setNearbyNPC] = useState<NPCCharacter | null>(null);
  const [nearbyLoot, setNearbyLoot] = useState<LootDropEntity | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingCombatText[]>([]);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [simPlayers, setSimPlayers] = useState<SimulatedPlayer[]>([]);
  const [dayNightInfo, setDayNightInfo] = useState<DayNightInfo>();
  const [activeNPC, setActiveNPC] = useState<NPCCharacter | null>(null);
  const [celebration, setCelebration] = useState(0);

  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [classOpen, setClassOpen] = useState(false);
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);

  const playerSnapshot = trpc.player.me.useQuery(undefined, { enabled: Boolean(activation) && isAuthenticated });
  const characterAppearance = trpc.assetSubmissions.characterAppearance.useQuery(undefined, { enabled: Boolean(activation) && isAuthenticated });
  const issueZoneTicket = trpc.gameplay.issueZoneTicket.useMutation();
  const choosePlayerClass = trpc.player.chooseClass.useMutation();
  const acceptGameplayQuest = trpc.gameplay.acceptQuest.useMutation();

  const requestAuthoritativeAction = useCallback((command: AurionGameplayCommand) => {
    window.dispatchEvent(new CustomEvent("aurion:request-action", { detail: { command, source: "human" as const } }));
  }, []);

  const requestAuthoritativeMount = useCallback(() => {
    engineRef.current?.addChatMessage("system", "Aurion", "Mount bleibt auf dem -ax1-Keybind Z; die serverseitige Mount-Mutation folgt in der Progressionsmigration.");
    window.dispatchEvent(new CustomEvent("aurion:xaurion-mount-intent", { detail: { source: "human" as const } }));
  }, []);

  const rejectLocalGameplayWrite = useCallback((label: string) => {
    engineRef.current?.addChatMessage("system", "Aurion", `${label} wartet auf den serverautoritativen Migrationspfad; der Client schreibt keinen Ersatzstatus.`);
  }, []);

  useEffect(() => {
    const onLoad = (event: Event) => {
      setWebglError(null);
      setActivation(validActivation((event as CustomEvent<unknown>).detail));
    };
    const onReturn = () => setActivation(null);
    const onCelebrate = () => setCelebration(value => value + 1);
    window.addEventListener("aurion:load-open-world", onLoad);
    window.addEventListener("aurion:return-to-tower", onReturn);
    window.addEventListener("aurion:xaurion-celebrate", onCelebrate);
    return () => {
      window.removeEventListener("aurion:load-open-world", onLoad);
      window.removeEventListener("aurion:return-to-tower", onReturn);
      window.removeEventListener("aurion:xaurion-celebrate", onCelebrate);
    };
  }, []);

  useEffect(() => {
    if (!activation || !containerRef.current) return;
    const support = MMOEngine.checkWebGLSupport();
    if (!support.supported) {
      setWebglError(support.error ?? "WebGL ist nicht verfügbar.");
      return;
    }

    let disposed = false;
    let engine: MMOEngine | undefined;
    let unsubscribeEquipment: (() => void) | undefined;
    const fail = (error: unknown) => {
      if (disposed) return;
      engine?.stop();
      zoneClientRef.current?.close();
      zoneClientRef.current = null;
      engineRef.current = null;
      keysRef.current.clear();
      virtualInputRef.current = { forward: 0, right: 0 };
      setZoneStatus("closed");
      setWebglError(runtimeIssueCode(error));
    };
    try {
      engine = new MMOEngine(containerRef.current, currentClassId);
      engineRef.current = engine;
      engine.onRuntimeError = fail;
      bindAurionAuthorityProjection(engine, {
        requestAction: requestAuthoritativeAction,
        requestMount: requestAuthoritativeMount,
      });
      setEquipment({ ...engine.player.equipment });
      setInventory([...engine.player.inventory]);
      setStats({ ...engine.player.stats, currentZone: activation.displayName ?? engine.player.stats.currentZone });
      unsubscribeEquipment = engine.observePlayerEquipment(next => {
        if (!disposed) setEquipment({ ...next });
      });
      engine.onStateUpdate = state => {
        if (disposed) return;
        setStats({ ...state.stats, currentZone: activation.displayName ?? state.stats.currentZone });
        setEquipment({ ...state.equipment });
        setInventory([...state.inventory]);
        setTargetMob(state.targetMob ? { ...state.targetMob } : null);
        setNearbyNPC(state.nearbyNPC ? { ...state.nearbyNPC } : null);
        setNearbyLoot(state.nearbyLoot ? { ...state.nearbyLoot } : null);
        setQuests([...state.quests]);
        setChatMessages([...state.chatMessages]);
        setFloatingTexts([...state.floatingTexts]);
        setPartyMembers([...state.partyMembers]);
        setDayNightInfo(state.dayNightInfo);
        setSimPlayers([...state.simPlayers]);
      };
      engine.start();
    } catch (error) {
      fail(error);
    }
    return () => {
      disposed = true;
      unsubscribeEquipment?.();
      engine?.stop();
      if (engineRef.current === engine) engineRef.current = null;
      keysRef.current.clear();
      virtualInputRef.current = { forward: 0, right: 0 };
    };
  }, [activation, requestAuthoritativeAction, requestAuthoritativeMount]);

  useEffect(() => {
    const engine = engineRef.current;
    const projection = playerSnapshot.data as AurionPlayerProjection | undefined;
    if (!engine || !projection?.profile) return;
    const nextClass = classForAurion(projection.profile.selectedClass);
    if (engine.player.currentClassId !== nextClass) engine.player.setClass(nextClass);
    setCurrentClassId(nextClass);
    if (Number.isSafeInteger(projection.profile.level) && (projection.profile.level ?? 0) > 0) engine.player.stats.level = projection.profile.level!;
    if (Number.isSafeInteger(projection.profile.totalXp) && (projection.profile.totalXp ?? -1) >= 0) engine.player.stats.xp = projection.profile.totalXp!;
    if (Number.isSafeInteger(projection.profile.aurionPoints) && (projection.profile.aurionPoints ?? -1) >= 0) engine.player.stats.score = projection.profile.aurionPoints!;
    if (Number.isSafeInteger(projection.profile.victories) && (projection.profile.victories ?? -1) >= 0) engine.player.stats.bossKills = projection.profile.victories!;
    engine.player.stats.activeWeaponType = weaponForAurion(projection.weaponLoadout?.weaponTrack);
    if (activation?.displayName) engine.player.stats.currentZone = activation.displayName;
    setStats({ ...engine.player.stats });
  }, [activation?.displayName, playerSnapshot.data]);

  useEffect(() => {
    const engine = engineRef.current;
    const url = characterAppearance.data?.storageUrl;
    if (!engine || !url) return;
    void engine.player.equipGlbModel(url);
  }, [characterAppearance.data?.storageUrl, activation]);

  useEffect(() => {
    if (!activation || webglError || !engineRef.current || !isAuthenticated || !user?.id) return;
    let disposed = false;
    let client: ZoneMovementClient | undefined;
    setZoneStatus("connecting");
    issueZoneTicket.mutate({ zoneId: "observatory_threshold", clientBuild: "xaurion-open-world-v1" }, {
      onSuccess: ({ ticket }) => {
        if (disposed || !engineRef.current) return;
        client = new ZoneMovementClient({
          onStatus: status => { if (!disposed) setZoneStatus(status); },
          onReject: () => { if (!disposed) setZoneStatus("rejected"); },
          onSnapshot: snapshot => {
            if (disposed) return;
            const self = snapshot.presences.find(presence => presence.userId === user.id);
            const engine = engineRef.current;
            if (!self || !engine) return;
            const x = self.position.x / 1000;
            const z = self.position.z / 1000;
            engine.player.position.x = x;
            engine.player.position.z = z;
            engine.player.position.y = engine.landscape.chunkManager.getElevationAt(x, z);
            engine.player.stats.x = x;
            engine.player.stats.y = engine.player.position.y;
            engine.player.stats.z = z;
          },
        });
        zoneClientRef.current?.close();
        zoneClientRef.current = client;
        client.connect(ticket);
      },
      onError: () => { if (!disposed) setZoneStatus("rejected"); },
    });
    return () => {
      disposed = true;
      client?.close();
      if (zoneClientRef.current === client) zoneClientRef.current = null;
    };
  }, [activation, webglError, isAuthenticated, user?.id]);

  const sendAuthoritativeMovement = useCallback((input: ZoneMovementInput) => {
    zoneClientRef.current?.sendMovement(input);
  }, []);

  const syncAx1HumanMovement = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const keys = keysRef.current;
    const virtual = virtualInputRef.current;
    const forward = virtual.forward + (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
    const right = virtual.right + (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
    engine.setVirtualMovement(forward, right);
    sendAuthoritativeMovement(ax1MovementToAurionIntent(engine.cameraYaw, forward, right));
  }, [sendAuthoritativeMovement]);

  useEffect(() => {
    if (!activation) return;
    const typing = () => ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement?.tagName ?? "").toUpperCase());
    const down = (event: KeyboardEvent) => {
      if (event.repeat || typing()) return;
      const key = event.key.toLowerCase();
      const engine = engineRef.current;
      if (!engine) return;

      if (["w", "a", "s", "d"].includes(key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        keysRef.current.add(key);
        syncAx1HumanMovement();
        return;
      }
      if (key === "1" || key === "2" || key === "3" || key === "4" || key === "5") {
        event.preventDefault();
        event.stopImmediatePropagation();
        engine.castClassSkill(Number(key) - 1);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        event.stopImmediatePropagation();
        engine.castClassSkill(2);
        return;
      }
      if (key === "z") {
        event.preventDefault();
        event.stopImmediatePropagation();
        engine.toggleMount();
        return;
      }
      if (key === "f") {
        event.preventDefault();
        event.stopImmediatePropagation();
        const result = engine.interactNearby();
        if (result.npcOpened) {
          setActiveNPC(result.npcOpened);
          setDialogueOpen(true);
        }
        return;
      }
      if (key === "tab") {
        event.preventDefault();
        event.stopImmediatePropagation();
        engine.cycleTarget();
      }
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!["w", "a", "s", "d"].includes(key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      keysRef.current.delete(key);
      syncAx1HumanMovement();
    };
    const cameraFollowTimer = window.setInterval(() => {
      const virtual = virtualInputRef.current;
      if (keysRef.current.size > 0 || Math.abs(virtual.forward) > 0.01 || Math.abs(virtual.right) > 0.01) syncAx1HumanMovement();
    }, 100);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.clearInterval(cameraFollowTimer);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      engineRef.current?.setVirtualMovement(0, 0);
      sendAuthoritativeMovement({ x: 0, z: 0 });
      keysRef.current.clear();
      virtualInputRef.current = { forward: 0, right: 0 };
    };
  }, [activation, sendAuthoritativeMovement, syncAx1HumanMovement]);

  const handleVirtualMove = useCallback((forward: number, right: number) => {
    virtualInputRef.current = { forward, right };
    syncAx1HumanMovement();
  }, [syncAx1HumanMovement]);

  const handleInteract = useCallback(() => {
    const result = engineRef.current?.interactNearby();
    if (result?.npcOpened) {
      setActiveNPC(result.npcOpened);
      setDialogueOpen(true);
    }
  }, []);

  const handleSelectClass = useCallback((classId: CharacterClassId) => {
    const playerClass = aurionClassForAx1(classId);
    if (!playerClass) {
      rejectLocalGameplayWrite("Diese -ax1-Klasse");
      return;
    }
    choosePlayerClass.mutate({ playerClass }, {
      onSuccess: () => {
        void playerSnapshot.refetch();
        setClassOpen(false);
      },
      onError: () => rejectLocalGameplayWrite("Klassenwahl"),
    });
  }, [choosePlayerClass, playerSnapshot, rejectLocalGameplayWrite]);

  const handleEquip = useCallback((_item: RPGItem) => {
    rejectLocalGameplayWrite("Ausrüstungswechsel");
  }, [rejectLocalGameplayWrite]);

  const handleUnequip = useCallback((_slot: keyof EquipmentState) => {
    rejectLocalGameplayWrite("Ausrüstungswechsel");
  }, [rejectLocalGameplayWrite]);

  const handleSendMessage = useCallback((text: string, channel: ChatMessage["channel"]) => {
    engineRef.current?.addChatMessage(channel, user?.name || "Explorer", text);
  }, [user?.name]);

  const handleAcceptQuest = useCallback((quest: Quest) => {
    const questKey = aurionQuestKey(quest.id);
    if (!questKey) {
      rejectLocalGameplayWrite("Diese -ax1-Quest");
      return;
    }
    acceptGameplayQuest.mutate({ questKey }, {
      onSuccess: () => engineRef.current?.addChatMessage("system", "Aurion", `Server bestätigt Quest: ${quest.title}`),
      onError: () => rejectLocalGameplayWrite("Questannahme"),
    });
  }, [acceptGameplayQuest, rejectLocalGameplayWrite]);

  const handleBuyItem = useCallback((_item: RPGItem) => {
    rejectLocalGameplayWrite("Händlerkauf");
  }, [rejectLocalGameplayWrite]);

  const worldLabel = useMemo(() => activation?.displayName ?? "Aurion Open World", [activation?.displayName]);
  if (!activation) return null;

  return (
    <section className="xaurion-runtime" data-testid="xaurion-open-world-runtime" aria-label="Aurion Open World powered by owner ZIP reference">
      <div ref={containerRef} className="xaurion-runtime__viewport" id="three-viewport" />
      <div className="xaurion-runtime__bridge-status" aria-live="polite">
        <span><Database size={13} /> AURION DB</span>
        <b>{webglError ? "ANGEHALTEN" : zoneStatus === "connected" ? "BEWEGUNG VERBUNDEN" : zoneStatus === "connecting" ? "VERBINDET" : zoneStatus === "rejected" ? "VERBINDUNG ABGELEHNT" : "NICHT VERBUNDEN"}</b>
        <i><Radio size={12} /> {worldLabel}</i>
      </div>
      <button className="xaurion-runtime__return" type="button" onClick={() => window.dispatchEvent(new Event("aurion:xaurion-return-request"))}>
        <ArrowLeft size={16} /> ZUR STERNWARTE
      </button>
      {celebration > 0 && <div className="xaurion-runtime__celebration" key={celebration} aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <span key={index} style={{ "--i": index } as React.CSSProperties}>✦</span>)}</div>}
      {webglError && <div className="xaurion-runtime__error" role="alert"><b>OPEN WORLD ANGEHALTEN</b><span>Bitte kehre zur Sternwarte zurück und öffne die Welt erneut. Vorgang {webglError}</span></div>}

      {!webglError && stats && (
        <GameHUD
          playerStats={stats}
          currentClassId={currentClassId}
          targetMob={targetMob}
          nearbyNPC={nearbyNPC}
          nearbyLoot={nearbyLoot}
          quests={quests}
          chatMessages={chatMessages}
          floatingTexts={floatingTexts}
          partyMembers={partyMembers}
          dayNightInfo={dayNightInfo}
          onCastSkill={index => index >= 0 && index < 5 && requestAuthoritativeAction(String(index + 1) as AurionGameplayCommand)}
          onCycleTarget={() => engineRef.current?.cycleTarget()}
          onVirtualMove={handleVirtualMove}
          onToggleMount={requestAuthoritativeMount}
          onInteract={handleInteract}
          onOpenInventory={() => setInventoryOpen(true)}
          onOpenCharacter={() => setCharacterOpen(true)}
          onOpenQuests={() => setQuestsOpen(true)}
          onOpenClasses={() => setClassOpen(true)}
          onOpenMap={() => setMapOpen(true)}
          onOpenParty={() => setPartyOpen(true)}
          onSendMessage={handleSendMessage}
        />
      )}

      {stats && equipment && <InventoryModal isOpen={inventoryOpen} onClose={() => setInventoryOpen(false)} equipment={equipment} inventory={inventory} gold={stats.gold} onEquip={handleEquip} onUnequip={handleUnequip} onUseConsumable={() => rejectLocalGameplayWrite("Verbrauchsgegenstand")} onDiscard={() => rejectLocalGameplayWrite("Gegenstand verwerfen")} onSortInventory={mode => engineRef.current?.sortInventory(mode)} />}
      {stats && <CharacterModal isOpen={characterOpen} onClose={() => setCharacterOpen(false)} stats={stats} currentClassId={currentClassId} onAllocateStatPoint={() => ({ success: false, message: "Aurion server authority is required for stat allocation." })} onUnlockMilestoneSkill={() => ({ success: false, message: "Aurion server authority is required for skill unlocks." })} onEquipSkill={() => rejectLocalGameplayWrite("Skill-Loadout")} />}
      <ClassSelectModal isOpen={classOpen} onClose={() => setClassOpen(false)} currentClassId={currentClassId} onSelectClass={handleSelectClass} />
      {stats && <NPCDialogueModal isOpen={dialogueOpen} onClose={() => setDialogueOpen(false)} npc={activeNPC} activeQuests={quests} playerGold={stats.gold} playerLevel={stats.level} genkitAdapter={engineRef.current?.genkitAdapter} onAcceptQuest={handleAcceptQuest} onBuyItem={handleBuyItem} />}
      <QuestLogModal isOpen={questsOpen} onClose={() => setQuestsOpen(false)} quests={quests} />
      {stats && <WorldMapModal isOpen={mapOpen} onClose={() => setMapOpen(false)} playerStats={stats} npcs={engineRef.current?.npcs ?? []} chunkManager={engineRef.current?.landscape.chunkManager ?? null} />}
      <PartyModal isOpen={partyOpen} onClose={() => setPartyOpen(false)} partyMembers={partyMembers} availablePlayers={simPlayers} onInvitePlayer={() => rejectLocalGameplayWrite("Party-Einladung")} onRemoveMember={() => rejectLocalGameplayWrite("Party-Änderung")} onLeaveParty={() => rejectLocalGameplayWrite("Party verlassen")} onPromoteLeader={() => rejectLocalGameplayWrite("Party-Leitung")} />
    </section>
  );
}
