extends RefCounted
## Wire-only v5 projection. The Aurion gateway is the sole game authority.
const ZONE := "observatory_threshold"
const VERSION := 5
const MAX_CLIENT_BYTES := 2048
const MAX_BROWSER_SNAPSHOT_CODE_UNITS := 65536
const FIXED_CONTENT := "286c575d3d0050ffa77b794d5b7a7e24858acee8"
const NODE_IDS := ["node_beast_1","node_copper_1","node_cotton_1","node_iron_1","node_steel_1"]
const REJECT_CODES := ["INVALID_MESSAGE", "STALE_CLIENT_SEQUENCE", "UNSUPPORTED_ZONE_COMMAND", "PROTOCOL_VERSION_UNSUPPORTED", "INVALID_COMBAT_TARGET", "COMBAT_TARGET_OUT_OF_RANGE", "COMBATANT_DEAD", "INVALID_COMBAT_SKILL", "COMBAT_SKILL_COOLDOWN"]

static func valid_hello(ticket: String) -> Dictionary:
	if ticket.length() < 24 or ticket.length() > 160:
		return {}
	return {"type": "hello", "ticket": ticket, "zoneId": ZONE, "protocolVersion": VERSION}

static func serialized_hello(ticket: String) -> String:
	var data := valid_hello(ticket)
	if data.is_empty():
		return ""
	var encoded := JSON.stringify(data)
	if encoded.to_utf8_buffer().size() > MAX_CLIENT_BYTES:
		return ""
	return encoded

## The original lexical wire representation must be checked before JSON.parse_string()
## rounds fractional tokens into IEEE-754 integers. Strings and escapes are
## skipped; JSON.parse_string remains responsible for structural validation.
static func wire_numbers_are_integers(wire: String) -> bool:
	var inside_string := false
	var escaped := false
	var index := 0
	while index < wire.length():
		var ch := wire[index]
		if inside_string:
			if escaped:
				escaped = false
			elif ch == "\\":
				escaped = true
			elif ch == "\"":
				inside_string = false
			index += 1
			continue
		if ch == "\"":
			inside_string = true
			index += 1
			continue
		if ch == "-" or (ch >= "0" and ch <= "9"):
			var started := index
			if ch == "-":
				index += 1
			while index < wire.length() and wire[index] >= "0" and wire[index] <= "9":
				index += 1
			if index == started or (index == started + 1 and ch == "-"):
				return false
			# Deny any fractional or exponential notation even when a float
			# would round to an exact integer after parsing.
			if index < wire.length() and wire[index] in [".", "e", "E"]:
				return false
			continue
		index += 1
	return not inside_string

static func is_valid_reject(raw: Variant) -> bool:
	return typeof(raw) == TYPE_DICTIONARY and raw.get("type") == "reject" and typeof(raw.get("code")) == TYPE_STRING and raw.get("code") in REJECT_CODES

