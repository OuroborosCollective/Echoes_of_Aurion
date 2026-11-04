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
	# Exercise the real capture path with an explicit protocol fixture and actual
	# renderer. This proves idle-gap/one-shot behavior, never live acceptance.
	var nodes: Array = []
	var codec = load("res://net/zone_codec.gd")
	for id in codec.NODE_IDS:
		nodes.append({"nodeId":id,"remaining":5,"depleted":false,"respawnAtTick":null})
	var snapshot := {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold",
		"connectionId":"zone_peer_abcdefghijklmnop","selfEntityId":"player:1","snapshotSeq":1,"tick":3,
		"presences":[{"entityId":"player:1","userId":1,"position":{"x":0,"z":0},"lastAcceptedClientSeq":0}],
		"mobs":[],"combatants":[],"resources":{"contractVersion":1,"contentSourceRevision":codec.FIXED_CONTENT,"revision":1,"nodes":nodes}}
	if not scene._confirmed_zone.apply_welcome(snapshot):
		push_error("STARTUP_CAPTURE_FIXTURE_INVALID")
		quit(1)
		return
	var directory := ProjectSettings.globalize_path("user://startup-published-tick-test")
	DirAccess.make_dir_recursive_absolute(directory)
	var capture := Capture.new()
	scene.add_child(capture)
	capture._main = scene
	capture._directory = directory
	capture._nonce = "a".repeat(32)
	capture._viewport_size = Vector2i(640,360)
	capture._start_ms = Time.get_ticks_msec()
	capture._target = 2 # No snapshot was published at tick 2.
	capture._process(0.0)
	await process_frame
	await RenderingServer.frame_post_draw
	await process_frame
	var path := directory.path_join("godot-observation.json")
	var initial := FileAccess.get_file_as_string(path)
	var observation: Variant = JSON.parse_string(initial)
	if typeof(observation) != TYPE_DICTIONARY or observation.get("snapshot",{}).get("tick") != 3 or observation.get("minimumTick") != 2:
		push_error("STARTUP_CAPTURE_PUBLISHED_TICK_NOT_CAPTURED")
		quit(1)
		return
	snapshot["type"] = "snapshot"
	snapshot["tick"] = 4
	snapshot["snapshotSeq"] = 2
	for key in ["protocolVersion","connectionId","selfEntityId"]: snapshot.erase(key)
	scene._confirmed_zone.apply_snapshot(snapshot)
	capture._process(0.0)
	await process_frame
	if FileAccess.get_file_as_string(path) != initial:
		push_error("STARTUP_CAPTURE_REPLACED_FIRST_FRAME")
		quit(1)
		return
	for file in DirAccess.get_files_at(directory): DirAccess.remove_absolute(directory.path_join(file))
	DirAccess.remove_absolute(directory)
	print("STARTUP_FIRST_PUBLISHED_TICK_ONCE_PASS_SYNTHETIC_STATE")
	scene.queue_free()
	await process_frame
	quit(0)
