extends SceneTree
## G21 synthetic Godot InputEvent regressions, NOT a physical Tab A9 or live Aurion test.
var failures: Array[String] = []

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func touch(id: int, point: Vector2, pressed: bool) -> InputEventScreenTouch:
	var event := InputEventScreenTouch.new()
	event.index = id
	event.position = point
	event.pressed = pressed
	return event

func drag(id: int, point: Vector2) -> InputEventScreenDrag:
	var event := InputEventScreenDrag.new()
	event.index = id
	event.position = point
	return event

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	var router_script := load("res://ui/mobile/touch_router.gd") as Script
	var camera_scene := load("res://world/camera_rig.tscn") as PackedScene
	require(router_script != null, "G21 touch router missing")
	require(camera_scene != null, "G21 native camera scene missing")
	if router_script == null or camera_scene == null:
		_finish()
		return
	var router: RefCounted = router_script.new()
	var area := Rect2(Vector2(640, 80), Vector2(640, 720))
	var blocked: Array[Rect2] = [
		Rect2(0, 560, 300, 240), # G20 joystick
		Rect2(1120, 610, 160, 190), # future dedicated action button
		Rect2(0, 0, 1280, 70), # actual world HUD
	]
	require(router.route(touch(1, Vector2(120, 680), true), true, area, blocked).is_empty(), "G20 joystick finger captured by camera")
	require(router.route(touch(3, Vector2(1200, 700), true), true, area, blocked).is_empty(), "UI button finger leaked into camera")
	require(router.route(touch(2, Vector2(850, 400), true), false, area, blocked).is_empty(), "hidden/menu world captured a finger")
	require(router.route(touch(2, Vector2(850, 400), true), true, area, blocked).get("kind") == "start", "camera finger not captured")
	require(router.route(touch(1, Vector2(140, 680), false), true, area, blocked).is_empty(), "other finger cancelled camera")
	require(router.route(drag(3, Vector2(1170, 720)), true, area, blocked).is_empty(), "action finger rotated camera")
	var moving: Dictionary = router.route(drag(2, Vector2(880, 420)), true, area, blocked)
	require(moving.get("kind") == "drag" and moving.get("delta") == Vector2(30, 20), "camera drag delta/index not isolated")
	require(router.route(touch(2, Vector2(880, 420), false), true, area, blocked).get("kind") == "end", "drag release triggered tap")
	require(router.route(touch(7, Vector2(840, 390), true), true, area, blocked).get("kind") == "start", "camera did not release index")
	require(router.route(touch(7, Vector2(844, 390), false), true, area, blocked).get("kind") == "tap", "short tap not distinguished from camera drag")
	require(router.route(touch(8, Vector2(900, 410), true), true, area, blocked).get("kind") == "start", "camera cannot start after tap")
	require(router.route(drag(8, Vector2(930, 430)), false, area, blocked).is_empty(), "menu/suspension allowed camera movement")
	require(router.active_finger() == -1, "menu/suspension retained stale finger")
	require(router.route(touch(8, Vector2(930, 430), false), true, area, blocked).is_empty(), "late release resurrected an old tap")
	require(router.route(touch(9, Vector2(900, 410), true), true, area, blocked).get("kind") == "start", "camera cannot resume after menu")
	router.cancel()
	require(router.route(touch(9, Vector2(900, 410), false), true, area, blocked).is_empty(), "resize/connection reset produced a tap")
	var camera := camera_scene.instantiate() as Camera3D
	require(camera != null, "G21 camera scene root must be Camera3D")
	if camera != null:
		root.add_child(camera)
		var target := Vector3(10, 1, -5)
		camera.follow_confirmed(target)
		var start: Vector3 = camera.position
		require(camera.position.distance_to(target) >= 3.0, "camera orbit collapsed into the player")
		camera.drag_orbit(Vector2(50, -30))
		require(camera.position.distance_to(start) > 0.1, "camera orbit did not respond to drag")
		require(is_equal_approx(camera.position.distance_to(target), camera.orbit_distance), "camera radius changed gameplay position")
		camera.drag_orbit(Vector2(0, -100000))
		require(is_equal_approx(camera.pitch_radians, deg_to_rad(65.0)), "upward camera pitch not bounded")
		camera.drag_orbit(Vector2(0, 100000))
		require(is_equal_approx(camera.pitch_radians, deg_to_rad(5.0)), "downward camera pitch not bounded")
		camera.reset_view()
		require(is_equal_approx(camera.yaw_radians, 0.0), "camera yaw survived reset")
		camera.queue_free()
	var packed := load("res://app/main.tscn") as PackedScene
	require(packed != null, "G21 active scene missing")
	if packed != null:
		var scene: Control = packed.instantiate()
		root.add_child(scene)
		await process_frame
		var joystick := scene.get_node_or_null("MobileJoystick") as Control
		var active_camera := scene.get_node_or_null("%WorldCamera") as Camera3D
		require(joystick != null and not joystick.visible, "G20 joystick lifecycle regressed")
		require(active_camera != null and active_camera.has_method("drag_orbit"), "G21 camera not mounted in active Godot scene")
		if active_camera != null:
			var before: Transform3D = active_camera.transform
			scene._input(touch(10, Vector2(950, 420), true))
			scene._input(drag(10, Vector2(990, 460)))
			require(active_camera.transform.is_equal_approx(before), "offline screen touch altered the camera")
		scene.queue_free()
		await process_frame
	_finish()

func _finish() -> void:
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("Godot G21 multitouch routing and confirmed-position camera orbit verified (headless fixture only)")
	quit(0 if failures.is_empty() else 1)
