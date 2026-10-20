extends Node
## G10 handshake transport only. No gameplay authority, no production proof.
signal zone_connected
signal zone_welcome(welcome: Dictionary)
signal zone_snapshot(snapshot: Dictionary)
signal zone_rejected(code: String)
signal zone_closed(reason: String)

const Codec = preload("res://net/zone_codec.gd")
const TIMEOUT_MS := 5000
const MAX_PACKET_BYTES := 131072

var _peer: WebSocketPeer
var _state := "closed"
var _hello := ""
var _connected_at := -1
var _received_welcome := false
var _reject_notifications_in_flight := false
var _last_snapshot_seq := -1
var _last_tick := -1
var _next_client_seq := 1

func state_name() -> String:
	return _state

func send_move(input_x: int, input_z: int) -> bool:
	if _state != "connected" or _peer == null or _peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return false
	var wire := Codec.serialized_move(_next_client_seq, input_x, input_z)
	if wire.is_empty() or _peer.send_text(wire) != OK:
		return false
	_next_client_seq += 1
	return true

func send_attack(target_id: String) -> bool:
	if _state != "connected" or _peer == null or _peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return false
	var wire := Codec.serialized_attack(_next_client_seq, target_id)
	if wire.is_empty() or _peer.send_text(wire) != OK:
		return false
	_next_client_seq += 1
	return true

func send_skill(skill_id: String, target_id: String) -> bool:
	if _state != "connected" or _peer == null or _peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return false
	var wire := Codec.serialized_skill(_next_client_seq, skill_id, target_id)
	if wire.is_empty() or _peer.send_text(wire) != OK:
		return false
	_next_client_seq += 1
	return true

func connect_zone(base_url: String, ticket: String) -> bool:
	if _state != "closed" or _reject_notifications_in_flight or not is_inside_tree():
		return false
	if base_url != "https://arelogic.space" and base_url != "https://arelogic.space/":
		return false
	_hello = Codec.serialized_hello(ticket)
	if _hello.is_empty():
		return false
	_peer = WebSocketPeer.new()
	_peer.handshake_headers = PackedStringArray(["Origin: https://arelogic.space"])
	_peer.inbound_buffer_size = MAX_PACKET_BYTES
	_peer.outbound_buffer_size = 4096
	_peer.max_queued_packets = 4
	# Browser-origin policy is server authorization preflight, not native identity.
	var result := _peer.connect_to_url("wss://arelogic.space/v1/ws")
	if result != OK:
		_peer = null
		_hello = ""
		return false
	_state = "connecting"
	_last_snapshot_seq = -1
	_last_tick = -1
	_next_client_seq = 1
	_connected_at = Time.get_ticks_msec()
	set_process(true)
	return true

func _ready() -> void:
	set_process(_state != "closed")

func _process(_delta: float) -> void:
	if _peer == null:
		return
	var active_peer := _peer
	active_peer.poll()
	if _state == "connecting" or _state == "authenticating":
		if Time.get_ticks_msec() - _connected_at > TIMEOUT_MS:
			_finish("hello_timeout")
			return
	var ready := active_peer.get_ready_state()
	if ready == WebSocketPeer.STATE_OPEN and _state == "connecting":
		_state = "authenticating"
		if active_peer.send_text(_hello) != OK:
			_finish("hello_send_failed")
			return
		_hello = ""
	# Server may send reject and immediately start a 1008 close; drain queued
	# text frames during CLOSING/CLOSED as well as OPEN before reporting closure.
	if ready in [WebSocketPeer.STATE_OPEN, WebSocketPeer.STATE_CLOSING, WebSocketPeer.STATE_CLOSED]:
		while _peer == active_peer and active_peer.get_available_packet_count() > 0:
			var bytes := active_peer.get_packet()
			if not active_peer.was_string_packet():
				_finish("binary_frame_rejected")
				return
			if bytes.size() > MAX_PACKET_BYTES:
				_finish("oversized_frame")
				return
			var wire := bytes.get_string_from_utf8()
			if not Codec.wire_numbers_are_integers(wire):
				_finish("invalid_welcome")
				return
			var decoded: Variant = JSON.parse_string(wire)
			if _state == "authenticating":
				if Codec.is_valid_reject(decoded):
					# Tear down before callbacks; otherwise a synchronous close
					# overrides the server reason or destroys a successor peer.
					var reject_code: String = decoded["code"]
					_report_reject(reject_code)
					return
				# The server currently broadcasts a snapshot during join, before
				# emitting welcome. No snapshot state may be projected until
				# a verified welcome makes the session authoritative.
				if _is_pre_welcome_snapshot(decoded):
					if not Codec.is_valid_snapshot(decoded):
						_finish("invalid_snapshot")
						return
					continue
				if _accept_welcome(decoded):
					return
				_finish("invalid_welcome")
				return
			elif _state == "connected":
				if typeof(decoded) == TYPE_DICTIONARY and decoded.get("type") == "snapshot":
					if not Codec.is_valid_snapshot(decoded):
						_finish("invalid_snapshot")
						return
					if decoded["snapshotSeq"] > _last_snapshot_seq and decoded["tick"] >= _last_tick:
						_last_snapshot_seq = int(decoded["snapshotSeq"])
						_last_tick = int(decoded["tick"])
						emit_signal("zone_snapshot", decoded)
						if _peer != active_peer:
							return
					continue
				if Codec.is_valid_reject(decoded):
					# Post-welcome rejects are per-command feedback, not an auth failure.
					emit_signal("zone_rejected", str(decoded["code"]))
					if _peer != active_peer:
						return
					continue
				# Combat and telegraph are known v5 event types whose presentation
				# projection is integrated separately. Anything outside the wire union
				# is a protocol violation and must not leave an authenticated peer open.
				if typeof(decoded) == TYPE_DICTIONARY and decoded.get("type") in ["combat", "telegraph"]:
					continue
				_finish("invalid_server_message")
				return
	if _peer == active_peer and active_peer.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		_finish("closed")

func _is_pre_welcome_snapshot(raw: Variant) -> bool:
	# Never project pre-auth gameplay data. The gateway sends a snapshot
	# while joining, before the final authenticated welcome frame.
	return typeof(raw) == TYPE_DICTIONARY and raw.get("type") == "snapshot"

func _report_reject(code: String) -> void:
	# No new connection may begin until the old reject + close notifications
	# finish, even if a synchronous signal listener attempts to reconnect.
	_reject_notifications_in_flight = true
	_finish("server_reject", false)
	emit_signal("zone_rejected", code)
	emit_signal("zone_closed", "server_reject")
	_reject_notifications_in_flight = false

func _accept_welcome(raw: Variant) -> bool:
	if not Codec.is_valid_welcome(raw):
		return false
	_received_welcome = true
	_last_snapshot_seq = int(raw["snapshotSeq"])
	_last_tick = int(raw["tick"])
	_state = "connected"
	emit_signal("zone_welcome", raw.duplicate(true))
	if _state != "connected":
		return true
	emit_signal("zone_connected")
	return true

func _finish(reason: String, notify: bool = true) -> void:
	var old := _state
	if _peer != null:
		_peer.close()
	_peer = null
	_hello = ""
	_state = "closed"
	_received_welcome = false
	_last_snapshot_seq = -1
	_last_tick = -1
	_next_client_seq = 1
	set_process(false)
	if old != "closed" and notify:
		emit_signal("zone_closed", reason)

func close_zone() -> void:
	_finish("client_close")
