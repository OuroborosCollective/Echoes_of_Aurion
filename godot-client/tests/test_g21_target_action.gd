extends SceneTree
## Isolated G21 UI + real local WebSocket transport; fixture state is not live Aurion.
const Codec = preload("res://net/zone_codec.gd")
const Actor = preload("res://actors/actor_view.tscn")
var failures: Array[String] = []

func require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _init() -> void:
	call_deferred("verify")

func welcome() -> Dictionary:
	var nodes: Array = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId": id, "remaining": 5, "depleted": false, "respawnAtTick": null})
	return {"type":"welcome", "protocolVersion":5, "zoneId":"observatory_threshold",
		"connectionId":"zone_peer_g21_target_12345", "selfEntityId":"player:1", "snapshotSeq":1, "tick":1,
		"presences":[{"entityId":"player:1", "userId":1, "position":{"x":0,"z":0}, "lastAcceptedClientSeq":0}],
		"mobs":[{"entityId":"mob_1", "archetype":"clockwork_stalker", "level":1, "state":"idle", "position":{"x":2000,"z":0}, "targetEntityId":null, "isBoss":false, "isElite":false, "health":10, "maxHealth":10}],
		"combatants":[], "resources":{"contractVersion":1,"contentSourceRevision":Codec.FIXED_CONTENT,"revision":1,"nodes":nodes}}

