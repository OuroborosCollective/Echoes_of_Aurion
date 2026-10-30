extends Node3D
## Visual projection of published Aurion world designs. The caller must bind
## the response and chunk readbacks to the active authenticated zone session.
## This node creates no collisions, actions, scripts, or authoritative state.
const ChunkTerrain = preload("res://world/chunk_terrain.gd")
const MAX_VISUALS := 18
const MAX_ASSET_BYTES := 24 * 1024 * 1024
const MAX_JSON_BYTES := 4 * 1024 * 1024
const MAX_MODELS := MAX_VISUALS
const MAX_MODEL_MESH_INSTANCES := 256
const MAX_MODEL_MATERIALS := 256
const MAX_MODEL_RESOURCE_DESCRIPTORS := 256
const MAX_TOTAL_MODEL_MATERIALS := 1024
const MAX_TOTAL_TEXTURE_PIXELS := 16 * 1024 * 1024
const MAX_TOTAL_MODEL_VERTICES := 750000
const MAX_TOTAL_SOURCE_BYTES := 48 * 1024 * 1024
const MAX_RENDERED_TRIANGLES := 1000000
const MAX_RENDERED_MESH_INSTANCES := 512
const MAX_RENDERED_SURFACES := 512
const CHUNK_MM := 64000
const HALF_CHUNK_MM := 32000

var diagnostic := "Kein bestätigter Weltentwurf"
var _connection := ""
var _design: Dictionary = {}
var _catalog: Dictionary = {}
var _placements: Array = []
var _assets: Dictionary = {}
var _chunks: Dictionary = {}
var _center := Vector2i.ZERO
var _has_center := false
var _models: Dictionary = {}
var _model_costs: Dictionary = {}
var _desired_cache: Array = []
var _desired_dirty := true

static func _hex(value: Variant, length: int) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != length:
		return false
	for character in value:
		if not "0123456789abcdef".contains(character):
			return false
	return true

static func _whole(value: Variant, low: int, high: int) -> bool:
	if typeof(value) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	var number := float(value)
	return is_finite(number) and number == floor(number) and number >= low and number <= high

static func _id(value: Variant, asset: bool = false) -> bool:
	if typeof(value) != TYPE_STRING:
		return false
	if asset:
		if value.length() < 8 or value.length() > 64 or not value.begins_with("glb_"):
			return false
	elif value.length() < 3 or value.length() > 96 or not "abcdefghijklmnopqrstuvwxyz".contains(value.substr(0, 1)):
		return false
	for character in value:
		if not "abcdefghijklmnopqrstuvwxyz0123456789._:-".contains(character):
			return false
	return true

## Resolve physical bytes only inside the server-approved logical family.
## Prefer the cheapest published LOD that fits the native per-model budget.
static func _physical_assets(entry: Dictionary) -> Array:
	var sha: Variant = entry.get("sha256")
	var normalization: Variant = entry.get("normalization")
	if not _hex(sha, 64) or entry.get("storageUrl") != "/api/assets/glb/" + str(sha) + ".glb" or typeof(normalization) != TYPE_DICTIONARY or normalization.get("sourceSha256") != sha:
		return []
	var lods: Variant = entry.get("lods", [])
	if typeof(lods) != TYPE_ARRAY or lods.size() > 4:
		return []
	if lods.is_empty():
		return [{"sha256":sha,"storageUrl":entry.storageUrl}]
	var result: Array = []
	var previous_level := -1
	for variant in lods:
		if typeof(variant) != TYPE_DICTIONARY or not _whole(variant.get("level"), 0, 3) or int(variant.level) <= previous_level:
			return []
		previous_level = int(variant.level)
		var physical_sha: Variant = variant.get("sha256")
		var physical_norm: Variant = variant.get("normalization")
		if not _hex(physical_sha, 64) or variant.get("storageUrl") != "/api/assets/glb/" + str(physical_sha) + ".glb" or typeof(physical_norm) != TYPE_DICTIONARY or physical_norm.get("sourceSha256") != physical_sha:
			return []
		var detail: Variant = physical_norm.get("lod")
		if typeof(detail) != TYPE_DICTIONARY or not _whole(detail.get("level"), previous_level, previous_level) or not _whole(detail.get("triangleCount"), 1, 2000000):
			return []
		if variant.get("bytes") != null and not _whole(variant.bytes, 1, MAX_ASSET_BYTES):
			return []
		if int(detail.triangleCount) <= 250000:
			result.append({"sha256":physical_sha,"storageUrl":variant.storageUrl})
	if lods[0].get("sha256") != sha:
		return []
	result.reverse()
	return result

