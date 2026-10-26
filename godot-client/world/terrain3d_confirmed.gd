extends Node3D
## Optional G19 GPU renderer; source authority stays Aurion protected readback.
## Never generates gameplay heights, physics, seeds or persisted world edits.
const ChunkTerrain = preload("res://world/chunk_terrain.gd")
const MaterialCatalog = preload("res://world/material_catalog.gd")
const CHUNK_METERS := 64
const REGION_METERS := 256
const TILE_METERS := 4
const MAX_CHUNKS := 9
const MATERIAL_IDS := {"grass":0, "forest_floor":0, "riverbank":1, "stone":1, "ash":1, "ruin_path":2}
var _models: Dictionary = {}
var _connection := ""
var _terrain: Node3D = null
var diagnostic := "Terrain3D nicht initialisiert"

func terrain_node() -> Node3D:
	return _terrain

func active_chunk_count() -> int:
	return _models.size()

func clear() -> void:
	_models.clear()
	_connection = ""
	if _terrain != null:
		remove_child(_terrain)
		_terrain.queue_free()
		_terrain = null
	diagnostic = "Terrain3D zurückgesetzt"

func remove_chunk(coord: Vector2i) -> bool:
	if not _models.has(coord):
		return false
	_models.erase(coord)
	_rebuild()
	return true

func apply_confirmed(model: Variant, connection_id: String) -> bool:
	if connection_id.is_empty() or connection_id.length() > 128:
		clear()
		diagnostic = "terrain_session_invalid"
		return false
	var validation: Dictionary = ChunkTerrain.new()._validate(model)
	if validation.get("status") != "validated":
		var bad_coord := Vector2i.ZERO
		if typeof(model) == TYPE_DICTIONARY and typeof(model.get("base")) == TYPE_DICTIONARY:
			var coord: Variant = model.base.get("coordinate")
			if typeof(coord) == TYPE_DICTIONARY and typeof(coord.get("x")) == TYPE_INT and typeof(coord.get("z")) == TYPE_INT:
				bad_coord = Vector2i(coord.x, coord.z)
		if _connection == connection_id and _models.has(bad_coord):
			_models.erase(bad_coord)
			_rebuild()
		else:
			clear()
		diagnostic = str(validation.get("reason", "terrain_unverified"))
		return false
	if _connection != connection_id:
		clear()
		_connection = connection_id
	var coord: Dictionary = validation.coordinate
	var position := Vector2i(int(coord.x), int(coord.z))
	if _models.has(position) and _models[position] == model:
		return _terrain != null
	if not _models.has(position) and _models.size() >= MAX_CHUNKS:
		diagnostic = "terrain_chunk_budget_exhausted"
		return false
	_models[position] = model.duplicate(true)
	if not _rebuild():
		_models.erase(position)
		_rebuild()
		return false
	diagnostic = "Terrain3D: %d bestätigte Chunks (darstellend)" % _models.size()
	return true

func _rebuild() -> bool:
	if _terrain != null:
		remove_child(_terrain)
		_terrain.queue_free()
		_terrain = null
	if _models.is_empty():
		return true
	if not ClassDB.class_exists("Terrain3D"):
		diagnostic = "terrain3d_native_addon_unavailable"
		return false
	var catalog := MaterialCatalog.new().build()
	if catalog.get("status") != "resolved":
		diagnostic = "terrain_atlas_unavailable"
		return false
	var terrain := ClassDB.instantiate("Terrain3D") as Node3D
	if terrain == null:
		diagnostic = "terrain3d_create_failed"
		return false
	terrain.name = "AurionConfirmedTerrain3D"
	add_child(terrain)
	terrain.region_size = REGION_METERS
	terrain.mesh_lods = 4
	terrain.material.world_background = 0
	terrain.material.auto_shader = false
	terrain.collision.mode = 0
	var assets = ClassDB.instantiate("Terrain3DAssets")
	for pair in [{"name":"forest","id":0},{"name":"rock","id":1},{"name":"paving","id":2}]:
		var source: StandardMaterial3D = catalog.materials[pair.name] as StandardMaterial3D
		var asset = ClassDB.instantiate("Terrain3DTextureAsset")
		asset.name = pair.name
		asset.albedo_texture = source.albedo_texture
		asset.albedo_color = Color.WHITE
		asset.uv_scale = 0.25
		assets.set_texture(pair.id, asset)
	terrain.assets = assets
	# Region maps are fully rebuilt only on confirmed changes, never per frame.
	# Missing/unconfirmed meters are HOLES, not a fabricated planar game world.
	var regions: Dictionary = {}
	var samples: Dictionary = {}
	for coord in _models:
		var model: Dictionary = _models[coord]
		var origin_x: int = coord.x * CHUNK_METERS - CHUNK_METERS / 2
		var origin_z: int = coord.y * CHUNK_METERS - CHUNK_METERS / 2
		for tile in model.base.tiles:
			var base_x: int = origin_x + int(tile.x) * TILE_METERS
			var base_z: int = origin_z + int(tile.z) * TILE_METERS
			for z in range(base_z, base_z + TILE_METERS):
				for x in range(base_x, base_x + TILE_METERS):
					var reg := Vector2i(floori(float(x) / REGION_METERS), floori(float(z) / REGION_METERS))
					regions[reg] = true
					samples[Vector2i(x,z)] = {"height":float(tile.heightMm) / 1000.0,"mat":int(MATERIAL_IDS[tile.surface])}
	if regions.size() > 9:
		terrain.queue_free()
		remove_child(terrain)
		diagnostic = "terrain_region_budget_exceeded"
		return false
	var util = ClassDB.instantiate("Terrain3DUtil")
	for reg in regions:
		var origin_x: int = reg.x * REGION_METERS
		var origin_z: int = reg.y * REGION_METERS
		var heights := Image.create(REGION_METERS, REGION_METERS, false, Image.FORMAT_RF)
		var controls := Image.create(REGION_METERS, REGION_METERS, false, Image.FORMAT_RF)
		heights.fill(Color(0, 0, 0, 1))
		controls.fill(Color(util.as_float(4), 0, 0, 1)) # hole flag, ID 0
		for z in range(REGION_METERS):
			for x in range(REGION_METERS):
				var sample: Dictionary = samples.get(Vector2i(origin_x + x, origin_z + z), {})
				if sample.is_empty():
					continue
				heights.set_pixel(x, z, Color(sample.height, 0, 0, 1))
				controls.set_pixel(x, z, Color(util.as_float(int(sample.mat) << 27), 0, 0, 1))
		terrain.data.import_images([heights, controls, null], Vector3(origin_x, 0, origin_z))
	_terrain = terrain
	return true