func verify() -> void:
	var listener := TCPServer.new()
	require(listener.listen(0, "127.0.0.1") == OK, "local TCP listener failed")
	if not listener.is_listening():
		finish()
		return
	var client := WebSocketPeer.new()
	require(client.connect_to_url("ws://127.0.0.1:%d" % listener.get_local_port()) == OK, "local WebSocket connect failed")
	var remote: WebSocketPeer
	for _attempt in range(300):
		client.poll()
		if remote == null and listener.is_connection_available():
			remote = WebSocketPeer.new()
			require(remote.accept_stream(listener.take_connection()) == OK, "local WebSocket accept failed")
		if remote != null:
			remote.poll()
			if remote.get_ready_state() == WebSocketPeer.STATE_OPEN and client.get_ready_state() == WebSocketPeer.STATE_OPEN:
				break
		await create_timer(0.01).timeout
	if remote == null or remote.get_ready_state() != WebSocketPeer.STATE_OPEN or client.get_ready_state() != WebSocketPeer.STATE_OPEN:
		require(false, "local WebSocket handshake did not open")
		listener.stop()
		finish()
		return
	root.size = Vector2i(1280, 800)
	var packed := load("res://app/main.tscn") as PackedScene
	var scene: Control = packed.instantiate()
	root.add_child(scene)
	await process_frame
	scene.set_process(false)
	scene._on_zone_welcome(welcome())
	scene._zone_socket.set_process(false)
	scene._zone_socket._peer = client
	scene._zone_socket._state = "connected"
	scene._show_3d()
	await process_frame
	# A missing prepared/selected model must not freeze a confirmed player's
	# camera; the scene must not manufacture a substitute actor.
	require(not is_instance_valid(scene._self_actor), "fixture unexpectedly has a player model")
	scene.world_camera.reset_view()
	scene.world_camera.position = Vector3(30.0, 30.0, 30.0)
	scene._project_3d(Time.get_ticks_msec())
	require(bool(scene.world_camera.get("_has_visual_target")), "camera ignored confirmed self without a model")
	var camera_before_orbit: Vector3 = scene.world_camera.position
	# Carry forward #1192's simultaneous G20/G21 lifecycle checks, using the
	# current router/camera implementation and confirmed fixture state.
	var joystick: Control = scene.mobile_joystick
	var left := InputEventScreenTouch.new()
	left.index = 17
	left.position = joystick.get_node("Base").get_global_rect().get_center()
	left.pressed = true
	Input.parse_input_event(left)
	await process_frame
	var left_drag := InputEventScreenDrag.new()
	left_drag.index = 17
	left_drag.position = left.position + Vector2(50, 0)
	Input.parse_input_event(left_drag)
	await process_frame
	var held: Vector2 = joystick.get("output")
	require(held.x > 0.5, "left joystick failed to hold its finger")
	var state_before: String = JSON.stringify(scene._confirmed_zone.current_state())
	var orbit_before: float = scene.world_camera.yaw_radians
	var camera_point := Vector2.ZERO
	var camera_view: Rect2 = scene.world_view.get_global_rect()
	for y_part in [0.3, 0.5, 0.7]:
		for x_part in [0.65, 0.75, 0.85, 0.95]:
			var candidate: Vector2 = camera_view.position + camera_view.size * Vector2(x_part, y_part)
			var excluded := false
			for blocked: Rect2 in scene._camera_exclusions():
				excluded = excluded or blocked.has_point(candidate)
			if not excluded:
				camera_point = candidate
				break
		if camera_point != Vector2.ZERO:
			break
	require(camera_point != Vector2.ZERO, "fixture has no unblocked camera area")
	var right := InputEventScreenTouch.new()
	right.index = 22
	right.position = camera_point
	right.pressed = true
	Input.parse_input_event(right)
	await process_frame
	var right_drag := InputEventScreenDrag.new()
	right_drag.index = 22
	right_drag.position = camera_point + Vector2(40, -12)
	Input.parse_input_event(right_drag)
	await process_frame
	require(not is_equal_approx(scene.world_camera.yaw_radians, orbit_before), "camera did not orbit while joystick was held")
	require(scene.world_camera.position.distance_to(camera_before_orbit) > 0.01, "camera did not move visually without player model")
	require((joystick.get("output") as Vector2).is_equal_approx(held), "camera changed the held joystick")
	require(JSON.stringify(scene._confirmed_zone.current_state()) == state_before, "camera changed confirmed world state")
	var orbit_after: float = scene.world_camera.yaw_radians
	var third_drag := InputEventScreenDrag.new()
	third_drag.index = 23
	third_drag.position = camera_point + Vector2(-100, 0)
	Input.parse_input_event(third_drag)
	await process_frame
	require(is_equal_approx(scene.world_camera.yaw_radians, orbit_after), "third finger moved camera")
	scene._toggle_world_diagnostics()
	require(scene._camera_router.active_finger() == -1, "diagnostics retained camera finger")
	require((joystick.get("output") as Vector2).is_zero_approx(), "diagnostics retained joystick input")
	Input.parse_input_event(right_drag)
	await process_frame
	require(is_equal_approx(scene.world_camera.yaw_radians, orbit_after), "camera moved while diagnostics were open")
	scene._toggle_world_diagnostics()
	right.pressed = false
	Input.parse_input_event(right)
	await process_frame
	left.pressed = false
	Input.parse_input_event(left)
	await process_frame
	var actor := Actor.instantiate() as Node3D
	actor.entity_id = "mob_1" # Presentation test fixture; no model/persistence is claimed.
	actor.visible = true
	actor.position = Vector3(2.0, 0.0, 0.0)
	scene.world_actors.add_child(actor)
	scene.world_camera.position = Vector3(0.0, 2.5, 6.0)
	scene.world_camera.look_at(Vector3(0.0, 1.0, 0.0), Vector3.UP)
	scene.world_camera.current = true
	await process_frame
	var view_rect: Rect2 = scene.world_view.get_global_rect()
	var viewport_point: Vector2 = scene.world_camera.unproject_position(actor.global_position + Vector3(0, 1, 0))
	var screen_point := view_rect.position + Vector2(viewport_point.x * view_rect.size.x / float(scene.live_3d_viewport.size.x), viewport_point.y * view_rect.size.y / float(scene.live_3d_viewport.size.y))
	require(screen_point.x >= view_rect.position.x + view_rect.size.x * 0.5, "fixture target not in camera touch area")
	var touch := InputEventScreenTouch.new()
	touch.index = 22
	touch.position = screen_point
	touch.pressed = true
	scene._input(touch)
	touch.pressed = false
	scene._input(touch)
	require(scene._selected_target_id == "mob_1", "confirmed visible target not selected through touch")
	scene._refresh_target_hud()
	require(not scene.world_action.disabled, "confirmed live mob did not enable action")
	var before: String = JSON.stringify(scene._confirmed_zone.current_state())
	scene.world_action.pressed.emit()
	var packet := ""
	for _attempt in range(200):
		client.poll()
		remote.poll()
		if remote.get_available_packet_count() > 0:
			packet = remote.get_packet().get_string_from_utf8()
			break
		await create_timer(0.01).timeout
	require(Codec.wire_numbers_are_integers(packet), "attack packet encoded a fractional numeric value")
	var expected_packet: Dictionary = JSON.parse_string(JSON.stringify({"type":"attack", "clientSeq":1, "targetEntityId":"mob_1"}))
	require(JSON.parse_string(packet) == expected_packet, "target action did not send canonical attack packet")
	require(JSON.stringify(scene._confirmed_zone.current_state()) == before, "action mutated confirmed world state")
	# The native mobile button must reach the same real local transport, without
	# creating a second action path or changing the confirmed fixture state.
	scene._mobile_hud_enabled = true
	scene._show_3d()
	scene._refresh_target_hud()
	require(not scene.mobile_hud.attack_button.disabled, "mobile HUD did not enable confirmed target")
	await process_frame
	var mobile_press := InputEventScreenTouch.new()
	mobile_press.index = 31
	mobile_press.position = scene.mobile_hud.attack_button.get_global_rect().get_center()
	mobile_press.pressed = true
	Input.parse_input_event(mobile_press)
	await process_frame
	var mobile_release := InputEventScreenTouch.new()
	mobile_release.index = 31
	mobile_release.position = mobile_press.position
	mobile_release.pressed = false
	Input.parse_input_event(mobile_release)
	await process_frame
	packet = ""
	for _attempt in range(200):
		client.poll()
		remote.poll()
		if remote.get_available_packet_count() > 0:
			packet = remote.get_packet().get_string_from_utf8()
			break
		await create_timer(0.01).timeout
	expected_packet["clientSeq"] = 2.0 # JSON parsing represents wire numbers consistently.
	require(JSON.parse_string(packet) == expected_packet, "mobile button did not send canonical attack packet")
	require(JSON.stringify(scene._confirmed_zone.current_state()) == before, "mobile attack mutated confirmed state")
	scene.mobile_hud.set_menu_open(true)
	scene.mobile_hud.attack_button.pressed.emit()
	var menu_sent := false
	for _attempt in range(20):
		client.poll()
		remote.poll()
		menu_sent = menu_sent or remote.get_available_packet_count() > 0
		await create_timer(0.01).timeout
	require(not menu_sent, "open menu sent attack")
	scene.mobile_hud.set_menu_open(false)
	scene._world_is_stale = true
	scene._refresh_target_hud()
	require(scene.world_action.disabled, "stale world left action enabled")
	scene.world_action.pressed.emit()
	var unexpected := false
	for _attempt in range(20):
		client.poll()
		remote.poll()
		unexpected = unexpected or remote.get_available_packet_count() > 0
		await create_timer(0.01).timeout
	require(not unexpected, "stale world sent another attack")
	scene._world_is_stale = false
	actor.entity_id = "mob_999" # Unknown to the confirmed fixture state.
	scene._selected_target_id = "mob_999"
	scene._refresh_target_hud()
	require(scene.world_action.disabled, "unconfirmed target enabled action")
	scene.world_action.pressed.emit()
	for _attempt in range(20):
		client.poll()
		remote.poll()
		unexpected = unexpected or remote.get_available_packet_count() > 0
		await create_timer(0.01).timeout
	require(not unexpected, "unconfirmed target sent an attack")
	client.close()
	remote.close()
	listener.stop()
	scene.queue_free()
	await process_frame
	finish()

func finish() -> void:
	for failure in failures:
		push_error(failure)
	if failures.is_empty():
		print("G21 target UI and canonical attack over isolated local WebSocket verified (fixture, not live Aurion)")
	quit(0 if failures.is_empty() else 1)
