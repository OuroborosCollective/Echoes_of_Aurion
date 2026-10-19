extends SceneTree
const Socket = preload("res://net/zone_socket.gd")
const Codec = preload("res://net/zone_codec.gd")
var errors: Array[String] = []
var callback_transport: Node
var connected_callbacks := 0
var last_close_reason := ""
var last_reject_code := ""
var close_callbacks := 0
var reject_callbacks := 0

func remember_rejection(code: String) -> void:
	last_reject_code = code
	reject_callbacks += 1
	# The callback is synchronous: closing here must never override the server reason.
	if code == "PROTOCOL_VERSION_UNSUPPORTED":
		callback_transport.close_zone()

func close_during_connected_signal() -> void:
	connected_callbacks += 1
	callback_transport.close_zone()

func remember_close_reason(reason: String) -> void:
	last_close_reason = reason
	close_callbacks += 1

## Exercise the actual WebSocketPeer.packet -> _process() path over loopback TCP.
## No synthetic gameplay/server evidence; this is a local headless regression only.
func verify_socket_packet_loop(wire: String, expect_welcome: bool, expected_reject_code: String = "", pre_welcome_wire: String = "") -> void:
	var server := TCPServer.new()
	var listen_result := server.listen(0, "127.0.0.1")
	require(listen_result == OK, "loopback websocket server could not listen")
	if listen_result != OK:
		return
	connected_callbacks = 0
	last_close_reason = ""
	last_reject_code = ""
	close_callbacks = 0
	reject_callbacks = 0
	callback_transport = Socket.new()
	root.add_child(callback_transport)
	await process_frame
	callback_transport.zone_connected.connect(close_during_connected_signal)
	callback_transport.zone_closed.connect(remember_close_reason)
	callback_transport.zone_rejected.connect(remember_rejection)
	callback_transport._peer = WebSocketPeer.new()
	callback_transport._hello = Codec.serialized_hello("a".repeat(43))
	callback_transport._state = "connecting"
	callback_transport._connected_at = Time.get_ticks_msec()
	var connect_result: int = callback_transport._peer.connect_to_url("ws://127.0.0.1:%d" % server.get_local_port())
	require(connect_result == OK, "loopback WebSocketPeer could not initiate a socket")
	if connect_result != OK:
		callback_transport.close_zone()
		callback_transport.queue_free()
		server.stop()
		await process_frame
		return
	callback_transport.set_process(true)
	var remote: WebSocketPeer
	var hello_received := false
	var welcome_sent := false
	var pre_snapshot_sent := false
	var pre_snapshot_checked := false
	var started := Time.get_ticks_msec()
	while Time.get_ticks_msec() - started < 4000 and callback_transport.state_name() != "closed":
		if remote == null and server.is_connection_available():
			remote = WebSocketPeer.new()
			require(remote.accept_stream(server.take_connection()) == OK, "loopback WebSocket accept failed")
		if remote != null:
			remote.poll()
			if remote.get_ready_state() == WebSocketPeer.STATE_OPEN:
				# A single server-side join sends the snapshot and then
				# welcome in FIFO WebSocket message order. Both packets must
				# reach Godot's actual _process() decoder.
				if remote.get_available_packet_count() > 0 and not hello_received:
					var hello_bytes := remote.get_packet()
					var hello: Variant = JSON.parse_string(hello_bytes.get_string_from_utf8())
					hello_received = remote.was_string_packet() and typeof(hello) == TYPE_DICTIONARY and hello.get("type") == "hello" and hello.get("protocolVersion") == 5
					if hello_received:
						if pre_welcome_wire.is_empty():
							welcome_sent = remote.send_text(wire) == OK
						else:
							pre_snapshot_sent = remote.send_text(pre_welcome_wire) == OK
							if pre_snapshot_sent:
								welcome_sent = remote.send_text(wire) == OK
								pre_snapshot_checked = welcome_sent
					else:
						errors.append("loopback server received an invalid hello")
		await process_frame
	require(hello_received and welcome_sent, "actual WebSocket hello/welcome exchange was not exercised")
	if not pre_welcome_wire.is_empty():
		require(pre_snapshot_sent and pre_snapshot_checked, "gateway snapshot-first ordering was not exercised")
	require(callback_transport.state_name() == "closed", "WebSocket processing did not reach a terminal state")
	require(connected_callbacks == (1 if expect_welcome else 0), "unexpected zone_connected callback after wire welcome (callbacks=%d, close_reason=%s, snapshot_sent=%s, welcome_sent=%s)" % [connected_callbacks, last_close_reason, str(pre_snapshot_sent), str(welcome_sent)])
	if expect_welcome:
		require(last_close_reason == "client_close", "synchronous zone_connected close failed (reason=%s, reject=%s)" % [last_close_reason, last_reject_code])
	elif not expected_reject_code.is_empty():
		require(last_close_reason == "server_reject", "server reject did not terminate the handshake")
	else:
		require(last_close_reason == "invalid_welcome", "malformed wire frame was accepted")
	require(last_reject_code == expected_reject_code, "server reject signal lost or invented a rejection code")
	require(reject_callbacks == (1 if not expected_reject_code.is_empty() else 0), "server reject callback was duplicated")
	require(close_callbacks == 1, "terminal close callback was duplicated")
	if remote != null:
		remote.close()
	server.stop()
	callback_transport.queue_free()
	await process_frame

