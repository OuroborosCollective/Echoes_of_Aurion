extends RefCounted
## Session-scoped presentation cache. Callers must resolve an authenticated
## catalog entry against a confirmed actor before requesting its bytes.
const Inspector = preload("res://world/world_design_projection.gd")
const MAX_ACTORS := 12
const MAX_ASSET_BYTES := 8 * 1024 * 1024
const MAX_SOURCE_BYTES := 48 * 1024 * 1024
const MAX_TEXTURE_PIXELS := 8 * 1024 * 1024
const MAX_VERTICES := 500000
var _connection := ""
var _owners: Dictionary = {}
var _requests: Dictionary = {}
var _models: Dictionary = {}
var _costs: Dictionary = {}

func clear() -> void:
	_connection = ""
	_owners.clear()
	_requests.clear()
	_models.clear()
	_costs.clear()

## Priority order comes from the confirmed scene (self, then nearby actors).
func set_owners(connection_id: String, owners: Array) -> void:
	if _connection != connection_id:
		clear()
	_connection = connection_id
	_owners.clear()
	for owner in owners:
		if typeof(owner) == TYPE_STRING and not owner.is_empty() and _owners.size() < MAX_ACTORS:
			_owners[owner] = true
	for owner in _requests.keys():
		if not _owners.has(owner):
			_requests.erase(owner)
	_prune()

func admits(owner: String) -> bool:
	return not _connection.is_empty() and _owners.has(owner)

func forget(owner: String) -> void:
	_requests.erase(owner)
	_prune()

static func _normalization_valid(value: Variant, sha: String) -> bool:
	if typeof(value) != TYPE_DICTIONARY or value.get("revision") != "aurion.glb-normalization.v1" or value.get("sourceSha256") != sha or value.get("unitConvention") != "gltf-rh-y-up-meter" or value.get("unitToMm") != 1000 or value.get("axisConvention") != "aurion-rh-y-up-forward-z":
		return false
	if value.get("axisTransform3x3") != [1,0,0,0,1,0,0,0,1] or not Inspector._whole(value.get("scaleE8"), 1, 100000000):
		return false
	var translation: Variant = value.get("translationMm")
	if typeof(translation) != TYPE_ARRAY or translation.size() != 3:
		return false
	for coordinate in translation:
		if not Inspector._whole(coordinate, -1000000000, 1000000000):
			return false
	return Inspector._hex(value.get("manifestSha256"), 64)

static func physical(entry: Dictionary) -> Dictionary:
	if entry.get("assetType") not in ["character", "enemy"] or typeof(entry.get("assetId")) != TYPE_STRING:
		return {}
	var variants: Variant = entry.get("lods", [])
	if typeof(variants) != TYPE_ARRAY or variants.size() > 4:
		return {}
	if not variants.is_empty() and (typeof(variants[0]) != TYPE_DICTIONARY or variants[0].get("sha256") != entry.get("sha256")):
		return {}
	if variants.is_empty():
		variants = [entry]
	var candidates: Array = []
	var previous_level := -1
	for variant in variants:
		if typeof(variant) != TYPE_DICTIONARY:
			return {}
		var sha: Variant = variant.get("sha256")
		if not Inspector._hex(sha, 64) or variant.get("storageUrl") != "/api/assets/glb/" + str(sha) + ".glb" or not _normalization_valid(variant.get("normalization"), str(sha)):
			return {}
		var level: Variant = variant.get("level", 0)
		if not Inspector._whole(level, 0, 3) or int(level) <= previous_level:
			return {}
		previous_level = int(level)
		if variant.get("bytes") != null and not Inspector._whole(variant.bytes, 1, MAX_ASSET_BYTES):
			continue
		candidates.append({"sha256":sha,"storageUrl":variant.storageUrl,"normalization":variant.normalization.duplicate(true),"level":int(level),"bytes":variant.get("bytes")})
	if candidates.is_empty():
		return {}
	candidates.sort_custom(func(a: Dictionary, b: Dictionary):
		var ar: int = a.level - 2 if a.level >= 2 else 12 - a.level
		var br: int = b.level - 2 if b.level >= 2 else 12 - b.level
		return ar < br if ar != br else a.sha256 < b.sha256)
	return candidates[0]

