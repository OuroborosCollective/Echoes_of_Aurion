// Compatibility facade only. AX1 owns content in ax1MobContent; WASD owns all FSM laws.
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
