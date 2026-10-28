extends Node3D
## G18 read-only presentation of an Aurion-confirmed WorldChunkReadModel.
## NEVER rebuild a world seed, claim persistence, compute collision or gameplay.
## The caller must authenticate the response and bind its zone/session epoch.
const MaterialCatalog = preload("res://world/material_catalog.gd")
const RULESET := "aurion-world-chunk.v1"
const TILE_COUNT := 256
const GRID_SIZE := 16
const TILE_METERS := 4.0
const CHUNK_METERS := 64.0
const SURFACE_MATERIAL := {
	"grass": "forest", "forest_floor": "forest",
	"riverbank": "rock", "stone": "rock", "ash": "rock",
	"ruin_path": "paving",
}
var diagnostic := "Nicht geladen"
var _last_connection := ""
var _last_model: Dictionary = {}

static func _whole(value: Variant, minimum: int, maximum: int) -> bool:
	if typeof(value) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	var number: float = float(value)
	return not is_nan(number) and not is_inf(number) and number >= minimum and number <= maximum and number == floor(number)

static func _hex(value: Variant, length: int) -> bool:
	if typeof(value) != TYPE_STRING or value.length() != length:
		return false
	for ch in value:
		if not "0123456789abcdef".contains(ch):
			return false
	return true

static func _fnv(value: Variant) -> bool:
	return typeof(value) == TYPE_STRING and value.begins_with("fnv1a-") and _hex(value.substr(6), 8)

func clear() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	_last_connection = ""
	_last_model.clear()
	diagnostic = "Nicht geladen"

func _reject(reason: String) -> bool:
	clear()
	diagnostic = reason
	return false

static func _validate(read_model: Variant) -> Dictionary:
	if typeof(read_model) != TYPE_DICTIONARY:
		return {"reason": "chunk_readmodel_missing"}
	var base: Variant = read_model.get("base")
	if typeof(base) != TYPE_DICTIONARY or base.get("ruleSetVersion") != RULESET or base.get("baseRevision") != 1:
		return {"reason": "chunk_revision_invalid"}
	if typeof(base.get("worldId")) != TYPE_STRING or base.worldId.is_empty() or base.worldId.length() > 128:
		return {"reason": "chunk_world_invalid"}
	if not _fnv(base.get("worldSeedDigest")) or not _hex(base.get("worldGenerationRevision"), 40):
		return {"reason": "chunk_world_provenance_invalid"}
	if not _fnv(base.get("deterministicHash")) or not _fnv(read_model.get("deterministicHash")):
		return {"reason": "chunk_hash_invalid"}
	if base.get("biome") not in ["forest", "riverland", "plains", "highland", "ashland", "ruins"]:
		return {"reason": "chunk_biome_invalid"}
	var coordinate: Variant = base.get("coordinate")
	if typeof(coordinate) != TYPE_DICTIONARY or not _whole(coordinate.get("x"), -1000000, 1000000) or not _whole(coordinate.get("z"), -1000000, 1000000):
		return {"reason": "chunk_coordinate_invalid"}
	var tiles: Variant = base.get("tiles")
	if typeof(tiles) != TYPE_ARRAY or tiles.size() != TILE_COUNT:
		return {"reason": "chunk_tiles_incomplete"}
	for field in ["appliedDeltaIds", "visibleResources", "structures", "roads"]:
		if typeof(read_model.get(field)) != TYPE_ARRAY:
			return {"reason": "chunk_readmodel_invalid"}
	if read_model.structures.size() > 24 or read_model.roads.size() > 32:
		return {"reason": "chunk_overlays_unbounded"}
	var tiles_by_index: Array = []
	tiles_by_index.resize(TILE_COUNT)
	for item in tiles:
		if typeof(item) != TYPE_DICTIONARY:
			return {"reason": "chunk_tile_invalid"}
		var x: Variant = item.get("x")
		var z: Variant = item.get("z")
		if not _whole(x, 0, GRID_SIZE - 1) or not _whole(z, 0, GRID_SIZE - 1):
			return {"reason": "chunk_tile_coordinate_invalid"}
		if not _whole(item.get("heightMm"), -100000, 100000):
			return {"reason": "chunk_height_invalid"}
		if typeof(item.get("surface")) != TYPE_STRING or not SURFACE_MATERIAL.has(item.surface):
			return {"reason": "chunk_surface_invalid"}
		var index: int = int(z) * GRID_SIZE + int(x)
		if tiles_by_index[index] != null:
			return {"reason": "chunk_duplicate_tile"}
		tiles_by_index[index] = item
	for tile in tiles_by_index:
		if tile == null:
			return {"reason": "chunk_tile_missing"}
	return {"status": "validated", "tiles": tiles_by_index, "coordinate": coordinate}

