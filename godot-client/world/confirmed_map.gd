extends Control
## Presentation-only map of confirmed Aurion v5 snapshots. A/B/Haus are
## private, volatile design sketches; never sent to Aurion as gameplay commands.
signal selection_changed(label: String)

const SCALE := 0.018
const MAX_MARKERS := 128
var _records: Dictionary = {}
var _self_id := ""
var _selected := ""
var _armed := ""
var _plans: Dictionary = {}
var _fresh := false
var _origin := Vector2.ZERO

func set_confirmed(world: Variant, registry: Variant) -> void:
	if world == null or not world.has_state():
		clear()
		return
	_self_id = world.self_entity_id()
	var own: Dictionary = registry.record("presences", _self_id)
	if own.is_empty():
		clear()
		return
	_origin = Vector2(float(own["position"]["x"]), float(own["position"]["z"]))
	var updated: Dictionary = {}
	for category in ["presences", "mobs"]:
		for id in registry.ids(category):
			if updated.size() >= MAX_MARKERS:
				break
			var record: Dictionary = registry.record(category, id)
			if record.has("position"):
				updated[id] = record
	_records = updated
	if not _records.has(_selected):
		_selected = ""
		selection_changed.emit("")
	_fresh = true
	visible = true
	queue_redraw()

func marker_record(id: String) -> Dictionary:
	return (_records.get(id, {}) as Dictionary).duplicate(true)

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
	queue_redraw()

func clear() -> void:
	_records.clear()
	_plans.clear()
	_self_id = ""
	_selected = ""
	_armed = ""
	_fresh = false
	_origin = Vector2.ZERO
	visible = false
	selection_changed.emit("")
	queue_redraw()

func world_to_screen(position: Dictionary) -> Vector2:
	return size * 0.5 + (Vector2(float(position["x"]), float(position["z"])) - _origin) * (SCALE / 1000.0)

func _screen_to_world(point: Vector2) -> Dictionary:
	var coords := _origin + (point - size * 0.5) * (1000.0 / SCALE)
	return {"x": int(round(coords.x)), "z": int(round(coords.y))}

func _gui_input(event: InputEvent) -> void:
	if not _fresh or not (event is InputEventMouseButton) or event.button_index != MOUSE_BUTTON_LEFT or not event.pressed:
		return
	var point: Vector2 = event.position
	if not Rect2(Vector2.ZERO, size).has_point(point):
		return
	if not _armed.is_empty():
		var key := _armed
		_plans[key] = _screen_to_world(point)
		_armed = ""
		selection_changed.emit("Entwurf " + key + " · X %.2f m · Z %.2f m · nur lokal" % [float(_plans[key]["x"]) / 1000.0, float(_plans[key]["z"]) / 1000.0])
		queue_redraw()
		accept_event()
		return
	_selected = ""
	var distance := 18.0
	for id in _records:
		var record: Dictionary = _records[id]
		var delta := world_to_screen(record["position"]).distance_to(point)
		if delta < distance:
			distance = delta
			_selected = id
	if not _selected.is_empty():
		var selected := _records[_selected] as Dictionary
		selection_changed.emit("Aurion bestätigt · " + _selected + (" · Modell " + str(selected["archetype"]) if selected.has("archetype") else "") + " · X %.2f m · Z %.2f m" % [float(selected["position"]["x"]) / 1000.0, float(selected["position"]["z"]) / 1000.0])
	else:
		selection_changed.emit("Kein bestätigtes Objekt an dieser Position")
	queue_redraw()
	accept_event()

func _draw() -> void:
	var background := Color(0.055, 0.10, 0.13, 1)
	draw_rect(Rect2(Vector2.ZERO, size), background, true)
	for step in range(-10, 11):
		var axis := float(step) * 36.0
		draw_line(Vector2(size.x * 0.5 + axis, 0), Vector2(size.x * 0.5 + axis, size.y), Color(0.16, 0.28, 0.30, 0.55), 1)
		draw_line(Vector2(0, size.y * 0.5 + axis), Vector2(size.x, size.y * 0.5 + axis), Color(0.16, 0.28, 0.30, 0.55), 1)
	for id in _records:
		var record: Dictionary = _records[id]
		var location := world_to_screen(record["position"])
		if not Rect2(Vector2.ZERO, size).has_point(location):
			continue
		var tint := Color(0.93, 0.76, 0.36) if id == _self_id else Color(0.85, 0.32, 0.33) if id.begins_with("mob_") else Color(0.31, 0.75, 0.90)
		draw_circle(location, 8.0 if id == _self_id else 6.0, tint)
		if id == _selected:
			draw_arc(location, 12, 0, TAU, 28, Color.WHITE, 2)
	for label in _plans:
		var point := world_to_screen(_plans[label])
		if Rect2(Vector2.ZERO, size).has_point(point):
			draw_rect(Rect2(point - Vector2(5, 5), Vector2(10, 10)), Color(0.50, 0.96, 0.60), false, 2)
