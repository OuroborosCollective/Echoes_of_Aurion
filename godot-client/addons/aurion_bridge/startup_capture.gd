extends Node
## Explicit CI observation of the real editor-launched game. No fake session,
## replay scene, camera override, movement, authoring command or screenshot retry.
var _main: Control
var _directory := ""
var _nonce := ""
var _started := ""
var _start_ms := 0
var _last_state_ms := -1000
var _target := -1
var _captured_tick := -1
var _done := false
var _viewport_size := Vector2i.ZERO

static func configure_viewport(main: Control, viewport_size: Vector2i) -> void:
	main.get_window().size = viewport_size
	main.get_window().content_scale_size = viewport_size
	# Configure the render target before the initially hidden container appears.
	# Restore normal container ownership; never resize the captured image bytes.
	main.world_view.stretch = false
	main.live_3d_viewport.size = viewport_size
	main.world_view.stretch = true

static func requested_directory() -> String:
	var directory := OS.get_environment("AURION_PARITY_PRIVATE_DIR")
	var nonce := OS.get_environment("AURION_PARITY_NONCE")
	if not directory.is_absolute_path() or not DirAccess.dir_exists_absolute(directory) or nonce.length() != 32:
		return ""
	for ch in nonce:
		if not "0123456789abcdef".contains(ch): return ""
	return directory

static func write_json(path: String, value: Dictionary) -> void:
	var file := FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		push_error("STARTUP_CAPTURE_WRITE_FAILED")
		return
	file.store_string(JSON.stringify(value))
	file.close()
	DirAccess.rename_absolute(path + ".tmp", path)

func bind(main: Control) -> void:
	_main = main
	_directory = requested_directory()
	_nonce = OS.get_environment("AURION_PARITY_NONCE")
	_started = Time.get_datetime_string_from_system(true) + "Z"
	_start_ms = Time.get_ticks_msec()
	if _directory.is_empty():
		set_process(false)
		return
	var dimensions := OS.get_environment("AURION_PARITY_VIEWPORT").split("x")
	if dimensions.size() != 2 or not dimensions[0].is_valid_int() or not dimensions[1].is_valid_int():
		_fail("GODOT_VIEWPORT_NOT_CONFIGURED")
		return
	var viewport_size := Vector2i(int(dimensions[0]), int(dimensions[1]))
	if viewport_size.x < 320 or viewport_size.y < 240 or viewport_size.x > 4096 or viewport_size.y > 2160:
		_fail("GODOT_VIEWPORT_INVALID")
		return
	_viewport_size = viewport_size
	configure_viewport(_main, viewport_size)
	# Same real PKCE transaction and single-use callback as the manual editor UI.
	_main._auth_start.browser_opener = Callable(self, "_browser_handoff")
	_main._auth_start.session_failed.connect(func(_reason: String): _fail("NATIVE_SESSION_REJECTED"))
	_main._auth_start.start_failed.connect(func(_reason: String): _fail("NATIVE_AUTH_START_FAILED"))
	_main.call_deferred("_on_login_pressed")

func _browser_handoff(url: String) -> int:
	if not url.begins_with("https://arelogic.space/api/native-auth/browser/"):
		return ERR_INVALID_PARAMETER
	write_json(_directory.path_join("login.json"), {"url": url})
	return OK

func _fail(code: String) -> void:
	_done = true
	write_json(_directory.path_join("godot-state.json"), {"nonce":_nonce,"failure":code})

