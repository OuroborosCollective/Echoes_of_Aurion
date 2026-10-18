extends SceneTree
const Socket = preload("res://net/zone_socket.gd")
const Codec = preload("res://net/zone_codec.gd")
var errors: Array[String] = []
var callback_transport: Node

func close_during_connected_signal() -> void:
	callback_transport.close_zone()

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
	# P2: synchronous zone_connected callbacks may close the transport.
	callback_transport = Socket.new()
	root.add_child(callback_transport)
	await process_frame
	callback_transport.zone_connected.connect(close_during_connected_signal)
	callback_transport._state = "authenticating"
	require(callback_transport._accept_welcome(wire), "valid welcome did not trigger connected signal")
	require(callback_transport.state_name() == "closed", "callback close resurrected connected state")
	callback_transport.queue_free()
	await process_frame
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
