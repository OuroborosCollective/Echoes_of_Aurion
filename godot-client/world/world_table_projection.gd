extends Node3D
## Bounded visual projection only. Never registers collision or gameplay entities.
const Slice = preload("res://projection/world_slice.gd")
const COLORS := {"grass": Color(0.18, 0.35, 0.24), "forest_floor": Color(0.12, 0.24, 0.19), "riverbank": Color(0.35, 0.38, 0.32), "stone": Color(0.42, 0.44, 0.46), "ash": Color(0.28, 0.27, 0.30), "ruin_path": Color(0.48, 0.43, 0.33)}
var _reply: Dictionary = {}
var flat := false
var cut_height := 100.0
var show_structures := true
var show_roads := true

func clear() -> void:
	_reply.clear()
	for child in get_children():
		remove_child(child)
		child.queue_free()

func apply_confirmed(reply: Variant, actor: String, connection: String, coordinate: Vector2i) -> bool:
	clear()
	if not Slice.valid(reply, actor, connection, coordinate):
		return false
	_reply = reply.duplicate(true)
	rebuild()
	return true

func rebuild() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	if _reply.is_empty() or _reply.status != "VERIFIED":
		return
	var chunk: Dictionary = _reply.slice.chunks[0]
	# At most six mesh surfaces and one marker; no per-tile nodes or colliders.
	var mesh := ArrayMesh.new()
	for surface in COLORS:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var count := 0
		for tile in chunk.tiles:
			if tile.surface != surface or float(tile.heightMm) / 1000.0 > cut_height:
				continue
			var x := float(tile.x) * 4.0 - 32.0
			var z := float(tile.z) * 4.0 - 32.0
			var y := 0.0 if flat else float(tile.heightMm) / 1000.0
			for v in [Vector3(x,y,z), Vector3(x+4,y,z), Vector3(x,y,z+4), Vector3(x+4,y,z), Vector3(x+4,y,z+4), Vector3(x,y,z+4)]:
				st.set_normal(Vector3.UP)
				st.add_vertex(v)
			count += 1
		if count > 0:
			var material := StandardMaterial3D.new()
			material.albedo_color = COLORS[surface]
			material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			st.set_material(material)
			st.commit(mesh)
	if mesh.get_surface_count() > 0:
		var terrain := MeshInstance3D.new()
		terrain.mesh = mesh
		add_child(terrain)
	# Markers show confirmed coordinates, not invented structure geometry.
	if show_structures:
		for structure in chunk.structures:
			_marker(_point(structure.positionMm), Color(0.90, 0.72, 0.30))
	if show_roads:
		var lines := ImmediateMesh.new()
		if not chunk.roads.is_empty():
			lines.surface_begin(Mesh.PRIMITIVE_LINES)
			for road in chunk.roads:
				var start := _point(road.fromMm)
				var end := _point(road.toMm)
				if start.y - 0.15 > cut_height or end.y - 0.15 > cut_height:
					continue
				if flat:
					start.y = 0.15
					end.y = 0.15
				lines.surface_set_color(Color(0.7, 0.7, 0.6))
				lines.surface_add_vertex(start)
				lines.surface_add_vertex(end)
			lines.surface_end()
			var road_mesh := MeshInstance3D.new()
			road_mesh.mesh = lines
			road_mesh.material_override = _unshaded(Color(0.7,0.7,0.6))
			add_child(road_mesh)
	var own: Dictionary = _reply.slice.entities[0].position
	var coord: Dictionary = _reply.slice.coordinate
	_marker(_point({"x": float(own.x) - float(coord.x) * 64000.0 + 32000.0, "z": float(own.z) - float(coord.z) * 64000.0 + 32000.0}), Color(0.35, 0.8, 0.95))

func _point(local: Dictionary) -> Vector3:
	var x := float(local.x) / 1000.0 - 32.0
	var z := float(local.z) / 1000.0 - 32.0
	var tile_index := clampi(int(floor(float(local.z) / 4000.0)), 0, 15) * 16 + clampi(int(floor(float(local.x) / 4000.0)), 0, 15)
	var y := 0.0
	for tile in _reply.slice.chunks[0].tiles:
		if int(tile.z) * 16 + int(tile.x) == tile_index:
			y = float(tile.heightMm) / 1000.0
			break
	return Vector3(x, y + 0.15, z)

func _marker(point: Vector3, color: Color) -> void:
	if point.y - 0.15 > cut_height:
		return
	if flat:
		point.y = 0.15
	var marker := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.45
	sphere.height = 0.9
	sphere.radial_segments = 8
	sphere.rings = 4
	marker.mesh = sphere
	marker.material_override = _unshaded(color)
	marker.position = point
	add_child(marker)

func _unshaded(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.albedo_color = color
	return material