func verify_move_packet_loop(welcome_wire: String) -> void:
	var server := TCPServer.new()
	require(server.listen(0, "127.0.0.1") == OK, "move loopback server could not listen")
	if not server.is_listening():
		return
	var transport = Socket.new()
	root.add_child(transport)
	await process_frame
	transport._peer = WebSocketPeer.new()
	transport._hello = Codec.serialized_hello("a".repeat(43))
	transport._state = "connecting"
	transport._connected_at = Time.get_ticks_msec()
	require(transport._peer.connect_to_url("ws://127.0.0.1:%d" % server.get_local_port()) == OK, "move loopback client could not connect")
	transport.set_process(true)
	var remote: WebSocketPeer
	var hello_received := false
	var welcome_sent := false
	var first_sent := false
	var second_sent := false
	var received: Array = []
	var started := Time.get_ticks_msec()
	while Time.get_ticks_msec() - started < 4000 and received.size() < 2:
		if remote == null and server.is_connection_available():
			remote = WebSocketPeer.new()
			require(remote.accept_stream(server.take_connection()) == OK, "move loopback WebSocket accept failed")
		if remote != null:
			remote.poll()
			if remote.get_ready_state() == WebSocketPeer.STATE_OPEN:
				while remote.get_available_packet_count() > 0:
					var bytes := remote.get_packet()
					var was_text := remote.was_string_packet()
					var decoded: Variant = JSON.parse_string(bytes.get_string_from_utf8())
					if not hello_received:
						hello_received = was_text and typeof(decoded) == TYPE_DICTIONARY and decoded.get("type") == "hello"
						if hello_received:
							welcome_sent = remote.send_text(welcome_wire) == OK
					elif was_text and typeof(decoded) == TYPE_DICTIONARY:
						received.append(decoded)
		if transport.state_name() == "connected" and not first_sent:
			require(transport.send_move(1, 0), "connected move was not queued")
			require(not transport.send_move(2, 0), "out-of-contract move axis was queued")
			first_sent = true
		if received.size() == 1 and not second_sent:
			require(transport.send_move(0, -1), "second connected move was not queued")
			second_sent = true
		await process_frame
	require(hello_received and welcome_sent, "move test did not complete hello/welcome")
	require(first_sent and second_sent, "move test did not exercise both sends")
	require(received.size() == 2, "server did not receive exactly two move frames")
	if received.size() == 2:
		var first: Dictionary = received[0]
		var second: Dictionary = received[1]
		require(first.size() == 3 and first.get("type") == "move" and first.get("clientSeq") == 1 and typeof(first.get("input")) == TYPE_DICTIONARY and first["input"].size() == 2 and first["input"].get("x") == 1 and first["input"].get("z") == 0, "first move wire shape or sequence drifted")
		require(second.size() == 3 and second.get("type") == "move" and second.get("clientSeq") == 2 and typeof(second.get("input")) == TYPE_DICTIONARY and second["input"].size() == 2 and second["input"].get("x") == 0 and second["input"].get("z") == -1, "second move wire shape or sequence drifted")
	transport.close_zone()
	if remote != null:
		remote.close()
	server.stop()
	transport.queue_free()
	await process_frame