func _clear_visuals() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()

func clear() -> void:
	_clear_visuals()
	_connection = ""
	_design.clear()
	_catalog.clear()
	_placements.clear()
	_assets.clear()
	_chunks.clear()
	_models.clear()
	_model_costs.clear()
	_desired_cache.clear()
	_desired_dirty = true
	_has_center = false
	diagnostic = "Kein bestätigter Weltentwurf"

func bind_confirmed(design: Variant, catalog: Variant, connection_id: String) -> bool:
	if connection_id.is_empty() or not connection_id.begins_with("zone_peer_") or connection_id.length() > 128:
		return false
	if _connection == connection_id and _design == design and _catalog == catalog:
		return true
	var checked := _validate_sources(design, catalog)
	if checked.is_empty():
		if _connection == connection_id:
			clear()
			diagnostic = "Weltentwurf oder Katalog ungültig"
		return false
	if not _connection.is_empty() and _connection != connection_id:
		clear()
	_connection = connection_id
	_design = design.duplicate(true)
	_catalog = catalog.duplicate(true)
	_placements = checked.placements
	_assets = checked.assets
	_desired_dirty = true
	# Only current catalog/design-authorized content may survive an update.
	for sha in _models.keys():
		if not _assets.has(sha):
			_models.erase(sha)
			_model_costs.erase(sha)
	_refresh()
	return true

static func _validate_sources(design: Variant, catalog: Variant) -> Dictionary:
	if typeof(design) != TYPE_DICTIONARY or design.get("schemaVersion") != "aurion.world-design.v1" or not _hex(design.get("revision"), 64):
		return {}
	if typeof(design.get("designs")) != TYPE_ARRAY or design.designs.size() > 64:
		return {}
	if typeof(catalog) != TYPE_DICTIONARY or catalog.get("version") != "aurion.glb-import.v1" or not _hex(catalog.get("revision"), 64):
		return {}
	if typeof(catalog.get("entries")) != TYPE_ARRAY or catalog.entries.size() > 500:
		return {}
	var entries: Dictionary = {}
	var approved: Dictionary = {}
	var assets: Dictionary = {}
	for entry in catalog.entries:
		if typeof(entry) != TYPE_DICTIONARY or typeof(entry.get("assetId")) != TYPE_STRING or entry.assetId.length() < 8 or entry.assetId.length() > 64 or entries.has(entry.assetId):
			return {}
		entries[entry.assetId] = entry
		if entry.get("assetType") != "arena" or not entry.has("targetKey") or entry.get("targetKey") != null or entry.get("purpose") not in ["world-environment", "world-nature"]:
			continue
		var candidates := _physical_assets(entry)
		if candidates.is_empty():
			continue
		var alternatives: Array = []
		for candidate in candidates:
			assets[candidate.sha256] = candidate
			alternatives.append(candidate.sha256)
		approved[entry.assetId] = {"alternatives":alternatives,"subcategory":entry.get("subcategory")}
	var placements: Array = []
	var design_keys: Dictionary = {}
	for item in design.designs:
		if typeof(item) != TYPE_DICTIONARY or not _id(item.get("designKey")) or design_keys.has(item.designKey):
			return {}
		design_keys[item.designKey] = true
		if not _whole(item.get("version"), 1, 1000000) or not _hex(item.get("designHash"), 64) or not _hex(item.get("expectedCatalogRevision"), 64):
			return {}
		if typeof(item.get("title")) != TYPE_STRING or item.title.length() > 160 or typeof(item.get("placements")) != TYPE_ARRAY or item.placements.size() > 256:
			return {}
		var keys: Dictionary = {}
		for position in item.placements:
			if typeof(position) != TYPE_DICTIONARY or not _id(position.get("placementKey")) or keys.has(position.placementKey):
				return {}
			keys[position.placementKey] = true
			if not _id(position.get("assetId"), true):
				return {}
			if not _whole(position.get("chunkX"), -100000, 100000) or not _whole(position.get("chunkZ"), -100000, 100000) or not _whole(position.get("xMm"), 0, 63999) or not _whole(position.get("zMm"), 0, 63999) or not _whole(position.get("rotationQuarterTurns"), 0, 3) or not _whole(position.get("scalePermille"), 250, 4000):
				return {}
			var asset: Variant = approved.get(position.assetId)
			if typeof(asset) != TYPE_DICTIONARY:
				continue
			var alternatives: Array = asset.alternatives
			placements.append({"designKey":item.designKey,"placementKey":position.placementKey,
				"sha256":alternatives[0],"alternatives":alternatives,"chunk":Vector2i(int(position.chunkX),int(position.chunkZ)),
				"xMm":int(position.xMm),"zMm":int(position.zMm),"rotation":int(position.rotationQuarterTurns),
				"scale":int(position.scalePermille),"subcategory":asset.subcategory})
	return {"placements":placements,"assets":assets}

