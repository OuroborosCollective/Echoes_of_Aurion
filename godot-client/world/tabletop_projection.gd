extends Node3D
## Ephemeral presentation of the same protected Aurion slice. No simulation,
## collision, discovery, asset download, seed regeneration or gameplay signals.
const Slice = preload("res://projection/world_slice.gd")
const Terrain = preload("res://world/chunk_terrain.gd")
var terrain := Terrain.new()
var structures := Node3D.new()
var roads := Node3D.new()
var own_position := Node3D.new()
var _slice: Dictionary = {}
var _fingerprint := ""
var _connection := ""
var _ceiling := INF
var _transparent := false
func _init() -> void:
	terrain.name = "FilteredTerrain"
	structures.name = "DisclosedStructureMarkers"
	roads.name = "DisclosedRoads"
	own_position.name = "OwnPosition"
	for node in [terrain, structures, roads, own_position]: add_child(node)
func _empty(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()
func clear() -> void:
	terrain.clear()
	for node in [structures, roads, own_position]: _empty(node)
	_slice.clear()
	_fingerprint = ""
	_connection = ""
func readback_fingerprint() -> String:
	return _fingerprint
func snapshot() -> Dictionary:
	return _slice.duplicate(true)
func apply_readback(response: Variant, connection: String, actor: String, coordinate: Vector2i) -> bool:
	var checked := Slice.validate(response, connection, actor, coordinate)
	if not checked.get("ok", false):
		clear()
		return false
	var s: Dictionary = checked.slice
	if _connection == connection and not _slice.is_empty():
		if int(s.epoch) < int(_slice.epoch) or (s.epoch == _slice.epoch and s.worldRoot != _slice.worldRoot):
			clear()
			return false
	if _connection == connection and _fingerprint == checked.fingerprint and _slice == s: return true
	clear()
	_connection = connection
	_slice = s
	_fingerprint = checked.fingerprint
	_rebuild()
	return true
func _local(point: Dictionary) -> Vector3:
	return Vector3(float(_slice.coordinate.x) * 64.0 - 32.0 + float(point.x) / 1000.0, 0.0, float(_slice.coordinate.z) * 64.0 - 32.0 + float(point.z) / 1000.0)
func _height(point: Dictionary) -> float:
	if _slice.chunks.is_empty(): return 0.0
	return Slice.height_at(_slice.chunks[0], point)
func _display(parent: Node3D, mesh: Mesh, color: Color, at: Vector3) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 1.0
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if color.a < 1.0: material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	node.material_override = material
	node.position = at
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(node)
	return node
func _rebuild() -> void:
	terrain.clear()
	for node in [structures, roads, own_position]: _empty(node)
	if _slice.is_empty(): return
	if not _slice.chunks.is_empty():
		var chunk: Dictionary = _slice.chunks[0]
		terrain.apply_filtered_tiles(chunk.tiles, chunk.coordinate, _connection, _ceiling)
		# Markers disclose a known placement, never an invented building/model or
		# underground volume. Only server-approved asset renderers own GLB shape.
		var overlays := Slice.filtered_overlays(chunk, _ceiling)
		for item in overlays.structures:
			var at := _local(item.positionMm)
			at.y = _height(item.positionMm) + 0.5
			var marker := BoxMesh.new()
			marker.size = Vector3(1.0, 1.0, 1.0)
			var node := _display(structures, marker, Color(0.94, 0.68, 0.24, 0.3 if _transparent else 1.0), at)
			node.set_meta("placement_id", item.id)
		for item in overlays.roads:
			var a := _local(item.fromMm)
			var b := _local(item.toMm)
			a.y = _height(item.fromMm) + 0.05
			b.y = _height(item.toMm) + 0.05
			var line := ImmediateMesh.new()
			line.surface_begin(Mesh.PRIMITIVE_LINES)
			line.surface_add_vertex(a)
			line.surface_add_vertex(b)
			line.surface_end()
			_display(roads, line, Color(0.9, 0.85, 0.66), Vector3.ZERO)
	var position: Dictionary = _slice.entities[0].position
	var pin := SphereMesh.new()
	pin.radius = 0.65
	pin.height = 1.3
	pin.radial_segments = 8
	pin.rings = 4
	_display(own_position, pin, Color(0.28, 0.86, 0.82), Vector3(float(position.x) / 1000.0, 2.5, float(position.z) / 1000.0))
func set_ceiling(height: float) -> void:
	if is_nan(height): return
	var next := clampf(height, -100.0, 100.0) if is_finite(height) else INF
	if next == _ceiling: return
	_ceiling = next
	_rebuild()
func set_transparency(enabled: bool) -> void:
	if _transparent == enabled: return
	_transparent = enabled
	for node in structures.get_children():
		var material: StandardMaterial3D = node.material_override
		material.albedo_color.a = 0.3 if enabled else 1.0
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA if enabled else BaseMaterial3D.TRANSPARENCY_DISABLED
func set_category(category: String, enabled: bool) -> void:
	match category:
		"terrain": terrain.visible = enabled
		"structures": structures.visible = enabled
		"roads": roads.visible = enabled
		"self": own_position.visible = enabled
