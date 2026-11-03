extends RefCounted
## Local-only G21 finger ownership. Touch ID is not a network/gameplay identity.
const DRAG_THRESHOLD_PX := 12.0
const MIN_PINCH_DISTANCE_PX := 16.0
var _camera_finger := -1
var _second_finger := -1
var _second_position := Vector2.ZERO
var _pinched := false
var _start := Vector2.ZERO
var _last := Vector2.ZERO
var _dragged := false

func active_finger() -> int:
	return _camera_finger

func cancel() -> void:
	_camera_finger = -1
	_second_finger = -1
	_second_position = Vector2.ZERO
	_pinched = false
	_start = Vector2.ZERO
	_last = Vector2.ZERO
	_dragged = false

func _excluded(point: Vector2, exclusions: Array[Rect2]) -> bool:
	for area in exclusions:
		if area.has_point(point):
			return true
	return false

func route(event: InputEvent, permitted: bool, camera_area: Rect2, exclusions: Array[Rect2]) -> Dictionary:
	if not permitted:
		cancel()
		return {}
	if event is InputEventScreenTouch:
		if not event.position.is_finite():
			cancel()
			return {}
		if event.canceled:
			if event.index == _camera_finger or event.index == _second_finger:
				cancel()
			return {}
		if event.pressed:
			# The G20 joystick owns its own finger. A button and a camera
			# must never acquire the same touch index, even at high FPS.
			if not camera_area.has_point(event.position) or _excluded(event.position, exclusions):
				return {}
			if _camera_finger != -1:
				if _pinched or event.index == _camera_finger:
					return {}
				_second_finger = event.index
				_second_position = event.position
				_pinched = true
				_dragged = true
				return {"kind": "pinch_start"}
			_camera_finger = event.index
			_start = event.position
			_last = event.position
			_dragged = false
			return {"kind": "start"}
		if event.index == _second_finger:
			_second_finger = -1
			return {"kind": "end"}
		if event.index != _camera_finger:
			return {}
		if _pinched:
			if _second_finger != -1:
				_camera_finger = _second_finger
				_last = _second_position
				_second_finger = -1
			else:
				cancel()
			return {"kind": "end"}
		var tap: bool = not _dragged and event.position.distance_to(_start) < DRAG_THRESHOLD_PX and not _excluded(event.position, exclusions)
		cancel()
		return {"kind": "tap", "position": event.position} if tap else {"kind": "end"}
	if event is InputEventScreenDrag and (event.index == _camera_finger or event.index == _second_finger):
		if not event.position.is_finite():
			cancel()
			return {}
		if _pinched:
			if _second_finger == -1:
				return {}
			var old_distance := _last.distance_to(_second_position)
			if event.index == _camera_finger:
				_last = event.position
			else:
				_second_position = event.position
			var new_distance := _last.distance_to(_second_position)
			if old_distance < MIN_PINCH_DISTANCE_PX or new_distance < MIN_PINCH_DISTANCE_PX:
				return {}
			return {"kind": "zoom", "factor": new_distance / old_distance}
		var delta: Vector2 = event.position - _last
		_last = event.position
		if not _dragged and event.position.distance_to(_start) < DRAG_THRESHOLD_PX:
			return {}
		_dragged = true
		if not delta.is_finite():
			cancel()
			return {}
		return {"kind": "drag", "delta": delta}
	return {}