func accept_surface(readback: Variant, connection_id: String, center: Vector2i) -> bool:
	if connection_id != _connection or _connection.is_empty():
		return false
	var checked: Dictionary = ChunkTerrain._validate(readback)
	if checked.get("status") != "validated":
		return false
	var coordinate := Vector2i(int(checked.coordinate.x), int(checked.coordinate.z))
	if maxi(absi(coordinate.x - center.x), absi(coordinate.y - center.y)) > 1:
		return false
	if _has_center and _center == center and _chunks.has(coordinate) and _chunks[coordinate] == checked.tiles:
		return true
	set_center(center, connection_id)
	_chunks[coordinate] = checked.tiles.duplicate(true)
	_desired_dirty = true
	_refresh()
	return true

func set_center(center: Vector2i, connection_id: String) -> void:
	if connection_id != _connection or _connection.is_empty():
		return
	if _has_center and _center == center:
		return
	_center = center
	_has_center = true
	_desired_dirty = true
	for coordinate in _chunks.keys():
		if maxi(absi(coordinate.x - center.x), absi(coordinate.y - center.y)) > 1:
			_chunks.erase(coordinate)
	_refresh()

func remove_surface(coordinate: Vector2i, connection_id: String) -> void:
	if connection_id == _connection and _chunks.has(coordinate):
		_chunks.erase(coordinate)
		_desired_dirty = true
		_refresh()

func reset_surfaces(connection_id: String) -> void:
	if connection_id == _connection:
		_chunks.clear()
		_has_center = false
		_desired_dirty = true
		_refresh()

func _desired() -> Array:
	if not _desired_dirty:
		return _desired_cache
	var result: Array = []
	if not _has_center:
		_desired_cache = result
		_desired_dirty = false
		return _desired_cache
	for item in _placements:
		if not _chunks.has(item.chunk) or maxi(absi(item.chunk.x - _center.x), absi(item.chunk.y - _center.y)) > 1:
			continue
		if result.size() == MAX_VISUALS and not _placement_less(item, result.back()):
			continue
		var low := 0
		var high := result.size()
		while low < high:
			var middle := int((low + high) / 2)
			if _placement_less(item, result[middle]):
				high = middle
			else:
				low = middle + 1
		result.insert(low, item)
		if result.size() > MAX_VISUALS:
			result.pop_back()
	_desired_cache = result
	_desired_dirty = false
	return _desired_cache

func _placement_less(a: Dictionary, b: Dictionary) -> bool:
	var ad: int = absi(a.chunk.x - _center.x) + absi(a.chunk.y - _center.y)
	var bd: int = absi(b.chunk.x - _center.x) + absi(b.chunk.y - _center.y)
	return ad < bd if ad != bd else (str(a.designKey) + ":" + str(a.placementKey)) < (str(b.designKey) + ":" + str(b.placementKey))

func needed_assets() -> Array:
	var result: Array = []
	if _models.size() >= MAX_MODELS:
		return result
	var seen: Dictionary = {}
	for item in _desired():
		if not _models.has(item.sha256) and not seen.has(item.sha256):
			seen[item.sha256] = true
			result.append(_assets[item.sha256].duplicate(true))
	return result

func try_next_asset(sha: String, connection_id: String) -> bool:
	if connection_id != _connection or _connection.is_empty():
		return false
	var changed := false
	for item in _placements:
		if item.sha256 != sha:
			continue
		var index: int = item.alternatives.find(sha)
		if index >= 0 and item.alternatives.size() > 1:
			item.sha256 = item.alternatives[(index + 1) % item.alternatives.size()]
			changed = true
	if changed:
		_desired_dirty = true
		_refresh()
	return changed

