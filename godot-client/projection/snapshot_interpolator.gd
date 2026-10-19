extends RefCounted
## Presentation-only bounded interpolation of server-confirmed positions.
## Integer millimetre values remain unchanged in the authoritative readmodel.
const WINDOW_MS := 100
var _connection := ""
var _seq := -1
var _positions: Dictionary = {}
var _start_positions: Dictionary = {}
var _captured_ms := 0

func reset() -> void:
	_connection = ""
	_seq = -1
	_positions.clear()
	_start_positions.clear()
	_captured_ms = 0

func capture(world: Variant, now_ms: int) -> bool:
	if world == null or not world.has_state() or now_ms < 0:
		return false
	var connection: String = world.connection_id()
	var seq: int = world.last_seq()
	if connection == _connection and seq <= _seq:
		return false
	var state: Dictionary = world.current_state()
	var next: Dictionary = {}
	for category in ["presences", "mobs"]:
		for entity in state[category]:
			next[entity["entityId"]] = entity["position"].duplicate(true)
	var same_session := connection == _connection
	var previous: Dictionary = {}
	for id in next:
		# Preserve the currently displayed position when a newer confirmed
		# snapshot arrives mid-transition. The new target stays server-owned.
		var current_visual: Variant = visual_mm(id, now_ms) if same_session else null
		if current_visual is Vector2:
			previous[id] = {"x": current_visual.x, "z": current_visual.y}
		else:
			previous[id] = next[id].duplicate(true)
	_positions = next
	_start_positions = previous
	_connection = connection
	_seq = seq
	_captured_ms = now_ms
	return true

func confirmed_mm(entity_id: String) -> Dictionary:
	var found: Dictionary = _positions.get(entity_id, {})
	return found.duplicate(true)

func visual_mm(entity_id: String, now_ms: int) -> Variant:
	if not _positions.has(entity_id):
		return null
	var a: Dictionary = _start_positions[entity_id]
	var b: Dictionary = _positions[entity_id]
	var factor := clampf(float(now_ms - _captured_ms) / float(WINDOW_MS), 0.0, 1.0)
	return Vector2(lerpf(float(a["x"]), float(b["x"]), factor), lerpf(float(a["z"]), float(b["z"]), factor))
