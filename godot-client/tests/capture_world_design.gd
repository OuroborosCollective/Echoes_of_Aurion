extends "res://tests/test_world_design_scene.gd"
## Real active SubViewport and local GLB, with synthetic Aurion readbacks.
const SAMPLE_STEP := 12

func take_frame(viewport: SubViewport) -> Image:
	for index in range(6): await process_frame
	await RenderingServer.frame_post_draw
	return viewport.get_texture().get_image()

func verify() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("World-design pixel test needs a display backend")
		quit(1)
		return
	var output := OS.get_environment("AURION_CAPTURE_DIR")
	if output.is_empty():
		push_error("World-design pixel test needs AURION_CAPTURE_DIR")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(output)
	root.size = Vector2i(960, 600)
	DisplayServer.window_set_size(root.size)
	var scene: Control = load("res://app/main.tscn").instantiate()
	root.add_child(scene)
	var admitted := welcome()
	scene._on_zone_welcome(admitted)
	require(scene._confirmed_zone.has_state(), "render fixture welcome rejected")
	# A synthetic welcome has no live socket producing 100-ms snapshots.
	# Keep its explicitly fixture-only observation point fixed during capture.
	scene.set_process(false)
	require(scene._apply_chunk_surface(surface(), SESSION), "render fixture terrain rejected")
	scene._show_3d()
	var viewport := scene.get_node("WorldView/Live3D") as SubViewport
	var camera := Camera3D.new()
	scene.get_node("WorldView/Live3D/World").add_child(camera)
	camera.current = true
	camera.position = Vector3(6, 6, 9)
	camera.fov = 45.0
	camera.look_at(Vector3(0, 2.5, 0), Vector3.UP)
	var before := await take_frame(viewport)
	require(not before.is_empty(), "baseline pixels missing")
	scene._world_design_readback = design()
	scene._monster_catalog = catalog()
	scene._sync_world_design()
	var visuals := scene.get_node("WorldView/Live3D/World/WorldDesignVisuals") as Node3D
	var bytes := FileAccess.get_file_as_bytes("res://assets/starter_village/Barrel.glb")
	require(visuals.supply_asset(SHA, bytes, SESSION), "render fixture asset rejected")
	var after := await take_frame(viewport)
	require(not after.is_empty() and after.get_size() == before.get_size(), "confirmed pixels missing")
	if not after.is_empty() and after.get_size() == before.get_size():
		var changed := 0
		var sampled := 0
		for y in range(0, after.get_height(), SAMPLE_STEP):
			for x in range(0, after.get_width(), SAMPLE_STEP):
				var a: Color = before.get_pixel(x, y)
				var b: Color = after.get_pixel(x, y)
				if absf(a.r-b.r) + absf(a.g-b.g) + absf(a.b-b.b) > 0.16: changed += 1
				sampled += 1
		print("WORLD_DESIGN_IMAGE_READBACK sampled=%d changed=%d" % [sampled, changed])
		require(changed >= maxi(30, int(sampled / 25)), "server-shaped world model did not visibly change the framebuffer")
		require(before.save_png(output.path_join("world-design-before.png")) == OK, "baseline image save failed")
		require(after.save_png(output.path_join("world-design-after.png")) == OK, "world image save failed")
	scene._on_zone_closed("client_close")
	require(visuals.get_child_count() == 0, "logout retained world-design visual")
	scene.queue_free()
	await process_frame
	if failures.is_empty(): print("GODOT_WORLD_DESIGN_SOFTWARE_RENDER_PASS (synthetic fixture, no live design or tablet)")
	else:
		for failure in failures: push_error(failure)
	quit(0 if failures.is_empty() else 1)