func supply_asset(sha: String, bytes: PackedByteArray, connection_id: String) -> bool:
	if connection_id != _connection or _connection.is_empty() or not _assets.has(sha):
		return false
	var needed := false
	for request in needed_assets():
		if request.sha256 == sha:
			needed = true
	if not needed or _models.size() >= MAX_MODELS or bytes.size() > MAX_ASSET_BYTES or bytes.size() < 28:
		return false
	var hash := HashingContext.new()
	if hash.start(HashingContext.HASH_SHA256) != OK or hash.update(bytes) != OK or hash.finish().hex_encode() != sha:
		return false
	var costs := _inspect_glb(bytes)
	if costs.is_empty():
		return false
	var pixels: int = costs.pixels
	var vertices: int = costs.vertices
	var materials: int = costs.materials
	var source_bytes := bytes.size()
	for previous in _model_costs.values():
		pixels += int(previous.pixels)
		vertices += int(previous.vertices)
		materials += int(previous.materials)
		source_bytes += int(previous.bytes)
	if pixels > MAX_TOTAL_TEXTURE_PIXELS or vertices > MAX_TOTAL_MODEL_VERTICES or materials > MAX_TOTAL_MODEL_MATERIALS or source_bytes > MAX_TOTAL_SOURCE_BYTES:
		return false
	var state := GLTFState.new()
	var document := GLTFDocument.new()
	if document.append_from_buffer(bytes, "", state) != OK:
		return false
	var model := document.generate_scene(state) as Node3D
	if model == null:
		return false
	if model.find_children("*", "MeshInstance3D", true, false).is_empty() or not model.find_children("*", "Skeleton3D", true, false).is_empty() or not model.find_children("*", "CollisionObject3D", true, false).is_empty():
		model.free()
		return false
	var packed := PackedScene.new()
	var result := packed.pack(model)
	model.free()
	if result != OK:
		return false
	_models[sha] = packed
	_model_costs[sha] = {"pixels":costs.pixels,"vertices":costs.vertices,"materials":costs.materials,"triangles":costs.triangles,"instances":costs.instances,"surfaces":costs.surfaces,"bytes":bytes.size()}
	_refresh()
	return true

static func _inspect_glb(bytes: PackedByteArray) -> Dictionary:
	if bytes.size() < 28 or bytes.decode_u32(0) != 0x46546c67 or bytes.decode_u32(4) != 2 or bytes.decode_u32(8) != bytes.size():
		return {}
	var length := int(bytes.decode_u32(12))
	if length < 2 or length > MAX_JSON_BYTES or length % 4 != 0 or bytes.decode_u32(16) != 0x4e4f534a or 20 + length + 8 > bytes.size():
		return {}
	var binary_offset := 20 + length
	var binary_length := int(bytes.decode_u32(binary_offset))
	if binary_length % 4 != 0 or bytes.decode_u32(binary_offset + 4) != 0x004e4942 or binary_offset + 8 + binary_length != bytes.size():
		return {}
	var data: Variant = JSON.parse_string(bytes.slice(20, binary_offset).get_string_from_utf8().strip_edges())
	if typeof(data) != TYPE_DICTIONARY or typeof(data.get("asset")) != TYPE_DICTIONARY or data.asset.get("version") != "2.0":
		return {}
	for field in ["nodes", "meshes", "accessors", "bufferViews", "images", "scenes", "buffers", "skins", "animations"]:
		if data.has(field) and (typeof(data[field]) != TYPE_ARRAY or data[field].size() > 8192):
			return {}
	if data.get("images", []).size() > 32 or not data.get("skins", []).is_empty() or not data.get("animations", []).is_empty():
		return {}
	# Godot also constructs unreferenced materials and resource descriptors while
	# parsing. Source bytes and rendered triangle counts alone do not bound them.
	for field in ["materials", "textures", "samplers", "cameras"]:
		var resources: Variant = data.get(field, [])
		var limit: int = 32 if field == "cameras" else (MAX_MODEL_MATERIALS if field == "materials" else MAX_MODEL_RESOURCE_DESCRIPTORS)
		if typeof(resources) != TYPE_ARRAY or resources.size() > limit:
			return {}
		for resource in resources:
			if typeof(resource) != TYPE_DICTIONARY:
				return {}
	var buffers: Variant = data.get("buffers", [])
	if buffers.size() != 1 or typeof(buffers[0]) != TYPE_DICTIONARY or not _whole(buffers[0].get("byteLength"), 1, binary_length):
		return {}
	# GLTFDocument decodes accessors in native code. Reject malformed component
	# types and out-of-bounds layouts before passing any bytes to that parser.
	if not _buffer_accessors_valid(data, binary_length):
		return {}
	var supported := ["KHR_materials_unlit", "KHR_materials_clearcoat", "KHR_materials_transmission", "KHR_materials_ior", "KHR_materials_specular", "KHR_texture_transform", "KHR_mesh_quantization"]
	for field in ["extensionsRequired", "extensionsUsed"]:
		var extensions: Variant = data.get(field, [])
		if typeof(extensions) != TYPE_ARRAY:
			return {}
		for extension in extensions:
			if extension not in supported:
				return {}
	var pixels := _image_budget(data, bytes, binary_offset + 8, binary_length)
	var geometry := _geometry_budget(data)
	if pixels < 0 or geometry.is_empty():
		return {}
	var pending: Array = [data]
	var count := 0
	while not pending.is_empty():
		var value: Variant = pending.pop_back()
		count += 1
		if count > 250000:
			return {}
		if typeof(value) == TYPE_DICTIONARY:
			if value.has("uri"):
				return {}
			for child in value.values():
				if typeof(child) in [TYPE_ARRAY, TYPE_DICTIONARY]:
					pending.append(child)
		elif typeof(value) == TYPE_ARRAY:
			for child in value:
				if typeof(child) in [TYPE_ARRAY, TYPE_DICTIONARY]:
					pending.append(child)
	return {"pixels":pixels,"vertices":geometry.vertices,"materials":data.get("materials", []).size(),"triangles":geometry.triangles,"instances":geometry.instances,"surfaces":geometry.surfaces}

