extends SceneTree
const Socket = preload("res://net/zone_socket.gd")
const Codec = preload("res://net/zone_codec.gd")
var errors: Array[String] = []

func require(ok: bool, description: String) -> void:
	if not ok:
		errors.append(description)

func _init() -> void:
	call_deferred("verify")

func verify() -> void:
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
