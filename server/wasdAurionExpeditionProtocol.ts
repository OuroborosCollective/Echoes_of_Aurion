import { createHash } from "node:crypto";

/** Pure, receipt-bound Aurion adapters for Wasd dungeon, monster, combat, magic and travel semantics. */
export type ExpeditionRoomKind = "hall" | "treasure_room" | "monster_lair" | "collapsed_passage" | "ancient_shrine";
export type ExpeditionRoom = { id: number; kind: ExpeditionRoomKind; danger: number; receiptHash: string };
export type ExpeditionLayout = { expeditionId: string; seed: string; tier: number; resolutionIndex: number; rooms: readonly ExpeditionRoom[]; receiptHash: string };
export type MonsterSpawn = { id: string; species: string; biome: "forest" | "mountain" | "desert"; strength: number; speed: number; aggression: number; intelligence: number; resilience: number; mutations: readonly string[]; receiptHash: string };
export type Combatant = { id: string; combatLevel: number; stamina: number; health: number; mana?: number };
export type CombatResolution = { state: "resolved" | "rejected"; reason?: "no_stamina" | "no_mana"; hit: boolean; damage: number; crit: boolean; attackerStamina: number; defenderHealth: number; receiptHash: string };
export type Spell = { id: string; kind: "fire" | "water" | "lightning" | "wind" | "earth"; cost: number; potency: number; effect: string };
export type SpellResolution = { state: "cast" | "rejected"; reason?: "no_mana"; potency: number; manaAfter: number; effect: string; receiptHash: string };
export type TravelPosition = { x: number; y: number; z: number };
export type TravelResolution = { position: TravelPosition; distance: number; receiptHash: string };

const roomKinds: readonly ExpeditionRoomKind[] = ["hall", "treasure_room", "monster_lair", "collapsed_passage", "ancient_shrine"];
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const clampInt = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Math.floor(Number.isFinite(value) ? value : low)));
const hash = (parts: readonly string[]) => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const unit = (seed: string, label: string) => parseInt(hash([seed, label]).slice(0, 8), 16) / 0xffffffff;

