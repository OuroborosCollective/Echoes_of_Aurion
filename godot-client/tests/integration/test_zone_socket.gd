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
func verify_socket_packet_loop(wire: String, expect_welcome: bool, expected_reject_code: String = "", server_close_after_send: bool = false) -> void:
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
	var started := Time.get_ticks_msec()
	while Time.get_ticks_msec() - started < 4000 and callback_transport.state_name() != "closed":
		if remote == null and server.is_connection_available():
			remote = WebSocketPeer.new()
			require(remote.accept_stream(server.take_connection()) == OK, "loopback WebSocket accept failed")
		if remote != null:
			remote.poll()
			if remote.get_ready_state() == WebSocketPeer.STATE_OPEN:
				if remote.get_available_packet_count() > 0 and not welcome_sent:
					var hello_bytes := remote.get_packet()
					var hello: Variant = JSON.parse_string(hello_bytes.get_string_from_utf8())
					hello_received = remote.was_string_packet() and typeof(hello) == TYPE_DICTIONARY and hello.get("type") == "hello" and hello.get("protocolVersion") == 5
					if hello_received:
						welcome_sent = remote.send_text(wire) == OK
						if welcome_sent and server_close_after_send:
							# Godot's loopback WebSocketPeer can drop its own queued
							# outbound text if close() is called before poll().
							# Flush the reject frame and then immediately queue 1008
							# in the SAME server iteration (client has not polled).
							remote.poll()
							remote.close(1008, "zone authorization rejected")
					else:
						errors.append("loopback server received an invalid hello")
		await process_frame
	require(hello_received and welcome_sent, "actual WebSocket hello/welcome exchange was not exercised")
	require(callback_transport.state_name() == "closed", "WebSocket processing did not reach a terminal state")
	require(connected_callbacks == (1 if expect_welcome else 0), "unexpected zone_connected callback after wire welcome")
	if expect_welcome:
		require(last_close_reason == "client_close", "synchronous zone_connected close failed")
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
	var welcome = {"type":"welcome","protocolVersion":5,"zoneId":"observatory_threshold","connectionId":"zone_peer_abcdefghijklmnop","selfEntityId":"player:1","snapshotSeq":0,"tick":0,"presences":[],"mobs":[],"combatants":[],"resources":{"contractVersion":1,"contentSourceRevision":"286c575d3d0050ffa77b794d5b7a7e24858acee8","revision":1,"nodes":[]}}
	require(not Codec.is_valid_welcome(welcome), "incomplete resources accepted as authoritative welcome")
	# P1: real wire JSON is parsed through JSON.parse_string, not hand-built integer variants.
	var nodes: Array[Dictionary] = []
	for id in Codec.NODE_IDS:
		nodes.append({"nodeId": id, "remaining": 1, "depleted": false, "respawnAtTick": null})
	welcome["resources"]["nodes"] = nodes
	var wire: Dictionary = JSON.parse_string(JSON.stringify(welcome))
	require(Codec.is_valid_welcome(wire), "valid round-tripped wire welcome was rejected")
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
	require(not Codec.is_valid_reject({"type":"reject","code":"FABRICATED_CODE"}), "unknown v5 reject code accepted")
	# P2: test through a real packet loop, not a direct helper invocation.
	var welcome_wire := JSON.stringify(welcome)
	require(Codec.wire_numbers_are_integers(welcome_wire), "valid integer wire numbers rejected")
	await verify_socket_packet_loop(welcome_wire, true)
	# P2: the lexical token must remain integral BEFORE Godot rounds a JSON float.
	var bad_wire := welcome_wire.replace('"snapshotSeq":0', '"snapshotSeq":1.0000000000000001')
	require(bad_wire != welcome_wire, "rounded-number test could not locate wire snapshotSeq")
	require(not Codec.wire_numbers_are_integers(bad_wire), "fractional wire token rounded to an accepted integer")
	await verify_socket_packet_loop(bad_wire, false)
	await verify_socket_packet_loop(JSON.stringify({"type":"reject","code":"PROTOCOL_VERSION_UNSUPPORTED"}), false, "PROTOCOL_VERSION_UNSUPPORTED")
	# Production zone gateway sends reject and immediately starts a 1008 close.
	await verify_socket_packet_loop(JSON.stringify({"type":"reject","code":"PROTOCOL_VERSION_UNSUPPORTED"}), false, "PROTOCOL_VERSION_UNSUPPORTED", true)
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
