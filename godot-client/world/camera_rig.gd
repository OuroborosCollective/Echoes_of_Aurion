extends Camera3D
## G21 visual-only orbit. Player position and target come from Aurion
## confirmed state; camera rotation never becomes zone movement or combat truth.
const DEFAULT_PITCH := 18.0
const MIN_PITCH := 5.0
const MAX_PITCH := 65.0
const DEFAULT_DISTANCE := 5.8
@export_range(0.001, 0.03, 0.0005) var touch_sensitivity := 0.004
@export var invert_vertical := false
@export_range(3.0, 12.0, 0.1) var orbit_distance := DEFAULT_DISTANCE
var yaw_radians := 0.0
var pitch_radians := deg_to_rad(DEFAULT_PITCH)
var _visual_target := Vector3.ZERO
var _has_visual_target := false

func follow_confirmed(target: Vector3) -> void:
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
	pitch_radians = clampf(pitch_radians + pitch_delta, deg_to_rad(MIN_PITCH), deg_to_rad(MAX_PITCH))
	if _has_visual_target:
		_update_visual_camera()

func reset_view() -> void:
	yaw_radians = 0.0
	pitch_radians = deg_to_rad(DEFAULT_PITCH)
	orbit_distance = DEFAULT_DISTANCE
	_has_visual_target = false
	_visual_target = Vector3.ZERO

func _update_visual_camera() -> void:
	if not _has_visual_target:
		return
	var x := sin(yaw_radians) * cos(pitch_radians) * orbit_distance
	var y := sin(pitch_radians) * orbit_distance
	var z := cos(yaw_radians) * cos(pitch_radians) * orbit_distance
	position = _visual_target + Vector3(x, y, z)
	look_at(_visual_target, Vector3.UP)