func request(entry: Dictionary, owner: String) -> Dictionary:
	if not admits(owner):
		return {"status":"blocked", "reason":"actor_capacity"}
	var candidate := physical(entry)
	if candidate.is_empty():
		_requests.erase(owner)
		_prune()
		return {"status":"blocked", "reason":"actor_asset_profile"}
	_requests[owner] = candidate
	_prune()
	var sha: String = candidate.sha256
	var result := {"status":"pending", "reason":"actor_model_loading", "entityId":owner,
		"catalogAssetId":entry.assetId, "sourceAssetId":"glb_" + sha.substr(0,48),
		"sha256":sha, "resourcePath":"catalog:" + sha,
		"normalization":candidate.normalization.duplicate(true)}
	if _models.has(sha):
		result.status = "resolved"
		result.reason = ""
		result["packedScene"] = _models[sha]
	return result

func _prune() -> void:
	var needed: Dictionary = {}
	for request in _requests.values():
		needed[request.sha256] = true
	for sha in _models.keys():
		if not needed.has(sha):
			_models.erase(sha)
			_costs.erase(sha)

func needed_assets() -> Array:
	var result: Array = []
	var seen: Dictionary = {}
	for owner in _owners:
		var request: Dictionary = _requests.get(owner, {})
		if request.is_empty() or _models.has(request.sha256) or seen.has(request.sha256):
			continue
		seen[request.sha256] = true
		result.append({"sha256":request.sha256,"storageUrl":request.storageUrl})
	return result

func supply_asset(sha: String, bytes: PackedByteArray, connection_id: String) -> bool:
	if connection_id.is_empty() or connection_id != _connection or bytes.size() > MAX_ASSET_BYTES or bytes.size() < 28 or _models.has(sha):
		return false
	var requested := false
	for request in _requests.values():
		if request.sha256 == sha:
			if request.bytes != null and int(request.bytes) != bytes.size():
				return false
			requested = true
	if not requested:
		return false
	var hash := HashingContext.new()
	if hash.start(HashingContext.HASH_SHA256) != OK or hash.update(bytes) != OK or hash.finish().hex_encode() != sha:
		return false
	var cost := Inspector.inspect_actor_glb(bytes)
	if cost.is_empty():
		return false
	var pixels: int = cost.pixels
	var vertices: int = cost.vertices
	var source_bytes := bytes.size()
	var decoded: int = cost.decoded
	for previous in _costs.values():
		pixels += int(previous.pixels)
		vertices += int(previous.vertices)
		source_bytes += int(previous.bytes)
		decoded += int(previous.decoded)
	if decoded > 64 * 1024 * 1024 or pixels > MAX_TEXTURE_PIXELS or vertices > MAX_VERTICES or source_bytes > MAX_SOURCE_BYTES or _models.size() >= MAX_ACTORS:
		return false
	var state := GLTFState.new()
	var document := GLTFDocument.new()
	if document.append_from_buffer(bytes, "", state) != OK:
		return false
	var model := document.generate_scene(state) as Node3D
	if model == null:
		return false
	var meshes := model.find_children("*", "MeshInstance3D", true, false)
	var players := model.find_children("*", "AnimationPlayer", true, false)
	if meshes.is_empty() or players.size() != 1 or model.find_children("*", "Skeleton3D", true, false).is_empty() or not model.find_children("*", "CollisionObject3D", true, false).is_empty():
		model.free()
		return false
	var packed := PackedScene.new()
	var error := packed.pack(model)
	model.free()
	if error != OK:
		return false
	_models[sha] = packed
	_costs[sha] = {"pixels":cost.pixels,"vertices":cost.vertices,"bytes":bytes.size(),"decoded":cost.decoded}
	return true

func evidence() -> Dictionary:
	return {"models":_models.size(),"actors":_owners.size(),"requested":_requests.size(),"pending":needed_assets().size()}

static func normalize_model(model: Node3D, normalization: Dictionary) -> Node3D:
	if normalization.is_empty():
		return model
	var wrapper := Node3D.new()
	wrapper.name = "CatalogNormalization"
	wrapper.scale = Vector3.ONE * (float(normalization.scaleE8) / 100000000.0)
	var t: Array = normalization.translationMm
	wrapper.position = Vector3(float(t[0]),float(t[1]),float(t[2])) / 1000.0
	wrapper.add_child(model)
	return wrapper
