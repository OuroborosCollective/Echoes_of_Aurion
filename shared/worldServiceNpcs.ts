/** Static service definitions are published by the server's world snapshot.
 * Opening the smith projects the existing crafting service; item/XP writes still
 * require its authenticated, transactional crafting route.
 */
export const worldServiceNpcs = Object.freeze([Object.freeze({
  id: "observatory_blacksmith", name: "Sternwartenschmied", service: "crafting" as const,
  // Three metres beside the imported Royal Forge anvil at (0, -14), outside
  // its 1.4 m collision radius and clear of the furnace at (0, -17).
  targetKey: "npc_blacksmith", positionMm: Object.freeze({ x: 3000, z: -14000 }),
  heightMeters: 2, interactionRadiusMeters: 5,
})]);
export type WorldServiceNpc = (typeof worldServiceNpcs)[number];
