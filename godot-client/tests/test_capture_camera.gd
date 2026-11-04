extends SceneTree
## Actual Camera3D projection regression with a synthetic pose; no live world.
const Rig = preload("res://world/camera_rig.gd")
func _init() -> void:
	call_deferred("verify")
func verify() -> void:
	var camera = Rig.new()
	root.add_child(camera)
	var pose := {"positionMm":[12123,5000,18000],"targetMm":[12000,1000,8000],"fovMilliDeg":58000,"nearMm":100,"farMm":800000}
	if not camera.has_method("align_capture_camera"):
		push_error("CAMERA_ALIGNMENT_MISSING")
		quit(1)
		return
	for bad in [null, {}, {"positionMm":[0,0,0]}, {"positionMm":[0,0,0],"targetMm":[0,1,0],"fovMilliDeg":58000,"nearMm":100,"farMm":800000}]:
		if camera.align_capture_camera(bad):
			push_error("INVALID_CAMERA_ACCEPTED")
			quit(1)
			return
	if not camera.align_capture_camera(pose):
		push_error("VALID_CAMERA_REJECTED")
		quit(1)
		return
	camera.follow_confirmed(Vector3(900,1,900))
	camera.zoom_visual(2.0)
	camera.drag_orbit(Vector2(80,40))
	if camera.global_position.distance_to(Vector3(12.123,5,18)) > 0.00001 or camera.fov != 58.0 or camera.keep_aspect != Camera3D.KEEP_HEIGHT or abs(camera.near - 0.1) > 0.000001 or camera.far != 800.0:
		push_error("CAPTURE_CAMERA_DRIFT")
		quit(1)
		return
	var direction: Vector3 = (Vector3(12,1,8)-camera.global_position).normalized()
	if (-camera.global_basis.z).distance_to(direction) > 0.000001 or camera.align_capture_camera(pose):
		push_error("CAPTURE_CAMERA_DIRECTION_OR_REARM_INVALID")
		quit(1)
		return
	camera.reset_view()
	camera.follow_confirmed(Vector3(0,1,0))
	if camera.global_position.distance_to(Vector3(12.123,5,18)) < 1.0:
		push_error("CAPTURE_CAMERA_NOT_RELEASED")
		quit(1)
		return
	print("CAPTURE_CAMERA_ALIGNMENT_PASS_SYNTHETIC_POSE_REAL_CAMERA3D")
	camera.queue_free()
	quit(0)
