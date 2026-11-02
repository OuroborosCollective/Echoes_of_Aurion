extends SceneTree
## Actual Godot software render of explicit protocol fixtures; no live/device claim.
const Fixture = preload("res://tests/fixtures/hud_fixture.gd")
func _init() -> void:
	call_deferred("capture")
func capture() -> void:
	var output := OS.get_environment("AURION_CAPTURE_DIR")
	if output.is_empty() or DisplayServer.get_name() == "headless":
		push_error("Tabletop capture requires output and real display backend")
		quit(1)
		return
	DirAccess.make_dir_recursive_absolute(output)
	var scene: Control = load("res://app/main.tscn").instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene._mobile_hud_enabled = true
	scene._on_zone_welcome(Fixture.welcome())
	scene._zone_socket.set_process(false)
	scene._zone_socket._state = "connected" # explicit transport fixture only
	scene._config.server_base_url = "" # no fixture credential can leave the process
	scene._show_3d()
	var tokens := {"version":"aurion.native-auth.v1","tokenType":"Bearer","accessToken":"t".repeat(43),"refreshToken":"r".repeat(43),"accessExpiresInSeconds":900,"refreshAbsoluteRemainingSeconds":2592000,"refreshIdleExpiresInSeconds":604800}
	if not scene._auth_start._tokens.accept_token_response(tokens, Time.get_ticks_msec()):
		quit(1)
		return
	var dto_fixture: SceneTree = load("res://tests/test_world_slice.gd").new()
	var dto: Dictionary = dto_fixture.fixture()
	dto_fixture.free()
	dto.connectionId = scene._confirmed_zone.connection_id()
	dto.slice.actorId = scene._confirmed_zone.self_entity_id()
	dto.slice.entities[0].entityId = dto.slice.actorId
	var self_record: Dictionary = scene._entities.record("presences", scene._confirmed_zone.self_entity_id())
	dto.slice.entities[0].position = self_record.position
	for tile in dto.slice.chunks[0].tiles:
		tile.surface = "ruin_path" if tile.x in [7, 8] else ("stone" if tile.z < 3 else "grass")
		tile.heightMm = 1250 + int(tile.z) * 100
	if not scene._set_tabletop(true):
		push_error("Synthetic tabletop scene did not open")
		quit(1)
		return
	scene._on_tabletop_ready(dto, dto.connectionId, scene._auth_start.session_generation(), Vector2i.ZERO)
	if scene._tabletop_layer.readback_fingerprint().is_empty():
		push_error("Synthetic scoped DTO rejected")
		quit(1)
		return
	var watermark := Label.new()
	watermark.text = "TESTDATEN · KEIN LIVE-SERVER / KEIN TAB A9"
	watermark.add_theme_font_size_override("font_size", 16)
	scene.add_child(watermark)
	for viewport_size in [Vector2i(1340, 800), Vector2i(640, 360), Vector2i(360, 640)]:
		root.size = viewport_size
		DisplayServer.window_set_size(viewport_size)
		watermark.position = Vector2(20, viewport_size.y - 32)
		await process_frame
		await process_frame
		scene._fit_layout()
		for mode in ["3d", "map"]:
			scene._set_tabletop_fallback(mode == "map")
			await process_frame
			await RenderingServer.frame_post_draw
			var image := root.get_texture().get_image()
			if image.is_empty() or image.save_png(output.path_join("tabletop-%s-%dx%d.png" % [mode, viewport_size.x, viewport_size.y])) != OK:
				quit(1)
				return
			print("TABLETOP_SYNTHETIC_RENDER %s %dx%d %s / %s" % [mode, image.get_width(), image.get_height(), DisplayServer.get_name(), RenderingServer.get_video_adapter_name()])
	quit(0)
