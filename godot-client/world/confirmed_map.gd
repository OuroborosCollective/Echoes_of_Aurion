extends Control
## Presentation-only map of confirmed Aurion v5 snapshots. A/B/Haus are
## private, volatile design sketches; never sent to Aurion as gameplay commands.
signal selection_changed(label: String)

const SCALE := 18.0
const MAX_PRESENCES := 96
const MAX_MOBS := 32
const TAP_DRAG_THRESHOLD := 12.0
var _records: Dictionary = {}
var _visual_positions: Dictionary = {}
var _visual_origin := {"x": 0.0, "z": 0.0}
var _self_id := ""
var _selected := ""
var _armed := ""
var _plans: Dictionary = {}
var _fresh := false
var _origin := {"x": 0, "z": 0}
var _pointer_down := false
var _pointer_dragged := false
var _pointer_origin := Vector2.ZERO

func set_confirmed(world: Variant, registry: Variant) -> void:
	if world == null or not world.has_state():
		clear()
		return
	_self_id = world.self_entity_id()
	var own: Dictionary = registry.record("presences", _self_id)
	if own.is_empty():
		clear()
		return
	_origin = {"x": int(own["position"]["x"]), "z": int(own["position"]["z"])}
	var updated: Dictionary = {_self_id: own}
	var presence_count := 1
	for id in registry.ids("presences"):
		if id == _self_id:
			continue
		if presence_count >= MAX_PRESENCES:
			break
		var record: Dictionary = registry.record("presences", id)
		if record.has("position"):
			updated[id] = record
			presence_count += 1
	var mob_count := 0
	for id in registry.ids("mobs"):
		if mob_count >= MAX_MOBS:
			break
		var record: Dictionary = registry.record("mobs", id)
		if record.has("position"):
			updated[id] = record
			mob_count += 1
	_records = updated
	_visual_positions.clear()
	for id in _records:
		_visual_positions[id] = (_records[id]["position"] as Dictionary).duplicate(true)
	_visual_origin = (_visual_positions[_self_id] as Dictionary).duplicate(true)
	if not _records.has(_selected):
		_selected = ""
		if _armed.is_empty():
			selection_changed.emit("")
	elif not _selected.is_empty() and _armed.is_empty():
		selection_changed.emit(_describe_record(_selected))
	_fresh = true
	visible = true
	queue_redraw()

func set_visual_positions(interpolator: Variant, now_ms: int) -> void:
	if _records.is_empty():
		return
	var updated: Dictionary = {}
	for id in _records:
		var position: Dictionary = interpolator.visual_precise_mm(id, now_ms)
		updated[id] = position if not position.is_empty() else (_records[id]["position"] as Dictionary).duplicate(true)
	_visual_positions = updated
	_visual_origin = (_visual_positions[_self_id] as Dictionary).duplicate(true)
	queue_redraw()

func marker_record(id: String) -> Dictionary:
	return (_records.get(id, {}) as Dictionary).duplicate(true)

func marker_screen(id: String) -> Vector2:
	if not _visual_positions.has(id):
		return Vector2.ZERO
	return _position_to_screen(_visual_positions[id])

func selected_record() -> Dictionary:
	return marker_record(_selected)

func plan_points() -> Dictionary:
	return _plans.duplicate(true)

func arm_plan(label: String) -> bool:
	if not _fresh or label not in ["A", "B", "Haus"]:
		return false
	_armed = label
	selection_changed.emit("Entwurf " + label + " · Punkt auf Karte wählen (nicht gespeichert)")
	return true

func set_stale(stale: bool) -> void:
	_fresh = not stale and not _records.is_empty()
	if stale:
		_armed = ""
		_pointer_down = false
	queue_redraw()

func clear() -> void:
	_records.clear()
	_visual_positions.clear()
	_plans.clear()
	_self_id = ""
	_selected = ""
	_armed = ""
	_fresh = false
	_origin = {"x": 0, "z": 0}
	_visual_origin = {"x": 0.0, "z": 0.0}
	_pointer_down = false
	_pointer_dragged = false
	visible = false
	selection_changed.emit("")
	queue_redraw()

func world_to_screen(position: Dictionary) -> Vector2:
	return _position_to_screen(position)

func _position_to_screen(position: Dictionary) -> Vector2:
	var relative_x := float(position["x"]) - float(_visual_origin["x"])
	var relative_z := float(position["z"]) - float(_visual_origin["z"])
	return size * 0.5 + Vector2(relative_x, relative_z) * (SCALE / 1000.0)

