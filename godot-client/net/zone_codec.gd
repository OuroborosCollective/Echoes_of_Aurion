extends RefCounted
## Wire-only v5 projection. The Aurion gateway is the sole game authority.
const ZONE := "observatory_threshold"
const VERSION := 5
const MAX_CLIENT_BYTES := 2048
const MAX_BROWSER_SNAPSHOT_CODE_UNITS := 65536
const FIXED_CONTENT := "286c575d3d0050ffa77b794d5b7a7e24858acee8"
const NODE_IDS := ["node_beast_1","node_copper_1","node_cotton_1","node_iron_1","node_steel_1"]

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

static func _safe_nonnegative(value: Variant) -> bool:
	return typeof(value) == TYPE_INT and value >= 0 and value <= 9007199254740991

static func _valid_position(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return false
	return typeof(value.get("x")) == TYPE_INT and typeof(value.get("z")) == TYPE_INT and abs(value["x"]) <= 64000032000 and abs(value["z"]) <= 64000032000

static func _valid_resources(value: Variant) -> bool:
	if typeof(value) != TYPE_DICTIONARY:
		return false
	if value.get("contractVersion") != 1 or value.get("contentSourceRevision") != FIXED_CONTENT or not _safe_nonnegative(value.get("revision")):
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
		found.append(node["nodeId"])
	return true

static func is_valid_welcome(raw: Variant) -> bool:
	if typeof(raw) != TYPE_DICTIONARY:
		return false
	if raw.get("type") != "welcome" or raw.get("protocolVersion") != VERSION or raw.get("zoneId") != ZONE:
		return false
	var conn: Variant = raw.get("connectionId")
	var entity: Variant = raw.get("selfEntityId")
	if typeof(conn) != TYPE_STRING or conn.length() < 12 or conn.length() > 96 or typeof(entity) != TYPE_STRING:
		return false
	if not conn.begins_with("zone_peer_") or not entity.begins_with("player:") or entity.length() <= 7:
		return false
	if not _safe_nonnegative(raw.get("snapshotSeq")) or not _safe_nonnegative(raw.get("tick")):
		return false
	for key in ["presences","mobs","combatants"]:
		if typeof(raw.get(key)) != TYPE_ARRAY:
			return false
	if raw["presences"].size() > 128 or raw["mobs"].size() > 32 or raw["combatants"].size() > 160:
		return false
	if not _valid_resources(raw.get("resources")):
		return false
	# Later G10 slices must validate every nested entity before exposing it.
	# Fail closed until the full nested v5 schema is checked.
	if not raw["presences"].is_empty() or not raw["mobs"].is_empty() or not raw["combatants"].is_empty():
		return false
	return true