func require(ok: bool, description: String) -> void:
	if not ok:
		errors.append(description)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
	# P2: fail closed if started before the node enters a scene tree.
	var detached = Socket.new()
	require(not detached.connect_zone("https://arelogic.space", "a".repeat(43)), "detached transport initiated a connection")
	require(detached.state_name() == "closed", "detached connection changed state")
	detached.free()
	var transport = Socket.new()
	root.add_child(transport)
	await process_frame
	require(transport.state_name() == "closed", "initial state should be closed")
	require(not transport.connect_zone("https://evil.example", "a".repeat(43)), "foreign host accepted")
	require(not transport.connect_zone("https://arelogic.space", "weak"), "short ticket accepted")
	require(transport.state_name() == "closed", "invalid input produced connected state")
	require(Codec.is_valid_welcome({"type": "welcome"}) == false, "incomplete welcome accepted")
	require(Codec.valid_hello("a".repeat(43)).size() == 4, "hello shape incorrect")
	require(Codec.valid_hello("short").is_empty(), "malformed hello accepted")
	require(Codec.valid_move(1, -1, 1) == {"type":"move","clientSeq":1,"input":{"x":-1,"z":1}}, "move shape incorrect")
	require(Codec.valid_move(0, 0, 0).is_empty(), "zero move sequence accepted")
	require(Codec.valid_move(2147483648, 0, 0).is_empty(), "oversized move sequence accepted")
	require(Codec.valid_move(1, -2, 0).is_empty(), "invalid move axis accepted")
	require(not transport.send_move(0, 0), "move sent before verified welcome")
	var welcome = {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold","connectionId":"zone_peer_abcdefghijklmnop","selfEntityId":"player:1","snapshotSeq":0,"tick":0,"presences":[],"mobs":[],"combatants":[],"resources":{"contractVersion":1,"contentSourceRevision":"286c575d3d0050ffa77b794d5b7a7e24858acee8","revision":1,"nodes":[]}}
	require(not Codec.is_valid_welcome(welcome), "incomplete resources accepted as authoritative welcome")
	# P1: real wire JSON is parsed through JSON.parse_string, not hand-built integer variants.
	var nodes: Array[Dictionary] = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId": id, "remaining": 1, "depleted": false, "respawnAtTick": null})
	welcome["resources"]["nodes"] = nodes
	var wire: Dictionary = JSON.parse_string(JSON.stringify(welcome))
	require(Codec.is_valid_welcome(wire), "valid round-tripped wire welcome was rejected")

	# Actual zone joins normally include the authenticated player, mobs and
	# combatants. The client must accept their checked shapes, not empty-only.
	var populated: Dictionary = welcome.duplicate(true)
	populated["presences"] = [{
		"entityId": "player:1", "userId": 1,
		"position": {"x": 1000, "z": -2000},
		"lastAcceptedClientSeq": 0,
	}]
	populated["mobs"] = [{
		"entityId": "mob_1", "archetype": "clockwork_stalker",
		"level": 1, "state": "idle", "position": {"x": 1000, "z": 2000},
		"targetEntityId": null, "isBoss": false, "isElite": false,
		"health": 10, "maxHealth": 10,
	}]
	populated["combatants"] = [{
		"entityId": "player:1", "health": 20, "maxHealth": 20,
		"stamina": 10, "maxStamina": 10, "alive": true,
		"combatLevel": 1, "lastCombatSequence": 0,
	}]
	require(Codec.is_valid_welcome(JSON.parse_string(JSON.stringify(populated))), "real nested welcome state rejected")
	var wrong_presence: Dictionary = populated.duplicate(true)
	wrong_presence["presences"][0]["userId"] = -2
	require(not Codec.is_valid_welcome(wrong_presence), "invalid presence userId accepted")
	var wrong_mob: Dictionary = populated.duplicate(true)
	wrong_mob["mobs"][0]["targetEntityId"] = "mob_1"
	require(not Codec.is_valid_welcome(wrong_mob), "invalid mob target accepted")
	var wrong_combatant: Dictionary = populated.duplicate(true)
	wrong_combatant["combatants"][0]["maxHealth"] = 0
	require(not Codec.is_valid_welcome(wrong_combatant), "invalid combatant maxHealth accepted")
	var snapshot_wire: Dictionary = populated.duplicate(true)
	snapshot_wire["type"] = "snapshot"
	snapshot_wire.erase("connectionId")
	snapshot_wire.erase("selfEntityId")
	snapshot_wire.erase("protocolVersion")
	require(Codec.is_valid_snapshot(JSON.parse_string(JSON.stringify(snapshot_wire))), "valid nested snapshot rejected")

	var mismatch_presence: Dictionary = populated.duplicate(true)
	mismatch_presence["presences"][0]["userId"] = 2
	require(not Codec.is_valid_welcome(mismatch_presence), "presence identity/entity mismatch accepted")
	var invalid_health: Dictionary = populated.duplicate(true)
	invalid_health["combatants"][0]["health"] = 0
	require(not Codec.is_valid_welcome(invalid_health), "alive combatant with zero health accepted")
	var invalid_stamina: Dictionary = populated.duplicate(true)
	invalid_stamina["combatants"][0]["stamina"] = 11
	require(not Codec.is_valid_welcome(invalid_stamina), "combatant stamina above capacity accepted")
	var invalid_mob_state: Dictionary = populated.duplicate(true)
	invalid_mob_state["mobs"][0]["state"] = "dead"
	require(not Codec.is_valid_welcome(invalid_mob_state), "dead mob with positive health accepted")
	var invalid_boss: Dictionary = populated.duplicate(true)
	invalid_boss["mobs"][0]["isBoss"] = true
	require(not Codec.is_valid_welcome(invalid_boss), "non-elite boss accepted")
	var invalid_idle_target: Dictionary = populated.duplicate(true)
	invalid_idle_target["mobs"][0]["targetEntityId"] = "player:1"
	require(not Codec.is_valid_welcome(invalid_idle_target), "idle mob with combat target accepted")
	var depleted_live: Dictionary = populated.duplicate(true)
	depleted_live["resources"]["nodes"][0]["depleted"] = true
	require(not Codec.is_valid_welcome(depleted_live), "depleted resource with remaining inventory accepted")
	var stale_respawn: Dictionary = populated.duplicate(true)
	stale_respawn["resources"]["nodes"][0]["remaining"] = 0
	stale_respawn["resources"]["nodes"][0]["depleted"] = true
	stale_respawn["resources"]["nodes"][0]["respawnAtTick"] = 1
	stale_respawn["tick"] = 1
	require(not Codec.is_valid_welcome(stale_respawn), "expired resource respawn accepted")
	var valid_respawn: Dictionary = stale_respawn.duplicate(true)
	valid_respawn["resources"]["nodes"][0]["respawnAtTick"] = 2
	require(Codec.is_valid_welcome(valid_respawn), "future depleted resource respawn rejected")

	snapshot_wire["presences"].append(snapshot_wire["presences"][0].duplicate())
	require(not Codec.is_valid_snapshot(snapshot_wire), "duplicate presence entity accepted")

	# Gateway joins emit snapshot before welcome; it must not terminate auth.
	var early_snapshot: Dictionary = welcome.duplicate(true)
	early_snapshot["type"] = "snapshot"
	early_snapshot.erase("connectionId")
	early_snapshot.erase("protocolVersion")
	early_snapshot.erase("selfEntityId")
	var transient = Socket.new()
	root.add_child(transient)
	await process_frame
	transient._state = "authenticating"
	require(transient._is_pre_welcome_snapshot(early_snapshot), "gateway pre-welcome snapshot should be ignored without projection")
	require(not transient._is_pre_welcome_snapshot({"type":"attack"}), "unknown pre-welcome message permitted")
	transient._state = "closed"
	transient.queue_free()
	await process_frame
	var rejecting = Socket.new()
	root.add_child(rejecting)
	await process_frame
	var order: Array[String] = []
	rejecting.zone_rejected.connect(func(_code: String) -> void:
		order.append("reject")
		require(not rejecting.connect_zone("https://arelogic.space", "a".repeat(43)), "reconnect allowed during rejection callback")
		rejecting.close_zone()
	)
	rejecting.zone_closed.connect(func(reason: String) -> void:
		order.append("close:" + reason)
		require(not rejecting.connect_zone("https://arelogic.space", "a".repeat(43)), "reconnect allowed before terminal callback")
	)
	rejecting._state = "authenticating"
	rejecting._report_reject("PROTOCOL_VERSION_UNSUPPORTED")
	require(order == ["reject", "close:server_reject"], "rejection callback order or close reason invalid")
	require(rejecting.state_name() == "closed", "reject did not terminate transport")
	rejecting.queue_free()
	await process_frame
	require(Codec._safe_nonnegative(1.0), "integral wire float rejected")
	require(not Codec._safe_nonnegative(1.5), "fractional wire number accepted")
	require(not Codec._safe_nonnegative(-1.0), "negative wire number accepted")
	require(not Codec._safe_nonnegative(9007199254740992.0), "unsafe floating-point integer accepted")
	var invalid_tick: Dictionary = wire.duplicate(true)
	invalid_tick["tick"] = 1.5
	require(not Codec.is_valid_welcome(invalid_tick), "fractional server tick accepted")
	var invalid_remaining: Dictionary = wire.duplicate(true)
	invalid_remaining["resources"]["nodes"][0]["remaining"] = 1.5
	require(not Codec.is_valid_welcome(invalid_remaining), "fractional resource count accepted")
	var invalid_revision: Dictionary = wire.duplicate(true)
	invalid_revision["resources"]["revision"] = 9007199254740992.0
	require(not Codec.is_valid_welcome(invalid_revision), "unsafe resource revision accepted")
	var zero_revision: Dictionary = wire.duplicate(true)
	zero_revision["resources"]["revision"] = 0
	require(not Codec.is_valid_welcome(zero_revision), "resource revision zero violated canonical v5 schema")
	for bad_id in ["player:0", "player:01", "player:-1", "player:abc", "player:1a"]:
		var invalid_entity: Dictionary = wire.duplicate(true)
		invalid_entity["selfEntityId"] = bad_id
		require(not Codec.is_valid_welcome(invalid_entity), "invalid v5 selfEntityId accepted: " + bad_id)
	require(Codec.is_valid_reject({"type":"reject","code":"PROTOCOL_VERSION_UNSUPPORTED"}), "known v5 reject code missing")
	var command_peer = Socket.new()
	root.add_child(command_peer)
	await process_frame
	command_peer._state = "connected"
	command_peer._last_snapshot_seq = 8
	command_peer._last_tick = 12
	require(command_peer._last_tick == 12, "snapshot tick watermark unavailable")
	command_peer.close_zone()
	command_peer.queue_free()
	await process_frame
	require(not Codec.is_valid_reject({"type":"reject","code":"FABRICATED_CODE"}), "unknown v5 reject code accepted")
	# P2: test through a real packet loop, not a direct helper invocation.
	var welcome_wire := JSON.stringify(welcome)
	require(Codec.wire_numbers_are_integers(welcome_wire), "valid integer wire numbers rejected")
	await verify_socket_packet_loop(welcome_wire, true)
	await verify_move_packet_loop(welcome_wire)
	# Real Aurion zone.join broadcasts a snapshot before the server sends
	# welcome. This uses two wire packets with intervening Godot process frames.
	early_snapshot["presences"] = [{"entityId":"player:1","userId":1,"position":{"x":0,"z":0},"lastAcceptedClientSeq":0}]
	require(Codec.wire_numbers_are_integers(JSON.stringify(early_snapshot)), "snapshot test fixture emitted fractional JSON numbers")
	await verify_socket_packet_loop(welcome_wire, true, "", JSON.stringify(early_snapshot))
	# P2: the lexical token must remain integral BEFORE Godot rounds a JSON float.
	var bad_wire := welcome_wire.replace('"snapshotSeq":0', '"snapshotSeq":1.0000000000000001')
	require(bad_wire != welcome_wire, "rounded-number test could not locate wire snapshotSeq")
	require(not Codec.wire_numbers_are_integers(bad_wire), "fractional wire token rounded to an accepted integer")
	await verify_socket_packet_loop(bad_wire, false)
	await verify_socket_packet_loop(JSON.stringify({"type":"reject","code":"PROTOCOL_VERSION_UNSUPPORTED"}), false, "PROTOCOL_VERSION_UNSUPPORTED")
	# Production zone gateway sends reject and immediately starts a 1008 close.
	await verify_socket_packet_loop(JSON.stringify({"type":"reject","code":"FAKE_CODE"}), false)
	var invalid_entity_wire: Dictionary = welcome.duplicate(true)
	invalid_entity_wire["selfEntityId"] = "player:0"
	await verify_socket_packet_loop(JSON.stringify(invalid_entity_wire), false)
	var invalid_resource_wire: Dictionary = welcome.duplicate(true)
	invalid_resource_wire["resources"]["revision"] = 0
	await verify_socket_packet_loop(JSON.stringify(invalid_resource_wire), false)
	var string_with_decimals := welcome_wire.replace("zone_peer_abcdefghijklmnop", "zone_peer_1.0000000000000001")
	require(Codec.wire_numbers_are_integers(string_with_decimals), "number-like characters inside JSON strings were rejected")
	transport.close_zone()
	require(transport.state_name() == "closed", "close failed")
	transport.queue_free()
	await process_frame
	if errors.is_empty():
		print("Godot G10 WebSocket handshake contract verified (headless, no live server)")
		quit(0)
	else:
		for issue in errors:
			push_error(issue)
		quit(1)
