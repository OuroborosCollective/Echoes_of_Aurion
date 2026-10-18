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
	_peer.poll()
	if _state == "connecting" or _state == "authenticating":
		if Time.get_ticks_msec() - _connected_at > TIMEOUT_MS:
			_finish("hello_timeout")
			return
	match _peer.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			if _state == "connecting":
				_state = "authenticating"
				if _peer.send_text(_hello) != OK:
					_finish("hello_send_failed")
					return
				_hello = ""
			while _peer.get_available_packet_count() > 0:
				var bytes := _peer.get_packet()
				if not _peer.was_string_packet():
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
					if _accept_welcome(decoded):
						return
					else:
						_finish("invalid_welcome")
						return
				elif _state == "connected":
					# No game projection until the complete v5 nested decoder ships.
					if typeof(decoded) == TYPE_DICTIONARY and decoded.get("type") == "reject":
						emit_signal("zone_rejected", "server_reject")
						_finish("server_reject")
						return
		WebSocketPeer.STATE_CLOSING:
			pass
		WebSocketPeer.STATE_CLOSED:
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