## Matches the server's bounded GLB buffer/accessor contract, with the glTF
## alignment and padded matrix rules checked before Godot's native decoder.
static func _buffer_accessors_valid(data: Dictionary, binary_length: int) -> bool:
	var declared: int = int(data.buffers[0].byteLength)
	if binary_length - declared > 3:
		return false
	var views: Array = data.get("bufferViews", [])
	var accessors: Array = data.get("accessors", [])
	for view in views:
		if typeof(view) != TYPE_DICTIONARY or not _whole(view.get("buffer"), 0, 0) or not _whole(view.get("byteOffset", 0), 0, declared) or not _whole(view.get("byteLength"), 1, declared):
			return false
		if int(view.get("byteOffset", 0)) + int(view.byteLength) > declared:
			return false
		if view.has("byteStride") and (not _whole(view.byteStride, 4, 252) or int(view.byteStride) % 4 != 0):
			return false
	var sizes := {5120:1, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4}
	var ranges := {5120:[-128.0,127.0], 5121:[0.0,255.0], 5122:[-32768.0,32767.0], 5123:[0.0,65535.0], 5125:[0.0,4294967295.0], 5126:[-3.402823466e38,3.402823466e38]}
	var widths := {"SCALAR":1, "VEC2":2, "VEC3":3, "VEC4":4, "MAT2":4, "MAT3":9, "MAT4":16}
	for accessor in accessors:
		if typeof(accessor) != TYPE_DICTIONARY or accessor.has("sparse") or not _whole(accessor.get("bufferView"), 0, views.size() - 1):
			return false
		var component: Variant = accessor.get("componentType")
		var kind: Variant = accessor.get("type")
		if not _whole(component, 5120, 5126) or not sizes.has(int(component)) or typeof(kind) != TYPE_STRING or not widths.has(kind) or not _whole(accessor.get("count"), 1, 1000000):
			return false
		var view: Dictionary = views[int(accessor.bufferView)]
		if not _whole(accessor.get("byteOffset", 0), 0, int(view.byteLength)):
			return false
		var component_size: int = sizes[int(component)]
		var element_size: int = component_size * int(widths[kind])
		if kind.begins_with("MAT"):
			var dimension: int = int(kind.substr(3, 1))
			var column_size: int = (dimension * component_size + 3) & ~3
			element_size = dimension * column_size
		var stride: int = int(view.get("byteStride", element_size))
		var offset: int = int(accessor.get("byteOffset", 0))
		if stride < element_size or stride > 252 or stride % component_size != 0 or offset % component_size != 0 or (int(view.get("byteOffset", 0)) + offset) % component_size != 0:
			return false
		if offset + (int(accessor.count) - 1) * stride + element_size > int(view.byteLength):
			return false
		if accessor.has("normalized") and typeof(accessor.normalized) != TYPE_BOOL:
			return false
		for field in ["min", "max"]:
			if not accessor.has(field):
				continue
			var values: Variant = accessor[field]
			if typeof(values) != TYPE_ARRAY or values.size() != widths[kind]:
				return false
			for value in values:
				if typeof(value) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(value)):
					return false
				var number := float(value)
				var bounds: Array = ranges[int(component)]
				if number < bounds[0] or number > bounds[1] or (int(component) != 5126 and number != floor(number)):
					return false
		if accessor.has("min") and accessor.has("max"):
			for axis in range(widths[kind]):
				if float(accessor.min[axis]) > float(accessor.max[axis]):
					return false
	return true

