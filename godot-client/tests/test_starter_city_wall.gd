extends SceneTree
## Presentation checks only. Optional actual files are byte-verified; no live claims.
const WallProjection = preload("res://world/world_design_projection.gd")

func _init() -> void:
	for sha in WallProjection.STARTER_CITY_WALL_HASHES:
		assert(is_equal_approx(WallProjection._visual_scale(sha, "structure", 101.5, 1000), 1.0))
		assert(is_equal_approx(WallProjection._visual_scale(sha, "structure", 101.5, 500), 0.5))
	assert(is_equal_approx(WallProjection._visual_scale("f".repeat(64), "structure", 10.0, 1000), 0.5))
	_test_selection()
	var directory := OS.get_environment("AURION_CITY_WALL_ASSET_DIR")
	if not directory.is_empty():
		for level in range(3):
			var path := directory.path_join("Aurion_CityWall_LOD%d.glb" % level)
			var bytes := FileAccess.get_file_as_bytes(path)
			var hash := HashingContext.new()
			hash.start(HashingContext.HASH_SHA256)
			hash.update(bytes)
			assert(hash.finish().hex_encode() == WallProjection.STARTER_CITY_WALL_HASHES[level])
			var state := GLTFState.new()
			var document := GLTFDocument.new()
			assert(document.append_from_buffer(bytes, "", state) == OK)
			var model := document.generate_scene(state)
			assert(model != null)
			var bounds: AABB = WallProjection._model_bounds(model)
			assert(absf(bounds.size.x - 101.5) < 0.01)
			assert(absf(bounds.size.y - 12.3) < 0.01)
			assert(absf(bounds.size.z - 89.5) < 0.01)
			var meshes := model.find_children("*", "MeshInstance3D", true, false)
			assert(meshes.size() == 4)
			for mesh in meshes:
				var material: StandardMaterial3D = mesh.mesh.surface_get_material(0)
				assert(material != null and material.albedo_texture != null)
				assert(material.normal_enabled and material.normal_texture != null)
			model.free()
		print("GODOT_STARTER_CITY_WALL_REAL_GLB_IMPORT_PASS (actual files; not live world)")
	print("GODOT_STARTER_CITY_WALL_SCALE_PASS (presentation only)")
	quit(0)

func _test_selection() -> void:
	var projection := WallProjection.new()
	projection._center = Vector2i.ZERO
	projection._has_center = true
	projection._chunks = {Vector2i.ZERO: [], Vector2i(1, 0): []}
	for index in range(18):
		projection._placements.append({"designKey":"props", "placementKey":"prop-%02d" % index,
			"chunk":Vector2i.ZERO, "sha256":"f".repeat(64), "xMm":32000, "zMm":32000, "scale":1000, "rotation":0})
	var wall := {"designKey":"wall", "placementKey":"perimeter", "chunk":Vector2i(1, 0),
		"sha256":WallProjection.STARTER_CITY_WALL_HASHES[0], "xMm":32000, "zMm":32000, "scale":1000, "rotation":0}
	projection._placements.append(wall)
	var selected := projection._desired()
	assert(selected.size() == 18 and selected[0].designKey == "wall")
	assert(selected[1].placementKey == "prop-00" and selected[-1].placementKey == "prop-16")
	wall.scale = 250
	projection._desired_dirty = true
	assert(projection._desired()[0].designKey == "props")
	wall.scale = 1000
	wall.xMm = 50000 # dx=82m: only the unrotated 50.75m half extent overlaps.
	assert(projection._wall_overlaps_center(wall))
	wall.rotation = 1
	assert(not projection._wall_overlaps_center(wall))
	projection.free()