func _process(_delta: float) -> void:
	if _directory.is_empty() or _done or _main == null: return
	if Time.get_ticks_msec() - _start_ms > 90000:
		_fail("GODOT_FIRST_START_TIMEOUT")
		return
	var callback_path := _directory.path_join("callback.json")
	if FileAccess.file_exists(callback_path):
		var callback: Variant = JSON.parse_string(FileAccess.get_file_as_string(callback_path))
		DirAccess.remove_absolute(callback_path)
		if typeof(callback) != TYPE_DICTIONARY or not _main.handle_native_auth_callback(str(callback.get("url", ""))):
			_fail("NATIVE_CALLBACK_REJECTED")
			return
	var tick: int = _main._confirmed_zone.last_tick()
	if Time.get_ticks_msec() - _last_state_ms >= 100:
		_last_state_ms = Time.get_ticks_msec()
		write_json(_directory.path_join("godot-state.json"), {"nonce":_nonce,"tick":tick,
			"connected":_main._zone_socket.state_name() == "connected", "worldVisible":_main.world_view.visible,
			"terrain":_main.confirmed_terrain.get_child_count(), "pid":OS.get_process_id()})
	var arm_path := _directory.path_join("arm.json")
	if _target < 0 and FileAccess.file_exists(arm_path):
		var arm: Variant = JSON.parse_string(FileAccess.get_file_as_string(arm_path))
		if typeof(arm) != TYPE_DICTIONARY or arm.get("nonce") != _nonce or typeof(arm.get("tick")) not in [TYPE_INT, TYPE_FLOAT] or float(arm.tick) != floor(float(arm.tick)) or arm.tick <= tick or arm.tick > tick + 100:
			_fail("GODOT_CAPTURE_ARM_INVALID")
			return
		_target = int(arm.tick)
	if _target < 0 or tick < _target: return
	# Idle ticks may have no broadcast. Take the first actually published/rendered
	# snapshot after the shared lower bound, once; never select a later image.
	_captured_tick = tick
	_done = true
	_capture()

func _capture() -> void:
	# Metadata and pixels must describe the same actually rendered tick. No
	# pause of the canonical simulation, and no substituted/offline snapshot.
	await RenderingServer.frame_post_draw
	if _main._confirmed_zone.last_tick() != _captured_tick:
		_fail("GODOT_RENDER_TICK_CHANGED")
		return
	var viewport: SubViewport = _main.live_3d_viewport
	var pixels := viewport.get_texture().get_image()
	if pixels != null and pixels.get_size() != _viewport_size:
		_fail("GODOT_VIEWPORT_SIZE_MISMATCH")
		return
	if pixels == null or pixels.is_empty() or pixels.save_png(_directory.path_join("godot.png")) != OK:
		_fail("GODOT_VIEWPORT_CAPTURE_FAILED")
		return
	var camera: Camera3D = _main.world_camera
	var actors: Array = []
	for actor in _main.world_actors.get_children():
		if actor is Node3D and actor.visible and actor.get("entity_id") != null:
			actors.append({"entityId":actor.get("entity_id"),"assetId":actor.get("asset_id"),"position":_mm(actor.position)})
	var chunks: Array = []
	for terrain in [_main.confirmed_terrain] + _main.confirmed_neighbors.get_children():
		var model: Variant = terrain.get("_last_model")
		if typeof(model) == TYPE_DICTIONARY and not model.is_empty():
			chunks.append({"worldId":model.base.worldId,"coordinate":model.base.coordinate,"hash":model.deterministicHash})
	write_json(_directory.path_join("godot-observation.json"), {
		"schema":"aurion.startup-view.observation.v1","source":"godot-live-editor","nonce":_nonce,"captureIndex":1,
		"startedAtUtc":_started,"capturedAtUtc":Time.get_datetime_string_from_system(true) + "Z",
		"pid":OS.get_process_id(),"snapshot":_main._confirmed_zone.current_state(),
		"selfEntityId":_main._confirmed_zone.self_entity_id(),"minimumTick":_target,
		"connected":_main._zone_socket.state_name() == "connected" and _main._auth_start.protected_response_allowed(),
		"worldVisible":_main.world_view.visible,"stale":_main._world_is_stale,
		"viewportPx":[pixels.get_width(), pixels.get_height()],
		"camera":{"positionMm":_mm(camera.global_position),"targetMm":_mm(camera.get("_visual_target")),"fovMilliDeg":roundi(camera.fov * 1000)},
		"chunks":chunks,"actors":actors,"actorCache":_main._actor_models.evidence(),
		"worldAssets":{"rendered":_main._world_design_visuals.get_child_count() + _main.starter_village_visuals.get_child_count(),
			"publishedDesigns":_main._world_design_visuals.get_child_count(),"starterVillage":_main.starter_village_visuals.get_child_count(),
			"pending":_main._world_design_visuals.needed_assets().size(),"diagnostic":_main._world_design_visuals.diagnostic},
		"environmentPresent":_main.live_3d_viewport.world_3d.environment != null,
	})

func _mm(value: Vector3) -> Array:
	return [roundi(value.x * 1000), roundi(value.y * 1000), roundi(value.z * 1000)]
