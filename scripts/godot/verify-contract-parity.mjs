import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = relative => readFile(path.join(root, relative), "utf8");
const [schemaText, protocol, gateway, presence, timing, movement, mob, combat, resource, telegraph, skills, ecology, worldChunk, godotTest] = await Promise.all([
  read("godot-client/net/contracts/zone_v5.schema.json"),
  read("server/zoneProtocol.ts"),
  read("server/zoneGateway.ts"),
  read("shared/zonePresenceContract.ts"),
  read("shared/zoneTimingContract.ts"),
  read("client/src/lib/zoneMovement.ts"),
  read("shared/zoneMobContract.ts"),
  read("shared/zoneCombatContract.ts"),
  read("shared/zoneResourceContract.ts"),
  read("shared/zoneTelegraphContract.ts"),
  read("shared/ax1BladeSkillProtocol.ts"),
  read("shared/ax1ResourceEcologyProtocol.ts"),
  read("shared/worldChunkProtocol.ts"),
  read("godot-client/tests/contracts/test_zone_contract.gd"),
]);
const schema = JSON.parse(schemaText);
const defs = schema.$defs;
const limits = schema["x-aurion-wire-limits"];
const expectText = (text, fragment, label) => assert.ok(text.includes(fragment), `${label}: missing ${fragment}`);
const captureNumber = (text, expression, label) => {
  const match = text.match(expression);
  assert.ok(match, `${label}: numeric constant not found`);
  return Number(match[1].replaceAll("_", ""));
};
const captureString = (text, expression, label) => {
  const match = text.match(expression);
  assert.ok(match, `${label}: string constant not found`);
  return match[1];
};

assert.equal(limits.path, "/v1/ws");
assert.equal(limits.protocol_version, 5);
assert.equal(limits.tick_ms, 100);
assert.equal(limits.fixed_point_units_per_meter, 1000);
assert.equal(limits.client_message_utf8_bytes_max, 2048);
assert.equal(limits.browser_snapshot_utf16_code_units_max, 65536);
assert.equal(limits.hello_timeout_ms, 5000);
assert.equal(defs.clientSequence.maximum, 2147483647);
assert.deepEqual(defs.zoneMove.properties.input.properties.x.enum, [-1, 0, 1]);
assert.deepEqual(defs.zoneMove.properties.input.properties.z.enum, [-1, 0, 1]);