## Budget what the active glTF scene actually instantiates, not merely the
## shared mesh definitions. Reject animated/morph content for static world art.
static func _geometry_budget(data: Dictionary) -> Dictionary:
	var meshes: Variant = data.get("meshes", [])
	var accessors: Variant = data.get("accessors", [])
	var nodes: Variant = data.get("nodes", [])
	var scenes: Variant = data.get("scenes", [])
	if meshes.is_empty() or accessors.is_empty() or nodes.is_empty() or scenes.is_empty() or nodes.size() > 4096 or scenes.size() > 64:
		return {}
	var mesh_costs: Array = []
	for mesh in meshes:
		if typeof(mesh) != TYPE_DICTIONARY or typeof(mesh.get("primitives")) != TYPE_ARRAY or mesh.primitives.is_empty() or mesh.primitives.size() > 256:
			return {}
		var triangles := 0
		var vertices := 0
		for primitive in mesh.primitives:
			if typeof(primitive) != TYPE_DICTIONARY or primitive.has("targets") or typeof(primitive.get("attributes")) != TYPE_DICTIONARY or not _whole(primitive.attributes.get("POSITION"), 0, accessors.size() - 1):
				return {}
			var position: Variant = accessors[int(primitive.attributes.POSITION)]
			if typeof(position) != TYPE_DICTIONARY or not _whole(position.get("count"), 1, 250000) or position.get("type") != "VEC3":
				return {}
			var types := {"POSITION":["VEC3"],"NORMAL":["VEC3"],"TANGENT":["VEC4"],"TEXCOORD_0":["VEC2"],"TEXCOORD_1":["VEC2"],"COLOR_0":["VEC3","VEC4"]}
			for attribute in primitive.attributes:
				if attribute not in ["POSITION", "NORMAL", "TANGENT", "TEXCOORD_0", "TEXCOORD_1", "COLOR_0"] or not _whole(primitive.attributes[attribute], 0, accessors.size() - 1):
					return {}
				var accessor: Variant = accessors[int(primitive.attributes[attribute])]
				if typeof(accessor) != TYPE_DICTIONARY or not _whole(accessor.get("count"), int(position.count), int(position.count)) or accessor.get("type") not in types[attribute]:
					return {}
			vertices += int(position.count)
			var count: int = int(position.count)
			if primitive.has("indices"):
				if not _whole(primitive.indices, 0, accessors.size() - 1):
					return {}
				var index_accessor: Variant = accessors[int(primitive.indices)]
				if typeof(index_accessor) != TYPE_DICTIONARY or not _whole(index_accessor.get("count"), 1, 750000) or index_accessor.get("type") != "SCALAR" or not _whole(index_accessor.get("componentType"), 5121, 5125) or int(index_accessor.componentType) not in [5121,5123,5125]:
					return {}
				count = int(index_accessor.count)
			var mode: Variant = primitive.get("mode", 4)
			if not _whole(mode, 4, 6):
				return {}
			triangles += int(count / 3) if int(mode) == 4 else maxi(0, count - 2)
			if vertices > 250000 or triangles > 250000:
				return {}
		mesh_costs.append({"vertices":vertices,"triangles":triangles,"surfaces":mesh.primitives.size()})
	var scene_index: Variant = data.get("scene", 0)
	if not _whole(scene_index, 0, scenes.size() - 1):
		return {}
	var scene: Variant = scenes[int(scene_index)]
	if typeof(scene) != TYPE_DICTIONARY or typeof(scene.get("nodes")) != TYPE_ARRAY or scene.nodes.is_empty():
		return {}
	var pending: Array = scene.nodes.duplicate()
	var seen: Dictionary = {}
	var scene_vertices := 0
	var scene_triangles := 0
	var instances := 0
	var scene_surfaces := 0
	var used_meshes: Dictionary = {}
	while not pending.is_empty():
		var raw: Variant = pending.pop_back()
		if not _whole(raw, 0, nodes.size() - 1) or seen.has(int(raw)) or seen.size() >= 1024:
			return {}
		var index := int(raw)
		seen[index] = true
		var node: Variant = nodes[index]
		if typeof(node) != TYPE_DICTIONARY or node.has("skin") or node.has("weights"):
			return {}
		if node.has("mesh"):
			if not _whole(node.mesh, 0, mesh_costs.size() - 1):
				return {}
			var cost: Dictionary = mesh_costs[int(node.mesh)]
			used_meshes[int(node.mesh)] = true
			scene_vertices += int(cost.vertices)
			scene_triangles += int(cost.triangles)
			scene_surfaces += int(cost.surfaces)
			instances += 1
			if scene_vertices > 250000 or scene_triangles > 250000 or instances > MAX_MODEL_MESH_INSTANCES or scene_surfaces > MAX_RENDERED_SURFACES:
				return {}
		var children: Variant = node.get("children", [])
		if typeof(children) != TYPE_ARRAY:
			return {}
		pending.append_array(children)
	# Godot imports every mesh definition, including ones outside this scene.
	# Reject unused definitions so their decoded arrays are also budgeted.
	return {"vertices":scene_vertices,"triangles":scene_triangles,"instances":instances,"surfaces":scene_surfaces} if instances > 0 and scene_triangles > 0 and used_meshes.size() == mesh_costs.size() else {}

