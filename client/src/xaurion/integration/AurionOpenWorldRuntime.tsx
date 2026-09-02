import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Database, Radio } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ZoneMovementClient, type ZoneMovementInput } from "@/lib/zoneMovement";
import { MMOEngine } from "../core/MMOEngine";
import { GameHUD } from "../components/GameHUD";
import { InventoryModal } from "../components/InventoryModal";
import { CharacterModal } from "../components/CharacterModal";
import { ClassSelectModal } from "../components/ClassSelectModal";
import { NPCDialogueModal } from "../components/NPCDialogueModal";
import { QuestLogModal } from "../components/QuestLogModal";
import { WorldMapModal } from "../components/WorldMapModal";
import { PartyModal } from "../components/PartyModal";
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

const classForAurion = (value: AurionPlayerProjection["profile"] extends infer P ? P extends { selectedClass?: infer C } ? C : never : never): CharacterClassId => {
  if (value === "seer") return "mage";
  if (value === "warden") return "ranger";
  return "knight";
};

const weaponForAurion = (value: AurionPlayerProjection["weaponLoadout"] extends infer P ? P extends { weaponTrack?: infer W } ? W : never : never) => {
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
  const connectedOnceRef = useRef(false);

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

  useEffect(() => {
    const onLoad = (event: Event) => {
      connectedOnceRef.current = false;
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
    let unsubscribeEquipment: (() => void) | undefined;
    try {
      const engine = new MMOEngine(containerRef.current, currentClassId);
      engineRef.current = engine;
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
      setWebglError(null);
    } catch (error) {
      setWebglError(error instanceof Error ? error.message : "xaurion konnte nicht initialisiert werden.");
    }
    return () => {
      disposed = true;
      unsubscribeEquipment?.();
      engineRef.current?.stop();
      engineRef.current = null;
      keysRef.current.clear();
    };
  }, [activation]);

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
    if (!activation || !isAuthenticated || !user?.id || connectedOnceRef.current) return;
    connectedOnceRef.current = true;
    setZoneStatus("connecting");
    issueZoneTicket.mutate({ zoneId: "observatory_threshold", clientBuild: "xaurion-open-world-v1" }, {
      onSuccess: ({ ticket }) => {
        const client = new ZoneMovementClient({
          onStatus: setZoneStatus,
          onReject: () => setZoneStatus("rejected"),
          onSnapshot: snapshot => {
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
      onError: () => setZoneStatus("rejected"),
    });
    return () => {
      zoneClientRef.current?.close();
      zoneClientRef.current = null;
      setZoneStatus("idle");
    };
  }, [activation, isAuthenticated, user?.id]);

  const sendAuthoritativeMovement = useCallback((input: ZoneMovementInput) => {
    zoneClientRef.current?.sendMovement(input);
  }, []);

  useEffect(() => {
    if (!activation) return;
    const publish = () => {
      const keys = keysRef.current;
      const input: ZoneMovementInput = {
        x: ((keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0)) as -1 | 0 | 1,
        z: ((keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0)) as -1 | 0 | 1,
      };
      sendAuthoritativeMovement(input);
    };
    const down = (event: KeyboardEvent) => {
      if (event.repeat || ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement?.tagName ?? "").toUpperCase())) return;
      const key = event.key.toLowerCase();
      if (!/[wasd]/.test(key) || key.length !== 1) return;
      keysRef.current.add(key);
      publish();
    };
    const up = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!/[wasd]/.test(key) || key.length !== 1) return;
      keysRef.current.delete(key);
      publish();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      sendAuthoritativeMovement({ x: 0, z: 0 });
      keysRef.current.clear();
    };
  }, [activation, sendAuthoritativeMovement]);

  const handleVirtualMove = useCallback((forward: number, right: number) => {
    engineRef.current?.setVirtualMovement(forward, right);
    const input: ZoneMovementInput = {
      x: right > 0.15 ? 1 : right < -0.15 ? -1 : 0,
      z: forward > 0.15 ? -1 : forward < -0.15 ? 1 : 0,
    };
    sendAuthoritativeMovement(input);
  }, [sendAuthoritativeMovement]);

  const handleInteract = useCallback(() => {
    const result = engineRef.current?.interactNearby();
    if (result?.npcOpened) {
      setActiveNPC(result.npcOpened);
      setDialogueOpen(true);
    }
  }, []);

  const handleSelectClass = useCallback((classId: CharacterClassId) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.player.setClass(classId);
    setCurrentClassId(classId);
    setStats({ ...engine.player.stats });
  }, []);

  const handleEquip = useCallback((item: RPGItem) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.equipItem(item);
    setEquipment({ ...engine.player.equipment });
    setInventory([...engine.player.inventory]);
    setStats({ ...engine.player.stats });
  }, []);

  const handleUnequip = useCallback((slot: keyof EquipmentState) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.unequipItem(String(slot));
    setEquipment({ ...engine.player.equipment });
    setInventory([...engine.player.inventory]);
    setStats({ ...engine.player.stats });
  }, []);

  const handleSendMessage = useCallback((text: string, channel: ChatMessage["channel"]) => {
    engineRef.current?.addChatMessage(channel, user?.name || "Explorer", text);
  }, [user?.name]);

  const handleAcceptQuest = useCallback((quest: Quest) => {
    const engine = engineRef.current;
    if (!engine || engine.quests.some(candidate => candidate.id === quest.id)) return;
    engine.quests.push({ ...quest });
    engine.addChatMessage("system", "Quest", `Accepted: ${quest.title}`);
  }, []);

  const handleBuyItem = useCallback((item: RPGItem) => {
    const engine = engineRef.current;
    if (!engine || engine.player.stats.gold < item.valueGold) return;
    engine.player.stats.gold -= item.valueGold;
    engine.player.inventory.push(item);
  }, []);

  const worldLabel = useMemo(() => activation?.displayName ?? "Aurion Open World", [activation?.displayName]);
  if (!activation) return null;

  return (
    <section className="xaurion-runtime" data-testid="xaurion-open-world-runtime" aria-label="Aurion Open World powered by owner ZIP reference">
      <div ref={containerRef} className="xaurion-runtime__viewport" id="three-viewport" />
      <div className="xaurion-runtime__bridge-status" aria-live="polite">
        <span><Database size={13} /> AURION DB</span>
        <b>{zoneStatus === "connected" ? "SERVER-AUTORITÄT LIVE" : zoneStatus === "connecting" ? "VERBINDET" : "READBACK"}</b>
        <i><Radio size={12} /> {worldLabel}</i>
      </div>
      <button className="xaurion-runtime__return" type="button" onClick={() => window.dispatchEvent(new Event("aurion:xaurion-return-request"))}>
        <ArrowLeft size={16} /> ZUR STERNWARTE
      </button>
      {celebration > 0 && <div className="xaurion-runtime__celebration" key={celebration} aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <span key={index} style={{ "--i": index } as React.CSSProperties}>✦</span>)}</div>}
      {webglError && <div className="xaurion-runtime__error" role="alert"><b>OPEN-WORLD-RENDERER NICHT VERFÜGBAR</b><span>{webglError}</span></div>}

      {stats && (
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
          onCastSkill={index => engineRef.current?.castClassSkill(index)}
          onCycleTarget={() => engineRef.current?.cycleTarget()}
          onVirtualMove={handleVirtualMove}
          onToggleMount={() => engineRef.current?.toggleMount()}
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

      {stats && equipment && <InventoryModal isOpen={inventoryOpen} onClose={() => setInventoryOpen(false)} equipment={equipment} inventory={inventory} gold={stats.gold} onEquip={handleEquip} onUnequip={handleUnequip} onUseConsumable={item => { engineRef.current?.player.useConsumable(item); if (engineRef.current) { setInventory([...engineRef.current.player.inventory]); setStats({ ...engineRef.current.player.stats }); } }} onDiscard={itemId => { const engine = engineRef.current; if (!engine) return; engine.player.inventory = engine.player.inventory.filter(item => item.id !== itemId); setInventory([...engine.player.inventory]); }} onSortInventory={mode => engineRef.current?.sortInventory(mode)} />}
      {stats && <CharacterModal isOpen={characterOpen} onClose={() => setCharacterOpen(false)} stats={stats} currentClassId={currentClassId} onAllocateStatPoint={attribute => { const result = engineRef.current?.player.allocateStatPoint(attribute) ?? { success: false, message: "Engine unavailable" }; if (engineRef.current) setStats({ ...engineRef.current.player.stats }); return result; }} onUnlockMilestoneSkill={skillId => { const result = engineRef.current?.player.unlockMilestoneSkill(skillId) ?? { success: false, message: "Engine unavailable" }; if (engineRef.current) setStats({ ...engineRef.current.player.stats }); return result; }} onEquipSkill={(slot, skill) => { engineRef.current?.player.equipSkillToHotbar(slot, skill); if (engineRef.current) setStats({ ...engineRef.current.player.stats }); }} />}
      <ClassSelectModal isOpen={classOpen} onClose={() => setClassOpen(false)} currentClassId={currentClassId} onSelectClass={handleSelectClass} />
      {stats && <NPCDialogueModal isOpen={dialogueOpen} onClose={() => setDialogueOpen(false)} npc={activeNPC} activeQuests={quests} playerGold={stats.gold} playerLevel={stats.level} genkitAdapter={engineRef.current?.genkitAdapter} onAcceptQuest={handleAcceptQuest} onBuyItem={handleBuyItem} />}
      <QuestLogModal isOpen={questsOpen} onClose={() => setQuestsOpen(false)} quests={quests} />
      {stats && <WorldMapModal isOpen={mapOpen} onClose={() => setMapOpen(false)} playerStats={stats} npcs={engineRef.current?.npcs ?? []} chunkManager={engineRef.current?.landscape.chunkManager ?? null} />}
      <PartyModal isOpen={partyOpen} onClose={() => setPartyOpen(false)} partyMembers={partyMembers} availablePlayers={simPlayers} onInvitePlayer={player => engineRef.current?.partyManager.inviteMember(player)} onRemoveMember={memberId => engineRef.current?.partyManager.removeMember(memberId)} onLeaveParty={() => engineRef.current?.partyManager.leaveParty()} onPromoteLeader={memberId => engineRef.current?.partyManager.promoteToLeader(memberId)} />
    </section>
  );
}