export function resolveExpeditionLayout(input: { expeditionId: string; seed: string; tier: number; resolutionIndex: number }): ExpeditionLayout {
  if (!input.expeditionId || !input.seed || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Expedition requires explicit id, seed and resolution index");
  const tier = clampInt(input.tier, 1, 10);
  const base = hash(["wasd:expedition:v1", input.expeditionId, input.seed, String(tier), String(input.resolutionIndex)]);
  const roomCount = 4 + Math.floor(unit(base, "room_count") * 6);
  const rooms = Array.from({ length: roomCount }, (_, id) => {
    const kind = roomKinds[Math.floor(unit(base, `kind:${id}`) * roomKinds.length)]!;
    const danger = 1 + ((id + tier) % 5);
    return { id, kind, danger, receiptHash: hash([base, String(id), kind, String(danger)]) };
  });
  return { expeditionId: input.expeditionId, seed: input.seed, tier, resolutionIndex: input.resolutionIndex, rooms, receiptHash: hash([base, ...rooms.map(room => room.receiptHash)]) };
}

export function resolveMonsterSpawn(input: { spawnerId: string; biome: MonsterSpawn["biome"]; packIndex: number; resolutionIndex: number }): MonsterSpawn {
  if (!input.spawnerId || !Number.isSafeInteger(input.packIndex) || !Number.isSafeInteger(input.resolutionIndex) || input.packIndex < 0 || input.resolutionIndex < 0) throw new Error("Monster spawn requires stable source inputs");
  const speciesTable: Record<MonsterSpawn["biome"], readonly string[]> = { forest: ["wolf", "boar"], mountain: ["stone_beast", "frost_wolf"], desert: ["sand_stalker", "scorpion"] };
  const seed = hash(["wasd:monster:v1", input.spawnerId, input.biome, String(input.packIndex), String(input.resolutionIndex)]);
  const species = speciesTable[input.biome][Math.floor(unit(seed, "species") * speciesTable[input.biome].length)]!;
  const mutations: string[] = [];
  if (input.biome === "mountain") mutations.push("frost_resistance");
  if (unit(seed, "rare") < 0.08) mutations.push("rare_variant");
  const stat = (name: string) => 4 + Math.floor(unit(seed, name) * 12);
  const id = `spawn_${seed.slice(0, 20)}`;
  return { id, species, biome: input.biome, strength: stat("strength"), speed: stat("speed"), aggression: stat("aggression"), intelligence: stat("intelligence"), resilience: stat("resilience"), mutations: mutations.sort(compare), receiptHash: hash([seed, id, species, ...mutations]) };
}

export function resolveCombatStrike(input: { action: "melee" | "spell"; attacker: Combatant; defender: Combatant; weaponBonus?: number; receiptId: string; resolutionIndex: number }): CombatResolution {
  if (!input.receiptId || !input.attacker.id || !input.defender.id || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Combat requires confirmed identity, receipt and resolution index");
  const stamina = clampInt(input.attacker.stamina, 0, 100000);
  const health = clampInt(input.defender.health, 0, 100000);
  if (input.action === "melee" && stamina <= 0) return { state: "rejected", reason: "no_stamina", hit: false, damage: 0, crit: false, attackerStamina: stamina, defenderHealth: health, receiptHash: hash(["wasd:combat:v1", input.receiptId, "no_stamina"]) };
  const attackerLevel = Math.max(1, clampInt(input.attacker.combatLevel, 1, 1000));
  const defenderLevel = Math.max(1, clampInt(input.defender.combatLevel, 1, 1000));
  const seed = hash(["wasd:combat:v1", input.action, input.attacker.id, input.defender.id, String(input.resolutionIndex), input.receiptId, String(stamina), String(health), String(input.weaponBonus ?? 0)]);
  const hitChance = Math.min(0.95, Math.max(0.3, 0.65 + ((attackerLevel - defenderLevel) / (attackerLevel + defenderLevel)) * 0.3));
  const hit = unit(seed, "hit") <= hitChance;
  const crit = hit && unit(seed, "crit") < 0.08;
  const damage = hit ? Math.max(1, 5 + attackerLevel + Math.max(0, Math.floor(input.weaponBonus ?? 0)) - Math.floor(defenderLevel * 0.3) + Math.floor(unit(seed, "damage") * 4)) * (crit ? 1.75 : 1) : 0;
  const finalDamage = Math.floor(damage);
  return { state: "resolved", hit, damage: finalDamage, crit, attackerStamina: Math.max(0, stamina - (input.action === "melee" ? 8 : 0)), defenderHealth: Math.max(0, health - finalDamage), receiptHash: hash([seed, String(hit), String(finalDamage), String(crit)]) };
}

export function resolveSpellCast(input: { caster: Combatant; spell: Spell; weatherTone: "clear" | "rain" | "storm" | "ashfall"; receiptId: string; resolutionIndex: number }): SpellResolution {
  if (!input.receiptId || !input.caster.id || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Spell requires confirmed identity, receipt and resolution index");
  const mana = clampInt(input.caster.mana ?? 0, 0, 100000);
  if (mana < input.spell.cost) return { state: "rejected", reason: "no_mana", potency: 0, manaAfter: mana, effect: input.spell.effect, receiptHash: hash(["wasd:magic:v1", input.receiptId, "no_mana"]) };
  const multiplier: Record<Spell["kind"], Record<typeof input.weatherTone, number>> = {
    fire: { clear: 1, rain: 0.8, storm: 0.85, ashfall: 1.15 }, water: { clear: 1, rain: 1.15, storm: 1.2, ashfall: 0.9 }, lightning: { clear: 1, rain: 1.1, storm: 1.3, ashfall: 0.9 }, wind: { clear: 1, rain: 1.05, storm: 1.2, ashfall: 0.9 }, earth: { clear: 1, rain: 1.05, storm: 0.95, ashfall: 1.1 },
  };
  const value = Math.max(1, Math.floor(Math.max(0, input.spell.potency) * multiplier[input.spell.kind][input.weatherTone]));
  return { state: "cast", potency: value, manaAfter: mana - Math.max(0, Math.floor(input.spell.cost)), effect: input.spell.effect, receiptHash: hash(["wasd:magic:v1", input.receiptId, input.spell.id, String(input.resolutionIndex), String(value)]) };
}

export function resolveMountTravel(input: { position: TravelPosition; direction: TravelPosition; speed: number; receiptId: string; resolutionIndex: number }): TravelResolution {
  if (!input.receiptId || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 0) throw new Error("Travel requires a confirmed receipt and resolution index");
  const speed = Math.max(0, Math.min(64, Number.isFinite(input.speed) ? input.speed : 0));
  const position = { x: input.position.x + input.direction.x * speed, y: input.position.y + input.direction.y * speed, z: input.position.z + input.direction.z * speed };
  const distance = Math.sqrt(input.direction.x ** 2 + input.direction.y ** 2 + input.direction.z ** 2) * speed;
  return { position, distance, receiptHash: hash(["wasd:travel:v1", input.receiptId, String(input.resolutionIndex), String(position.x), String(position.y), String(position.z)]) };
}