func _screen_to_world(point: Vector2) -> Dictionary:
	var relative := (point - size * 0.5) * (1000.0 / SCALE)
	return {
		"x": int(round(float(_visual_origin["x"]) + relative.x)),
		"z": int(round(float(_visual_origin["z"]) + relative.y)),
	}

func _gui_input(event: InputEvent) -> void:
	if not _fresh:
		return
	if event is InputEventMouseMotion and _pointer_down:
		if event.position.distance_to(_pointer_origin) > TAP_DRAG_THRESHOLD:
			_pointer_dragged = true
		return
	if not (event is InputEventMouseButton) or event.button_index != MOUSE_BUTTON_LEFT:
		return
	if event.pressed:
		_pointer_down = true
		_pointer_dragged = false
		_pointer_origin = event.position
		return
	var point: Vector2 = event.position
	var is_tap := _pointer_down and not _pointer_dragged and point.distance_to(_pointer_origin) <= TAP_DRAG_THRESHOLD
	_pointer_down = false
	if not is_tap or not Rect2(Vector2.ZERO, size).has_point(point):
		return
	_activate_point(point)
	accept_event()

func _activate_point(point: Vector2) -> void:
	if not _armed.is_empty():
		var key := _armed
		_plans[key] = _screen_to_world(point)
		_armed = ""
		selection_changed.emit("Entwurf " + key + " · X %.2f m · Z %.2f m · nur lokal" % [float(_plans[key]["x"]) / 1000.0, float(_plans[key]["z"]) / 1000.0])
		queue_redraw()
		return
	_selected = ""
	var distance := 18.0
	for id in _records:
		var record: Dictionary = _records[id]
		var location := marker_screen(id)
		if not Rect2(Vector2.ZERO, size).has_point(location):
			continue
		var delta := location.distance_to(point)
		# Later-drawn records win exact ties, so a visible mob remains selectable.
		if delta <= distance:
			distance = delta
			_selected = id
	selection_changed.emit(_describe_record(_selected) if not _selected.is_empty() else "Kein bestätigtes Objekt an dieser Position")
	queue_redraw()

func _describe_record(id: String) -> String:
	var selected := _records[id] as Dictionary
	return "Aurion bestätigt · " + id + (" · Modell " + str(selected["archetype"]) if selected.has("archetype") else "") + " · X %.2f m · Z %.2f m" % [float(selected["position"]["x"]) / 1000.0, float(selected["position"]["z"]) / 1000.0]

func _plan_tint(label: String) -> Color:
	if label == "A":
		return Color(0.50, 0.96, 0.60)
	if label == "B":
		return Color(0.98, 0.72, 0.28)
	return Color(0.36, 0.78, 0.96)

func _draw() -> void:
	var background := Color(0.055, 0.10, 0.13, 1)
	draw_rect(Rect2(Vector2.ZERO, size), background, true)
	for step in range(-10, 11):
		var axis := float(step) * 36.0
		draw_line(Vector2(size.x * 0.5 + axis, 0), Vector2(size.x * 0.5 + axis, size.y), Color(0.16, 0.28, 0.30, 0.55), 1)
		draw_line(Vector2(0, size.y * 0.5 + axis), Vector2(size.x, size.y * 0.5 + axis), Color(0.16, 0.28, 0.30, 0.55), 1)
	for id in _records:
		var record: Dictionary = _records[id]
		var location := marker_screen(id)
		if not Rect2(Vector2.ZERO, size).has_point(location):
			continue
		var tint := Color(0.93, 0.76, 0.36) if id == _self_id else Color(0.85, 0.32, 0.33) if id.begins_with("mob_") else Color(0.31, 0.75, 0.90)
		draw_circle(location, 8.0 if id == _self_id else 6.0, tint)
		if id == _selected:
			draw_arc(location, 12, 0, TAU, 28, Color.WHITE, 2)
	for label in _plans:
		var point := world_to_screen(_plans[label])
		if Rect2(Vector2.ZERO, size).has_point(point):
			var tint := _plan_tint(label)
			draw_rect(Rect2(point - Vector2(5, 5), Vector2(10, 10)), tint, false, 2)
			draw_string(ThemeDB.fallback_font, point + Vector2(8, 5), str(label), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, tint)