static func _vertex(st: SurfaceTool, point: Vector3, uv: Vector2) -> void:
	# Godot 4 uses clockwise front faces. Explicit +Y lighting is needed for
	# horizontal tiles because clockwise XZ winding has a -Y cross product.
	st.set_normal(Vector3.UP)
	st.set_uv(uv)
	st.add_vertex(point)

func apply_confirmed(read_model: Variant, connection_id: String) -> bool:
	if connection_id.is_empty() or connection_id.length() > 128:
		return _reject("chunk_connection_missing")
	var checked := _validate(read_model)
	if checked.get("status") != "validated":
		return _reject(str(checked.get("reason", "chunk_unverified")))
	# Match the complete server-shaped readback, not merely a short FNV hash.
	if _last_connection == connection_id and _last_model == read_model and get_child_count() == 1:
		return true
	var catalog: Dictionary = MaterialCatalog.new().build()
	if catalog.get("status") != "resolved":
		return _reject("chunk_materials_" + str(catalog.get("reason", "unavailable")))
	var materials: Dictionary = catalog.materials
	var mesh := ArrayMesh.new()
	var sorted_tiles: Array = checked.tiles
	var coord: Dictionary = checked.coordinate
	var origin_x: float = float(coord.x) * CHUNK_METERS - CHUNK_METERS / 2.0
	var origin_z: float = float(coord.z) * CHUNK_METERS - CHUNK_METERS / 2.0
	# Material surfaces are created in a fixed order; server tile order cannot
	# change mesh topology or introduce a second gameplay state.
	for material_name in ["paving", "forest", "rock"]:
		var material: StandardMaterial3D = materials.get(material_name) as StandardMaterial3D
		if material == null:
			return _reject("chunk_material_missing")
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		st.set_material(material)
		var count := 0
		for tile in sorted_tiles:
			if SURFACE_MATERIAL.get(tile.surface) != material_name:
				continue
			count += 1
			var x: float = origin_x + float(tile.x) * TILE_METERS
			var z: float = origin_z + float(tile.z) * TILE_METERS
			var y: float = float(tile.heightMm) / 1000.0
			var a := Vector3(x, y, z)
			var b := Vector3(x + TILE_METERS, y, z)
			var c := Vector3(x, y, z + TILE_METERS)
			var d := Vector3(x + TILE_METERS, y, z + TILE_METERS)
			# Clockwise on screen when viewed from above: visible from +Y in
			# Godot 4's Compatibility renderer; the previous order was culled.
			_vertex(st, a, Vector2(0, 0))
			_vertex(st, b, Vector2(1, 0))
			_vertex(st, c, Vector2(0, 1))
			_vertex(st, b, Vector2(1, 0))
			_vertex(st, d, Vector2(1, 1))
			_vertex(st, c, Vector2(0, 1))
		if count > 0:
			st.commit(mesh)
	if mesh.get_surface_count() == 0:
		return _reject("chunk_mesh_empty")
	clear()
	var display := MeshInstance3D.new()
	display.name = "ConfirmedChunkSurface"
	display.mesh = mesh
	add_child(display)
	_last_connection = connection_id
	_last_model = read_model.duplicate(true)
	diagnostic = "Bestätigter Chunk als Darstellung; keine Gameplay-Kollision"
	return true
