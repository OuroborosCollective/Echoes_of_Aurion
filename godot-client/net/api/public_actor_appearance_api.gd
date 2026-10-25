extends Node
## Read-only authenticated server query. Never treats public appearance data as
## world presence: the active v5 snapshot remains the independent identity gate.
signal appearances_ready(response: Dictionary, connection_id: String, session_generation: int, requested_ids: String)
signal request_failed(reason: String, connection_id: String)
const RuntimeConfig = preload("res://config/runtime_config.gd")
const PATH := "/api/game/public-player-appearances"
const MAX_RESPONSE_BYTES := 1048576
var _auth: Node
var _http: HTTPRequest
var _active := false
var _epoch := 0
var _connection_id := ""
var _generation := -1
var _requested_ids := ""
var _server := ""
var _retried := false
var _waiting_refresh := false

func _init(auth: Node) -> void:
	_auth = auth

func _ready() -> void:
	_auth.refresh_succeeded.connect(_on_refresh_succeeded)
	_auth.refresh_failed.connect(_on_refresh_failed)
	_auth.logout_succeeded.connect(_on_auth_terminal)
	_auth.logout_failed.connect(_on_auth_terminal)

func busy() -> bool:
	return _active

func request_public(base_url: String, connection_id: String, user_ids: Array[int], allow_local: bool = false) -> bool:
	if _active or not is_inside_tree() or connection_id.is_empty() or user_ids.is_empty() or user_ids.size() > 128:
		return false
	var server: String = RuntimeConfig.validated_server_url(base_url, allow_local)
	if server.is_empty() or not _auth.protected_response_allowed():
		return false
	var ordered := user_ids.duplicate()
	ordered.sort()
	var parts: PackedStringArray = []
	var previous := 0
	for id in ordered:
		if id < 1 or id > 2147483647 or id == previous:
			return false
		parts.append(str(id))
		previous = id
	_requested_ids = ",".join(parts)
	_connection_id = connection_id
	_server = server
	_retried = false
	_active = true
	if _auth.access_token().is_empty():
		_retried = true
		return _begin_refresh()
	return _send()

func _send() -> bool:
	if not _auth.protected_response_allowed() or _auth.access_token().is_empty():
		_fail("PUBLIC_APPEARANCE_SESSION_UNAVAILABLE")
		return false
	_generation = _auth.session_generation()
	_epoch += 1
	if is_instance_valid(_http):
		_http.cancel_request()
		_http.queue_free()
	_http = HTTPRequest.new()
	_http.body_size_limit = MAX_RESPONSE_BYTES
	_http.max_redirects = 0
	_http.timeout = 12.0
	add_child(_http)
	_http.request_completed.connect(_on_wire_completed.bind(_epoch))
	var error: Error = _http.request(_server + PATH + "?userIds=" + _requested_ids,
		PackedStringArray(["Accept: application/json", "Authorization: Bearer " + _auth.access_token()]),
		HTTPClient.METHOD_GET)
	if error != OK:
		_fail("PUBLIC_APPEARANCE_REQUEST_FAILED")
		return false
	return true

func _on_wire_completed(result: int, code: int, headers: PackedStringArray, body: PackedByteArray, request_epoch: int) -> void:
	if not _active or request_epoch != _epoch:
		return
	if _auth.session_generation() != _generation or not _auth.protected_response_allowed():
		_fail("PUBLIC_APPEARANCE_SESSION_CHANGED")
		return
	if result != HTTPRequest.RESULT_SUCCESS:
		_fail("PUBLIC_APPEARANCE_REQUEST_FAILED")
		return
	if code == 401 and not _retried:
		_retried = true
		_begin_refresh()
		return
	if code != 200 or not _json_header(headers):
		_fail("PUBLIC_APPEARANCE_RESPONSE_INVALID")
		return
	var data: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(data) != TYPE_DICTIONARY or typeof(data.get("appearances")) != TYPE_ARRAY or data.appearances.size() > 128:
		_fail("PUBLIC_APPEARANCE_RESPONSE_INVALID")
		return
	var connection := _connection_id
	var generation := _generation
	var ids := _requested_ids
	_complete()
	emit_signal("appearances_ready", data, connection, generation, ids)

func _begin_refresh() -> bool:
	_waiting_refresh = true
	var started: bool = _auth.refresh()
	if started or _auth.refresh_in_flight():
		return true
	if _active:
		_fail("PUBLIC_APPEARANCE_SESSION_UNAVAILABLE")
	return false

func _on_refresh_succeeded() -> void:
	if _active and _waiting_refresh:
		_waiting_refresh = false
		_send()

func _on_refresh_failed(_reason: String) -> void:
	if _active and _waiting_refresh:
		_fail("PUBLIC_APPEARANCE_SESSION_UNAVAILABLE")

func _on_auth_terminal(_reason: String = "") -> void:
	if _active:
		_fail("PUBLIC_APPEARANCE_SESSION_UNAVAILABLE")

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
	_requested_ids = ""

func _fail(reason: String) -> void:
	var connection := _connection_id
	_complete()
	emit_signal("request_failed", reason, connection)

func cancel() -> void:
	_epoch += 1
	if is_instance_valid(_http):
		_http.cancel_request()
	_complete()

func _exit_tree() -> void:
	cancel()
