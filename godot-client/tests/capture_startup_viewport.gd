extends SceneTree
## Isolated actual renderer check. No login, server, player or live acceptance.
const Capture = preload("res://addons/aurion_bridge/startup_capture.gd")

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("STARTUP_VIEWPORT_REQUIRES_REAL_DISPLAY")
		quit(1)
		return
	var scene: Control = load("res://app/main.tscn").instantiate()
	root.add_child(scene)
	for target in [Vector2i(1280, 720), Vector2i(640, 360)]:
		Capture.configure_viewport(scene, target)
		scene.world_view.visible = true
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		var pixels: Image = scene.live_3d_viewport.get_texture().get_image()
		if pixels == null or pixels.is_empty() or pixels.get_size() != target:
			push_error("STARTUP_VIEWPORT_ORIGINAL_PIXELS_WRONG_SIZE: " + str(target))
			quit(1)
			return
	print("STARTUP_VIEWPORT_ORIGINAL_PIXELS_PASS")
	scene.queue_free()
	await process_frame
	quit(0)
