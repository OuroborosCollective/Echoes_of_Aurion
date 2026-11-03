extends RefCounted
## Validates the protected DTO; hashes are server provenance identifiers, not
## locally re-created authority. Caller must reconcile auth/session/position.
const Terrain = preload("res://world/chunk_terrain.gd")
const PATH := "/api/game/world-slice"
const MAX_BYTES := 65536
const MAX_SAFE := 9007199254740991
static func exact(value: Variant, keys: Array) -> bool:
	if typeof(value) != TYPE_DICTIONARY or value.size() != keys.size(): return false
	for key in keys:
		if not value.has(key): return false
	return true
static func whole(value: Variant, minimum: int, maximum: int) -> bool:
	return Terrain._whole(value, minimum, maximum)
static func hash_id(value: Variant) -> bool:
	return typeof(value) == TYPE_STRING and value.begins_with("sha256:") and Terrain._hex(value.substr(7), 64)
static func position(value: Variant, minimum: int, maximum: int) -> bool:
	return exact(value, ["x", "z"]) and whole(value.x, minimum, maximum) and whole(value.z, minimum, maximum)
static func identifier(value: Variant) -> bool:
	return typeof(value) == TYPE_STRING and not value.is_empty() and value.length() <= 128
static func validate(response: Variant, connection: String, actor: String, coordinate: Vector2i) -> Dictionary:
	if connection.is_empty() or actor.is_empty() or not exact(response, ["status", "connectionId", "slice", "fingerprint", "mutationAuthority"]): return {}
	if response.connectionId != connection or response.mutationAuthority != "none" or not hash_id(response.fingerprint) or response.status not in ["VERIFIED", "FOGGED"]: return {}
	var s: Variant = response.slice
	if not exact(s, ["schema", "policy", "worldId", "zoneId", "actorId", "epoch", "worldRoot", "sourceRevision", "observedAtTick", "coordinate", "radius", "lod", "knowledgeHash", "chunks", "entities"]): return {}
	if s.schema != "aurion.world-slice.v1" or s.policy != "actor-observed-current-epoch.v1" or s.worldId != "echoes-of-aurion-global" or s.zoneId != "observatory_threshold" or s.actorId != actor: return {}
	if not whole(s.epoch, 1, MAX_SAFE) or not whole(s.observedAtTick, 1, MAX_SAFE) or not hash_id(s.worldRoot) or not Terrain._hex(s.sourceRevision, 40): return {}
	if not position(s.coordinate, -1000000, 1000000) or int(s.coordinate.x) != coordinate.x or int(s.coordinate.z) != coordinate.y: return {}
	if not whole(s.radius, 0, 1) or s.lod not in ["full", "map"] or typeof(s.chunks) != TYPE_ARRAY or s.chunks.size() > 1: return {}
	if response.status == "FOGGED":
		if s.knowledgeHash != null or not s.chunks.is_empty(): return {}
	elif not hash_id(s.knowledgeHash) or s.chunks.size() != 1: return {}
	if typeof(s.entities) != TYPE_ARRAY or s.entities.size() != 1: return {}
	var self_record: Variant = s.entities[0]
	if not exact(self_record, ["entityId", "position"]) or self_record.entityId != actor or not position(self_record.position, -MAX_SAFE, MAX_SAFE): return {}
	if floori((float(self_record.position.x) + 32000.0) / 64000.0) != coordinate.x or floori((float(self_record.position.z) + 32000.0) / 64000.0) != coordinate.y: return {}
	for chunk in s.chunks:
		if not exact(chunk, ["coordinate", "authorityReceiptHash", "tiles", "structures", "roads"]) or chunk.coordinate != s.coordinate or not hash_id(chunk.authorityReceiptHash): return {}
		if typeof(chunk.tiles) != TYPE_ARRAY or chunk.tiles.size() != 256: return {}
		for index in range(256):
			var tile: Variant = chunk.tiles[index]
			if not exact(tile, ["x", "z", "heightMm", "surface"]) or not whole(tile.x, 0, 15) or not whole(tile.z, 0, 15) or int(tile.x) != index % 16 or int(tile.z) != index / 16: return {}
			if not whole(tile.heightMm, -100000, 100000) or typeof(tile.surface) != TYPE_STRING or not Terrain.SURFACE_MATERIAL.has(tile.surface): return {}
		for category in ["structures", "roads"]:
			if typeof(chunk[category]) != TYPE_ARRAY or chunk[category].size() > 64: return {}
			var previous := ""
			for item in chunk[category]:
				var keys: Array = ["id", "assetKey", "positionMm"] if category == "structures" else ["id", "fromMm", "toMm"]
				if not exact(item, keys) or not identifier(item.id) or item.id <= previous: return {}
				previous = item.id
				if category == "structures":
					if not identifier(item.assetKey) or not position(item.positionMm, 0, 63999): return {}
				elif not position(item.fromMm, 0, 63999) or not position(item.toMm, 0, 63999): return {}
	if JSON.stringify(response).to_utf8_buffer().size() > MAX_BYTES: return {}
	return {"ok": true, "slice": s.duplicate(true), "fingerprint": response.fingerprint, "status": response.status}

## Pure presentation filters shared by 3D and 2D after DTO validation.
static func height_at(chunk: Dictionary, point: Dictionary) -> float:
	var index := clampi(int(point.z) / 4000, 0, 15) * 16 + clampi(int(point.x) / 4000, 0, 15)
	return float(chunk.tiles[index].heightMm) / 1000.0
static func filtered_overlays(chunk: Dictionary, ceiling: float) -> Dictionary:
	var result := {"structures":[], "roads":[]}
	for item in chunk.structures:
		if height_at(chunk, item.positionMm) + 0.5 <= ceiling: result.structures.append(item)
	for item in chunk.roads:
		if item.fromMm != item.toMm and maxf(height_at(chunk, item.fromMm), height_at(chunk, item.toMm)) + 0.05 <= ceiling: result.roads.append(item)
	return result
