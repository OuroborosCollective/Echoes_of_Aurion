import type { Engine } from "@babylonjs/core/Engines/engine";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

import { createGameScene as createBaseGameScene, type GameHandle } from "./scene";
import { STARTER_CHARACTER_ASSETS, type StarterRuntimeAssetSources } from "./starterCharacterAssets";
import { StarterCreatureVisuals } from "./starterCreatureVisuals";

const PLAYER_ANIMATION_NAMES = new Set<string>(STARTER_CHARACTER_ASSETS.player.animations);
const EMPTY_STARTER_SOURCES: StarterRuntimeAssetSources = Object.freeze({
  player: null,
  spider: null,
  beastLods: Object.freeze([null, null, null, null]),
});

type MissionStateDetail = {
  arena?: number;
  sentinelHp?: number;
  explorerHp?: number;
};

type GameEventDetail = {
  kind?: string;
  audio?: { cue?: string };
};

type AuthoritativeActionDetail = {
  command?: string;
  source?: string;
};

function playerAnimationForState(groups: AnimationGroup[], desired: "Idle" | "Run" | "AttackCombo" | "Death"): AnimationGroup | undefined {
  const exact = (name: string) => groups.find(group => group.name === name) ?? groups.find(group => group.name.toLowerCase() === name.toLowerCase());
  if (desired === "Run") return exact("Run") ?? exact("Walk") ?? exact("Idle");
  if (desired === "AttackCombo") return exact("AttackCombo") ?? exact("Fight") ?? exact("Idle");
  if (desired === "Death") return exact("Death") ?? exact("Idle");
  return exact("Idle") ?? groups[0];
}

