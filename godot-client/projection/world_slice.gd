extends RefCounted
## Strict read-only v1 public DTO. No seed, collision, inventory or foreign entity.
const Chunk = preload("res://world/chunk_terrain.gd")
const MAX_BYTES := 65536
const SAFE := 9007199254740991

static func _keys(value: Variant, names: Array) -> bool:
	if typeof(value) != TYPE_DICTIONARY or value.size() != names.size():
		return false
	for key in names:
		if not value.has(key):
			return false
	return true

static func _sha(value: Variant) -> bool:
	return typeof(value) == TYPE_STRING and value.begins_with("sha256:") and Chunk._hex(value.substr(7), 64)

static func _coord(value: Variant, bound: int = 1000000) -> bool:
	return _keys(value, ["x", "z"]) and Chunk._whole(value.x, -bound, bound) and Chunk._whole(value.z, -bound, bound)

static func _id(value: Variant) -> bool:
	return typeof(value) == TYPE_STRING and not value.is_empty() and value.length() <= 128

static func _actor(value: Variant) -> bool:
	if typeof(value) != TYPE_STRING or not value.begins_with("player:"):
		return false
	var suffix: String = value.substr(7)
	return not suffix.is_empty() and suffix.length() <= 16 and suffix[0] != "0" and suffix.is_valid_int() and suffix.to_int() > 0 and str(suffix.to_int()) == suffix

static func valid(reply: Variant, actor_id: String, connection: String, coordinate: Vector2i) -> bool:
	if not _actor(actor_id) or connection.is_empty() or not _keys(reply, ["status", "connectionId", "slice", "fingerprint", "mutationAuthority"]):
		return false
	if JSON.stringify(reply).to_utf8_buffer().size() > MAX_BYTES or reply.connectionId != connection or reply.mutationAuthority != "none" or not _sha(reply.fingerprint):
		return false
	var s: Variant = reply.slice
	if not _keys(s, ["schema", "policy", "worldId", "zoneId", "actorId", "epoch", "worldRoot", "sourceRevision", "observedAtTick", "coordinate", "radius", "lod", "knowledgeHash", "chunks", "entities"]):
		return false
	if s.schema != "aurion.world-slice.v1" or s.policy != "actor-observed-current-epoch.v1" or s.worldId != "echoes-of-aurion-global" or s.zoneId != "observatory_threshold" or s.actorId != actor_id:
		return false
	if not _coord(s.coordinate) or s.coordinate.x != coordinate.x or s.coordinate.z != coordinate.y or not Chunk._whole(s.radius, 0, 1) or s.lod not in ["full", "map"]:
		return false
	if not Chunk._whole(s.epoch, 1, SAFE) or not Chunk._whole(s.observedAtTick, 1, SAFE) or not _sha(s.worldRoot) or not Chunk._hex(s.sourceRevision, 40):
		return false
	if typeof(s.entities) != TYPE_ARRAY or s.entities.size() != 1:
		return false
	var own: Variant = s.entities[0]
	if not _keys(own, ["entityId", "position"]) or own.entityId != actor_id or not _coord(own.position, SAFE):
		return false
	if floor((float(own.position.x) + 32000.0) / 64000.0) != coordinate.x or floor((float(own.position.z) + 32000.0) / 64000.0) != coordinate.y:
		return false
	if typeof(s.chunks) != TYPE_ARRAY:
		return false
	if reply.status == "FOGGED":
		return s.chunks.is_empty() and s.knowledgeHash == null
	if reply.status != "VERIFIED" or s.chunks.size() != 1 or not _sha(s.knowledgeHash):
		return false
	var c: Variant = s.chunks[0]
	if not _keys(c, ["coordinate", "authorityReceiptHash", "tiles", "structures", "roads"]) or not _coord(c.coordinate) or c.coordinate != s.coordinate or not _sha(c.authorityReceiptHash):
		return false
	if typeof(c.tiles) != TYPE_ARRAY or c.tiles.size() != 256:
		return false
	var seen: Dictionary = {}
	for t in c.tiles:
		if not _keys(t, ["x", "z", "heightMm", "surface"]) or not Chunk._whole(t.x, 0, 15) or not Chunk._whole(t.z, 0, 15) or not Chunk._whole(t.heightMm, -100000, 100000) or not Chunk.SURFACE_MATERIAL.has(t.surface):
			return false
		var key := int(t.z) * 16 + int(t.x)
		if seen.has(key):
			return false
		seen[key] = true
	if typeof(c.structures) != TYPE_ARRAY or c.structures.size() > 64 or typeof(c.roads) != TYPE_ARRAY or c.roads.size() > 64:
		return false
	seen.clear()
	for row in c.structures:
		if not _keys(row, ["id", "assetKey", "positionMm"]) or not _id(row.id) or not _id(row.assetKey) or not _local(row.positionMm) or seen.has(row.id):
			return false
		seen[row.id] = true
	seen.clear()
	for row in c.roads:
		if not _keys(row, ["id", "fromMm", "toMm"]) or not _id(row.id) or not _local(row.fromMm) or not _local(row.toMm) or seen.has(row.id):
			return false
		seen[row.id] = true
	return true

static func _local(value: Variant) -> bool:
	return _coord(value, 63999) and value.x >= 0 and value.z >= 0
