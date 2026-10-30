extends SceneTree
## G13: actual Godot WebSocketPeer against Aurion's real isolated Node gateway.
## Endpoint and one-use ticket are CI-process environment only, never printed.
const Socket = preload("res://net/zone_socket.gd")
const World = preload("res://projection/zone_state.gd")
const Registry = preload("res://projection/entity_registry.gd")
const Interpolator = preload("res://projection/snapshot_interpolator.gd")
var world := World.new()
var registry := Registry.new()
var visual := Interpolator.new()
var confirmed_receipt: Dictionary = {}
var captured_ms := 0

var failures: Array[String] = []
var transport: Node
var hud: Control
var connected_count := 0
var snapshot_count := 0
var accepted_movement := false
var closed_reason := ""
var sent_move := false
var expected_entity_id := ""

func _init() -> void:
	call_deferred("_verify")

func _on_connected() -> void:
	connected_count += 1

func _on_welcome(welcome: Dictionary) -> void:
	_require(world.apply_welcome(welcome), "projection rejected actual welcome")
	_require(registry.sync(world), "registry rejected actual welcome")
	_require(visual.capture(world, Time.get_ticks_msec()), "interpolator rejected actual welcome")
	_check_hud_projection()

func _on_snapshot(snapshot: Dictionary) -> void:
	snapshot_count += 1
	_require(world.apply_snapshot(snapshot), "projection rejected actual snapshot")
	_require(registry.sync(world), "registry rejected actual snapshot")
	_check_hud_projection()
	captured_ms = Time.get_ticks_msec()
	_require(visual.capture(world, captured_ms), "interpolator rejected actual snapshot")
	for presence in snapshot.get("presences", []):
		if typeof(presence) != TYPE_DICTIONARY:
			continue
		if presence.get("entityId") == expected_entity_id and presence.get("lastAcceptedClientSeq") == 1 and presence.get("position", {}).get("x", 0) > 0:
			accepted_movement = true
			confirmed_receipt = world.current_state()
			# Read through the actual registry, not directly from the wire payload.
			for category in Registry.CATEGORIES:
				var records: Array = []
				for id in registry.ids(category):
					records.append(registry.record(category, id))
				if category == "resources":
					confirmed_receipt[category]["nodes"] = records
				else:
					confirmed_receipt[category] = records
			var target := Vector2(presence["position"]["x"], presence["position"]["z"])
			_require(Interpolator.WINDOW_MS == 100, "presentation contract must remain 100 ms")
			_require(visual.visual_mm(expected_entity_id, captured_ms) != target, "moving presentation not separated from confirmed target")
			_require(visual.visual_mm(expected_entity_id, captured_ms + 100) == target, "presentation exceeds 100 ms bound")
			_require(visual.confirmed_mm(expected_entity_id) == presence["position"], "interpolation changed confirmed integer position")
			var before := world.current_state()
			_require(not world.apply_snapshot(snapshot), "real duplicate snapshot accepted")
			var stale := snapshot.duplicate(true)
			stale["snapshotSeq"] = int(snapshot["snapshotSeq"]) - 1
			_require(not world.apply_snapshot(stale), "real stale snapshot accepted")
			_require(world.current_state() == before, "rejected snapshot changed confirmed state")
			_require(not registry.sync(world), "duplicate registry update accepted")
			_require(not visual.capture(world, Time.get_ticks_msec()), "duplicate interpolation update accepted")

func _on_closed(reason: String) -> void:
	closed_reason = reason

func _require(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)

func _check_hud_projection() -> void:
	# The actual gateway is isolated CI, not the production server. The HUD
	# reads its validated state via the same registry used by the game scene.
	hud.render_projection(world, registry, "", false, false, "")
	_require(hud.player_name.text.begins_with("Spieler: " + world.self_entity_id()), "HUD lost actual gateway player identity")
	var self_record: Dictionary = registry.record("combatants", world.self_entity_id())
	if self_record.is_empty():
		_require(hud.health_label.text == "HP: —" and not hud.health_bar.visible, "HUD invented absent gateway HP")
	else:
		var expected := "HP %d / %d" % [int(self_record["health"]), int(self_record["maxHealth"])]
		_require(hud.health_label.text == expected and hud.health_bar.visible, "HUD diverged from actual gateway HP")

