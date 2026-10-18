extends Node
## G10 handshake transport only. No gameplay authority, no production proof.
signal zone_connected
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

func state_name() -> String:
	return _state

func connect_zone(base_url: String, ticket: String) -> bool:
	if _state != "closed" or not is_inside_tree():
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
					_finish("server_reject")
					emit_signal("zone_rejected", reject_code)
					return
				if _accept_welcome(decoded):
					return
				_finish("invalid_welcome")
				return
			elif _state == "connected":
				if Codec.is_valid_reject(decoded):
					var reject_code: String = decoded["code"]
					_finish("server_reject")
					emit_signal("zone_rejected", reject_code)
					return
	if _peer == active_peer and active_peer.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		_finish("closed")

func _accept_welcome(raw: Variant) -> bool:
	if not Codec.is_valid_welcome(raw):
		return false
	_received_welcome = true
	_state = "connected"
	emit_signal("zone_connected")
	return true

func _finish(reason: String) -> void:
	var old := _state
	if _peer != null:
		_peer.close()
	_peer = null
	_hello = ""
	_state = "closed"
	_received_welcome = false
	set_process(false)
	if old != "closed":
		emit_signal("zone_closed", reason)

func close_zone() -> void:
	_finish("client_close")