## Reject implausibly large embedded textures before Godot decompresses them.
## This is a rendering budget, not a claim of physical-device performance.
static func _image_budget(data: Dictionary, bytes: PackedByteArray, binary_start: int, binary_length: int) -> int:
	var views: Variant = data.get("bufferViews", [])
	var images: Variant = data.get("images", [])
	if typeof(views) != TYPE_ARRAY or typeof(images) != TYPE_ARRAY:
		return -1
	var pixels := 0
	for image in images:
		if typeof(image) != TYPE_DICTIONARY or not _whole(image.get("bufferView"), 0, views.size() - 1):
			return -1
		var view: Variant = views[int(image.bufferView)]
		if typeof(view) != TYPE_DICTIONARY or not _whole(view.get("buffer", 0), 0, 0) or not _whole(view.get("byteOffset", 0), 0, binary_length) or not _whole(view.get("byteLength"), 1, binary_length):
			return -1
		var start := binary_start + int(view.get("byteOffset", 0))
		var length := int(view.byteLength)
		if start + length > binary_start + binary_length:
			return -1
		var dimensions := _image_dimensions(bytes, start, length, str(image.get("mimeType", "")))
		if dimensions.x < 1 or dimensions.y < 1 or dimensions.x > 2048 or dimensions.y > 2048:
			return -1
		pixels += dimensions.x * dimensions.y
		if pixels > 8 * 1024 * 1024:
			return -1
	return pixels

static func _image_dimensions(bytes: PackedByteArray, start: int, length: int, mime: String) -> Vector2i:
	if mime == "image/png" and length >= 24 and bytes.slice(start, start + 8) == PackedByteArray([137,80,78,71,13,10,26,10]) and bytes.slice(start+8, start+16) == PackedByteArray([0,0,0,13,73,72,68,82]):
		var width: int = (bytes[start+16] << 24) | (bytes[start+17] << 16) | (bytes[start+18] << 8) | bytes[start+19]
		var height: int = (bytes[start+20] << 24) | (bytes[start+21] << 16) | (bytes[start+22] << 8) | bytes[start+23]
		return Vector2i(width, height)
	if mime != "image/jpeg" or length < 4 or bytes[start] != 255 or bytes[start+1] != 216:
		return Vector2i.ZERO
	var position := start + 2
	var end := start + length
	while position + 3 < end:
		if bytes[position] != 255:
			return Vector2i.ZERO
		while position < end and bytes[position] == 255:
			position += 1
		if position >= end:
			break
		var marker: int = bytes[position]
		position += 1
		if marker in [216, 1] or (marker >= 208 and marker <= 215):
			continue
		if marker in [217, 218] or position + 2 > end:
			break
		var segment_length: int = (bytes[position] << 8) | bytes[position+1]
		if segment_length < 2 or position + segment_length > end:
			return Vector2i.ZERO
		if marker in [192,193,194,195,197,198,199,201,202,203,205,206,207]:
			if segment_length < 7:
				return Vector2i.ZERO
			return Vector2i((bytes[position+5] << 8) | bytes[position+6], (bytes[position+3] << 8) | bytes[position+4])
		position += segment_length
	return Vector2i.ZERO