func _verify() -> void:
	var url := OS.get_environment("AURION_G13_TEST_WS_URL")
	var ticket := OS.get_environment("AURION_G13_TEST_TICKET")
	expected_entity_id = OS.get_environment("AURION_G13_TEST_ENTITY_ID")
	_require(url.begins_with("ws://127.0.0.1:") and url.ends_with("/v1/ws"), "isolated gateway URL invalid")
	_require(ticket.begins_with("aurion_zone_") and ticket.length() >= 43, "one-use ticket invalid")
	_require(expected_entity_id.begins_with("player:"), "expected player identity invalid")
	if not failures.is_empty():
		_fail()
		return
	hud = (load("res://ui/screens/hud.tscn") as PackedScene).instantiate()
	root.add_child(hud)
	await process_frame
	transport = Socket.new()
	root.add_child(transport)
	await process_frame
	transport.zone_welcome.connect(_on_welcome)
	transport.zone_connected.connect(_on_connected)
	transport.zone_snapshot.connect(_on_snapshot)
	transport.zone_closed.connect(_on_closed)
	# Only tests inject a loopback WebSocketPeer. Production connect_zone()
	# remains pinned to wss://arelogic.space/v1/ws, with no test bypass.
	transport._peer = WebSocketPeer.new()
	transport._peer.handshake_headers = PackedStringArray(["Origin: http://127.0.0.1"])
	transport._peer.inbound_buffer_size = 131072
	transport._peer.outbound_buffer_size = 4096
	transport._peer.max_queued_packets = 4
	transport._hello = Socket.Codec.serialized_hello(ticket)
	transport._state = "connecting"
	transport._connected_at = Time.get_ticks_msec()
	var outcome: int = transport._peer.connect_to_url(url)
	_require(outcome == OK, "actual Godot WebSocketPeer failed to open isolated gateway")
	if outcome != OK:
		_fail()
		return
	transport.set_process(true)
	var start := Time.get_ticks_msec()
	while Time.get_ticks_msec() - start < 10000 and not accepted_movement and closed_reason.is_empty():
		if connected_count == 1 and not sent_move:
			_require(transport.state_name() == "connected", "welcome did not establish validated session")
			sent_move = transport.send_move(1, 0)
			_require(sent_move, "canonical Godot move rejected after welcome")
		await process_frame
	_require(connected_count == 1, "real Aurion welcome was not validated exactly once")
	_require(snapshot_count > 0, "no post-welcome snapshot projected by Godot")
	_require(sent_move, "native Godot movement intent was not sent")
	_require(accepted_movement, "Aurion did not confirm Godot movement")
	_require(closed_reason.is_empty(), "Aurion session closed unexpectedly")
	# Stop transport before waiting: the last confirmed target must settle and
	# freeze even without another server packet; no extrapolated future state.
	transport.close_zone()
	await create_timer(float(Interpolator.WINDOW_MS + 30) / 1000.0).timeout
	var confirmed := visual.confirmed_mm(expected_entity_id)
	_require(not confirmed.is_empty(), "confirmed position absent after disconnect")
	if not confirmed.is_empty():
		_require(visual.visual_mm(expected_entity_id, Time.get_ticks_msec()) == Vector2(confirmed["x"], confirmed["z"]), "visual did not settle within bounded delay")
		_require(visual.visual_mm(expected_entity_id, Time.get_ticks_msec() + 10000) == Vector2(confirmed["x"], confirmed["z"]), "visual extrapolated beyond confirmed state")
	transport.queue_free()
	await process_frame
	if failures.is_empty():
		print("G11_CONFIRMED_PROJECTION=" + JSON.stringify(confirmed_receipt))
		print("G22_REAL_ISOLATED_AURION_HUD_PROJECTION_PASS")
		print("G13_REAL_AURION_GATEWAY_GODOT_PASS")
		quit(0)
	else:
		_fail()

func _fail() -> void:
	for message in failures:
		push_error(message)
	quit(1)