export async function createGameScene(
  engine: Engine,
  canvas: HTMLCanvasElement,
  requestedCharacterModelUrl?: string,
  starterSources: StarterRuntimeAssetSources = EMPTY_STARTER_SOURCES,
): Promise<GameHandle> {
  const base = await createBaseGameScene(engine, canvas);
  const { scene } = base;
  const explorer = scene.getTransformNodeByName("explorer-root");
  const sentinel = scene.getTransformNodeByName("sentinel-root");

  let playerAnimations: AnimationGroup[] = [];
  let activePlayerAnimation: AnimationGroup | null = null;
  let currentPlayerSource: string | null | undefined = undefined;
  let explorerHp = 100;
  let sentinelHp = 1;
  let arenaIndex = 0;
  let playerAttackUntil = 0;
  let creatureAttackUntil = 0;
  let disposed = false;

  const setCharacterModel = async (sourceUrl?: string): Promise<void> => {
    const customSource = sourceUrl?.trim();
    const defaultSource = starterSources.player?.storageUrl;
    const sourceIdentity = customSource || defaultSource || null;
    if (currentPlayerSource === sourceIdentity && currentPlayerSource !== undefined) return;

    const previousGroups = new Set(scene.animationGroups);
    if (!sourceIdentity) {
      await base.setCharacterModel(undefined);
      currentPlayerSource = null;
      playerAnimations = [];
      activePlayerAnimation = null;
      window.dispatchEvent(new CustomEvent("aurion:starter-character-status", { detail: { active: false, source: "procedural", defaultAsset: true } }));
      return;
    }

    await base.setCharacterModel(sourceIdentity);
    playerAnimations = scene.animationGroups.filter(group => !previousGroups.has(group) && PLAYER_ANIMATION_NAMES.has(group.name));
    currentPlayerSource = sourceIdentity;
    activePlayerAnimation = null;
    const idle = playerAnimationForState(playerAnimations, "Idle");
    if (idle) {
      playerAnimations.forEach(group => group.stop());
      idle.start(true, 1);
      activePlayerAnimation = idle;
    }
    window.dispatchEvent(new CustomEvent("aurion:starter-character-status", { detail: {
      active: true,
      source: sourceIdentity,
      defaultAsset: !customSource,
      assetId: !customSource ? starterSources.player?.assetId ?? null : null,
      animations: playerAnimations.map(group => group.name),
    } }));
  };

  try {
    await setCharacterModel(requestedCharacterModelUrl);
  } catch (error) {
    await base.setCharacterModel(undefined).catch(() => undefined);
    currentPlayerSource = null;
    playerAnimations = [];
    console.warn("[Aurion starter characters] Standard-/Auswahlcharakter konnte nicht geladen werden; prozeduraler Explorer bleibt aktiv.", error);
    window.dispatchEvent(new CustomEvent("aurion:starter-character-status", { detail: { active: false, source: requestedCharacterModelUrl?.trim() || starterSources.player?.storageUrl || "procedural" } }));
  }

  const creatureVisuals = sentinel ? new StarterCreatureVisuals(scene, sentinel, starterSources) : null;
  const proceduralSentinelNodes = [
    "sentinel-torso",
    "sentinel-shoulder-0",
    "sentinel-shoulder-1",
    "sentinel-hip-0",
    "sentinel-hip-1",
  ].map(name => scene.getTransformNodeByName(name)).filter((node): node is TransformNode => Boolean(node));

  const syncCreatureArena = (): void => {
    if (!creatureVisuals) return;
    const usingGlb = creatureVisuals.setArena(arenaIndex);
    proceduralSentinelNodes.forEach(node => node.setEnabled(!usingGlb));
    window.dispatchEvent(new CustomEvent("aurion:starter-creature-status", { detail: { active: usingGlb, arenaIndex } }));
  };

  if (creatureVisuals) {
    void creatureVisuals.load().then(() => {
      if (!disposed) syncCreatureArena();
    }).catch(error => {
      console.warn("[Aurion starter characters] Starter-Monster-GLBs konnten nicht geladen werden; Sentinel-Fallback bleibt aktiv.", error);
      proceduralSentinelNodes.forEach(node => node.setEnabled(true));
      window.dispatchEvent(new CustomEvent("aurion:starter-creature-status", { detail: { active: false, arenaIndex, error: "load_failed" } }));
    });
  }

  const onMissionState = (event: Event): void => {
    const detail = (event as CustomEvent<MissionStateDetail>).detail;
    if (typeof detail?.arena === "number" && detail.arena !== arenaIndex) {
      arenaIndex = detail.arena;
      syncCreatureArena();
    }
    if (typeof detail?.sentinelHp === "number") sentinelHp = detail.sentinelHp;
    if (typeof detail?.explorerHp === "number") explorerHp = detail.explorerHp;
  };
  const onGameEvent = (event: Event): void => {
    const detail = (event as CustomEvent<GameEventDetail>).detail;
    if (detail?.audio?.cue === "combat.creature.monster.attack") creatureAttackUntil = performance.now() + 520;
  };
  const onHumanAction = (event: Event): void => {
    const command = (event as CustomEvent<{ code?: string }>).detail?.code;
    if (command === "F") playerAttackUntil = performance.now() + 420;
  };
  const onAuthoritativeAction = (event: Event): void => {
    const detail = (event as CustomEvent<AuthoritativeActionDetail>).detail;
    if (detail?.command === "F" && (detail.source ?? "gateway") === "human") playerAttackUntil = performance.now() + 420;
  };
  window.addEventListener("aurion:mission-state", onMissionState);
  window.addEventListener("aurion:game-event", onGameEvent);
  window.addEventListener("aurion:human-action", onHumanAction);
  window.addEventListener("aurion:authoritative-action", onAuthoritativeAction);

  let lastExplorerPosition = explorer?.position.clone() ?? Vector3.Zero();
  let lastSentinelPosition = sentinel?.position.clone() ?? Vector3.Zero();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const explorerMoving = explorer ? Vector3.DistanceSquared(explorer.position, lastExplorerPosition) > 0.000001 : false;
    const creatureMoving = sentinel ? Vector3.DistanceSquared(sentinel.position, lastSentinelPosition) > 0.000001 : false;
    if (explorer) lastExplorerPosition.copyFrom(explorer.position);
    if (sentinel) lastSentinelPosition.copyFrom(sentinel.position);

    if (playerAnimations.length) {
      const desired = explorerHp <= 0 ? "Death" : now < playerAttackUntil ? "AttackCombo" : explorerMoving ? "Run" : "Idle";
      const group = playerAnimationForState(playerAnimations, desired);
      if (group && group !== activePlayerAnimation) {
        playerAnimations.forEach(animation => animation.stop());
        group.start(desired !== "Death", 1);
        activePlayerAnimation = group;
      }
    }

    if (creatureVisuals && explorer && sentinel) {
      creatureVisuals.update({
        distanceMeters: Vector3.Distance(explorer.position, sentinel.position),
        moving: creatureMoving,
        attacking: now < creatureAttackUntil,
        dead: sentinelHp <= 0,
      });
    }
  });

  return {
    scene,
    setCharacterModel,
    setArenaModel: base.setArenaModel,
    dispose: () => {
      disposed = true;
      scene.onBeforeRenderObservable.remove(observer);
      window.removeEventListener("aurion:mission-state", onMissionState);
      window.removeEventListener("aurion:game-event", onGameEvent);
      window.removeEventListener("aurion:human-action", onHumanAction);
      window.removeEventListener("aurion:authoritative-action", onAuthoritativeAction);
      creatureVisuals?.dispose();
      base.dispose();
    },
  };
}