func _refresh() -> void:
	_clear_visuals()
	var desired := _desired()
	var needed_hashes: Dictionary = {}
	for item in desired:
		needed_hashes[item.sha256] = true
	for sha in _models.keys():
		if not needed_hashes.has(sha):
			_models.erase(sha)
			_model_costs.erase(sha)
	var rendered := 0
	var rendered_triangles := 0
	var rendered_mesh_instances := 0
	var rendered_surfaces := 0
	for item in desired:
		if not _models.has(item.sha256):
			continue
		var cost: Dictionary = _model_costs.get(item.sha256, {})
		if cost.is_empty() or rendered_triangles + int(cost.triangles) > MAX_RENDERED_TRIANGLES or rendered_mesh_instances + int(cost.instances) > MAX_RENDERED_MESH_INSTANCES or rendered_surfaces + int(cost.surfaces) > MAX_RENDERED_SURFACES:
			continue
		var model := (_models[item.sha256] as PackedScene).instantiate() as Node3D
		if model == null:
			continue
		var bounds: Variant = _model_bounds(model)
		if typeof(bounds) != TYPE_AABB:
			model.free()
			continue
		var dimension: float = maxf(bounds.size.x, maxf(bounds.size.y, bounds.size.z))
		if not is_finite(dimension) or dimension <= 0.0001:
			model.free()
			continue
		var row: int = int(item.zMm / 4000)
		var column: int = int(item.xMm / 4000)
		var tile: Dictionary = _chunks[item.chunk][row * 16 + column]
		var holder := Node3D.new()
		holder.name = "WorldVisual_%d" % rendered
		holder.set_meta("aurion_design_key", item.designKey)
		holder.set_meta("aurion_placement_key", item.placementKey)
		holder.set_meta("aurion_asset_sha256", item.sha256)
		holder.position = Vector3(float(item.chunk.x * CHUNK_MM + item.xMm - HALF_CHUNK_MM) / 1000.0,
			float(tile.heightMm) / 1000.0, float(item.chunk.y * CHUNK_MM + item.zMm - HALF_CHUNK_MM) / 1000.0)
		holder.rotation.y = float(item.rotation) * PI / 2.0
		var factor := clampf((_target_size(item.subcategory) / dimension) * (float(item.scale) / 1000.0), 0.05, 12.0)
		var midpoint: Vector3 = bounds.get_center()
		model.scale = Vector3.ONE * factor
		model.position = Vector3(-midpoint.x * factor, -bounds.position.y * factor, -midpoint.z * factor)
		holder.add_child(model)
		add_child(holder)
		rendered += 1
		rendered_triangles += int(cost.triangles)
		rendered_mesh_instances += int(cost.instances)
		rendered_surfaces += int(cost.surfaces)
	diagnostic = "Aurion-Weltentwurf: %d Modelle, %d noch nicht dargestellt" % [rendered, desired.size() - rendered]

static func _target_size(category: Variant) -> float:
	match category:
		"building": return 9.0
		"structure": return 5.0
		"teleporter": return 3.2
		"fountain": return 2.4
		"street-prop": return 1.8
		"tree": return 7.0
		"plant": return 1.2
		"rock": return 2.6
		_: return 2.5

static func _model_bounds(model: Node3D) -> Variant:
	var combined := AABB()
	var found := false
	for mesh in model.find_children("*", "MeshInstance3D", true, false):
		if not mesh is MeshInstance3D or mesh.mesh == null:
			continue
		var transform := Transform3D.IDENTITY
		var node: Node = mesh
		while node != model and node != null:
			if node is Node3D:
				transform = node.transform * transform
			node = node.get_parent()
		if node != model:
			return null
		var box: AABB = transform * mesh.get_aabb()
		if not box.position.is_finite() or not box.size.is_finite():
			return null
		combined = combined.merge(box) if found else box
		found = true
	return combined if found else null
