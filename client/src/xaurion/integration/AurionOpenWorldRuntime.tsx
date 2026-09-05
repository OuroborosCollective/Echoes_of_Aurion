import { useGlbCatalog } from "@/hooks/useGlbCatalog";
import { WORLD_DEMONSTRATION_EVENT } from "@/lib/companionWorldInputs";
import { VisibleCanvasCapture } from "@/lib/visibleCanvasCapture";
import { loadCompanionSession } from "@/lib/companionLearning";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Hammer } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { ZoneMovementClient, type ZoneMovementInput } from "@/lib/zoneMovement";
import { runtimeIssueCode } from "@shared/runtimeContracts";
import { DeterministicSimulation } from "@shared/deterministicSimulation";
import { MMOEngine } from "../core/MMOEngine";
import { ConfirmedVisualEffects } from "./confirmedVisualEffects";
import { RemotePresenceProjection } from "./RemotePresenceProjection";
import type { ConfirmedZonePresence } from "@shared/zonePresenceContract";
import { AurionAuthorityHud } from "./AurionAuthorityHud";
import { ServiceNpcProjection } from "./ServiceNpcProjection";
import { ax1MovementToAurionIntent, bindAurionAuthorityProjection, type AurionGameplayCommand } from "./aurionAuthorityAdapter";
import type { CharacterClassId } from "../types";
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
  const zoneConnectedRef = useRef(false);
  const remotePresenceRef = useRef<RemotePresenceProjection | null>(null);
  const keysRef = useRef(new Set<string>());
  const demonstratedMovementRef = useRef("0:0");
  const virtualInputRef = useRef({ forward: 0, right: 0 });
  const serviceNpcRef = useRef<ServiceNpcProjection | null>(null);
  const modelEvidenceRef = useRef<HTMLOutputElement>(null);
  const npcEvidenceRef = useRef<HTMLOutputElement>(null);
  const [nearbySmith, setNearbySmith] = useState(false);

  const [activation, setActivation] = useState<ActivationSnapshot | null>(null);
  const catalog = useGlbCatalog(Boolean(activation));
  const [modelStatus, setModelStatus] = useState("procedural");
  const [webglError, setWebglError] = useState<string | null>(null);
  const [zoneStatus, setZoneStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "rejected">("idle");
  const [currentClassId, setCurrentClassId] = useState<CharacterClassId>("knight");
  const [confirmedPosition, setConfirmedPosition] = useState<{ x: number; z: number }>();
  const [remotePlayers, setRemotePlayers] = useState<readonly ConfirmedZonePresence[]>([]);
  const [celebration, setCelebration] = useState(0);

  const playerSnapshot = trpc.player.me.useQuery(undefined, { enabled: Boolean(activation) && isAuthenticated });
  const worldSnapshot = trpc.gameplay.openWorld.useQuery(undefined, { enabled: Boolean(activation) && isAuthenticated });
  const characterAppearance = trpc.assetSubmissions.characterAppearance.useQuery(undefined, { enabled: Boolean(activation) && isAuthenticated });
  const issueZoneTicket = trpc.gameplay.issueZoneTicket.useMutation();

  const requestAuthoritativeAction = useCallback((command: AurionGameplayCommand) => {
    if (document.querySelector('[role="dialog"][data-state="open"], .community-overlay[data-opened-from-world="true"]')) return;
    window.dispatchEvent(new CustomEvent(WORLD_DEMONSTRATION_EVENT, { detail: { kind: "action", command } }));
    window.dispatchEvent(new CustomEvent("aurion:request-action", { detail: { command, source: "human" as const } }));
  }, []);

  const requestAuthoritativeMount = useCallback(() => {
    engineRef.current?.addChatMessage("system", "Aurion", "Mount bleibt auf dem -ax1-Keybind Z; die serverseitige Mount-Mutation folgt in der Progressionsmigration.");
    window.dispatchEvent(new CustomEvent("aurion:xaurion-mount-intent", { detail: { source: "human" as const } }));
  }, []);

  const requestWorldInteraction = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !zoneConnectedRef.current) return;
    if (serviceNpcRef.current?.interact(engine.player.position)) {
      window.dispatchEvent(new CustomEvent("aurion:open-community", { detail: { panel: "crafting" } }));
      return;
    }
    const result = engine.interactNearby();
    if (result.npcOpened) window.dispatchEvent(new Event("aurion:open-world-contacts"));
    else requestAuthoritativeAction("E");
  }, [requestAuthoritativeAction]);

  useEffect(() => {
    const onLoad = (event: Event) => {
      setWebglError(null);
      setConfirmedPosition(undefined);
      setRemotePlayers([]);
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
    let remotePresence: RemotePresenceProjection | undefined;
    let capture: VisibleCanvasCapture | undefined;
    const confirmedVisuals = new ConfirmedVisualEffects();
    const onConfirmedAction = (event: Event) => {
      if (disposed || !engine || engineRef.current !== engine) return;
      const effect = confirmedVisuals.accept((event as CustomEvent<unknown>).detail);
      if (!effect) return;
      engine.player.playConfirmedGlbAttack();
      try { engine.particleSystem.emit(effect.kind, engine.player.position, undefined, 1, effect.receiptKey); }
      catch (error) { fail(error); }
    };
    const fail = (error: unknown) => {
      if (disposed) return;
      capture?.dispose();
      remotePresence?.dispose();
      remotePresenceRef.current = null;
      setRemotePlayers([]);
      engine?.stop();
      zoneClientRef.current?.close();
      zoneClientRef.current = null;
      engineRef.current = null;
      keysRef.current.clear();
      virtualInputRef.current = { forward: 0, right: 0 };
      zoneConnectedRef.current = false;
      setZoneStatus("closed");
      setWebglError(runtimeIssueCode(error));
    };
    try {
      const world = activation.globalWorld;
      if (!world || typeof world.worldSeed !== "string" || typeof world.epoch !== "number") throw new Error("WORLD_CONTEXT_REQUIRED");
      engine = new MMOEngine(containerRef.current, currentClassId, new DeterministicSimulation(world.worldSeed, world.epoch));
      engineRef.current = engine;
      engine.onProjectionTick = delta => serviceNpcRef.current?.update(delta);
      engine.onRuntimeError = fail;
      bindAurionAuthorityProjection(engine, {
        requestAction: requestAuthoritativeAction,
        requestMount: requestAuthoritativeMount,
      });
      remotePresence = new RemotePresenceProjection(engine.scene, user!.id, (x, z) => engine!.landscape.chunkManager.getElevationAt(x, z));
      remotePresenceRef.current = remotePresence;
      engine.start();
      capture = new VisibleCanvasCapture(() => {
        if (!engine || disposed || engineRef.current !== engine) throw new Error("RETIRED_RENDERER");
        return engine.renderer.domElement;
      }, () => { const session = loadCompanionSession(); return !disposed && zoneConnectedRef.current && session?.userId === user?.id && session?.online === true && session?.mode === "learning"; }, "renderer");
      let evidenceFrames = 0;
      engine.onFrameRendered = () => {
        capture?.onRenderedFrame();
        if (++evidenceFrames % 3 !== 0 || !engine) return;
        const evidence = engine.player.glbPresentationEvidence();
        if (modelEvidenceRef.current) {
          modelEvidenceRef.current.dataset.presentation = JSON.stringify(evidence);
          modelEvidenceRef.current.dataset.groundY = String(engine.player.group.position.y);
        }
        if (npcEvidenceRef.current) npcEvidenceRef.current.dataset.presentation = JSON.stringify(serviceNpcRef.current?.evidence() ?? null);
        setNearbySmith(Boolean(serviceNpcRef.current?.isNearby(engine.player.position)));
      };
      window.addEventListener("aurion:authoritative-action", onConfirmedAction);
    } catch (error) {
      fail(error);
    }
    return () => {
      disposed = true;
      window.removeEventListener("aurion:authoritative-action", onConfirmedAction);
      capture?.dispose();
      remotePresence?.dispose();
      if (remotePresenceRef.current === remotePresence) remotePresenceRef.current = null;
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
  }, [activation?.displayName, playerSnapshot.data]);

  useEffect(() => {
    const engine = engineRef.current;
    const url = characterAppearance.data?.storageUrl ?? catalog?.entries.find(entry => entry.targetKey === "starter_player")?.storageUrl ?? null;
    if (!engine) return;
    let disposed = false;
    setModelStatus(url ? "loading" : "procedural");
    void engine.player.equipGlbModel(url).then(loaded => {
      if (!disposed) setModelStatus(url ? loaded ? "active" : "failed" : "procedural");
    });
    return () => { disposed = true; void engine.player.equipGlbModel(null); };
  }, [characterAppearance.data?.storageUrl, catalog?.revision, activation]);

  useEffect(() => {
    const engine = engineRef.current;
    const definition = worldSnapshot.data?.serviceNpcs?.find(npc => npc.id === "observatory_blacksmith");
    const url = catalog?.entries.find(entry => entry.targetKey === definition?.targetKey)?.storageUrl;
    if (!engine || !definition || !url) return;
    const npc = new ServiceNpcProjection(definition, engine.scene, (x, z) => engine.landscape.chunkManager.getElevationAt(x, z));
    serviceNpcRef.current = npc;
    void npc.load(url).catch(() => { npc.dispose(); if (serviceNpcRef.current === npc) serviceNpcRef.current = null; });
    return () => { npc.dispose(); if (serviceNpcRef.current === npc) serviceNpcRef.current = null; setNearbySmith(false); };
  }, [activation, catalog?.revision, worldSnapshot.data?.serviceNpcs]);

  useEffect(() => {
    if (!activation || webglError || !engineRef.current || !isAuthenticated || !user?.id) return;
    let disposed = false;
    let client: ZoneMovementClient | undefined;
    let lastMotion: { x: number; z: number; tick: number } | undefined;
    setZoneStatus("connecting");
    issueZoneTicket.mutate({ zoneId: "observatory_threshold", clientBuild: "xaurion-open-world-v1" }, {
      onSuccess: ({ ticket }) => {
        if (disposed || !engineRef.current) return;
        client = new ZoneMovementClient({
          onStatus: status => {
            if (disposed) return;
            zoneConnectedRef.current = status === "connected";
            setZoneStatus(status);
            if (status !== "connected") { remotePresenceRef.current?.clear(); setRemotePlayers([]); engineRef.current?.player.setConfirmedGlbSpeed(0); lastMotion = undefined; }
          },
          onReject: () => { if (!disposed) setZoneStatus("rejected"); },
          onSnapshot: snapshot => {
            if (disposed) return;
            const self = snapshot.presences.find(presence => presence.userId === user.id);
            const engine = engineRef.current;
            if (!self || !engine) return;
            try {
              remotePresenceRef.current?.apply(snapshot.presences);
              setRemotePlayers(remotePresenceRef.current?.presences ?? []);
            } catch (error) { engine.onRuntimeError?.(error); return; }
            setConfirmedPosition({ ...self.position });
            const x = self.position.x / 1000;
            const z = self.position.z / 1000;
            const seconds = lastMotion ? (snapshot.tick - lastMotion.tick) / 10 : 0;
            engine.player.setConfirmedGlbSpeed(lastMotion && seconds > 0 ? Math.hypot(x - lastMotion.x, z - lastMotion.z) / seconds : 0);
            lastMotion = { x, z, tick: snapshot.tick };
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
      zoneConnectedRef.current = false;
      client?.close();
      if (zoneClientRef.current === client) zoneClientRef.current = null;
    };
  }, [activation, webglError, isAuthenticated, user?.id]);

  const sendAuthoritativeMovement = useCallback((input: ZoneMovementInput) => {
    zoneClientRef.current?.sendMovement(input);
    const key = `${input.x}:${input.z}`;
    if (input.x !== 0 || input.z !== 0 || key !== demonstratedMovementRef.current) {
      demonstratedMovementRef.current = key;
      window.dispatchEvent(new CustomEvent(WORLD_DEMONSTRATION_EVENT, { detail: { kind: "move", x: input.x, z: input.z } }));
    }
  }, []);

  const syncAx1HumanMovement = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (document.querySelector('[role="dialog"][data-state="open"], .community-overlay[data-opened-from-world="true"]')) {
      keysRef.current.clear();
      virtualInputRef.current = { forward: 0, right: 0 };
      engine.setVirtualMovement(0, 0);
      sendAuthoritativeMovement({ x: 0, z: 0 });
      return;
    }
    const keys = keysRef.current;
    const virtual = virtualInputRef.current;
    const forward = virtual.forward + (keys.has("w") ? 1 : 0) - (keys.has("s") ? 1 : 0);
    const right = virtual.right + (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0);
    engine.setVirtualMovement(forward, right);
    sendAuthoritativeMovement(ax1MovementToAurionIntent(engine.cameraYaw, forward, right));
  }, [sendAuthoritativeMovement]);

  useEffect(() => {
    if (!activation) return;
    const typing = () => Boolean(document.querySelector('[role="dialog"][data-state="open"]')) || ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement?.tagName ?? "").toUpperCase());
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
        requestWorldInteraction();
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
    const releaseMovement = () => {
      keysRef.current.clear(); virtualInputRef.current = { forward: 0, right: 0 };
      engineRef.current?.setVirtualMovement(0, 0);
      sendAuthoritativeMovement({ x: 0, z: 0 });
    };
    const cameraFollowTimer = window.setInterval(() => {
      const virtual = virtualInputRef.current;
      if (keysRef.current.size > 0 || Math.abs(virtual.forward) > 0.01 || Math.abs(virtual.right) > 0.01) syncAx1HumanMovement();
    }, 100);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", releaseMovement);
    return () => {
      window.clearInterval(cameraFollowTimer);
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", releaseMovement);
      engineRef.current?.setVirtualMovement(0, 0);
      sendAuthoritativeMovement({ x: 0, z: 0 });
      keysRef.current.clear();
      virtualInputRef.current = { forward: 0, right: 0 };
    };
  }, [activation, sendAuthoritativeMovement, syncAx1HumanMovement, requestWorldInteraction]);

  const handleVirtualMove = useCallback((forward: number, right: number) => {
    virtualInputRef.current = { forward, right };
    syncAx1HumanMovement();
  }, [syncAx1HumanMovement]);

  const worldLabel = useMemo(() => activation?.displayName ?? "Aurion Open World", [activation?.displayName]);
  if (!activation) return null;

  return (
    <section className="xaurion-runtime" data-testid="xaurion-open-world-runtime" aria-label="Aurion Open World">
      <output data-testid="glb-model-status" aria-label="Charaktermodell" className="sr-only">{modelStatus}</output>
      <output ref={modelEvidenceRef} data-testid="glb-presentation" className="sr-only" />
      <output ref={npcEvidenceRef} data-testid="smith-presentation" className="sr-only" />
      <div ref={containerRef} className="xaurion-runtime__viewport" id="three-viewport" />
      <div className="xaurion-runtime__bridge-status" aria-live="polite">
        <span className="xaurion-connection-dot" data-connected={zoneStatus === "connected"} />
        <span>{webglError ? "Angehalten" : zoneStatus === "connected" ? worldLabel : zoneStatus === "connecting" ? "Verbindung wird hergestellt" : "Verbindung unterbrochen"}</span>
        <b className="sr-only">{zoneStatus === "connected" ? "BEWEGUNG VERBUNDEN" : "NICHT VERBUNDEN"}</b>
      </div>
      <button className="xaurion-runtime__return" type="button" onClick={() => window.dispatchEvent(new Event("aurion:xaurion-return-request"))}>
        <ArrowLeft size={18} /><span className="sr-only">ZUR STERNWARTE</span>
      </button>
      {celebration > 0 && <div className="xaurion-runtime__celebration" key={celebration} aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <span key={index} style={{ "--i": index } as React.CSSProperties}>✦</span>)}</div>}
      {webglError && <div className="xaurion-runtime__error" role="alert"><b>OPEN WORLD ANGEHALTEN</b><span>Bitte kehre zur Sternwarte zurück und öffne die Welt erneut. Vorgang {webglError}</span></div>}

      {!webglError && nearbySmith && <button className="ax1-npc-prompt" aria-label="Schmied ansprechen" onClick={requestWorldInteraction}><Hammer size={18} /> Schmied ansprechen <kbd>F</kbd></button>}
      {!webglError && user?.id && <AurionAuthorityHud userId={user.id} connected={zoneStatus === "connected"} position={confirmedPosition} remotePlayers={remotePlayers} onMove={handleVirtualMove} onAction={requestAuthoritativeAction} onInteract={requestWorldInteraction} />}
    </section>
  );
}
