extends Camera3D
## G21 visual-only orbit. Player position and target come from Aurion
## confirmed state; camera rotation never becomes zone movement or combat truth.
const DEFAULT_PITCH := 18.0
const MIN_PITCH := 5.0
const MAX_PITCH := 65.0
const DEFAULT_DISTANCE := 5.8
const MIN_DISTANCE := 3.0
const MAX_DISTANCE := 12.0
@export_range(0.001, 0.03, 0.0005) var touch_sensitivity := 0.004
@export var invert_vertical := false
@export_range(3.0, 12.0, 0.1) var orbit_distance := DEFAULT_DISTANCE
var _capture_pose: Dictionary = {}
var _tabletop := false
var _player_view: Dictionary = {}
var yaw_radians := 0.0
var pitch_radians := deg_to_rad(DEFAULT_PITCH)
var _visual_target := Vector3.ZERO
var _has_visual_target := false

func align_capture_camera(pose: Variant) -> bool:
	if not _capture_pose.is_empty() or typeof(pose) != TYPE_DICTIONARY: return false
	for key in ["positionMm", "targetMm"]:
		if typeof(pose.get(key)) != TYPE_ARRAY or pose[key].size() != 3: return false
		for value in pose[key]:
			if typeof(value) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(value)) or float(value) != floor(float(value)) or abs(float(value)) > 1e10: return false
	for key in ["fovMilliDeg", "nearMm", "farMm"]:
		if typeof(pose.get(key)) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(pose[key])) or float(pose[key]) != floor(float(pose[key])): return false
	if pose.fovMilliDeg < 10000 or pose.fovMilliDeg > 150000 or pose.nearMm < 1 or pose.farMm <= pose.nearMm or pose.farMm > 10000000: return false
	if pose.positionMm[0] == pose.targetMm[0] and pose.positionMm[2] == pose.targetMm[2]: return false
	_capture_pose = pose.duplicate(true)
	apply_capture_camera()
	return true

func apply_capture_camera() -> void:
	if _capture_pose.is_empty(): return
	var p: Array = _capture_pose.positionMm
	var t: Array = _capture_pose.targetMm
	_visual_target = Vector3(float(t[0]), float(t[1]), float(t[2])) / 1000.0
	global_position = Vector3(float(p[0]), float(p[1]), float(p[2])) / 1000.0
	projection = Camera3D.PROJECTION_PERSPECTIVE
	keep_aspect = Camera3D.KEEP_HEIGHT # FOV is vertical, matching Three.js.
	h_offset = 0.0
	v_offset = 0.0
	set_perspective(float(_capture_pose.fovMilliDeg) / 1000.0, float(_capture_pose.nearMm) / 1000.0, float(_capture_pose.farMm) / 1000.0)
	look_at(_visual_target, Vector3.UP)

func follow_confirmed(target: Vector3) -> void:
	if not _capture_pose.is_empty():
		apply_capture_camera()
		return
	if not target.is_finite():
		return
	_visual_target = target
	_has_visual_target = true
	_update_visual_camera()

func drag_orbit(delta: Vector2) -> void:
	if not delta.is_finite():
		return
	yaw_radians = wrapf(yaw_radians - delta.x * touch_sensitivity, -PI, PI)
	var pitch_delta := delta.y * touch_sensitivity * (1.0 if invert_vertical else -1.0)
	pitch_radians = clampf(pitch_radians + pitch_delta, deg_to_rad(15.0 if _tabletop else MIN_PITCH), deg_to_rad(85.0 if _tabletop else MAX_PITCH))
	if _has_visual_target:
		_update_visual_camera()

func reset_view() -> void:
	_capture_pose.clear()
	_tabletop = false
	_player_view.clear()
	yaw_radians = 0.0
	pitch_radians = deg_to_rad(DEFAULT_PITCH)
	orbit_distance = DEFAULT_DISTANCE
	_has_visual_target = false
	_visual_target = Vector3.ZERO

func zoom_visual(factor: float) -> void:
	# Pinch scale changes only presentation, within the existing camera range.
	# It never pans, fetches a chunk or emits an Aurion intent.
	if not is_finite(factor) or factor <= 0.0 or not _has_visual_target:
		return
	orbit_distance = clampf(orbit_distance / factor, 48.0 if _tabletop else MIN_DISTANCE, 160.0 if _tabletop else MAX_DISTANCE)
	_update_visual_camera()

func _update_visual_camera() -> void:
	if not _capture_pose.is_empty():
		apply_capture_camera()
		return
	if not _has_visual_target:
		return
	var x := sin(yaw_radians) * cos(pitch_radians) * orbit_distance
	var y := sin(pitch_radians) * orbit_distance
	var z := cos(yaw_radians) * cos(pitch_radians) * orbit_distance
	position = _visual_target + Vector3(x, y, z)
	look_at(_visual_target, Vector3.UP)

func set_tabletop(enabled: bool, center: Vector3 = Vector3.ZERO) -> void:
	if enabled == _tabletop: return
	if enabled:
		_player_view = {"yaw":yaw_radians,"pitch":pitch_radians,"distance":orbit_distance,"target":_visual_target,"has_target":_has_visual_target}
		_tabletop = true
		yaw_radians = 0.0
		pitch_radians = deg_to_rad(55.0)
		orbit_distance = 96.0
		follow_confirmed(center)
	else:
		_tabletop = false
		yaw_radians = _player_view.get("yaw", 0.0)
		pitch_radians = _player_view.get("pitch", deg_to_rad(DEFAULT_PITCH))
		orbit_distance = _player_view.get("distance", DEFAULT_DISTANCE)
		_visual_target = _player_view.get("target", Vector3.ZERO)
		_has_visual_target = _player_view.get("has_target", false)
		_player_view.clear()
		if _has_visual_target: _update_visual_camera()
