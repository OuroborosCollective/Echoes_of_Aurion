extends SceneTree
## Render the actual native scene with synthetic v5 data, never a live receipt.
const Fixture = preload("res://tests/fixtures/hud_fixture.gd")
const Actor = preload("res://actors/actor_view.tscn")

func _init() -> void:
	call_deferred("capture")

func capture() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("HUD capture requires a real display backend")
		quit(1)
		return
	var output := OS.get_environment("AURION_CAPTURE_DIR")
	if output.is_empty():
		push_error("AURION_CAPTURE_DIR is required")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(output)
	var scene: Control = (load("res://app/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene._mobile_hud_enabled = true
	scene._on_zone_welcome(Fixture.welcome())
	scene._zone_socket.set_process(false)
	scene._zone_socket._state = "connected" # Test-only projection, never a network connection.
	scene._show_3d()
	var actor := Actor.instantiate() as Node3D
	actor.entity_id = "mob_1"
	actor.visible = true
	scene.world_actors.add_child(actor)
	scene._selected_target_id = "mob_1"
	var watermark := Label.new()
	watermark.text = "TESTDATEN · KEIN LIVE-SERVER"
	watermark.add_theme_font_size_override("font_size", 16)
	scene.add_child(watermark)
	for viewport_size in [Vector2i(1340, 800), Vector2i(640, 360), Vector2i(360, 640)]:
		root.size = viewport_size
		DisplayServer.window_set_size(viewport_size)
		watermark.position = Vector2(20, viewport_size.y * 0.5)
		await process_frame
		await process_frame
		scene._fit_layout()
		scene._refresh_target_hud()
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		if image.is_empty() or image.save_png(output.path_join("mobile-hud-%dx%d.png" % [viewport_size.x, viewport_size.y])) != OK:
			push_error("Native HUD viewport capture failed")
			quit(1)
			return
		print("Rendered synthetic native HUD %dx%d using %s / %s" % [image.get_width(), image.get_height(), DisplayServer.get_name(), RenderingServer.get_video_adapter_name()])
	quit(0)
