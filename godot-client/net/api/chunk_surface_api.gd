extends Node
## Native authenticated READ ONLY Aurion chunk-surface client.
## A successful wire reply has no world authority without session and position
## reconciliation in main.gd. No client world seed or gameplay simulation.
signal surface_ready(readback: Dictionary, connection_id: String, generation: int, coordinate: Vector2i)
signal request_failed(reason: String, connection_id: String)
const RuntimeConfig = preload("res://config/runtime_config.gd")
const PATH := "/api/game/world-chunk-surface"
const MAX_BYTES := 262144

var _auth: Node
var _http: HTTPRequest
var _active := false
var _epoch := 0
var _generation := -1
var _server := ""
var _connection_id := ""
var _requested := Vector2i.ZERO
var _retried := false
var _waiting_refresh := false

func _init(auth: Node) -> void:
	_auth = auth

func _ready() -> void:
	_auth.refresh_succeeded.connect(_on_refresh_succeeded)
	_auth.refresh_failed.connect(_on_refresh_failed)
	_auth.logout_succeeded.connect(_on_terminal)
	_auth.logout_failed.connect(_on_terminal)

func busy() -> bool:
	return _active

func request_surface(server_url: String, connection_id: String, coordinate: Vector2i, allow_local: bool = false) -> bool:
	if _active or not is_inside_tree() or connection_id.is_empty():
		return false
	if absi(coordinate.x) > 1000000 or absi(coordinate.y) > 1000000:
		return false
	var validated: String = RuntimeConfig.validated_server_url(server_url, allow_local)
	if validated.is_empty() or not _auth.protected_response_allowed():
		return false
	_server = validated
	_connection_id = connection_id
	_requested = coordinate
	_retried = false
	_active = true
	if _auth.access_token().is_empty():
		_retried = true
		return _begin_refresh()
	return _send()

func _send() -> bool:
	var token: String = _auth.access_token()
	if token.is_empty() or not _auth.protected_response_allowed():
		_fail("CHUNK_SESSION_UNAVAILABLE")
		return false
	_generation = _auth.session_generation()
	if is_instance_valid(_http):
		_http.cancel_request()
		_http.queue_free()
	_epoch += 1
	var expected_epoch: int = _epoch
	_http = HTTPRequest.new()
	_http.body_size_limit = MAX_BYTES
	_http.max_redirects = 0
	_http.timeout = 12.0
	add_child(_http)
	_http.request_completed.connect(_on_completed.bind(expected_epoch))
	var query := "?x=%d&z=%d" % [_requested.x, _requested.y]
	var error: Error = _http.request(_server + PATH + query,
		PackedStringArray(["Accept: application/json", "Authorization: Bearer " + token]),
		HTTPClient.METHOD_GET)
	if error != OK:
		_fail("CHUNK_REQUEST_FAILED")
		return false
	return true

func _on_completed(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, epoch: int) -> void:
	if not _active or epoch != _epoch:
		return
	if not _auth.protected_response_allowed() or _auth.session_generation() != _generation:
		_fail("CHUNK_SESSION_CHANGED")
		return
	if result != HTTPRequest.RESULT_SUCCESS:
		_fail("CHUNK_REQUEST_FAILED")
		return
	if code == 401 and not _retried:
		_retried = true
		_begin_refresh()
		return
	if code != 200 or not _json_header(headers):
		_fail("CHUNK_RESPONSE_INVALID")
		return
	var response: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(response) != TYPE_DICTIONARY:
		_fail("CHUNK_RESPONSE_INVALID")
		return
	var id := _connection_id
	var generation := _generation
	var coordinate := _requested
	_complete()
	emit_signal("surface_ready", response, id, generation, coordinate)

func _begin_refresh() -> bool:
	_waiting_refresh = true
	var started: bool = _auth.refresh()
	if started or _auth.refresh_in_flight():
		return true
	if _active:
		_fail("CHUNK_SESSION_UNAVAILABLE")
	return false

func _on_refresh_succeeded() -> void:
	if _active and _waiting_refresh:
		_waiting_refresh = false
		_send()

func _on_refresh_failed(_reason: String) -> void:
	if _active and _waiting_refresh:
		_fail("CHUNK_SESSION_UNAVAILABLE")

func _on_terminal(_reason: String = "") -> void:
	if _active:
		_fail("CHUNK_SESSION_UNAVAILABLE")

static func _json_header(headers: PackedStringArray) -> bool:
	for header in headers:
		var value := header.to_lower()
		if value.begins_with("content-type:"):
			var mime := value.trim_prefix("content-type:").strip_edges()
			return mime == "application/json" or mime.begins_with("application/json;")
	return false

func _complete() -> void:
	_active = false
	_waiting_refresh = false
	_connection_id = ""
	_generation = -1

func _fail(reason: String) -> void:
	var id := _connection_id
	_complete()
	emit_signal("request_failed", reason, id)

func cancel() -> void:
	_epoch += 1
	if is_instance_valid(_http):
		_http.cancel_request()
	_complete()

func _exit_tree() -> void:
	cancel()
