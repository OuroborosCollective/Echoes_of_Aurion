extends Control
## 2D fallback of the identical filtered slice; never fetches or expands knowledge.
var _slice: Dictionary = {}
var _categories := {"terrain":true,"structures":true,"roads":true,"self":true}
var _ceiling := INF
func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
func set_slice(value: Dictionary) -> void:
	_slice = value.duplicate(true)
	queue_redraw()
func set_category(category: String, enabled: bool) -> void:
	if _categories.has(category): _categories[category] = enabled
	queue_redraw()
func set_ceiling(height: float) -> void:
	_ceiling = height
	queue_redraw()
func _point(point: Dictionary, rect: Rect2) -> Vector2:
	return rect.position + Vector2(float(point.x), float(point.z)) * rect.size / 64000.0
func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("0c1722"))
	if _slice.is_empty(): return
	var length := maxf(0.0, minf(size.x - 32.0, size.y - 160.0))
	var rect := Rect2((size - Vector2.ONE * length) * 0.5 + Vector2(0, 32), Vector2.ONE * length)
	draw_rect(rect, Color("202c38"))
	for chunk in _slice.chunks:
		if _categories.terrain:
			for tile in chunk.tiles:
				if float(tile.heightMm) / 1000.0 > _ceiling: continue
				var color := Color("446354") if tile.surface in ["grass", "forest_floor"] else Color("8b8574")
				draw_rect(Rect2(rect.position + Vector2(tile.x, tile.z) * length / 16.0, Vector2.ONE * (length / 16.0)), color)
		if _categories.roads:
			for road in chunk.roads: draw_line(_point(road.fromMm, rect), _point(road.toMm, rect), Color("e6d8ac"), 2.0)
		if _categories.structures:
			for item in chunk.structures: draw_circle(_point(item.positionMm, rect), 4.0, Color("efad3d"))
	if _categories.self:
		var at: Dictionary = _slice.entities[0].position
		var local_point := {"x":float(at.x) - float(_slice.coordinate.x) * 64000.0 + 32000.0, "z":float(at.z) - float(_slice.coordinate.z) * 64000.0 + 32000.0}
		draw_circle(_point(local_point, rect), 5.0, Color("47dbd1"))
