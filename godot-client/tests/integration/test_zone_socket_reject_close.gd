extends SceneTree
## Real node-ws gateway-shaped loopback proof of reject -> immediate close(1008).
## There are no productive server credentials or live Aurion sessions here.
const Socket = preload("res://net/zone_socket.gd")
const Codec = preload("res://net/zone_codec.gd")
var transport: Node
var reject_code := ""
var close_reason := ""
var reject_count := 0
var close_count := 0
var closed_before_reject := false
var errors: Array[String] = []

func _init() -> void:
	call_deferred("verify")

func on_reject(code: String) -> void:
	reject_count += 1
	reject_code = code
	closed_before_reject = transport.state_name() == "closed"
	# Godot signals are synchronous. The rejected attempt must already be
	# terminal, so a callback cannot override its close reason.
	transport.close_zone()

func on_close(reason: String) -> void:
	close_count += 1
	close_reason = reason

func require(ok: bool, message: String) -> void:
	if not ok:
		errors.append(message)

func verify() -> void:
	var args := OS.get_cmdline_user_args()
	require(args.size() == 1, "expected loopback ws port from Node harness")
	var port := int(args[0]) if args.size() == 1 else 0
	require(port > 0 and port <= 65535, "invalid loopback ws port")
	if not errors.is_empty():
		for e in errors:
			push_error(e)
		quit(1)
		return
	transport = Socket.new()
	root.add_child(transport)
	await process_frame
	transport.zone_rejected.connect(on_reject)
	transport.zone_closed.connect(on_close)
	# Only the test injects the local peer; production connect_zone remains
	# pinned to Aurion's canonical wss://arelogic.space/v1/ws origin.
	transport._peer = WebSocketPeer.new()
	transport._hello = Codec.serialized_hello("z".repeat(43))
	transport._state = "connecting"
	transport._connected_at = Time.get_ticks_msec()
	var result: int = transport._peer.connect_to_url("ws://127.0.0.1:%d" % port)
	require(result == OK, "WebSocketPeer failed to start Node ws loopback")
	if result == OK:
		transport.set_process(true)
		var start := Time.get_ticks_msec()
		while close_count == 0 and Time.get_ticks_msec() - start < 5000:
			await process_frame
		require(close_count == 1, "reject did not produce one terminal zone_closed signal")
		require(reject_count == 1, "reject frame lost or zone_rejected duplicated")
		require(reject_code == "PROTOCOL_VERSION_UNSUPPORTED", "incorrect code for rejected protocol")
		require(close_reason == "server_reject", "reject-then-close reported wrong terminal reason")
		require(closed_before_reject, "reject callback ran before attempt became terminal")
		require(transport.state_name() == "closed", "transport reopened or remained connected after rejection")
	transport.queue_free()
	await process_frame
	if errors.is_empty():
		print("Godot G10 Node ws reject-then-1008-close regression verified")
		quit(0)
	else:
		for e in errors:
			push_error(e)
		quit(1)
