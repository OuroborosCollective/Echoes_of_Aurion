extends SceneTree
## Synthetic input through real Godot objects. No device, server or receipt proof.
const Router = preload("res://ui/mobile/touch_router.gd")
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
	var router := Router.new()
	var area := Rect2(640, 80, 640, 720)
	var exclusions: Array[Rect2] = [Rect2(1100, 600, 180, 200)]
	router.route(touch(2, Vector2(800, 300), true), true, area, exclusions)
	require(router.route(touch(3, Vector2(900, 300), true), true, area, exclusions).get("kind") == "pinch_start", "second camera finger must start pinch")
	var zoom: Dictionary = router.route(drag(3, Vector2(1000, 300)), true, area, exclusions)
	require(zoom.get("kind") == "zoom" and is_equal_approx(float(zoom.get("factor", 0)), 2.0), "doubling finger separation must request exactly 2x zoom")
	require(router.route(touch(4, Vector2(950, 400), true), true, area, exclusions).is_empty(), "third finger must be ignored")
	require(router.route(drag(4, Vector2(980, 400)), true, area, exclusions).is_empty(), "third finger must not affect zoom")
	require(router.route(touch(3, Vector2(1000, 300), false), true, area, exclusions).get("kind") != "tap", "pinch release must not select/attack")
	require(router.route(drag(2, Vector2(820, 300)), true, area, exclusions).is_empty(), "remaining pinch finger must not become orbit")
	require(router.route(touch(2, Vector2(820, 300), false), true, area, exclusions).get("kind") != "tap", "remaining finger must not select")
	# Existing HUD/joystick ownership is preserved for either finger.
	router.route(touch(2, Vector2(800, 300), true), true, area, exclusions)
	require(router.route(touch(1, Vector2(1200, 700), true), true, area, exclusions).is_empty(), "HUD finger must not join pinch")
	require(router.route(touch(3, Vector2(900, 300), true), true, area, exclusions).get("kind") == "pinch_start", "excluded finger must not reserve the second slot")
	router.route(drag(3, Vector2(1000, 300)), false, area, exclusions)
	require(router.active_finger() == -1, "stale/menu/disconnect must clear both fingers")
	require(router.route(touch(2, Vector2(800, 300), false), true, area, exclusions).is_empty(), "late release must not resurrect input")
	router.route(touch(5, Vector2(800, 300), true), true, area, exclusions)
	router.route(touch(6, Vector2(800, 300), true), true, area, exclusions)
	zoom = router.route(drag(6, Vector2(900, 300)), true, area, exclusions)
	require(zoom.is_empty(), "overlapping fingers must establish a baseline without division by zero")
	router.cancel()
	# Cancellation/release must work symmetrically for either pinch finger.
	for first_up in [2, 3]:
		router.route(touch(2, Vector2(800, 300), true), true, area, exclusions)
		router.route(touch(3, Vector2(900, 300), true), true, area, exclusions)
		router.route(touch(first_up, Vector2(850, 300), false), true, area, exclusions)
		var remaining := 3 if first_up == 2 else 2
		require(router.route(drag(remaining, Vector2(950, 300)), true, area, exclusions).is_empty(), "either pinch release must suppress remaining drag")
		require(router.route(touch(remaining, Vector2(950, 300), false), true, area, exclusions).get("kind") != "tap", "either pinch release must suppress tap")
		require(router.active_finger() == -1, "pinch fingers leaked after both releases")
	router.route(touch(2, Vector2(800, 300), true), true, area, exclusions)
	router.route(touch(3, Vector2(900, 300), true), true, area, exclusions)
	var cancelled := touch(3, Vector2(900, 300), false)
	cancelled.canceled = true
	router.route(cancelled, true, area, exclusions)
	require(router.active_finger() == -1, "OS cancellation must release both pinch fingers")
	router.route(touch(5, Vector2(NAN, 300), true), true, area, exclusions)
	require(router.active_finger() == -1, "nonfinite point must not capture input")
	var camera := (load("res://world/camera_rig.tscn") as PackedScene).instantiate() as Camera3D
	root.add_child(camera)
	camera.follow_confirmed(Vector3(10, 1, -5))
	require(camera.has_method("zoom_visual"), "active camera needs bounded presentation zoom")
	if camera.has_method("zoom_visual"):
		camera.zoom_visual(2.0)
		require(is_equal_approx(camera.orbit_distance, 3.0), "zoom in must clamp at existing 3m minimum")
		camera.zoom_visual(0.01)
		require(is_equal_approx(camera.orbit_distance, 12.0), "zoom out must clamp at existing 12m maximum")
		var before: Transform3D = camera.transform
		for invalid in [NAN, INF, -1.0, 0.0]:
			camera.zoom_visual(invalid)
		require(camera.transform.is_equal_approx(before), "invalid zoom must leave camera unchanged")
		require(is_equal_approx(camera.position.distance_to(Vector3(10, 1, -5)), 12.0), "zoom must retain the exact confirmed target")
		camera.reset_view()
		require(is_equal_approx(camera.orbit_distance, 5.8), "session reset must restore existing default")
	camera.queue_free()
	var scene: Control = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	var active_camera: Camera3D = scene.get_node("%WorldCamera")
	active_camera.follow_confirmed(Vector3.ZERO)
	var offline_before: Transform3D = active_camera.transform
	require(scene.has_method("_on_camera_zoom_requested"), "Main must gate accessible zoom controls")
	if scene.has_method("_on_camera_zoom_requested"):
		scene._on_camera_zoom_requested(2.0)
		require(active_camera.transform.is_equal_approx(offline_before), "offline zoom control changed camera")
	for path in ["WorldHUD/WorldBar/ZoomIn", "WorldHUD/WorldBar/ZoomOut", "MobileHUD/MenuPanel/Scroll/Content/ZoomIn", "MobileHUD/MenuPanel/Scroll/Content/ZoomOut"]:
		var button := scene.get_node_or_null(path) as Button
		require(button != null, "missing single-touch/keyboard alternative: " + path)
		if button != null:
			require(button.custom_minimum_size.y >= 48.0 and button.focus_mode == Control.FOCUS_ALL, "zoom button needs 48px target and keyboard focus")
	scene.queue_free()
	await process_frame
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("GODOT_CAMERA_PINCH_ZOOM_PASS (synthetic input; no physical device or live receipts)")
	quit(0 if failures.is_empty() else 1)
