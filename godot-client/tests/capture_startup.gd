extends SceneTree

func _init() -> void:
	call_deferred("capture")

func capture() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("Capture requires a real display backend; headless is not rendering evidence")
		quit(1)
		return
	var packed := load("res://app/main.tscn") as PackedScene
	if packed == null:
		quit(1)
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	var output := OS.get_environment("AURION_CAPTURE_DIR")
	if output.is_empty():
		push_error("AURION_CAPTURE_DIR must identify the test artifact directory")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(output)
	for viewport_size in [Vector2i(1340, 800), Vector2i(800, 1340), Vector2i(360, 640)]:
		root.size = viewport_size
		DisplayServer.window_set_size(viewport_size)
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		if image.is_empty() or image.save_png(output.path_join("startup-%dx%d.png" % [viewport_size.x, viewport_size.y])) != OK:
			push_error("Viewport capture failed")
			quit(1)
			return
		print("Rendered startup %dx%d using %s / %s" % [image.get_width(), image.get_height(), DisplayServer.get_name(), RenderingServer.get_video_adapter_name()])
	quit(0)