static func _valid_player_entity_id(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING:
		return false
	var entity_id: String = value
	if not entity_id.begins_with("player:"):
		return false
	var digits := entity_id.substr(7)
	if digits.is_empty() or digits[0] < "1" or digits[0] > "9":
		return false
	for index in range(1, digits.length()):
		if digits[index] < "0" or digits[index] > "9":
			return false
	return true

static func _safe_nonnegative(value: Variant) -> bool:
	return (typeof(value) == TYPE_INT or (typeof(value) == TYPE_FLOAT and is_finite(value) and value == floor(value))) and value >= 0 and value <= 9007199254740991

static func _valid_position(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return false
	var x: Variant = value.get("x")
	var z: Variant = value.get("z")
	if typeof(x) not in [TYPE_INT, TYPE_FLOAT] or typeof(z) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	return _safe_nonnegative(abs(x)) and _safe_nonnegative(abs(z)) and x >= -64000032000 and x <= 64000031999 and z >= -64000032000 and z <= 64000031999

static func _valid_resources(value: Variant, tick: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return false
	if value.get("contractVersion") != 1 or value.get("contentSourceRevision") != FIXED_CONTENT or not _safe_nonnegative(value.get("revision")) or value.get("revision") == 0:
		return false
	var nodes: Variant = value.get("nodes")
	if typeof(nodes) != TYPE_ARRAY or nodes.size() != 5:
		return false
	var found: Array[String] = []
	for node in nodes:
		if typeof(node) != TYPE_DICTIONARY or node.get("nodeId") not in NODE_IDS or not _safe_nonnegative(node.get("remaining")) or typeof(node.get("depleted")) != TYPE_BOOL:
			return false
		if node["remaining"] > 5 or node["nodeId"] in found:
			return false
		var respawn: Variant = node.get("respawnAtTick", "missing")
		if respawn != null and (not _safe_nonnegative(respawn) or respawn == 0):
			return false
		if node["depleted"] != (node["remaining"] == 0):
			return false
		if node["depleted"] and (respawn == null or respawn <= tick):
			return false
		if not node["depleted"] and respawn != null:
			return false
		found.append(node["nodeId"])
	return true

static func _positive(value: Variant) -> bool:
	return _safe_nonnegative(value) and value > 0

static func _valid_mob_id(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING:
		return false
	var id: String = value
	if not id.begins_with("mob_"):
		return false
	var suffix := id.substr(4)
	if suffix.is_empty() or suffix.length() > 3 or suffix[0] < "1" or suffix[0] > "9":
		return false
	for i in range(1, suffix.length()):
		if suffix[i] < "0" or suffix[i] > "9":
			return false
	return true

static func _valid_entity_id(value: Variant) -> bool:
	return _valid_player_entity_id(value) or _valid_mob_id(value)

static func _valid_presence(raw: Variant) -> bool:
	if typeof(raw) != TYPE_DICTIONARY:
		return false
	return _valid_player_entity_id(raw.get("entityId")) and _positive(raw.get("userId")) and raw.get("entityId") == "player:" + str(int(raw.get("userId"))) and _valid_position(raw.get("position")) and _safe_nonnegative(raw.get("lastAcceptedClientSeq")) and raw.get("lastAcceptedClientSeq") <= 2147483647

static func _valid_mob(raw: Variant) -> bool:
	if typeof(raw) != TYPE_DICTIONARY:
		return false
	if not _valid_mob_id(raw.get("entityId")) or raw.get("archetype") not in ["clockwork_stalker", "corrupted_golem", "aether_wisp", "steam_drake", "centurion_elite", "titan_boss"]:
		return false
	if not _positive(raw.get("level")) or raw.get("level") > 10000 or raw.get("state") not in ["idle", "patrolling", "combat", "evading", "dead"]:
		return false
	if not _valid_position(raw.get("position")) or not raw.has("targetEntityId"):
		return false
	if raw["targetEntityId"] != null and not _valid_player_entity_id(raw["targetEntityId"]):
		return false
	if typeof(raw.get("isBoss")) != TYPE_BOOL or typeof(raw.get("isElite")) != TYPE_BOOL or not _safe_nonnegative(raw.get("health")) or not _positive(raw.get("maxHealth")):
		return false
	if raw["health"] > raw["maxHealth"] or (raw["isBoss"] and not raw["isElite"]):
		return false
	if raw["state"] == "dead" and (raw["health"] != 0 or raw["targetEntityId"] != null):
		return false
	if raw["state"] != "combat" and raw["targetEntityId"] != null:
		return false
	return true

static func _valid_combatant(raw: Variant) -> bool:
	if typeof(raw) != TYPE_DICTIONARY or not _valid_entity_id(raw.get("entityId")):
		return false
	if not _safe_nonnegative(raw.get("health")) or not _positive(raw.get("maxHealth")) or not _safe_nonnegative(raw.get("stamina")) or not _positive(raw.get("maxStamina")):
		return false
	return typeof(raw.get("alive")) == TYPE_BOOL and raw["health"] <= raw["maxHealth"] and raw["stamina"] <= raw["maxStamina"] and raw["alive"] == (raw["health"] > 0) and _positive(raw.get("combatLevel")) and raw.get("combatLevel") <= 10000 and _safe_nonnegative(raw.get("lastCombatSequence"))

static func is_valid_zone_state(raw: Variant) -> bool:
	if typeof(raw) != TYPE_DICTIONARY or raw.get("zoneId") != ZONE:
		return false
	if not _safe_nonnegative(raw.get("snapshotSeq")) or not _safe_nonnegative(raw.get("tick")):
		return false
	for key in ["presences", "mobs", "combatants"]:
		if typeof(raw.get(key)) != TYPE_ARRAY:
			return false
	if raw["presences"].size() > 128 or raw["mobs"].size() > 32 or raw["combatants"].size() > 160:
		return false
	if not _valid_resources(raw.get("resources"), raw["tick"]):
		return false
	var seen: Dictionary = {}
	for item in raw["presences"]:
		if not _valid_presence(item):
			return false
		var id: String = item["entityId"]
		if seen.has(id):
			return false
		seen[id] = true
	seen.clear()
	for item in raw["mobs"]:
		if not _valid_mob(item):
			return false
		var id: String = item["entityId"]
		if seen.has(id):
			return false
		seen[id] = true
	seen.clear()
	for item in raw["combatants"]:
		if not _valid_combatant(item):
			return false
		var id: String = item["entityId"]
		if seen.has(id):
			return false
		seen[id] = true
	return true

static func is_valid_snapshot(raw: Variant) -> bool:
	return typeof(raw) == TYPE_DICTIONARY and raw.get("type") == "snapshot" and is_valid_zone_state(raw)

static func is_valid_welcome(raw: Variant) -> bool:
	if typeof(raw) != TYPE_DICTIONARY:
		return false
	if raw.get("type") != "welcome" or raw.get("protocolVersion") != VERSION or raw.get("zoneId") != ZONE:
		return false
	var conn: Variant = raw.get("connectionId")
	var entity: Variant = raw.get("selfEntityId")
	if typeof(conn) != TYPE_STRING or conn.length() < 12 or conn.length() > 96 or typeof(entity) != TYPE_STRING:
		return false
	if not conn.begins_with("zone_peer_") or not _valid_player_entity_id(entity):
		return false
	return is_valid_zone_state(raw)
