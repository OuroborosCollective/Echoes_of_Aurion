// Legacy compatibility facade. Active mob content and FSM behavior are Aurion-owned; AX1/WASD names remain only for migrated provenance.
export { observatoryMobDefinitions } from "./ax1MobContent";
export {
  WASD_MOB_FSM_RULESET,
  WASD_MOB_LEASH_DISTANCE_FIXED as MOB_LEASH_DISTANCE_FIXED,
  WASD_MOB_EVADE_RETURN_DISTANCE_FIXED as MOB_EVADE_RETURN_DISTANCE_FIXED,
  WASD_MOB_COMBAT_DROPOFF_MULTIPLIER_BPS as MOB_COMBAT_DROPOFF_MULTIPLIER_BPS,
  applyMobCombatState,
  initialMobRuntimeState,
  mobDistance,
  nearestAggroTarget,
  publicMobSnapshot,
  resolveMobFsmTick,
  wasdMobAggroRadiusFixed,
  type MobDefinition,
  type MobRuntimeState,
  type WasdMobPosition,
} from "./wasdMobFsmProtocol";