assert.equal(limits.protocol_version, captureNumber(presence, /ZONE_PROTOCOL_VERSION\s*=\s*([0-9_]+)/, "protocol version"));
assert.equal(limits.tick_ms, captureNumber(timing, /ZONE_TICK_MS\s*=\s*([0-9_]+)/, "tick interval"));
assert.equal(limits.fixed_point_units_per_meter, captureNumber(protocol, /ZONE_FIXED_POINT_SCALE=([0-9_]+)/, "fixed-point scale"));
assert.equal(limits.client_message_utf8_bytes_max, captureNumber(gateway, /MAX_MESSAGE_BYTES=([0-9_]+)/, "incoming byte limit"));
assert.equal(limits.browser_snapshot_utf16_code_units_max, captureNumber(presence, /ZONE_SNAPSHOT_MAX_CHARACTERS\s*=\s*([0-9_]+)/, "snapshot limit"));
assert.equal(limits.hello_timeout_ms, captureNumber(gateway, /HELLO_TIMEOUT_MS=([0-9_]+)/, "hello timeout"));
assert.equal(defs.zoneState.properties.presences.maxItems, captureNumber(presence, /ZONE_MAX_PRESENCES\s*=\s*([0-9_]+)/, "presence maximum"));
assert.equal(defs.zoneState.properties.mobs.maxItems, captureNumber(mob, /ZONE_MAX_MOBS\s*=\s*([0-9_]+)/, "mob maximum"));
assert.equal(defs.zoneState.properties.combatants.maxItems, captureNumber(combat, /ZONE_MAX_COMBATANTS\s*=\s*([0-9_]+)/, "combatant maximum"));
assert.equal(defs.combatEvent.properties.contractVersion.const, captureString(combat, /ZONE_COMBAT_CONTRACT_VERSION\s*=\s*"([^"]+)"/, "combat version"));
assert.equal(defs.telegraphEvent.properties.contractVersion.const, captureString(telegraph, /ZONE_TELEGRAPH_CONTRACT_VERSION\s*=\s*"([^"]+)"/, "telegraph version"));
assert.equal(defs.telegraphEvent.properties.authorityRuleset.const, captureString(telegraph, /ZONE_TELEGRAPH_AUTHORITY_RULESET\s*=\s*"([^"]+)"/, "telegraph authority ruleset"));
const skillRevision = captureString(skills, /AX1_BLADE_SKILL_SOURCE_REVISION\s*=\s*"([0-9a-f]+)"/, "skill revision");
const ecologyRevision = captureString(ecology, /AX1_ECOLOGY_SOURCE_REVISION\s*=\s*"([0-9a-f]+)"/, "ecology revision");
assert.equal(defs.combatEvent.properties.skillSourceRevision.oneOf[1].const, skillRevision);
assert.equal(defs.resources.properties.contentSourceRevision.const, ecologyRevision);
assert.equal(defs.telegraphEvent.properties.visualSourceRevision.const, ecologyRevision);
const sourceSkills = [...skills.matchAll(/skillId:\s*"([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(defs.zoneSkill.properties.skillId.enum, sourceSkills);
const sourceNodes = [...ecology.matchAll(/node\(\{ id:\s*"([^"]+)"/g)].map(match => match[1]).sort();
assert.deepEqual(defs.resourceNode.properties.nodeId.enum, sourceNodes);
assert.equal(defs.resources.properties.nodes.minItems, sourceNodes.length);
assert.equal(defs.resources.properties.nodes.maxItems, sourceNodes.length);
const chunkSize = captureNumber(worldChunk, /WORLD_CHUNK_SIZE_MM\s*=\s*([0-9_]+)/, "chunk size");
const chunkLimit = captureNumber(worldChunk, /WORLD_CHUNK_COORDINATE_LIMIT\s*=\s*([0-9_]+)/, "chunk coordinate limit");
assert.equal(defs.worldPosition.properties.x.minimum, -chunkLimit * chunkSize - chunkSize / 2);
assert.equal(defs.worldPosition.properties.x.maximum, chunkLimit * chunkSize + chunkSize / 2 - 1);
assert.deepEqual(defs.worldPosition.properties.x, defs.worldPosition.properties.z);

expectText(protocol, "z.literal(\"observatory_threshold\")", "zone id");
expectText(protocol, "ZONE_FIXED_POINT_SCALE=1_000", "fixed-point scale");
expectText(protocol, "max(2_147_483_647)", "client sequence maximum");
expectText(gateway, "MAX_MESSAGE_BYTES=2_048", "incoming byte limit");
expectText(gateway, "HELLO_TIMEOUT_MS=5_000", "hello timeout");
expectText(gateway, "pathname!==\"/v1/ws\"", "websocket path");
expectText(presence, "ZONE_PROTOCOL_VERSION = 5", "protocol version");
expectText(presence, "ZONE_SNAPSHOT_MAX_CHARACTERS = 65_536", "browser snapshot limit");
expectText(timing, "ZONE_TICK_MS = 100", "tick interval");
expectText(movement, "raw.length>ZONE_SNAPSHOT_MAX_CHARACTERS", "browser UTF-16 guard");
expectText(mob, "ZONE_MAX_MOBS = 32", "mob maximum");
expectText(combat, "ZONE_MAX_COMBATANTS = 160", "combatant maximum");
expectText(combat, "wasd-zone-combat.v2", "combat version");
expectText(resource, "ZONE_RESOURCE_CONTRACT_VERSION = 1", "resource version");
expectText(telegraph, "aurion-zone-telegraph.v1", "telegraph version");
expectText(skills, "d356881538dae23c3aa97364a5596d48b6ac3079", "skill revision");
expectText(ecology, "286c575d3d0050ffa77b794d5b7a7e24858acee8", "ecology revision");

for (const marker of [
  "PROTOCOL_VERSION := 5",
  "TICK_MS := 100",
  "MAX_CLIENT_MESSAGE_BYTES := 2048",
  "MAX_BROWSER_SNAPSHOT_UTF16_UNITS := 65536",
  "MAX_CLIENT_SEQUENCE := 2147483647",
]) expectText(godotTest, marker, "Godot contract marker");

const isInteger = value => Number.isSafeInteger(value);
function validClientMessage(message) {
  if (!message || typeof message !== "object") return false;
  if (message.type === "hello") return typeof message.ticket === "string" && message.ticket.length >= 24 && message.ticket.length <= 160 && message.zoneId === "observatory_threshold" && message.protocolVersion === 5;
  if (!isInteger(message.clientSeq) || message.clientSeq < 1 || message.clientSeq > 2147483647) return false;
  if (message.type === "move") return message.input && [-1, 0, 1].includes(message.input.x) && [-1, 0, 1].includes(message.input.z);
  if (message.type === "attack") return /^mob_[1-9][0-9]{0,2}$/.test(message.targetEntityId);
  if (message.type === "skill") return defs.zoneSkill.properties.skillId.enum.includes(message.skillId) && (message.targetEntityId === undefined || /^mob_[1-9][0-9]{0,2}$/.test(message.targetEntityId));
  return false;
}
const ticket = `aurion_zone_${"a".repeat(43)}`;
assert.equal(validClientMessage({ type: "hello", ticket, zoneId: "observatory_threshold", protocolVersion: 5 }), true);
assert.equal(validClientMessage({ type: "hello", ticket, zoneId: "observatory_threshold", protocolVersion: 4 }), false);
assert.equal(validClientMessage({ type: "move", clientSeq: 1, input: { x: -1, z: 1 } }), true);
assert.equal(validClientMessage({ type: "move", clientSeq: 1, input: { x: 2, z: 0 } }), false);
assert.equal(validClientMessage({ type: "attack", clientSeq: 0, targetEntityId: "mob_1" }), false);
assert.equal(validClientMessage({ type: "skill", clientSeq: 2, skillId: "invented" }), false);

const unicodeProbe = "😀".repeat(1024);
assert.equal(unicodeProbe.length, 2048, "JavaScript length must be UTF-16 code units");
assert.equal(Buffer.byteLength(unicodeProbe, "utf8"), 4096, "UTF-8 bytes must remain distinct from UTF-16 units");
assert.ok(Buffer.byteLength(JSON.stringify({ type: "probe", value: unicodeProbe }), "utf8") > limits.client_message_utf8_bytes_max);

console.log("zone-v5 contract parity verified");

