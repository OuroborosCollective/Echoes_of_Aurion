extends RefCounted
## G20 client input adapter: commands only, never authoritative position.
## Network pacing is 100 ms and does NOT change Aurion's 10 Hz server tick.
const SEND_INTERVAL_MS := 100
const DEADZONE := 0.20
var _last_sent_ms := -1
var _last_direction := Vector2i.ZERO

func _axis(v: float) -> int:
	if not is_finite(v):
		return 0
	if v > DEADZONE:
		return 1
	if v < -DEADZONE:
		return -1
	return 0

func quantize(input: Vector2) -> Vector2i:
	return Vector2i(_axis(input.x), _axis(input.y))

func send_if_due(now_ms: int, input: Vector2, zone: Node, permitted: bool) -> bool:
	if not permitted or zone == null or not zone.has_method("send_move"):
		reset()
		return false
	if now_ms < 0:
		return false
	var direction := quantize(input)
	if direction == Vector2i.ZERO and _last_direction == Vector2i.ZERO:
		return false
	if _last_sent_ms >= 0 and (now_ms < _last_sent_ms or now_ms - _last_sent_ms < SEND_INTERVAL_MS):
		return false
	if not bool(zone.call("send_move", direction.x, direction.y)):
		return false
	_last_sent_ms = now_ms
	_last_direction = direction
	return true

func cancel(zone: Node, permitted: bool) -> bool:
	var released := false
	if _last_direction != Vector2i.ZERO and permitted and zone != null and zone.has_method("send_move"):
		released = bool(zone.call("send_move", 0, 0))
	reset()
	return released

func reset() -> void:
	_last_sent_ms = -1
	_last_direction = Vector2i.ZERO
